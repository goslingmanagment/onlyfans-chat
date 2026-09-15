import { createHash } from 'node:crypto';
import { z } from 'zod';

export const HUB_DEVICE_TOKEN_ACTIVATION_KEY = 'hubDeviceTokenActivation.v1';
export const HUB_DEVICE_TOKEN_REVOCATION_KEY = 'hubDeviceTokenRevocation.v1';
export const HUB_DEVICE_TOKEN_BINDING_KEY = 'hubDeviceTokenBinding.v1';
export const HUB_DEVICE_IDENTITY_KEY = 'hubDeviceIdentity.v1';
/** D35: why this machine stopped being signed in, for the sign-in screen's
 * banner. Non-secret, display-only, and never a gate on anything. */
export const HUB_SIGNED_OUT_KEY = 'hubSignedOut.v1';

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
  // D19: who signed in, for the persisted device identity. Optional/default
  // preserves journals written by pre-D19 builds.
  username: z.string().min(1).max(120).nullable().optional().default(null),
});

export const hubDeviceTokenRevocationSchema = journalBaseSchema.extend({
  /** Core already accepted the exact-token revoke, but unrelated active local
   * custody still requires explicit abandonment before the latch can clear. */
  remoteSettled: z.boolean().optional().default(false),
});

export const stagedDeviceTokenSchema = z.strictObject({
  version: z.literal(1),
  journalId: z.string().uuid(),
  token: z.string().min(1),
});

export const hubCredentialBindingSchema = z.strictObject({
  version: z.literal(1),
  hubBaseUrl: z.string().url(),
  tokenDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

/** D19: non-secret display metadata for the connected-state card. Written and
 * removed atomically alongside the device-token binding; unlike the custody
 * journals it is NEVER load-bearing for credentials. */
export const hubDeviceIdentitySchema = z.strictObject({
  version: z.literal(1),
  username: z.string().min(1).max(120).nullable(),
  label: z.string().min(1).max(120),
  tokenLast4: z.string().length(4),
  // Null when written by crash recovery: the true issue/expiry moments are
  // unknowable there, and a display record must never invent dates.
  issuedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
});

export const hubSignedOutSchema = z.strictObject({
  version: z.literal(1),
  reason: z.enum(['token_revoked', 'token_expired']),
  at: z.string().datetime(),
});

export type HubSignedOut = z.infer<typeof hubSignedOutSchema>;
export type HubDeviceTokenActivation = z.infer<typeof hubDeviceTokenActivationSchema>;
export type HubDeviceTokenRevocation = z.infer<typeof hubDeviceTokenRevocationSchema>;
export type StagedDeviceToken = z.infer<typeof stagedDeviceTokenSchema>;
export type HubCredentialBinding = z.infer<typeof hubCredentialBindingSchema>;
export type HubDeviceIdentity = z.infer<typeof hubDeviceIdentitySchema>;

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
    throw new Error(`Sign-in record ${key} is unreadable; refusing to use this device’s sign-in.`, {
      cause: error,
    });
  }
  if (raw === undefined) return null;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Sign-in record ${key} is corrupt; refusing to use this device’s sign-in.`);
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

export function readDeviceTokenBinding(
  queries: Pick<CredentialJournalQueries, 'get'>,
): HubCredentialBinding | null {
  return readJournal(queries, HUB_DEVICE_TOKEN_BINDING_KEY, hubCredentialBindingSchema);
}

export function readHubDeviceIdentity(
  queries: Pick<CredentialJournalQueries, 'get'>,
): HubDeviceIdentity | null {
  try {
    return readJournal(queries, HUB_DEVICE_IDENTITY_KEY, hubDeviceIdentitySchema);
  } catch {
    return null; // display metadata — never blocks credentials
  }
}

export function readHubSignedOut(
  queries: Pick<CredentialJournalQueries, 'get'>,
): HubSignedOut | null {
  try {
    return readJournal(queries, HUB_SIGNED_OUT_KEY, hubSignedOutSchema);
  } catch {
    return null; // display metadata — never blocks credentials
  }
}

export function parseStagedDeviceToken(
  raw: string,
  expected: { journalId: string; tokenDigest: string },
): StagedDeviceToken {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('The protected sign-in copy is corrupt.');
  }
  const parsed = stagedDeviceTokenSchema.safeParse(json);
  if (
    !parsed.success
    || parsed.data.journalId !== expected.journalId
    || deviceTokenDigest(parsed.data.token) !== expected.tokenDigest
  ) {
    throw new Error('The protected sign-in copy does not match its record.');
  }
  return parsed.data;
}
