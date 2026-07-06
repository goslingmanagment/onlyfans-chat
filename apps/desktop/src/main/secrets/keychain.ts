// OS-keychain-backed secret store (SPEC §4, §10): secrets are encrypted via
// Electron safeStorage (Keychain/DPAPI) and persisted one file per secret under
// app userData. Plaintext exists only in main-process memory.

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export const SECRET_NAMES = [
  'hubApiKey',
  // Stage 24: device-bound hub credential (agency_hub_device_…); preferred
  // over hubApiKey when present. Issued via Settings → Hub sign-in.
  'hubDeviceToken',
  'dbKey',
  'mediaCacheKey',
] as const;

export type SecretName = (typeof SECRET_NAMES)[number];

export const secretNameSchema = z.enum(SECRET_NAMES);

/** Secrets generated locally (random keys) rather than entered by the user. */
export type GeneratedKeyName = Extract<SecretName, 'dbKey' | 'mediaCacheKey'>;

/** Injectable subset of Electron's safeStorage (tests pass a fake). */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface Keychain {
  getSecret(name: SecretName): Promise<string | null>;
  setSecret(name: SecretName, value: string): Promise<void>;
  deleteSecret(name: SecretName): Promise<void>;
  hasSecret(name: SecretName): Promise<boolean>;
  /** Returns the persisted generated key, creating it exactly once. */
  getOrCreateGeneratedKey(name: GeneratedKeyName): Promise<string>;
  /**
   * Stage 24 / DP 8 (extended in Stage 31): removes secrets this version no
   * longer recognizes. Runs on every boot; deliberately irreversible on this
   * machine — a version rollback cannot restore the deleted lane (the owner
   * rotates/revokes the corresponding upstream credential after fleet confirm).
   */
  deleteDecommissionedSecrets(): Promise<void>;
}

/** Legacy secret files removed on boot: Stage 24 killed direct OFAPI reads;
 * Stage 31 killed direct AI provider calls (all generation rides the kernel
 * gateway — vendor keys live kernel-side only). */
const DECOMMISSIONED_SECRET_FILES = [
  'ofapiKey.secret',
  'anthropicKey.secret',
  'openRouterKey.secret',
] as const;

/** 32-byte random key as 64 hex chars (DB / media-cache encryption keys). */
export function generateDbKey(): string {
  return randomBytes(32).toString('hex');
}

export interface KeychainOptions {
  safeStorage: SafeStorageLike;
  /** e.g. join(app.getPath('userData'), 'secrets') — composition root supplies it. */
  secretsDir: string;
}

export function createKeychain(options: KeychainOptions): Keychain {
  const { safeStorage, secretsDir } = options;

  // Validated names are an allowlisted enum, so the joined path cannot escape secretsDir.
  function fileFor(name: SecretName): string {
    return join(secretsDir, `${secretNameSchema.parse(name)}.secret`);
  }

  async function getSecret(name: SecretName): Promise<string | null> {
    let blob: Buffer;
    try {
      blob = await readFile(fileFor(name));
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return null;
      throw err;
    }
    return safeStorage.decryptString(blob);
  }

  async function setSecret(name: SecretName, value: string): Promise<void> {
    const parsed = z.string().min(1).parse(value);
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS keychain encryption is unavailable; refusing to persist secret');
    }
    await mkdir(secretsDir, { recursive: true, mode: 0o700 });
    await writeFile(fileFor(name), safeStorage.encryptString(parsed), { mode: 0o600 });
  }

  async function deleteSecret(name: SecretName): Promise<void> {
    await rm(fileFor(name), { force: true });
  }

  async function hasSecret(name: SecretName): Promise<boolean> {
    const value = await getSecret(name);
    return value !== null && value.length > 0;
  }

  async function deleteDecommissionedSecrets(): Promise<void> {
    for (const file of DECOMMISSIONED_SECRET_FILES) {
      await rm(join(secretsDir, file), { force: true });
    }
  }

  // Serialized per name so concurrent callers cannot generate two different keys.
  const pendingCreates = new Map<GeneratedKeyName, Promise<string>>();

  function getOrCreateGeneratedKey(name: GeneratedKeyName): Promise<string> {
    const pending = pendingCreates.get(name);
    if (pending) return pending;
    const created = (async () => {
      const existing = await getSecret(name);
      if (existing !== null && existing.length > 0) return existing;
      const key = generateDbKey();
      await setSecret(name, key);
      return key;
    })().finally(() => {
      pendingCreates.delete(name);
    });
    pendingCreates.set(name, created);
    return created;
  }

  return { getSecret, setSecret, deleteSecret, hasSecret, getOrCreateGeneratedKey, deleteDecommissionedSecrets };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
