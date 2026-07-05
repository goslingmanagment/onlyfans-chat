import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKeychain, generateDbKey, SECRET_NAMES } from '@main/secrets/keychain';
import type { SafeStorageLike } from '@main/secrets/keychain';

const XOR_KEY = 0x5a;
const MARKER = Buffer.from('fake-enc:');

function createFakeSafeStorage(available = true): SafeStorageLike {
  const xor = (buf: Buffer): Buffer => Buffer.from(buf.map((b) => b ^ XOR_KEY));
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText) =>
      Buffer.concat([MARKER, xor(Buffer.from(plainText, 'utf8'))]),
    decryptString: (encrypted) => {
      if (!encrypted.subarray(0, MARKER.length).equals(MARKER)) {
        throw new Error('not encrypted by fake safeStorage');
      }
      return xor(Buffer.from(encrypted.subarray(MARKER.length))).toString('utf8');
    },
  };
}

describe('keychain', () => {
  let secretsDir: string;

  beforeEach(async () => {
    secretsDir = await mkdtemp(join(tmpdir(), 'cg-keychain-'));
  });

  afterEach(async () => {
    await rm(secretsDir, { recursive: true, force: true });
  });

  it('deletes decommissioned legacy secrets on request (Stage 24: ofapiKey)', async () => {
    const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
    // Simulate a pre-Stage-24 install holding the team-wide direct-read key.
    await keychain.setSecret('anthropicKey', 'keep-me');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(secretsDir, 'ofapiKey.secret'), Buffer.from('enc:legacy'));

    await keychain.deleteDecommissionedSecrets();

    const { readFile } = await import('node:fs/promises');
    await expect(readFile(join(secretsDir, 'ofapiKey.secret'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await keychain.getSecret('anthropicKey')).toBe('keep-me');
  });

  it('roundtrips a secret through the fake safeStorage', async () => {
    const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
    await keychain.setSecret('anthropicKey', 'sk-ofapi-test-123');
    expect(await keychain.getSecret('anthropicKey')).toBe('sk-ofapi-test-123');
    expect(await keychain.hasSecret('anthropicKey')).toBe(true);
  });

  it('persists encrypted bytes on disk (file !== plaintext)', async () => {
    const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
    await keychain.setSecret('anthropicKey', 'sk-ant-super-secret');
    const fileBytes = await readFile(join(secretsDir, 'anthropicKey.secret'));
    expect(fileBytes.includes(Buffer.from('sk-ant-super-secret', 'utf8'))).toBe(false);
    expect(fileBytes.subarray(0, MARKER.length).equals(MARKER)).toBe(true);
  });

  it('survives a process restart (new keychain instance, same dir)', async () => {
    const safeStorage = createFakeSafeStorage();
    const first = createKeychain({ safeStorage, secretsDir });
    await first.setSecret('openRouterKey', 'or-key-1');
    const second = createKeychain({ safeStorage, secretsDir });
    expect(await second.getSecret('openRouterKey')).toBe('or-key-1');
  });

  it('returns null / false for missing secrets', async () => {
    const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
    expect(await keychain.getSecret('dbKey')).toBeNull();
    expect(await keychain.hasSecret('dbKey')).toBe(false);
  });

  it('deletes a secret (idempotently)', async () => {
    const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
    await keychain.setSecret('anthropicKey', 'to-be-deleted');
    await keychain.deleteSecret('anthropicKey');
    expect(await keychain.getSecret('anthropicKey')).toBeNull();
    await expect(keychain.deleteSecret('anthropicKey')).resolves.toBeUndefined();
  });

  it('rejects empty secret values', async () => {
    const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
    await expect(keychain.setSecret('anthropicKey', '')).rejects.toThrow();
  });

  it('refuses to persist when OS encryption is unavailable', async () => {
    const keychain = createKeychain({ safeStorage: createFakeSafeStorage(false), secretsDir });
    await expect(keychain.setSecret('anthropicKey', 'value')).rejects.toThrow(/unavailable/);
    expect(await readdir(secretsDir)).toEqual([]);
  });

  it('allowlists the hub chatter key (write-only secret, SPEC §6.2)', async () => {
    expect(SECRET_NAMES).toContain('hubApiKey');
    const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
    await keychain.setSecret('hubApiKey', 'agency_hub_core_abc');
    expect(await keychain.getSecret('hubApiKey')).toBe('agency_hub_core_abc');
    const fileBytes = await readFile(join(secretsDir, 'hubApiKey.secret'));
    expect(fileBytes.includes(Buffer.from('agency_hub_core_abc', 'utf8'))).toBe(false);
  });

  it('writes one file per secret, named by the allowlisted secret name', async () => {
    const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
    for (const name of SECRET_NAMES) {
      await keychain.setSecret(name, `value-${name}`);
    }
    const files = (await readdir(secretsDir)).sort();
    expect(files).toEqual([...SECRET_NAMES].map((n) => `${n}.secret`).sort());
  });

  describe('generateDbKey', () => {
    it('produces 32 bytes as 64 hex chars, unique per call', () => {
      const a = generateDbKey();
      const b = generateDbKey();
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(b).toMatch(/^[0-9a-f]{64}$/);
      expect(a).not.toBe(b);
      expect(Buffer.from(a, 'hex').byteLength).toBe(32);
    });
  });

  describe('getOrCreateGeneratedKey', () => {
    it('creates once and returns the same key afterwards', async () => {
      const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
      const first = await keychain.getOrCreateGeneratedKey('dbKey');
      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(await keychain.getOrCreateGeneratedKey('dbKey')).toBe(first);
      // and across a "restart"
      const again = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
      expect(await again.getOrCreateGeneratedKey('dbKey')).toBe(first);
    });

    it('serializes concurrent creation to a single key', async () => {
      const keychain = createKeychain({ safeStorage: createFakeSafeStorage(), secretsDir });
      const [a, b, c] = await Promise.all([
        keychain.getOrCreateGeneratedKey('mediaCacheKey'),
        keychain.getOrCreateGeneratedKey('mediaCacheKey'),
        keychain.getOrCreateGeneratedKey('mediaCacheKey'),
      ]);
      expect(b).toBe(a);
      expect(c).toBe(a);
    });
  });
});
