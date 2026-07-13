import { createHash } from 'node:crypto';
import { z } from 'zod';

export const HUB_DEVICE_TOKEN_ACTIVATION_KEY = 'hubDeviceTokenActivation.v1';
export const HUB_DEVICE_TOKEN_REVOCATION_KEY = 'hubDeviceTokenRevocation.v1';

const journalBaseSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  hubBaseUrl: z.string().url(),
  tokenDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export const hubDeviceTokenActivationSchema = journalBaseSchema.extend({
  reservationId: z.number().int().positive(),
  label: z.string().min(1).max(120),
  keyPrefix: z.string().min(1),
  reservationExpiresAt: z.string().datetime(),
  // Durable sign-out intent written while activation is network-deferred.
  // Optional/default preserves journals written by the first rollout build.
  cancelRequested: z.boolean().optional().default(false),
});

export const hubDeviceTokenRevocationSchema = journalBaseSchema;

export const stagedDeviceTokenSchema = z.strictObject({
  version: z.literal(1),
  journalId: z.string().uuid(),
  token: z.string().min(1),
});

export type HubDeviceTokenActivation = z.infer<typeof hubDeviceTokenActivationSchema>;
export type HubDeviceTokenRevocation = z.infer<typeof hubDeviceTokenRevocationSchema>;
export type StagedDeviceToken = z.infer<typeof stagedDeviceTokenSchema>;

export interface CredentialJournalQueries {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  batch(mutations: readonly CredentialJournalMutation[]): void;
}

export type CredentialJournalMutation =
  | { kind: 'set'; key: string; value: unknown }
  | { kind: 'remove'; key: string };

export function deviceTokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readJournal<T>(
  queries: Pick<CredentialJournalQueries, 'get'>,
  key: string,
  schema: z.ZodType<T>,
): T | null {
  let raw: unknown;
  try {
    raw = queries.get(key);
  } catch (error) {
    throw new Error(`Credential journal ${key} is unreadable; refusing to use device credentials.`, {
      cause: error,
    });
  }
  if (raw === undefined) return null;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Credential journal ${key} is corrupt; refusing to use device credentials.`);
  }
  return parsed.data;
}

export function readDeviceTokenActivation(
  queries: Pick<CredentialJournalQueries, 'get'>,
): HubDeviceTokenActivation | null {
  return readJournal(queries, HUB_DEVICE_TOKEN_ACTIVATION_KEY, hubDeviceTokenActivationSchema);
}

export function readDeviceTokenRevocation(
  queries: Pick<CredentialJournalQueries, 'get'>,
): HubDeviceTokenRevocation | null {
  return readJournal(queries, HUB_DEVICE_TOKEN_REVOCATION_KEY, hubDeviceTokenRevocationSchema);
}

export function parseStagedDeviceToken(
  raw: string,
  expected: { journalId: string; tokenDigest: string },
): StagedDeviceToken {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Encrypted device-token staging record is corrupt.');
  }
  const parsed = stagedDeviceTokenSchema.safeParse(json);
  if (
    !parsed.success
    || parsed.data.journalId !== expected.journalId
    || deviceTokenDigest(parsed.data.token) !== expected.tokenDigest
  ) {
    throw new Error('Encrypted device-token staging record does not match its durable journal.');
  }
  return parsed.data;
}
