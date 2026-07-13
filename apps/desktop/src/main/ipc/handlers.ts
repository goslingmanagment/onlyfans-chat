// IPC invoke handlers — every InvokeChannels entry in src/preload/contract.ts.
// Args are renderer-controlled (trust boundary): zod-validate everything
// before touching the data layer (SPEC §15.3).

import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Personality } from '@chatgoose/shared/types';
import { analyzePingSegment } from '@chatgoose/shared/transcript/index';
import { messageGuardPolicySchema } from '@chatgoose/shared/message-guard/index';
import type { DataLayer, OutboxRow } from '../db/index';
import type { SettingsStore } from '../settings/store';
import type { CreditMeter } from '../ofapi/credit-meter';
import type { SendEngine } from '../send/engine';
import { auditOutbox } from '../send/audit';
import type { VaultService } from '../media/vault';
import type { SpendersService } from '../spenders/service';
import type { SpendersRefreshService } from '../spenders/refresh';
import type { OnlineService } from '../online/service';
import type { Logger } from '../diagnostics/logger';
import type { MessageGuardRuntime } from '../message-guard/runtime';
import { observeSendForAcceptance, reportFeedbackAcceptance } from '../hub/acceptance-reporter';
import type { AcceptanceSeam, FeedbackContext } from '../hub/acceptance-reporter';
import type { PersonaUpsertOutcome } from '../hub/index';
import {
  applyPendingPersonaIntents,
  classifyPersonaMutationFailure,
  clearPendingPersonaIntent,
  createPendingPersonaArchive,
  createPendingPersonaUpsert,
  ensurePersonaStorageScope,
  isCurrentPendingPersonaIntent,
  isWritablePersonality,
  loadPersonaAccountMappings,
  loadPendingPersonaIntents,
  mergeRemotePersonas,
  personaCacheKey,
  restorePendingPersonaIntent,
  samePersonaStorageScope,
  storePersonaAccountMappings,
  storePendingPersonaIntent,
  storedPersonalitySchema,
  storedPersonalitiesSchema,
  writablePersonalitySchema,
  type PendingPersonaIntent,
  type PersonaStorageScope,
} from '../personas/pending';
import type {
  ActivityVM,
  AiStartRequest,
  ConversationOpenResultVM,
  HarvestStatusVM,
  KeyTestProvider,
  HubDeviceTokenResultVM,
  KeyTestResultVM,
  LocalDataStatsVM,
  OutboxItemVM,
  HubTelemetryVM,
  SyncStatusVM,
  UpdateStatusVM,
} from '../../preload/contract';
import {
  aiTodayUsd,
  buildActivitySummary,
  buildFeatureCosts,
  sendsToday,
  utcDayOf,
  type ActivitySync,
} from './activity';
import {
  accountToVM,
  chatRowToVM,
  chatToVM,
  fanToVM,
  messageToVM,
} from './viewmodels';

const idSchema = z.string().min(1).max(64);
// Stage 31: vendor keys retired — only the hub connection probe remains.
const keysTestSchema = z.object({
  provider: z.literal('hub'),
});
const hubIssueDeviceTokenSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(500),
});
// Void args on the wire, but the trust boundary still validates the shape
// (SPEC §15.3) — an unexpected field on a renderer-controlled payload fails
// loudly instead of being silently ignored.
const hubSignOutDeviceSchema = z.object({}).strict();

const EMPTY_HUB_TELEMETRY: HubTelemetryVM = {
  received: { total: 0, byType: {} },
  applied: { total: 0, byType: {} },
  fallback: { total: 0, byType: {} },
  dropped: { total: 0, byType: {} },
  fallbackByReason: {},
};

// Renderer-controlled (trust boundary): bound the strings and accept opaque fields.
const logClientSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  scope: z.string().min(1).max(120),
  message: z.string().max(4000),
  fields: z.record(z.string(), z.unknown()).optional(),
});

function safeErrorOutcome(error: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (error instanceof Error) {
    fields['errorName'] = error.name;
  }
  if (error === null || typeof error !== 'object') {
    fields['valueType'] = typeof error;
    return fields;
  }
  const record = error as Record<string, unknown>;
  if (typeof record['code'] === 'string') {
    fields['errorCode'] = record['code'];
  }
  if (typeof record['upstreamStatus'] === 'number') {
    fields['upstreamStatus'] = record['upstreamStatus'];
  }
  const detail = record['detail'];
  if (detail !== null && typeof detail === 'object') {
    const detailRecord = detail as Record<string, unknown>;
    if (typeof detailRecord['status'] === 'number') {
      fields['httpStatus'] = detailRecord['status'];
    }
    if (typeof detailRecord['retryAfterMs'] === 'number') {
      fields['retryAfterMs'] = detailRecord['retryAfterMs'];
    }
  }
  return fields;
}

function safeMessageCount(
  data: DataLayer,
  accountId: string,
  chatId: string,
): number | null {
  try {
    return data.messages.count(accountId, chatId);
  } catch {
    return null;
  }
}

function safeLastMessageId(data: DataLayer, accountId: string, chatId: string): string | null {
  try {
    return data.chats.get(accountId, chatId)?.lastMessageId ?? null;
  } catch {
    return null;
  }
}

function conversationLoadResult(
  before: number | null,
  after: number | null,
): ConversationOpenResultVM['result'] {
  if (after === null) {
    return 'unknown';
  }
  if (before !== null && after > before) {
    return 'inserted';
  }
  if (after === 0) {
    return 'empty';
  }
  return 'unchanged';
}

