// Main-process logger (SPEC §11/§15): one in-memory ring (drives the diagnostics
// export) + a rotating, redacted log file under userData/logs. The whole reason
// to log is so a non-developer user can send ONE file when something breaks, so:
//   • every record is run through the shared secret redactor before it is kept
//     or written (defense in depth — we also never deliberately log secrets);
//   • writes are serialized and fire-and-forget — logging MUST NOT throw into
//     the caller or block a hot path, even if the disk is full / read-only.

import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  formatLogLine,
  meetsLevel,
  redactEntry,
  RingBuffer,
  type LogEntry,
  type LogLevel,
} from '@chatgoose/shared/diagnostics/log';

export interface LoggerOptions {
  /** Directory for the log files (created on first write). */
  dir: string;
  /** Clock seam (tests). */
  now?: () => number;
  /** In-memory ring size — the export ships this many recent records. */
  ringSize?: number;
  /** Rotate `app.log` → `app.1.log` once it exceeds this many bytes. */
  maxFileBytes?: number;
  /** Drop records below this level. */
  minLevel?: LogLevel;
  /** Also echo to the dev console (unpackaged builds). */
  mirrorConsole?: boolean;
  /** File base name (default 'app'). */
  fileName?: string;
}

export interface Logger {
  log(level: LogLevel, scope: string, msg: string, fields?: Record<string, unknown>): void;
  debug(scope: string, msg: string, fields?: Record<string, unknown>): void;
  info(scope: string, msg: string, fields?: Record<string, unknown>): void;
  warn(scope: string, msg: string, fields?: Record<string, unknown>): void;
  error(scope: string, msg: string, fields?: Record<string, unknown>): void;
  /** Sub-logger whose scope is `${parent}:${scope}`. */
  child(scope: string): ScopedLogger;
  /** Replace the set of exact secret values masked in every record. */
  setRedactionSecrets(values: readonly string[]): void;
  setMinLevel(level: LogLevel): void;
  /** Redacted recent records (newest last) for the diagnostics export. */
  snapshot(): LogEntry[];
  /**
   * The DURABLE on-disk log tail (rotated file then current, oldest→newest),
   * already redacted at write time. Spans process restarts — so a crash from a
   * PRIOR session is in the export even though the in-memory ring is empty.
   * Returns at most `maxLines` lines.
   */
  readFileTail(maxLines?: number): Promise<string[]>;
  /** error-level counts grouped by CG-* code (or 'uncoded') over the ring. */
  errorCounts(): Record<string, number>;
  /** Resolve once all queued writes have flushed (tests / shutdown). */
  flush(): Promise<void>;
  readonly filePath: string;
}

export interface ScopedLogger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(scope: string): ScopedLogger;
}

const DEFAULTS = {
  ringSize: 1000,
  maxFileBytes: 2 * 1024 * 1024,
  minLevel: 'info' as LogLevel,
} as const;

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? Date.now;
  const ring = new RingBuffer<LogEntry>(options.ringSize ?? DEFAULTS.ringSize);
  const maxFileBytes = options.maxFileBytes ?? DEFAULTS.maxFileBytes;
  const fileName = options.fileName ?? 'app';
  const filePath = join(options.dir, `${fileName}.log`);
  const rotatedPath = join(options.dir, `${fileName}.1.log`);

  let minLevel: LogLevel = options.minLevel ?? DEFAULTS.minLevel;
  let secrets: readonly string[] = [];
  let dirReady = false;
  let bytes: number | null = null;
  let writeChain: Promise<void> = Promise.resolve();

  async function doWrite(line: string): Promise<void> {
    if (!dirReady) {
      await mkdir(options.dir, { recursive: true });
      dirReady = true;
    }
    if (bytes === null) {
      try {
        bytes = (await stat(filePath)).size;
      } catch {
        bytes = 0;
      }
    }
    const lineBytes = Buffer.byteLength(line, 'utf8') + 1;
    if (bytes + lineBytes > maxFileBytes) {
      try {
        await rename(filePath, rotatedPath); // overwrites the previous .1
      } catch {
        // ignore — keep appending to the current file rather than lose the record
      }
      bytes = 0;
    }
    await appendFile(filePath, `${line}\n`, 'utf8');
    bytes += lineBytes;
  }

  function enqueueWrite(line: string): void {
    // Serialize and swallow — a logging failure must never surface to callers.
    writeChain = writeChain.then(() => doWrite(line)).catch(() => undefined);
  }

  function mirror(entry: LogEntry, line: string): void {
    if (options.mirrorConsole !== true) {
      return;
    }
    if (entry.level === 'error') {
      console.error(line);
    } else if (entry.level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  function log(
    level: LogLevel,
    scope: string,
    msg: string,
    fields?: Record<string, unknown>,
  ): void {
    if (!meetsLevel(level, minLevel)) {
      return;
    }
    // Lift a CG-* code into the dedicated column; keep the rest as fields.
    let code: string | undefined;
    let rest: Record<string, unknown> | undefined = fields;
    if (fields !== undefined && typeof fields['code'] === 'string') {
      code = fields['code'];
      const { code: _drop, ...others } = fields;
      rest = Object.keys(others).length > 0 ? others : undefined;
    }
    const entry: LogEntry = {
      t: now(),
      level,
      scope,
      msg,
      ...(code !== undefined ? { code } : {}),
      ...(rest !== undefined ? { fields: rest } : {}),
    };
    const redacted = redactEntry(entry, secrets);
    ring.push(redacted);
    const line = formatLogLine(redacted);
    mirror(redacted, line);
    enqueueWrite(line);
  }

  function makeScoped(scope: string): ScopedLogger {
    return {
      debug: (msg, fields) => log('debug', scope, msg, fields),
      info: (msg, fields) => log('info', scope, msg, fields),
      warn: (msg, fields) => log('warn', scope, msg, fields),
      error: (msg, fields) => log('error', scope, msg, fields),
      child: (sub) => makeScoped(`${scope}:${sub}`),
    };
  }

  return {
    log,
    debug: (scope, msg, fields) => log('debug', scope, msg, fields),
    info: (scope, msg, fields) => log('info', scope, msg, fields),
    warn: (scope, msg, fields) => log('warn', scope, msg, fields),
    error: (scope, msg, fields) => log('error', scope, msg, fields),
    child: makeScoped,
    setRedactionSecrets: (values) => {
      secrets = values.filter((value) => typeof value === 'string' && value.length >= 6);
    },
    setMinLevel: (level) => {
      minLevel = level;
    },
    snapshot: () => ring.toArray(),
    readFileTail: async (maxLines = 4000) => {
      const readLines = async (path: string): Promise<string[]> => {
        try {
          const text = await readFile(path, 'utf8');
          return text.split('\n').filter((line) => line !== '');
        } catch {
          return []; // file not created yet (no writes) — fine
        }
      };
      // Rotated file holds the OLDER half; current file the newer.
      const lines = [...(await readLines(rotatedPath)), ...(await readLines(filePath))];
      return lines.length > maxLines ? lines.slice(lines.length - maxLines) : lines;
    },
    errorCounts: () => {
      const counts: Record<string, number> = {};
      for (const entry of ring.toArray()) {
        if (entry.level === 'error') {
          const key = entry.code ?? 'uncoded';
          counts[key] = (counts[key] ?? 0) + 1;
        }
      }
      return counts;
    },
    flush: () => writeChain,
    filePath,
  };
}
