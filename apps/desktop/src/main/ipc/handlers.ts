// IPC invoke handlers — every InvokeChannels entry in src/preload/contract.ts.
// Args are renderer-controlled (trust boundary): zod-validate everything
// before touching the data layer (SPEC §15.3).

import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Personality } from '@chatgoose/shared/types';
import { analyzePingSegment } from '@chatgoose/shared/transcript/index';
import { reconcileBundledPersonalities } from '@chatgoose/shared/prompts/personalities';
import type { DataLayer, OutboxRow } from '../db/index';
import type { SettingsStore } from '../settings/store';
import type { CreditMeter } from '../ofapi/credit-meter';
import type { SendEngine } from '../send/engine';
import { auditOutbox } from '../send/audit';
import type { VaultService } from '../media/vault';
import type { SpendersService } from '../spenders/service';
import type { SpendersRefreshService } from '../spenders/refresh';
import type { Logger } from '../diagnostics/logger';
import type {
  AiStartRequest,
  KeyTestProvider,
  KeyTestResultVM,
  LocalDataStatsVM,
  OutboxItemVM,
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
const keysTestSchema = z.object({
  provider: z.enum(['ofapi', 'anthropic', 'openrouter', 'hub']),
});

// Renderer-controlled (trust boundary): bound the strings and accept opaque fields.
const logClientSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  scope: z.string().min(1).max(120),
  message: z.string().max(4000),
  fields: z.record(z.string(), z.unknown()).optional(),
});

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
const mappingSchema = z.object({ accountId: idSchema, personalityId: z.string().nullable() });
const personalitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  content: z.string().max(100_000),
  updatedAt: z.number(),
  builtin: z.boolean().optional(),
  builtinVersion: z.number().optional(),
});
const personalityDeleteSchema = z.object({ id: z.string().min(1) });
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
const vaultUploadSchema = z.object({
  accountId: idSchema,
  fileToken: z.uuid(),
  useAsync: z.boolean().optional(),
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

function draftKey(accountId: string, chatId: string): string {
  return `draft.${accountId}.${chatId}`;
}

function outboxToVM(row: OutboxRow): OutboxItemVM {
  return {
    localId: row.localId,
    chatId: row.chatId,
    text: row.text,
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

const PERSONALITIES_KEY = 'personalities';
const personalitiesStoredSchema = z.array(personalitySchema);

/** Coordinator surface pinned for the parallel ai-coordinator build. */
export interface AiCoordinatorLike {
  start(req: AiStartRequest): void;
  cancel(operationId: string): void;
  conversationOpened(accountId: string, chatId: string): void;
  conversationClosed(accountId: string, chatId: string): void;
}

export interface IpcDeps {
  data: DataLayer;
  settingsStore: SettingsStore;
  /** hubStatus/hubActivity are HubAwareSync extensions; plain providers report hub 'off'. */
  sync: ActivitySync | null;
  creditMeter: CreditMeter | null;
  coordinator: AiCoordinatorLike | null;
  /** Null until an OFAPI key exists (same lifecycle as sync). */
  send: SendEngine | null;
  /** Vault browsing/upload (PRD F7); null/absent until an OFAPI key exists.
   *  Optional (not `| null` alone) so pre-P5 IpcDeps call sites stay valid. */
  vault?: VaultService | null;
  /** Spenders board (PLAN item 12); null/absent until an OFAPI key exists. */
  spenders?: SpendersService | null;
  /** Spenders freshness: hydrate TTL guard + scoped refresh queue (PLAN item 13). */
  spendersRefresh?: SpendersRefreshService | null;
  purge: () => Promise<void>;
  /** Settings "Test" buttons; probes the STORED key. Optional like vault. */
  testKey?: (provider: KeyTestProvider) => Promise<KeyTestResultVM>;
  /** Danger-zone capabilities (paths/shell live only in the composition root). */
  localData?: {
    stats: () => Promise<LocalDataStatsVM>;
    openFolder: () => Promise<void>;
    exportDiagnostics: () => Promise<{ path: string }>;
  } | null;
  /** Settings → Updates (PLAN item 11). Always present; returns `unsupported`
   *  off win32-packaged builds. status/check/install read the lazily-created
   *  update controller in the composition root. */
  updates?: {
    status: () => UpdateStatusVM;
    check: () => Promise<UpdateStatusVM>;
    install: () => void;
  } | null;
  /** Called when settings.update sets an OFAPI key while sync is offline. */
  onOfapiKeyConfigured?: () => void;
  /**
   * Called after any settings.update that touched hubApiKey/hubBaseUrl. Key
   * writes go to the keychain and publish no settings-table change, so this
   * hook is the only reconnect signal for key-only edits.
   */
  onHubConfigChanged?: () => void;
  /** Diagnostics log sink (SPEC §11); absent in builds without a logger (tests). */
  logger?: Logger;
}

function normalizePersonality(parsed: z.infer<typeof personalitySchema>): Personality {
  return {
    id: parsed.id,
    name: parsed.name,
    content: parsed.content,
    updatedAt: parsed.updatedAt,
    ...(parsed.builtin !== undefined ? { builtin: parsed.builtin } : {}),
    ...(parsed.builtinVersion !== undefined ? { builtinVersion: parsed.builtinVersion } : {}),
  };
}

export function loadPersonalities(data: DataLayer): Personality[] {
  const saved = (data.settings.getParsed(PERSONALITIES_KEY, personalitiesStoredSchema) ?? []).map(
    normalizePersonality,
  );
  const { personalities, changed } = reconcileBundledPersonalities([...saved], Date.now());
  if (changed) {
    data.settings.set(PERSONALITIES_KEY, personalities);
  }
  return personalities;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { data, settingsStore } = deps;
  /** Ops already counted into ai_spend_log.inserted — one accept per run,
   *  however many parts the chatter inserts/copies. */
  const acceptedOps = new Set<string>();

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

  ipcMain.handle('query:personalities.list', () => loadPersonalities(data));

  ipcMain.handle('query:sync.status', (): SyncStatusVM => {
    const snapshot = deps.creditMeter?.snapshot() ?? null;
    const syncStatus = deps.sync?.status() ?? { freshness: {}, state: 'offline' as const };
    const today = utcDayOf(Date.now());
    return {
      creditsBalance: snapshot?.balance ?? null,
      creditsUsedToday: snapshot?.usedToday ?? 0,
      rpmRemaining: snapshot?.rpmRemaining ?? null,
      freshness: syncStatus.freshness,
      state: syncStatus.state,
      hub: deps.sync?.hubStatus?.() ?? 'off',
      aiTodayUsd: aiTodayUsd(data, today),
      sendsToday: sendsToday(data, today),
    };
  });

  // ── Settings → Activity panel (PLAN item 9; read-only) ──
  ipcMain.handle('query:activity.summary', async () => {
    const settings = await settingsStore.get();
    return buildActivitySummary({
      data,
      sync: deps.sync,
      creditMeter: deps.creditMeter,
      aiKeys: {
        hasAnthropicKey: settings.hasAnthropicKey,
        hasOpenRouterKey: settings.hasOpenRouterKey,
      },
    });
  });

  ipcMain.handle('query:outbox.audit', (_event, rawArgs: unknown) => {
    const args = z.object({ accountId: idSchema.optional() }).parse(rawArgs ?? {});
    return auditOutbox(data, args.accountId !== undefined ? { accountId: args.accountId } : {});
  });

  ipcMain.handle('query:ai.featureCosts', () => buildFeatureCosts(data));

  ipcMain.handle('cmd:keys.test', (_event, rawArgs: unknown) => {
    const args = keysTestSchema.parse(rawArgs);
    if (!deps.testKey) {
      throw new Error('Key testing is not available in this build.');
    }
    return deps.testKey(args.provider);
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
    deps.coordinator?.conversationOpened(args.accountId, args.chatId);
    await deps.sync?.openConversation(args.accountId, args.chatId);
  });

  ipcMain.handle('cmd:conversation.close', (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    deps.coordinator?.conversationClosed(args.accountId, args.chatId);
    deps.sync?.closeConversation(args.accountId, args.chatId);
  });

  // Manual in-chat ↻: a deliberate single-chat user read. Uses the same force
  // path as opening the chat (bypasses the auto-read gate), but does NOT touch
  // openConversation focus, the read-state sweep, or the AI coordinator — it
  // only pulls this chat's message tail now instead of waiting for the poll.
  ipcMain.handle('cmd:conversation.refresh', async (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    await deps.sync?.readChatTailForUserOpen(args.accountId, args.chatId, 'chat-refresh');
  });

  ipcMain.handle('cmd:sync.forceRefresh', async (_event, rawArgs: unknown) => {
    const args = forceRefreshSchema.parse(rawArgs ?? {});
    await deps.sync?.forceRefresh(args.accountId);
  });

  ipcMain.handle('cmd:settings.update', async (_event, rawPatch: unknown) => {
    const before = await settingsStore.get();
    const result = await settingsStore.update(rawPatch);
    if (!before.hasOfapiKey && result.hasOfapiKey) {
      deps.onOfapiKeyConfigured?.();
    }
    // Fires on any patch carrying hub config (incl. key replacement, which is
    // invisible in before/after VM comparison) — but only after validation.
    const touchedHub =
      typeof rawPatch === 'object' &&
      rawPatch !== null &&
      ('hubApiKey' in rawPatch || 'hubBaseUrl' in rawPatch);
    if (touchedHub) {
      deps.onHubConfigChanged?.();
    }
    return result;
  });

  ipcMain.handle('cmd:personalities.save', (_event, rawArgs: unknown) => {
    const personality = normalizePersonality(personalitySchema.parse(rawArgs));
    const existing = loadPersonalities(data);
    const next = existing.some((entry) => entry.id === personality.id)
      ? existing.map((entry) => (entry.id === personality.id ? personality : entry))
      : [...existing, personality];
    data.settings.set(PERSONALITIES_KEY, next);
    return next;
  });

  ipcMain.handle('cmd:personalities.delete', async (_event, rawArgs: unknown) => {
    const { id } = personalityDeleteSchema.parse(rawArgs);
    const next = loadPersonalities(data).filter((entry) => entry.id !== id);
    data.settings.set(PERSONALITIES_KEY, next);
    // cascade: drop mappings pointing at the deleted personality (legacy behavior)
    const settings = await settingsStore.get();
    const mappings = Object.fromEntries(
      Object.entries(settings.accountMappings).filter(([, pid]) => pid !== id),
    );
    await settingsStore.update({ accountMappings: mappings });
    return next;
  });

  ipcMain.handle('cmd:mappings.set', async (_event, rawArgs: unknown) => {
    const args = mappingSchema.parse(rawArgs);
    const settings = await settingsStore.get();
    const mappings = { ...settings.accountMappings };
    if (args.personalityId === null) {
      delete mappings[args.accountId];
    } else {
      mappings[args.accountId] = args.personalityId;
    }
    await settingsStore.update({ accountMappings: mappings });
  });

  ipcMain.handle('cmd:data.purge', () => deps.purge());

  ipcMain.handle('ai:start', (_event, rawArgs: unknown) => {
    const parsed = aiStartSchema.parse(rawArgs);
    if (!deps.coordinator) {
      throw new Error('AI is not available yet — configure an LLM API key in Settings.');
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
    // payload is the pending hub event JSON; acceptance rides alongside it
    data.db
      .prepare(
        `UPDATE usage_events
         SET payload = json_set(payload, '$.accepted', 1, '$.acceptedPart', @part)
         WHERE client_event_id = @id`,
      )
      .run({ part: args.partIndex ?? null, id: args.operationId });
    // The queue row is authoritative for (feature, day) but drains once the
    // hub is configured — fall back to the renderer-reported feature + today.
    const row: unknown = data.db
      .prepare('SELECT payload FROM usage_events WHERE client_event_id = @id')
      .get({ id: args.operationId });
    const payload = z
      .object({ payload: z.string() })
      .transform((value) => {
        try {
          return JSON.parse(value.payload) as unknown;
        } catch {
          return null;
        }
      })
      .pipe(z.object({ feature: z.string(), completedAt: z.string() }).nullable().catch(null))
      .safeParse(row);
    const feature = payload.success && payload.data !== null ? payload.data.feature : args.feature;
    const day =
      payload.success && payload.data !== null
        ? payload.data.completedAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    if (feature !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(day) && !acceptedOps.has(args.operationId)) {
      acceptedOps.add(args.operationId);
      data.aiSpendLog.markInserted(day, feature);
    }
  });

  // ── Send pipeline (SPEC §7) ──

  function requireSend(): SendEngine {
    if (!deps.send) {
      throw new Error('Sending is not available yet — configure the OFAPI key in Settings.');
    }
    return deps.send;
  }

  ipcMain.handle('query:outbox.list', (_event, rawArgs: unknown) => {
    const args = convSchema.parse(rawArgs);
    return data.outbox.listForChat(args.accountId, args.chatId).map(outboxToVM);
  });

  ipcMain.handle('cmd:send.message', (_event, rawArgs: unknown) => {
    const args = sendMessageSchema.parse(rawArgs);
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

  // Advisory commands: silently no-op without an engine (no key ⇒ no live composer).
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
      throw new Error('The spenders board is not available yet — configure the OFAPI key in Settings.');
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
      // No OFAPI key yet → no tail GET is possible; report the local-only state
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
      throw new Error('Spenders refresh is not available yet — configure the OFAPI key in Settings.');
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

  // ── Vault & PPV (PRD F7) ──

  function requireVault(): VaultService {
    if (!deps.vault) {
      throw new Error('The vault is not available yet — configure the OFAPI key in Settings.');
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

  ipcMain.handle('cmd:vault.pickFile', () => requireVault().pickFile());

  ipcMain.handle('cmd:vault.upload', (_event, rawArgs: unknown) => {
    const args = vaultUploadSchema.parse(rawArgs);
    return requireVault().upload({
      accountId: args.accountId,
      fileToken: args.fileToken,
      ...(args.useAsync !== undefined ? { useAsync: args.useAsync } : {}),
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