const chatsListSchema = z.object({
  accountId: idSchema,
  filter: z.enum(['all', 'unread', 'with_tips']),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const chatGetSchema = z.object({ accountId: idSchema, chatId: idSchema });
const chatsSearchSchema = z.object({ accountId: idSchema, query: z.string().max(200) });

const messagesPageSchema = z.object({
  accountId: idSchema,
  chatId: idSchema,
  beforeId: idSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const fanGetSchema = z.object({ accountId: idSchema, fanId: idSchema });
const convSchema = z.object({ accountId: idSchema, chatId: idSchema });
const forceRefreshSchema = z.object({ accountId: idSchema.optional() });
const reconcileUnreadSchema = z.object({
  accountId: idSchema.optional(),
  trigger: z.enum(['manual', 'unread-tab', 'account-focus']).optional(),
});
const focusAccountSchema = z.object({ accountId: idSchema.nullable() });
const mappingSchema = z.object({ accountId: idSchema, personalityId: z.string().nullable() });
const personalityDeleteSchema = storedPersonalitySchema;
const aiStartSchema = z.object({
  operationId: z.uuid(),
  feature: z.enum([
    'fast-reply',
    'improve-draft',
    'help-me',
    'fan-summary',
    'chat-review',
    'ping',
    'hi-greeting',
    'compare',
  ]),
  accountId: idSchema,
  chatId: idSchema,
  params: z.object({
    tone: z.enum(['none', 'casual', 'flirty', 'upsell', 'spicy']).optional(),
    mode: z.enum(['default', 'preferSplit']).optional(),
    draftText: z.string().max(20_000).optional(),
    forceRegenerate: z.boolean().optional(),
  }),
});
const aiCancelSchema = z.object({ operationId: z.uuid() });
// 'inserted' is the P3+ primary action (contract.ts AiFeedbackRequest); the
// P2-era literal('copied') silently rejected it and lost the acceptance rate.
const aiFeedbackSchema = z.object({
  operationId: z.uuid(),
  action: z.enum(['copied', 'inserted']),
  partIndex: z.number().int().min(0).optional(),
  feature: z
    .enum([
      'fast-reply',
      'improve-draft',
      'help-me',
      'fan-summary',
      'chat-review',
      'ping',
      'hi-greeting',
      'compare',
    ])
    .optional(),
});
const usageFeedbackPayloadSchema = z
  .object({
    feature: z.string(),
    completedAt: z.string(),
    accepted: z.union([z.boolean(), z.number()]).optional(),
  })
  .passthrough();
const usageFeedbackRowSchema = z.object({ payload: z.string() });

function parseUsageFeedbackPayload(row: unknown): z.infer<typeof usageFeedbackPayloadSchema> | null {
  const usageRow = usageFeedbackRowSchema.safeParse(row);
  if (!usageRow.success) return null;
  try {
    return usageFeedbackPayloadSchema.parse(JSON.parse(usageRow.data.payload));
  } catch {
    return null;
  }
}

function hasAcceptedFeedback(payload: z.infer<typeof usageFeedbackPayloadSchema>): boolean {
  return payload.accepted === true || payload.accepted === 1;
}

// ── Send pipeline (SPEC §7) ──
const sendTextSchema = z.string().min(1).max(20_000);
const sendMessageSchema = z.object({
  accountId: idSchema,
  chatId: idSchema,
  // [NEXT] sequences are small by construction (legacy splitter output).
  parts: z.array(sendTextSchema).min(1).max(10),
});
const sendRetrySchema = z.object({ accountId: idSchema, localId: idSchema, text: sendTextSchema });
const sendRowRefSchema = z.object({ accountId: idSchema, localId: idSchema });
const sendSequenceSchema = z.object({ accountId: idSchema, sequenceId: idSchema });
const messageRefSchema = z.object({ accountId: idSchema, chatId: idSchema, messageId: idSchema });
const draftSetSchema = z.object({ accountId: idSchema, chatId: idSchema, text: z.string().max(20_000) });
const draftStoredSchema = z.string();

// ── Spenders board (PLAN item 12) ──
const spendersListsSchema = z.object({ accountId: idSchema });
const spendersRosterSchema = z.object({ accountId: idSchema, listId: idSchema });
const spendersHydrateSchema = z.object({
  accountId: idSchema,
  chatId: idSchema,
  username: z.string().min(1).max(128).nullable().optional(),
});
// scope = 'all' | mapped OM list id (PLAN item 13 refresh queue)
const spendersScopeSchema = z.object({ accountId: idSchema, scope: idSchema });

// ── Online surface (variant C, flat) ──
const onlineSnapshotSchema = z.object({ accountId: idSchema, spendersOnly: z.boolean() });

// ── Vault & PPV (PRD F7) ──
const vaultListSchema = z.object({
  accountId: idSchema,
  albumId: idSchema.optional(),
  query: z.string().max(200).optional(),
  offset: z.number().int().min(0).optional(),
});
const vaultAlbumsSchema = z.object({ accountId: idSchema });
const chatGallerySchema = z.object({
  accountId: idSchema,
  chatId: idSchema,
  offset: z.number().int().min(0).optional(),
});
// Vault ids (numeric strings) or single-use ofapi_media_ ids; the engine owns
// the previews ⊆ mediaFiles and price-bounds invariants (validated pre-enqueue).
const ppvMediaIdSchema = z.string().min(1).max(64);
const sendPpvSchema = z.object({
  accountId: idSchema,
  chatId: idSchema,
  text: z.string().max(20_000), // caption may be empty (media-only message)
  price: z.number().min(0).max(200),
  mediaFiles: z.array(ppvMediaIdSchema).min(1).max(40),
  previews: z.array(ppvMediaIdSchema).max(40),
});
const guardScanSchema = z.object({ text: z.string().max(20_000) });
const guardBlocksSchema = z.object({
  accountId: idSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

function draftKey(accountId: string, chatId: string): string {
  return `draft.${accountId}.${chatId}`;
}

function outboxToVM(row: OutboxRow): OutboxItemVM {
  return {
    localId: row.localId,
    chatId: row.chatId,
    text: row.text,
    transport: row.transport,
    state: row.state,
    messageId: row.messageId,
    sequenceId: row.sequenceId,
    partIndex: row.partIndex,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    textHighlights: row.textHighlights,
    price: row.price,
    mediaCount: row.mediaFiles.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Coordinator surface pinned for the parallel ai-coordinator build. */
export interface AiCoordinatorLike {
  start(req: AiStartRequest): void;
  cancel(operationId: string): void;
  conversationOpened(accountId: string, chatId: string): void;
  conversationClosed(accountId: string, chatId: string): void;
  /** Stage 31: completed-op lookup for acceptance correlation. */
  getOperationContext?(operationId: string): {
    operationId: string;
    requestId: string | null;
    feature: string;
    accountId: string;
    chatId: string;
    parts: string[];
  } | null;
  /** C5: dedup an ai_spend_log insert-counter increment for a kernel-lane op
   * (see cmd:ai.feedback). True the first time for this operationId. */
  markOperationAccepted?(operationId: string): boolean;
}

export interface ReadRuntimeProbeResult {
  /**
   * Set only after the same probe proves the stored token dead and the pasted
   * key valid. SettingsStore records and replays this deletion in the same
   * durable intent as key promotion.
   */
  deleteDeadDeviceToken?: boolean;
  /** Non-custody side effects (redactor/log refresh) after commit. */
  afterCommit?: () => Promise<void>;
}

export interface IpcDeps {
  data: DataLayer;
  settingsStore: SettingsStore;
  /** Resolves the navigation gate for the sending WebContents only. */
  onRendererReady?: (webContentsId: number) => void;
  /** hubStatus/hubActivity are HubAwareSync extensions; plain providers report hub 'off'. */
  sync: ActivitySync | null;
  /** I116-2 (W4.1): true while boot-time runtime activation failed AUTH —
   *  sync is null then, and reporting hub:'off' hid the failure behind a
   *  false "not configured". Cleared by any successful runtime rebuild. */
  bootHubAuthFailed?: () => boolean;
  creditMeter: CreditMeter | null;
  coordinator: AiCoordinatorLike | null;
  /** Stage 31 acceptance lifecycle: copied/inserted (feedback) and
   * sent+edited (send-path observer) enqueue here; absent = lane off. */
  acceptance?: AcceptanceSeam | null;
  /** Stage 31: kernel persona CRUD (personas are kernel config); null while
   * the hub is unconfigured — the local KV serves as the offline cache. */
  personas?: {
    list: (expectedHubOrigin?: string) => Promise<Array<{
      key: string;
      displayName: string;
      systemBlock: string;
      updatedAt: string;
      version?: number;
    }>>;
    upsert: (args: {
      key: string;
      displayName: string;
      systemBlock: string;
      expectedVersion: number | null;
      expectedHubOrigin?: string;
    }) => Promise<PersonaUpsertOutcome | void>;
    archive: (args: {
      key: string;
      expectedVersion: number | null;
      expectedHubOrigin?: string;
    }) => Promise<unknown>;
  } | null;
  /** Null until an OFAPI read transport exists (same lifecycle as sync). */
  send: SendEngine | null;
  /** Synchronous Message Guard runtime; created at DB boot. */
  messageGuard?: MessageGuardRuntime | null;
  /** Vault browsing/gallery (PRD F7); null/absent until an OFAPI read transport exists.
   *  Optional (not `| null` alone) so pre-P5 IpcDeps call sites stay valid. */
  vault?: VaultService | null;
  /** Spenders board (PLAN item 12); null/absent until an OFAPI read transport exists. */
  spenders?: SpendersService | null;
  /** Spenders freshness: hydrate TTL guard + scoped refresh queue (PLAN item 13). */
  spendersRefresh?: SpendersRefreshService | null;
  /** Online-now surface (variant C); null/absent until an OFAPI read transport exists. */
  online?: OnlineService | null;
  purge: () => Promise<void>;
  /** Settings "Test" buttons; probes the STORED key. Optional like vault. */
  testKey?: (provider: KeyTestProvider) => Promise<KeyTestResultVM>;
  /** Stage 24: one-time hub device-token sign-in (Settings → Hub). */
  hubAuth?: {
    issueDeviceToken: (args: { username: string; password: string }) => Promise<HubDeviceTokenResultVM>;
    /** Security-first recovery: deletes the token, deactivates its runtime, then tries fallback. */
    signOutDevice: () => Promise<void>;
  } | null;
  /** Danger-zone capabilities (paths/shell live only in the composition root). */
  localData?: {
    stats: () => Promise<LocalDataStatsVM>;
    openFolder: () => Promise<void>;
    exportDiagnostics: () => Promise<{ path: string }>;
  } | null;
  /** Stage 12: one-time local-history harvest (Settings → Danger Zone). */
  harvest?: {
    start: () => Promise<{ manifestPath: string | null }>;
    pause: () => void;
    status: () => HarvestStatusVM;
  } | null;
  /** Settings → Updates (PLAN item 11). Always present; returns `unsupported`
   *  off win32-packaged builds. status/check/install read the lazily-created
   *  update controller in the composition root. */
  updates?: {
    status: () => UpdateStatusVM;
    check: () => Promise<UpdateStatusVM>;
    install: () => void;
  } | null;
  /**
   * 4a: validate a candidate read runtime built from a hubApiKey/hubBaseUrl
   * patch's overrides BEFORE it is persisted. Rejects (throws) with the
   * validation error when the credential/URL fails account bootstrap; resolves
   * (no-op) when the patch clears the hub or leaves nothing to probe. The
   * caller persists ONLY after this resolves, so a bad key never reaches the
   * keychain or the settings table (SPEC §15 — no half-applied credential).
  */
  probeReadRuntimeForPatch?: (rawPatch: unknown) => Promise<ReadRuntimeProbeResult | void>;
  /**
   * Serializes the complete validate/persist/cleanup/rebuild transaction with
   * device-token issue/sign-out. When provided, onOfapiRuntimeConfigChanged is
   * invoked inside this task and therefore must not re-enter the same queue.
   */
  runReadRuntimeMutation?: <Result>(task: () => Promise<Result>) => Promise<Result>;
  /** Called inside the mutation above when settings.update changes Hub credentials. */
  onOfapiRuntimeConfigChanged?: () => void | Promise<void>;
  /**
   * Called after any settings.update that touched hubApiKey/hubBaseUrl. Key
   * writes go to the keychain and publish no settings-table change, so this
   * hook is the only reconnect signal for key-only edits.
   */
  onHubConfigChanged?: () => void | Promise<void>;
  /** Diagnostics log sink (SPEC §11); absent in builds without a logger (tests). */
  logger?: Logger;
  getCoreCreditsSummary?: () => Promise<ActivityVM['credits']['core'] | null>;
}

function normalizePersonality(
  parsed: z.infer<typeof storedPersonalitySchema>,
): Personality {
  return {
    id: parsed.id,
    name: parsed.name,
    content: parsed.content,
    updatedAt: parsed.updatedAt,
    ...(parsed.remoteVersion !== undefined ? { remoteVersion: parsed.remoteVersion } : {}),
    ...(parsed.builtin !== undefined ? { builtin: parsed.builtin } : {}),
    ...(parsed.builtinVersion !== undefined ? { builtinVersion: parsed.builtinVersion } : {}),
  };
}

/** Stage 31: personas are kernel config; the local KV is the offline cache.
 * A fresh install still shows a mappable builtin entry — its content is a
 * placeholder until the first kernel refresh replaces it. */
export function loadPersonalities(
  data: DataLayer,
  scope: PersonaStorageScope | null,
): Personality[] {
  const cacheKey = personaCacheKey(scope);
  const raw = data.settings.get(cacheKey);
  if (raw !== undefined) {
    const parsed = storedPersonalitiesSchema.safeParse(raw);
    if (parsed.success) {
      // An authoritative Core list may legitimately be empty. Distinguish that
      // from an unset cache so an archived final persona is not re-created as a
      // local placeholder and later migrated back to Core.
      return parsed.data.map(normalizePersonality);
    }
  }
  const fallback: Personality[] = [{
    id: 'builtin:lora',
    name: 'Lora',
    content: '(kernel-managed persona — connect Agency Hub to view and edit)',
    updatedAt: 0,
    builtin: true,
  }];
  // Preserve corrupt user data for diagnostics/recovery. Only initialize a
  // placeholder when the scoped cache truly has no row.
  if (raw === undefined) {
    data.settings.set(cacheKey, fallback);
  }
  return fallback;
}

/** Kernel → local Personality mapping (the picker/editor VM shape). */
function kernelPersonaToLocal(persona: {
  key: string;
  displayName: string;
  systemBlock: string;
  updatedAt: string;
  version?: number;
}): Personality {
  const updatedAt = Date.parse(persona.updatedAt);
  return {
    id: persona.key,
    name: persona.displayName,
    content: persona.systemBlock,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    ...(persona.version !== undefined ? { remoteVersion: persona.version } : {}),
    ...(persona.key === 'builtin:lora' ? { builtin: true } : {}),
  };
}

function samePersonalityList(left: readonly Personality[], right: readonly Personality[]): boolean {
  return left.length === right.length && left.every((personality, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && candidate.id === personality.id
      && candidate.name === personality.name
      && candidate.content === personality.content
      && candidate.updatedAt === personality.updatedAt
      && candidate.remoteVersion === personality.remoteVersion
      && candidate.builtin === personality.builtin
      && candidate.builtinVersion === personality.builtinVersion;
  });
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { data, settingsStore } = deps;
  // A remote list request may outlive a save/archive that started after it.
  // Fence cache commits with a mutation revision so that the delayed snapshot
  // cannot roll the local cache back (and then be pushed back to Core at the
  // next runtime bootstrap). Reads also remember the newest committed request
  // so two overlapping list responses cannot regress each other.
  let personaMutationRevision = 0;
  let personaMutationsInFlight = 0;
  let nextPersonaListRequest = 0;
  let latestCommittedPersonaListRequest = 0;

  const resolvePersonaContext = async (): Promise<{
    scope: PersonaStorageScope | null;
    hubOrigin: string | null;
  }> => {
    const settings = await settingsStore.get();
    return {
      scope: ensurePersonaStorageScope(data.settings, settings.hubBaseUrl),
      hubOrigin: settings.hubBaseUrl === null
        ? null
        : new URL(settings.hubBaseUrl).origin,
    };
  };

  const beginPersonaMutation = (): (() => void) => {
    personaMutationsInFlight += 1;
    personaMutationRevision += 1;
    let ended = false;
    return () => {
      if (ended) {
        return;
      }
      ended = true;
      personaMutationsInFlight -= 1;
      personaMutationRevision += 1;
    };
  };

  const cachedPersonalitiesWithPending = (scope: PersonaStorageScope | null): Personality[] => {
    const cached = loadPersonalities(data, scope);
    try {
      return applyPendingPersonaIntents(cached, loadPendingPersonaIntents(data.settings, scope));
    } catch (error) {
      // A corrupt journal must fail closed: preserve the local cache and never
      // let a remote snapshot erase an intent we can no longer interpret.
      deps.logger?.warn('hub', 'pending persona journal could not be read', safeErrorOutcome(error));
      return cached;
    }
  };

  const projectConfirmedPendingPersona = async (
    scope: PersonaStorageScope | null,
    intent: PendingPersonaIntent,
    confirmedVersion?: number,
  ): Promise<boolean> => {
    // The operation may have been superseded while its request was in flight.
    // In that case the newer journal entry is the only local source of truth.
    if (!isCurrentPendingPersonaIntent(data.settings, scope, intent)) {
      return false;
    }
    const projectedIntent = intent.kind === 'upsert' && confirmedVersion !== undefined
      ? {
          ...intent,
          personality: { ...intent.personality, remoteVersion: confirmedVersion },
        }
      : intent;
    if (intent.kind === 'archive') {
      // A restart can occur after the tombstone is journaled but before the
      // normal delete handler reaches its mapping cascade. Mapping removal is
      // persisted first so a crash cannot leave AI enabled for an archived key.
      const mappings = Object.fromEntries(
        Object.entries(loadPersonaAccountMappings(data.settings, scope))
          .filter(([, pid]) => pid !== intent.key),
      );
      storePersonaAccountMappings(data.settings, scope, mappings);
    }
    data.settings.set(
      personaCacheKey(scope),
      applyPendingPersonaIntents(loadPersonalities(data, scope), [projectedIntent]),
    );
    return true;
  };

  const retryPendingPersonas = async (
    personas: NonNullable<IpcDeps['personas']>,
    scope: PersonaStorageScope | null,
    hubOrigin: string,
  ): Promise<void> => {
    const snapshot = loadPendingPersonaIntents(data.settings, scope);
    for (const intent of snapshot) {
      if (!isCurrentPendingPersonaIntent(data.settings, scope, intent)) {
        continue;
      }
      let confirmedByCore = false;
      let confirmedVersion: number | undefined;
      let conflictResolved = false;
      try {
        if (intent.kind === 'upsert') {
          const outcome = await personas.upsert({
            key: intent.key,
            displayName: intent.personality.name,
            systemBlock: intent.personality.content,
            expectedVersion: intent.expectedVersion,
            expectedHubOrigin: hubOrigin,
          });
          if (outcome !== undefined) {
            if (outcome.kind === 'upserted') {
              confirmedVersion = outcome.persona.version;
            } else {
              // HubModule's finite 409 reconciler already projected the remote
              // authoritative/recovered state and CAS-cleared this intent.
              conflictResolved = true;
            }
          }
        } else {
          await personas.archive({
            key: intent.key,
            expectedVersion: intent.expectedVersion,
            expectedHubOrigin: hubOrigin,
          });
        }
        confirmedByCore = true;
      } catch (error) {
        const failure = classifyPersonaMutationFailure(error, intent.kind);
        if (failure === 'already-archived') {
          confirmedByCore = true;
        } else {
          // Background replay never discards an acknowledged local mutation —
          // even a 4xx may be an auth/config problem that an operator can repair.
          deps.logger?.warn('hub', 'pending persona replay deferred', {
            personaKey: intent.key,
            mutation: intent.kind,
            failure,
            ...safeErrorOutcome(error),
          });
          if (failure === 'retryable') {
            // A transport outage applies to the lane, not just this key. Stop
            // after one bounded attempt instead of serially paying as many as
            // 128 request timeouts from a single UI list refresh.
            return;
          }
        }
      }
      if (!confirmedByCore) {
        continue;
      }
      if (conflictResolved) {
        continue;
      }
      try {
        // Project the acknowledged intent into the cache before clearing it.
        // Otherwise a crash here can leave an old cache with no tombstone and
        // the next bootstrap will resurrect it back into Core.
        if (await projectConfirmedPendingPersona(scope, intent, confirmedVersion)) {
          clearPendingPersonaIntent(data.settings, scope, intent);
        }
      } catch (error) {
        deps.logger?.warn('hub', 'pending persona replay deferred', {
          personaKey: intent.key,
          mutation: intent.kind,
          failure: 'local-projection',
          ...safeErrorOutcome(error),
        });
        return;
      }
    }
  };

  ipcMain.handle('query:accounts.list', async () => {
    const settings = await settingsStore.get();
    return data.accounts.list().map((row) =>
      accountToVM(row, row.avatar, settings.accountMappings[row.id] ?? null),
    );
  });

  ipcMain.handle('query:chats.list', (_event, rawArgs: unknown) => {
    const args = chatsListSchema.parse(rawArgs);
    const page = data.chats.list({
      accountId: args.accountId,
      filter: args.filter,
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
      ...(args.offset !== undefined ? { offset: args.offset } : {}),
    });
    return { items: page.items.map((row) => chatToVM(row, row.avatar)), hasMore: page.hasMore };
  });

  ipcMain.handle('query:chats.get', (_event, rawArgs: unknown) => {
    const args = chatGetSchema.parse(rawArgs);
    const row = data.chats.get(args.accountId, args.chatId);
    return row === null ? null : chatRowToVM(row, row.avatar);
  });

  ipcMain.handle('query:chats.search', (_event, rawArgs: unknown) => {
    const args = chatsSearchSchema.parse(rawArgs);
    return data.chats.search(args).map((row) => chatToVM(row, row.avatar));
  });

  ipcMain.handle('query:messages.page', (_event, rawArgs: unknown) => {
    const args = messagesPageSchema.parse(rawArgs);
    const page = data.messages.page({
      accountId: args.accountId,
      chatId: args.chatId,
      ...(args.beforeId !== undefined ? { beforeId: args.beforeId } : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    });
    return { items: page.items.map(messageToVM), hasMore: page.hasMore };
  });

  ipcMain.handle('query:fan.get', (_event, rawArgs: unknown) => {
    const args = fanGetSchema.parse(rawArgs);
    const row = data.fans.get(args.accountId, args.fanId);
    if (!row) {
      return null;
    }
    const summary = data.summaries.get(args.accountId, args.fanId);
    return fanToVM(row, row.avatar, summary);
  });

  ipcMain.handle('query:settings.get', () => settingsStore.get());

  ipcMain.handle('cmd:app.rendererReady', (event, rawArgs: unknown) => {
    z.undefined().parse(rawArgs);
    deps.onRendererReady?.(event.sender.id);
  });

  ipcMain.handle('query:personalities.list', async () => {
    const context = await resolvePersonaContext();
    const { scope } = context;
    const hubOrigin = context.hubOrigin;
    const personas = hubOrigin === null ? null : deps.personas;
    if (personas && hubOrigin !== null) {
      // Do not start a read whose snapshot is already known to overlap a
      // mutation. The cached copy is the only coherent view until the write
      // finishes.
      if (personaMutationsInFlight > 0) {
        return cachedPersonalitiesWithPending(scope);
      }

      // A list is also the reconnect/retry signal for durable offline edits.
      // Fence the replay as a mutation so another list cannot observe its
      // intermediate state; same-key wire ordering remains owned by HubModule.
      try {
        if (loadPendingPersonaIntents(data.settings, scope).length > 0) {
          const endReplay = beginPersonaMutation();
          try {
            await retryPendingPersonas(personas, scope, hubOrigin);
            // The retry may have just cleared an acknowledged intent. Serve
            // its locally projected state for this trigger instead of issuing
            // an immediate list that could still be an older replica/cache
            // snapshot. The next ordinary list remains authoritative.
            const current = await resolvePersonaContext();
            return cachedPersonalitiesWithPending(current.scope);
          } finally {
            endReplay();
          }
        }
      } catch (error) {
        deps.logger?.warn('hub', 'pending persona replay could not start', safeErrorOutcome(error));
        const current = await resolvePersonaContext();
        return cachedPersonalitiesWithPending(current.scope);
      }
      if (personaMutationsInFlight > 0) {
        return cachedPersonalitiesWithPending(scope);
      }

      const requestId = ++nextPersonaListRequest;
      const mutationRevision = personaMutationRevision;
      try {
        const remote = (await personas.list(hubOrigin)).map(kernelPersonaToLocal);
        const current = await resolvePersonaContext();
        if (
          current.hubOrigin !== hubOrigin
          || !samePersonaStorageScope(scope, current.scope)
        ) {
          // A response from a retired Hub must not populate or even render as
          // the newly active Hub's persona state.
          return cachedPersonalitiesWithPending(current.scope);
        }
        const cachedBeforeList = loadPersonalities(data, scope);
        const merged = mergeRemotePersonas(
          remote,
          cachedBeforeList,
          loadPendingPersonaIntents(data.settings, scope),
        );
        const mayCommit =
          personaMutationsInFlight === 0 &&
          personaMutationRevision === mutationRevision &&
          requestId > latestCommittedPersonaListRequest;
        if (mayCommit) {
          latestCommittedPersonaListRequest = requestId;
          // Core's active list is authoritative for mapping validity. A
          // persona archived on another device must disable its local account
          // mappings before the cache commit; otherwise the coordinator keeps
          // sending a key Core now rejects as Unknown persona. Pending upserts
          // remain in `merged` and retain their mappings until replay settles.
          const activeKeys = new Set(
            merged.filter(isWritablePersonality).map((persona) => persona.id),
          );
          const mappings = loadPersonaAccountMappings(data.settings, scope);
          const prunedMappings = Object.fromEntries(
            Object.entries(mappings).filter(([, personaId]) => activeKeys.has(personaId)),
          );
          if (Object.keys(prunedMappings).length !== Object.keys(mappings).length) {
            // Disable stale mappings first. A crash between these two KV writes
            // is safe (AI is gated) and the next list repairs the cache.
            storePersonaAccountMappings(data.settings, scope, prunedMappings);
          }
          // Settings writes publish a renderer invalidation for this query.
          // Avoid a list -> identical cache write -> list feedback loop.
          if (!samePersonalityList(cachedBeforeList, merged)) {
            data.settings.set(personaCacheKey(scope), merged);
          }
          return merged;
        }
      } catch {
        // Kernel unreachable — the cached copy serves (offline tolerance).
      }
    }
    const current = await resolvePersonaContext();
    return cachedPersonalitiesWithPending(current.scope);
  });

  ipcMain.handle('query:sync.status', (): SyncStatusVM => {
    const snapshot = deps.creditMeter?.snapshot() ?? null;
    const syncStatus = deps.sync?.status() ?? { freshness: {}, state: 'offline' as const };
    // I116-2 (W4.1): a boot-auth failure leaves sync null — surface it as
    // 'auth-failed' so the banner and sign-out UI engage instead of the
    // false "not configured".
    const hubStatus =
      deps.sync?.hubStatus?.() ??
      (deps.bootHubAuthFailed?.() === true ? ('auth-failed' as const) : ('off' as const));
    const hubActivity = deps.sync?.hubActivity?.() ?? null;
    const today = utcDayOf(Date.now());
    return {
      creditsBalance: snapshot?.balance ?? null,
      creditsUsedToday: snapshot?.usedToday ?? 0,
      rpmRemaining: snapshot?.rpmRemaining ?? null,
      freshness: syncStatus.freshness,
      listVerifiedAt: syncStatus.listVerifiedAt ?? syncStatus.freshness,
      state: hubStatus === 'live' ? 'live' : syncStatus.state,
      hub: hubStatus,
      hubMode: deps.sync?.hubMode?.() ?? 'off',
      hubModeOverride: deps.sync?.hubModeOverride?.() ?? 'auto',
      hubLastEventAt:
        hubActivity?.lastEventAt == null ? null : new Date(hubActivity.lastEventAt).toISOString(),
      hubLastEventType: hubActivity?.lastEventType ?? null,
      hubEventsToday: hubActivity?.eventsToday ?? 0,
      hubAppliedEventsToday: hubActivity?.appliedEventsToday ?? 0,
      hubDroppedEventsToday:
        (hubActivity?.droppedEventsToday ?? 0) + (hubActivity?.droppedFrames ?? 0),
      hubFallbackEventsToday: hubActivity?.fallbackEventsToday ?? 0,
      hubEventsByTypeToday: hubActivity?.eventsByTypeToday ?? {},
      hubAppliedByTypeToday: hubActivity?.appliedByTypeToday ?? {},
      hubFallbackByTypeToday: hubActivity?.fallbackByTypeToday ?? {},
      hubDroppedByTypeToday: hubActivity?.droppedByTypeToday ?? {},
      hubFallbackByReasonToday: hubActivity?.fallbackByReasonToday ?? {},
      hubLifetime: hubActivity?.lifetime ?? EMPTY_HUB_TELEMETRY,
      hubLastFallbackReason: hubActivity?.lastFallbackReason ?? null,
      aiTodayUsd: aiTodayUsd(data, today),
      sendsToday: sendsToday(data, today),
    };
  });

  // ── Settings → Activity panel (PLAN item 9; read-only) ──
  ipcMain.handle('query:activity.summary', async () => {
    const settings = await settingsStore.get();
    const coreCredits = await deps.getCoreCreditsSummary?.().catch((error) => {
      deps.logger?.warn('hub', 'core OFAPI credit summary unavailable', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }) ?? null;
    return buildActivitySummary({
      data,
      sync: deps.sync,
      creditMeter: deps.creditMeter,
      coreCredits,
      // Stage 31: AI is the kernel feature lane — configured = hub transport up.
      ai: { gatewayConfigured: settings.hubBaseUrl !== null && (settings.hasHubKey || settings.hasHubDeviceToken) },
    });
  });

  ipcMain.handle('query:outbox.audit', (_event, rawArgs: unknown) => {
    const args = z.object({ accountId: idSchema.optional() }).parse(rawArgs ?? {});
    return auditOutbox(data, args.accountId !== undefined ? { accountId: args.accountId } : {});
  });

  function requireMessageGuard(): MessageGuardRuntime {
    if (!deps.messageGuard) {
      throw new Error('Message Guard is not available in this build.');
    }
    return deps.messageGuard;
  }

  ipcMain.handle('query:guard.config', () => requireMessageGuard().getPolicy());

  ipcMain.handle('cmd:guard.config.update', (_event, rawArgs: unknown) => {
    const policy = messageGuardPolicySchema.parse(rawArgs);
    return requireMessageGuard().updatePolicy(policy);
  });

  ipcMain.handle('query:guard.scan', (_event, rawArgs: unknown) => {
    const args = guardScanSchema.parse(rawArgs);
    return requireMessageGuard().scan(args.text);
  });

  ipcMain.handle('query:guard.blocks', (_event, rawArgs: unknown) => {
    const args = guardBlocksSchema.parse(rawArgs ?? {});
    return requireMessageGuard().blocks({
      ...(args.accountId !== undefined ? { accountId: args.accountId } : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    });
  });

  ipcMain.handle('query:ai.featureCosts', () => buildFeatureCosts(data));

  ipcMain.handle('cmd:keys.test', (_event, rawArgs: unknown) => {
    const args = keysTestSchema.parse(rawArgs);
    if (!deps.testKey) {
      throw new Error('Key testing is not available in this build.');
    }
    return deps.testKey(args.provider);
  });

  ipcMain.handle('cmd:hub.issueDeviceToken', (_event, rawArgs: unknown) => {
    const args = hubIssueDeviceTokenSchema.parse(rawArgs);
    if (!deps.hubAuth) {
      throw new Error('Hub sign-in is not available in this build.');
    }
    return deps.hubAuth.issueDeviceToken(args);
  });

  ipcMain.handle('cmd:hub.signOutDevice', async (_event, rawArgs: unknown) => {
    hubSignOutDeviceSchema.parse(rawArgs ?? {});
    if (!deps.hubAuth) {
      throw new Error('Hub sign-in is not available in this build.');
    }
    await deps.hubAuth.signOutDevice();
  });

  function requireLocalData(): NonNullable<IpcDeps['localData']> {
    if (!deps.localData) {
      throw new Error('Local-data tools are not available in this build.');
    }
    return deps.localData;
  }

  ipcMain.handle('query:localData.stats', () => requireLocalData().stats());
  ipcMain.handle('cmd:localData.openFolder', () => requireLocalData().openFolder());
  ipcMain.handle('cmd:localData.exportDiagnostics', () => requireLocalData().exportDiagnostics());

  function requireHarvest(): NonNullable<IpcDeps['harvest']> {
    if (!deps.harvest) {
      throw new Error('History harvest is not available in this build.');
    }
    return deps.harvest;
  }

  ipcMain.handle('query:harvest.status', () => requireHarvest().status());
  // Fire-and-forget on purpose: the run outlives any sane IPC timeout; the
  // renderer polls query:harvest.status for progress. Errors land in status().
  ipcMain.handle('cmd:harvest.start', () => {
    void requireHarvest().start().catch(() => undefined);
    return { manifestPath: null };
  });
  ipcMain.handle('cmd:harvest.pause', () => requireHarvest().pause());

  // Renderer log feed: render crashes, unhandled rejections and failed IPC calls
  // funnel here so renderer-side problems share the exported log file (SPEC §11).
  ipcMain.handle('cmd:diag.logClient', (_event, rawArgs: unknown) => {
    const args = logClientSchema.parse(rawArgs);
    deps.logger?.log(args.level, `renderer:${args.scope}`, args.message, args.fields);
  });

  function requireUpdates(): NonNullable<IpcDeps['updates']> {
    if (!deps.updates) {
      throw new Error('Auto-update is not available in this build.');
    }
    return deps.updates;
  }

  ipcMain.handle('query:updates.status', () => requireUpdates().status());
  ipcMain.handle('cmd:updates.check', () => requireUpdates().check());
  ipcMain.handle('cmd:updates.install', () => requireUpdates().install());

  ipcMain.handle('query:ai.pingGate', (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    const rows = data.messages.page({ ...args, limit: 100 }).items.filter((row) => !row.deleted);
    const transcript = rows.map((row) => ({
      id: Number(row.messageId) || 0,
      createdAtMs: Date.parse(row.createdAt) || 0,
      sender: row.isSentByMe ? ('Model' as const) : ('Fan' as const),
      text: row.textPlain,
      labels: [],
    }));
    const analysis = analyzePingSegment(transcript, Date.now());
    return { segment: analysis.segment, blocked: analysis.segment === 'active' };
  });

  ipcMain.handle('cmd:conversation.open', async (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    const startedAt = Date.now();
    const localCountBefore = safeMessageCount(data, args.accountId, args.chatId);
    const lastMessageId = safeLastMessageId(data, args.accountId, args.chatId);
    deps.logger?.info('conversation', 'diag conversation.open requested', {
      accountId: args.accountId,
      chatId: args.chatId,
      lastMessageId,
      localCountBefore,
    });
    if (!deps.sync) {
      deps.logger?.warn('conversation', 'diag conversation.open skipped', {
        accountId: args.accountId,
        chatId: args.chatId,
        lastMessageId,
        localCountBefore,
        localCountAfter: localCountBefore,
        result: 'skipped_no_sync',
        elapsedMs: Date.now() - startedAt,
      });
      return {
        result: 'skipped_no_sync',
        localCountBefore,
        localCountAfter: localCountBefore,
      };
    }
    try {
      await deps.sync.openConversation(args.accountId, args.chatId);
      const localCountAfter = safeMessageCount(data, args.accountId, args.chatId);
      const result = conversationLoadResult(localCountBefore, localCountAfter);
      deps.logger?.info('conversation', 'diag conversation.open outcome', {
        accountId: args.accountId,
        chatId: args.chatId,
        lastMessageId,
        localCountBefore,
        localCountAfter,
        result,
        elapsedMs: Date.now() - startedAt,
      });
      return { result, localCountBefore, localCountAfter };
    } catch (error) {
      const localCountAfter = safeMessageCount(data, args.accountId, args.chatId);
      deps.logger?.warn('conversation', 'diag conversation.open failed', {
        accountId: args.accountId,
        chatId: args.chatId,
        lastMessageId,
        localCountBefore,
        localCountAfter,
        result: 'failed',
        elapsedMs: Date.now() - startedAt,
        ...safeErrorOutcome(error),
      });
      throw error;
    }
  });

  ipcMain.handle('cmd:conversation.close', (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    deps.sync?.closeConversation(args.accountId, args.chatId);
  });

  // Manual in-chat ↻: a deliberate single-chat user read. Uses the same force
  // path as opening the chat (bypasses the auto-read gate), but does NOT touch
  // openConversation focus, the read-state sweep, or the AI coordinator — it
  // only pulls this chat's message tail now instead of waiting for the poll.
  ipcMain.handle('cmd:conversation.refresh', async (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    const startedAt = Date.now();
    const localCountBefore = safeMessageCount(data, args.accountId, args.chatId);
    const lastMessageId = safeLastMessageId(data, args.accountId, args.chatId);
    deps.logger?.info('conversation', 'diag conversation.refresh requested', {
      accountId: args.accountId,
      chatId: args.chatId,
      lastMessageId,
      localCountBefore,
    });
    if (!deps.sync) {
      deps.logger?.warn('conversation', 'diag conversation.refresh skipped', {
        accountId: args.accountId,
        chatId: args.chatId,
        lastMessageId,
        localCountBefore,
        localCountAfter: localCountBefore,
        result: 'skipped_no_sync',
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }
    try {
      await deps.sync.readChatTailForUserOpen(args.accountId, args.chatId, 'chat-refresh');
      const localCountAfter = safeMessageCount(data, args.accountId, args.chatId);
      deps.logger?.info('conversation', 'diag conversation.refresh outcome', {
        accountId: args.accountId,
        chatId: args.chatId,
        lastMessageId,
        localCountBefore,
        localCountAfter,
        result: conversationLoadResult(localCountBefore, localCountAfter),
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      const localCountAfter = safeMessageCount(data, args.accountId, args.chatId);
      deps.logger?.warn('conversation', 'diag conversation.refresh failed', {
        accountId: args.accountId,
        chatId: args.chatId,
        lastMessageId,
        localCountBefore,
        localCountAfter,
        result: 'failed',
        elapsedMs: Date.now() - startedAt,
        ...safeErrorOutcome(error),
      });
      throw error;
    }
  });

  ipcMain.handle('cmd:conversation.loadOlder', async (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    return deps.sync?.loadOlderMessagesForUserOpen(args.accountId, args.chatId) ?? {
      returned: 0,
      fresh: 0,
      hasOlder: false,
    };
  });

  ipcMain.handle('cmd:sync.forceRefresh', async (_event, rawArgs: unknown) => {
    const args = forceRefreshSchema.parse(rawArgs ?? {});
    await deps.sync?.forceRefresh(args.accountId);
  });

  ipcMain.handle('cmd:sync.reconcileUnread', async (_event, rawArgs: unknown) => {
    const args = reconcileUnreadSchema.parse(rawArgs ?? {});
    await deps.sync?.reconcileUnread(args.accountId, args.trigger ?? 'manual');
  });

  ipcMain.handle('cmd:sync.focusAccount', (_event, rawArgs: unknown) => {
    const args = focusAccountSchema.parse(rawArgs);
    deps.sync?.setFocusedAccount(args.accountId);
  });

  ipcMain.handle('cmd:settings.update', async (_event, rawPatch: unknown) => {
    const rawPatchObject = typeof rawPatch === 'object' && rawPatch !== null;
    const mayTouchReadRuntime =
      rawPatchObject && ('hubApiKey' in rawPatch || 'hubBaseUrl' in rawPatch);
    const persistPatch = async () => {
      // Recompute under the credential queue: two overlapping URL patches must
      // not make this decision from an obsolete pre-lock settings snapshot.
      let touchedReadRuntime = rawPatchObject && 'hubApiKey' in rawPatch;
      if (rawPatchObject && 'hubBaseUrl' in rawPatch) {
        const current = await settingsStore.get();
        touchedReadRuntime = touchedReadRuntime || rawPatch.hubBaseUrl !== current.hubBaseUrl;
      }
      // 4a (SPEC §15): for hub-affecting keys, VALIDATE a candidate read runtime
      // built from the patch overrides BEFORE persisting. A bad key/URL rejects
      // here with nothing written to the keychain or the settings table — no
      // half-applied credential. Non-hub patches keep persist-then-return.
      const probeResult =
        touchedReadRuntime && deps.probeReadRuntimeForPatch
          ? await deps.probeReadRuntimeForPatch(rawPatch)
          : undefined;
      // A dead device token shadows both the old and candidate chatter keys.
      // Its deletion is part of SettingsStore's durable transition: before the
      // intent the old state is intact; after it, restart recovery repeats both
      // token cleanup and candidate-key promotion. The outer credential FIFO
      // also prevents deleting a subsequently issued token by name.
      const result = await settingsStore.update(rawPatch, {
        deleteDeadHubDeviceToken: probeResult?.deleteDeadDeviceToken === true,
      });
      await probeResult?.afterCommit?.();
      if (touchedReadRuntime) {
        await deps.onOfapiRuntimeConfigChanged?.();
      }
      return result;
    };
    // The token cleanup deletes by keychain name. Keep it under the same FIFO
    // ownership as sign-in/sign-out so it cannot delete a newer token that was
    // issued while a validated settings update was awaiting persistence.
    const result = mayTouchReadRuntime && deps.runReadRuntimeMutation !== undefined
      ? await deps.runReadRuntimeMutation(persistPatch)
      : await persistPatch();
    // Fires on hub-mode override patches only. Hub URL/key/read-transport edits
    // rebuild the read runtime above, after account-bootstrap validation.
    const touchedHubOverride =
      typeof rawPatch === 'object' &&
      rawPatch !== null &&
      'hubModeOverride' in rawPatch;
    if (touchedHubOverride) {
      await deps.onHubConfigChanged?.();
    }
    const touchedGuard =
      typeof rawPatch === 'object' &&
      rawPatch !== null &&
      ('messageGuardPolicy' in rawPatch || 'guardConfigTransport' in rawPatch);
    if (touchedGuard) {
      data.bus.publish({ scope: 'guard' });
    }
    return result;
  });

  ipcMain.handle('cmd:personalities.save', async (_event, rawArgs: unknown) => {
    const personality = normalizePersonality(writablePersonalitySchema.parse(rawArgs));
    const context = await resolvePersonaContext();
    const { scope } = context;
    const endMutation = beginPersonaMutation();
    try {
      const currentPending = loadPendingPersonaIntents(data.settings, scope)
        .find((candidate) => candidate.key === personality.id) ?? null;
      const intent = createPendingPersonaUpsert(
        personality,
        personality.remoteVersion ?? null,
        currentPending?.kind === 'upsert' ? currentPending : null,
      );
      const previous = storePendingPersonaIntent(data.settings, scope, intent);
      let confirmedByCore = false;
      let confirmedVersion: number | undefined;
      let conflictResolved = false;
      const hubOrigin = context.hubOrigin;
      const personas = hubOrigin === null ? null : deps.personas;
      if (personas && hubOrigin !== null) {
        try {
          const outcome = await personas.upsert({
            key: personality.id,
            displayName: personality.name,
            systemBlock: personality.content,
            expectedVersion: intent.expectedVersion,
            expectedHubOrigin: hubOrigin,
          });
          if (outcome !== undefined) {
            if (outcome.kind === 'upserted') {
              confirmedVersion = outcome.persona.version;
            } else {
              conflictResolved = true;
            }
          }
          confirmedByCore = true;
        } catch (error) {
          if (classifyPersonaMutationFailure(error, 'upsert') === 'client-rejected') {
            // Core rejected this request deterministically. Do not report an
            // offline success or replace a previously pending local edit.
            restorePendingPersonaIntent(data.settings, scope, intent, previous);
            throw error;
          }
          // Network/timeout/5xx: the durable intent is the retry source.
        }
      }
      if (conflictResolved) {
        const current = await resolvePersonaContext();
        return cachedPersonalitiesWithPending(current.scope);
      }
      const confirmedPersonality = confirmedVersion === undefined
        ? personality
        : { ...personality, remoteVersion: confirmedVersion };
      const existing = loadPersonalities(data, scope);
      const next = existing.some((entry) => entry.id === personality.id)
        ? existing.map((entry) => (entry.id === personality.id ? confirmedPersonality : entry))
        : [...existing, confirmedPersonality];
      data.settings.set(personaCacheKey(scope), next);
      if (confirmedByCore) {
        clearPendingPersonaIntent(data.settings, scope, intent);
      }
      const current = await resolvePersonaContext();
      return cachedPersonalitiesWithPending(current.scope);
    } finally {
      endMutation();
    }
  });

  ipcMain.handle('cmd:personalities.delete', async (_event, rawArgs: unknown) => {
    const base = normalizePersonality(personalityDeleteSchema.parse(rawArgs));
    const { id } = base;
    const context = await resolvePersonaContext();
    const { scope } = context;
    const endMutation = beginPersonaMutation();
    try {
      const intent = createPendingPersonaArchive(id, base.remoteVersion ?? null, base);
      const previous = storePendingPersonaIntent(data.settings, scope, intent);
      let confirmedByCore = false;
      const hubOrigin = context.hubOrigin;
      const personas = hubOrigin === null ? null : deps.personas;
      if (personas && hubOrigin !== null) {
        try {
          await personas.archive({
            key: id,
            expectedVersion: intent.expectedVersion,
            expectedHubOrigin: hubOrigin,
          });
          confirmedByCore = true;
        } catch (error) {
          const failure = classifyPersonaMutationFailure(error, 'archive');
          if (failure === 'already-archived') {
            confirmedByCore = true;
          } else if (failure === 'client-rejected') {
            restorePendingPersonaIntent(data.settings, scope, intent, previous);
            throw error;
          }
          // Network/timeout/5xx: keep the tombstone and retry it later.
        }
      }
      // Disable mappings before hiding the row. A crash after this write keeps
      // AI gated while the durable archive intent repairs the cache on replay.
      const mappings = Object.fromEntries(
        Object.entries(loadPersonaAccountMappings(data.settings, scope))
          .filter(([, pid]) => pid !== id),
      );
      storePersonaAccountMappings(data.settings, scope, mappings);
      const next = loadPersonalities(data, scope).filter((entry) => entry.id !== id);
      data.settings.set(personaCacheKey(scope), next);
      if (confirmedByCore) {
        clearPendingPersonaIntent(data.settings, scope, intent);
      }
      const current = await resolvePersonaContext();
      return cachedPersonalitiesWithPending(current.scope);
    } finally {
      endMutation();
    }
  });

  ipcMain.handle('cmd:mappings.set', async (_event, rawArgs: unknown) => {
    const args = mappingSchema.parse(rawArgs);
    const { scope } = await resolvePersonaContext();
    const mappings = { ...loadPersonaAccountMappings(data.settings, scope) };
    if (args.personalityId === null) {
      delete mappings[args.accountId];
    } else {
      mappings[args.accountId] = args.personalityId;
    }
    storePersonaAccountMappings(data.settings, scope, mappings);
  });

  ipcMain.handle('cmd:data.purge', () => deps.purge());

  ipcMain.handle('ai:start', (_event, rawArgs: unknown) => {
    const parsed = aiStartSchema.parse(rawArgs);
    if (!deps.coordinator) {
      throw new Error('AI is not available yet — connect Agency Hub in Settings.');
    }
    const req: AiStartRequest = {
      operationId: parsed.operationId,
      feature: parsed.feature,
      accountId: parsed.accountId,
      chatId: parsed.chatId,
      params: {
        ...(parsed.params.tone !== undefined ? { tone: parsed.params.tone } : {}),
        ...(parsed.params.mode !== undefined ? { mode: parsed.params.mode } : {}),
        ...(parsed.params.draftText !== undefined ? { draftText: parsed.params.draftText } : {}),
        ...(parsed.params.forceRegenerate !== undefined
          ? { forceRegenerate: parsed.params.forceRegenerate }
          : {}),
      },
    };
    deps.coordinator.start(req);
  });

  ipcMain.handle('ai:cancel', (_event, rawArgs: unknown) => {
    const { operationId } = aiCancelSchema.parse(rawArgs);
    deps.coordinator?.cancel(operationId);
  });

  // Acceptance-rate instrumentation (PRD §3): copy/insert actions recorded
  // next to the operation's usage event (pilot metrics) AND in the durable
  // ai_spend_log inserted counter (Activity panel "inserted" column).
  ipcMain.handle('cmd:ai.feedback', (_event, rawArgs: unknown) => {
    const args = aiFeedbackSchema.parse(rawArgs);
    const acceptedAt = new Date().toISOString();
    const acceptance = deps.acceptance ?? null;
    const payload = parseUsageFeedbackPayload(
      data.db
        .prepare('SELECT payload FROM usage_events WHERE client_event_id = @id')
        .get({ id: args.operationId }),
    );
    // payload is the pending hub event JSON; acceptance rides alongside it
    data.db
      .prepare(
        `UPDATE usage_events
         SET payload = json_set(payload, '$.accepted', 1, '$.acceptedPart', @part)
         WHERE client_event_id = @id`,
      )
      .run({ part: args.partIndex ?? null, id: args.operationId });

    // Stage 31 acceptance: correlated through the coordinator's completed-op
    // registry (the kernel lanes no longer write usage_events rows).
    const context = deps.coordinator?.getOperationContext?.(args.operationId) ?? null;
    let shouldReport = false;
    let reportingContext: FeedbackContext | null = context;

    if (payload !== null) {
      // Legacy lane: a usage_events row exists — its own `accepted` flag
      // (read above, pre-UPDATE) is the dedup.
      if (!hasAcceptedFeedback(payload)) {
        shouldReport = true;
        const day = payload.completedAt.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          data.aiSpendLog.markInserted(day, payload.feature);
        }
      }
    } else {
      // Kernel lane: remember only authoritative coordinator metadata. The
      // composition root also records the shown event, so this lookup survives
      // coordinator/runtime replacement. Renderer-supplied args.feature is
      // compatibility-only and is never trusted for accounting.
      if (context !== null) {
        data.aiAcceptance.remember({
          operationId: context.operationId,
          requestId: context.requestId,
          feature: context.feature,
          accountId: context.accountId,
          conversationId: context.chatId,
          parts: context.parts,
          day: utcDayOf(Date.now()),
          knownAt: acceptedAt,
        });
      }
      const operation = data.aiAcceptance.get(args.operationId);
      if (operation === null) {
        throw new Error('Unknown or expired AI operation; acceptance feedback was not counted.');
      }
      reportingContext = operation.accountId !== null && operation.conversationId !== null
        ? {
            operationId: operation.operationId,
            requestId: operation.requestId,
            feature: operation.feature,
            accountId: operation.accountId,
            chatId: operation.conversationId,
            parts: operation.parts,
          }
        : null;
      if (operation.acceptedAt === null) {
        // The spool append and one-way claim share ONE SQLite transaction.
        // Claiming first inside that transaction avoids duplicate enqueues;
        // an enqueue failure rolls the claim/metric back, and a crash can leave
        // neither side or both sides but never a divergent half-state.
        if (acceptance === null || reportingContext === null) {
          throw new Error('Acceptance reporting is temporarily unavailable; feedback was not consumed.');
        }
      }
      const result = operation.acceptedAt === null
        ? data.db.transaction(() => {
            const claimed = data.aiAcceptance.acceptOnce(args.operationId, acceptedAt);
            if (claimed.status === 'accepted' && acceptance !== null && reportingContext !== null) {
              acceptance.enqueue({
                operationId: reportingContext.operationId,
                requestId: reportingContext.requestId,
                feature: reportingContext.feature,
                action: args.action,
                accountId: reportingContext.accountId,
                conversationId: reportingContext.chatId,
                at: acceptedAt,
              });
            }
            return claimed;
          })
        : data.aiAcceptance.acceptOnce(args.operationId, acceptedAt);
      if (result.status === 'unknown') {
        throw new Error('Unknown or expired AI operation; acceptance feedback was not counted.');
      }
      if (result.status === 'accepted' && args.action === 'inserted' && reportingContext !== null) {
        acceptance?.trackInserted(reportingContext.accountId, reportingContext.chatId, {
          operationId: reportingContext.operationId,
          requestId: reportingContext.requestId,
          feature: reportingContext.feature,
          text:
            reportingContext.parts[args.partIndex ?? 0]
            ?? reportingContext.parts.join('\n'),
        });
      }
      shouldReport = false;
    }

    if (shouldReport && acceptance !== null && reportingContext !== null) {
      reportFeedbackAcceptance(
        acceptance,
        reportingContext,
        args.action,
        args.partIndex ?? null,
        acceptedAt,
      );
    }
  });

  // ── Send pipeline (SPEC §7) ──

  function requireSend(): SendEngine {
    if (!deps.send) {
      throw new Error('Sending is not available yet — configure Agency Hub in Settings.');
    }
    return deps.send;
  }

  ipcMain.handle('query:outbox.list', (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    return data.outbox.listForChat(args.accountId, args.chatId).map(outboxToVM);
  });

  ipcMain.handle('cmd:send.message', (_event, rawArgs: unknown) => {
    const args = sendMessageSchema.parse(rawArgs);
    // Stage 31 acceptance ('sent'): observe-only by construction — the hook
    // receives no send engine (see acceptance-reporter.ts); the send call
    // below is byte-identical either way.
    if (deps.acceptance) {
      try {
        observeSendForAcceptance(deps.acceptance, args, new Date().toISOString());
      } catch {
        // Telemetry must never block a send.
      }
    }
    return requireSend().sendParts(args);
  });

  ipcMain.handle('cmd:send.retry', (_event, rawArgs: unknown) => {
    const args = sendRetrySchema.parse(rawArgs);
    return requireSend().retry(args);
  });

  ipcMain.handle('cmd:send.dismiss', (_event, rawArgs: unknown) => {
    const args = sendRowRefSchema.parse(rawArgs);
    requireSend().dismiss(args);
  });

  ipcMain.handle('cmd:send.cancelSequence', (_event, rawArgs: unknown) => {
    const args = sendSequenceSchema.parse(rawArgs);
    requireSend().cancelSequence(args);
  });

  ipcMain.handle('cmd:send.verifyNow', async (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    await requireSend().verifyChat(args.accountId, args.chatId);
  });

  // Advisory commands: silently no-op without an engine (no write transport ⇒ no live composer).
  ipcMain.handle('cmd:chat.typingActive', (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    deps.send?.typingActive(args.accountId, args.chatId);
  });

  ipcMain.handle('cmd:chat.markRead', async (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    await deps.send?.markRead(args.accountId, args.chatId);
  });

  ipcMain.handle('cmd:message.unsend', async (_event, rawArgs: unknown) => {
    const args = messageRefSchema.parse(rawArgs);
    await requireSend().unsend(args.accountId, args.chatId, args.messageId);
  });

  // ── Spenders board (PLAN item 12; read-only toward OM lists) ──

  function requireSpenders(): SpendersService {
    if (!deps.spenders) {
      throw new Error('The spenders board is not available yet — configure OFAPI read access in Settings.');
    }
    return deps.spenders;
  }

  ipcMain.handle('query:spenders.lists', (_event, rawArgs: unknown) => {
    const args = spendersListsSchema.parse(rawArgs);
    return requireSpenders().lists(args.accountId);
  });

  ipcMain.handle('query:spenders.roster', (_event, rawArgs: unknown) => {
    const args = spendersRosterSchema.parse(rawArgs);
    return requireSpenders().roster(args.accountId, args.listId);
  });

  ipcMain.handle('query:spenders.untiered', (_event, rawArgs: unknown) => {
    const args = spendersListsSchema.parse(rawArgs);
    return requireSpenders().untiered(args.accountId);
  });

  ipcMain.handle('query:spenders.stats', (_event, rawArgs: unknown) => {
    const args = spendersListsSchema.parse(rawArgs);
    return requireSpenders().stats(args.accountId);
  });

  ipcMain.handle('cmd:spenders.hydrate', async (_event, rawArgs: unknown) => {
    const args = spendersHydrateSchema.parse(rawArgs);
    // One read-only tail GET through the sync machinery (same path as a chat
    // open), fired on EVERY quick-look open — main's per-fan thread-fetch stamp
    // TTL-guards the spend (PLAN item 13). Read deps.spendersRefresh fresh (it
    // is a live getter — see index.ts) so a key configured AFTER boot is seen.
    const service = deps.spendersRefresh;
    if (!service) {
      // No OFAPI read transport yet → no tail GET is possible; report the local-only state
      // in the same shape so the renderer never has to special-case it.
      return {
        hasChat: data.chats.get(args.accountId, args.chatId) !== null,
        fetched: false,
        messageCount: data.messages.count(args.accountId, args.chatId),
        skippedByTtl: false,
      };
    }
    return service.hydrateIfStale(args.accountId, args.chatId, {
      username: args.username ?? null,
    });
  });

  // ── Spenders freshness (PLAN item 13; read-only tail GETs) ──

  function requireSpendersRefresh(): SpendersRefreshService {
    if (!deps.spendersRefresh) {
      throw new Error('Spenders refresh is not available yet — configure OFAPI read access in Settings.');
    }
    return deps.spendersRefresh;
  }

  ipcMain.handle('query:spenders.freshness', (_event, rawArgs: unknown) => {
    const args = spendersListsSchema.parse(rawArgs);
    const service = deps.spendersRefresh;
    if (!service) {
      return { scopes: {}, active: null };
    }
    return { scopes: service.freshness(args.accountId), active: service.status(args.accountId) };
  });

  ipcMain.handle('cmd:spenders.refreshScope', async (_event, rawArgs: unknown) => {
    const args = spendersScopeSchema.parse(rawArgs);
    await requireSpendersRefresh().start(args.accountId, args.scope);
  });

  ipcMain.handle('cmd:spenders.refreshStop', (_event, rawArgs: unknown) => {
    const args = spendersListsSchema.parse(rawArgs);
    requireSpendersRefresh().stop(args.accountId);
  });

  // ── Online surface (variant C, flat; read-only /fans/active) ──

  function requireOnline(): OnlineService {
    if (!deps.online) {
      throw new Error('The online surface is not available yet — configure OFAPI read access in Settings.');
    }
    return deps.online;
  }

  ipcMain.handle('query:online.snapshot', (_event, rawArgs: unknown) => {
    const args = onlineSnapshotSchema.parse(rawArgs);
    // 0 credits — cached snapshot only. Degrade gracefully before an OFAPI
    // transport exists so the always-mounted rail-badge query never throws
    // (same shape as query:spenders.freshness's null-service path).
    if (!deps.online) {
      return { rows: [], counts: { online: 0, spenders: 0, waiting: 0 }, fetchedAt: null, truncated: false };
    }
    return deps.online.snapshot(args.accountId, args.spendersOnly);
  });

  ipcMain.handle('cmd:online.refresh', (_event, rawArgs: unknown) => {
    const args = onlineSnapshotSchema.parse(rawArgs);
    return requireOnline().refresh(args.accountId, args.spendersOnly);
  });

  // ── Vault & PPV (PRD F7) ──

  function requireVault(): VaultService {
    if (!deps.vault) {
      throw new Error('The vault is not available yet — configure OFAPI read access in Settings.');
    }
    return deps.vault;
  }

  ipcMain.handle('query:vault.list', (_event, rawArgs: unknown) => {
    const args = vaultListSchema.parse(rawArgs);
    return requireVault().listVault({
      accountId: args.accountId,
      ...(args.albumId !== undefined ? { albumId: args.albumId } : {}),
      ...(args.query !== undefined ? { query: args.query } : {}),
      ...(args.offset !== undefined ? { offset: args.offset } : {}),
    });
  });

  ipcMain.handle('query:vault.albums', (_event, rawArgs: unknown) => {
    const args = vaultAlbumsSchema.parse(rawArgs);
    return requireVault().listAlbums(args);
  });

  ipcMain.handle('query:chat.gallery', (_event, rawArgs: unknown) => {
    const args = chatGallerySchema.parse(rawArgs);
    return requireVault().chatGallery({
      accountId: args.accountId,
      chatId: args.chatId,
      ...(args.offset !== undefined ? { offset: args.offset } : {}),
    });
  });

  ipcMain.handle('cmd:send.ppv', (_event, rawArgs: unknown) => {
    const args = sendPpvSchema.parse(rawArgs);
    // Engine validates the PPV invariants (price bounds, previews ⊆ media)
    // BEFORE enqueue and owns the single-row guarantee.
    return requireSend().sendPpv(args);
  });

  // Drafts live in the settings table (key draft.<accountId>.<chatId>) — pure
  // local persistence, available with or without an OFAPI key.
  ipcMain.handle('query:draft.get', (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    return { text: data.settings.getParsed(draftKey(args.accountId, args.chatId), draftStoredSchema) ?? '' };
  });

  ipcMain.handle('cmd:draft.set', (_event, rawArgs: unknown) => {
    const args = draftSetSchema.parse(rawArgs);
    const key = draftKey(args.accountId, args.chatId);
    if (args.text === '') {
      data.settings.remove(key);
    } else {
      data.settings.set(key, args.text);
    }
  });
}
