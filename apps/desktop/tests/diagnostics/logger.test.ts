import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../../src/main/diagnostics/logger';

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cg-logger-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('createLogger', () => {
  it('writes a redacted, formatted line to <dir>/app.log', async () => {
    const dir = await tempDir();
    const logger = createLogger({ dir, now: () => Date.parse('2026-06-13T00:00:00.000Z') });
    logger.info('boot', 'app started', { version: '1.2.3' });
    await logger.flush();

    const contents = await readFile(join(dir, 'app.log'), 'utf8');
    expect(contents).toContain('INFO  [boot] app started {"version":"1.2.3"}');
    expect(contents.endsWith('\n')).toBe(true);
  });

  it('redacts secret values in both the file and the ring snapshot', async () => {
    const dir = await tempDir();
    const logger = createLogger({ dir });
    logger.setRedactionSecrets(['hunter2hunter2']);
    logger.error('ofapi', 'auth failed for hunter2hunter2', { header: 'Bearer hunter2hunter2' });
    await logger.flush();

    const contents = await readFile(join(dir, 'app.log'), 'utf8');
    expect(contents).not.toContain('hunter2hunter2');
    const snap = logger.snapshot();
    expect(JSON.stringify(snap)).not.toContain('hunter2hunter2');
    expect(snap[0]?.msg).toContain('[redacted]');
  });

  it('keeps only the last ringSize records in the snapshot', async () => {
    const dir = await tempDir();
    const logger = createLogger({ dir, ringSize: 3 });
    for (let i = 0; i < 6; i += 1) {
      logger.info('s', `msg ${i}`);
    }
    const snap = logger.snapshot();
    expect(snap).toHaveLength(3);
    expect(snap.map((entry) => entry.msg)).toEqual(['msg 3', 'msg 4', 'msg 5']);
    await logger.flush();
  });

  it('drops records below the minimum level', async () => {
    const dir = await tempDir();
    const logger = createLogger({ dir, minLevel: 'warn' });
    logger.info('s', 'noise');
    logger.debug('s', 'noise');
    logger.warn('s', 'kept');
    expect(logger.snapshot().map((entry) => entry.msg)).toEqual(['kept']);

    logger.setMinLevel('debug');
    logger.debug('s', 'now kept');
    expect(logger.snapshot().map((entry) => entry.msg)).toContain('now kept');
    await logger.flush();
  });

  it('lifts a CG-* code from fields into the dedicated column', async () => {
    const dir = await tempDir();
    const logger = createLogger({ dir });
    logger.error('ipc', 'handler failed', { code: 'CG-OF-03', channel: 'cmd:send.message' });
    const entry = logger.snapshot()[0];
    expect(entry?.code).toBe('CG-OF-03');
    expect(entry?.fields).toEqual({ channel: 'cmd:send.message' });
    expect(logger.errorCounts()).toEqual({ 'CG-OF-03': 1 });
    await logger.flush();
  });

  it('rotates app.log → app.1.log once the size cap is exceeded', async () => {
    const dir = await tempDir();
    const logger = createLogger({ dir, maxFileBytes: 200 });
    for (let i = 0; i < 50; i += 1) {
      logger.info('s', `a fairly long message number ${i} to push past the cap`);
    }
    await logger.flush();
    expect(existsSync(join(dir, 'app.1.log'))).toBe(true);
    const current = await readFile(join(dir, 'app.log'), 'utf8');
    // The current file restarted after the last rotation — far below the total.
    expect(Buffer.byteLength(current, 'utf8')).toBeLessThan(50 * 60);
  });

  it('measures pre-existing file size so rotation accounts for prior runs', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'app.log'), 'x'.repeat(190), 'utf8');
    const logger = createLogger({ dir, maxFileBytes: 200 });
    logger.info('s', 'this pushes the already-near-full file over the cap');
    await logger.flush();
    expect(existsSync(join(dir, 'app.1.log'))).toBe(true);
  });

  it('readFileTail returns durable on-disk lines across a simulated restart', async () => {
    const dir = await tempDir();
    // "Previous session" writes, then exits (flush).
    const first = createLogger({ dir });
    first.error('boot', 'fatal startup error');
    await first.flush();
    // "New session" starts with an EMPTY ring but must still see the prior crash.
    const second = createLogger({ dir });
    expect(second.snapshot()).toHaveLength(0);
    const tail = await second.readFileTail();
    expect(tail.some((line) => line.includes('fatal startup error'))).toBe(true);
  });

  it('readFileTail includes the rotated file (older) before the current (newer)', async () => {
    const dir = await tempDir();
    const logger = createLogger({ dir, maxFileBytes: 200 });
    for (let i = 0; i < 40; i += 1) {
      logger.info('s', `message number ${i} padded out to force a rotation`);
    }
    await logger.flush();
    const tail = await logger.readFileTail();
    const indices = tail
      .map((line) => /message number (\d+)/.exec(line)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    // Monotonic non-decreasing → rotated (older) lines precede current (newer).
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i]!).toBeGreaterThanOrEqual(indices[i - 1]!);
    }
  });

  it('child scopes are colon-joined', async () => {
    const dir = await tempDir();
    const logger = createLogger({ dir });
    logger.child('ipc').child('cmd:x').warn('nope');
    expect(logger.snapshot()[0]?.scope).toBe('ipc:cmd:x');
    await logger.flush();
  });

  it('never throws into the caller even when the dir cannot be created', async () => {
    // Point the dir at a path under a regular FILE so mkdir fails.
    const dir = await tempDir();
    const filePath = join(dir, 'not-a-dir');
    await writeFile(filePath, 'x', 'utf8');
    const logger = createLogger({ dir: join(filePath, 'logs') });
    expect(() => logger.error('s', 'still safe')).not.toThrow();
    await expect(logger.flush()).resolves.toBeUndefined();
    // The ring still captured it even though the file write failed.
    expect(logger.snapshot()[0]?.msg).toBe('still safe');
  });
});
