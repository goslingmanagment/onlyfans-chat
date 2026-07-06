// Hub cluster composition (SPEC §8.5/§8.6/§9.3): one module owns the REST
// client, the persisted usage reporter and the summary hooks, rebuilt whenever
// the hub config (base URL + chatter key) changes. Unconfigured hub = inert
// delegators — prefetch resolves null, push no-ops, and usage events stay
// parked in usage_events for a later configured session (today's behavior).

import { createHubClient, createUsageReporter } from '@chatgoose/shared/hub/index';
import { HubError } from '@chatgoose/shared/hub/index';
import type { HubClient, HubOfapiCreditsSummary, UsageReporter } from '@chatgoose/shared/hub/index';
import type { SummaryHubHooks, UsageEventRecord } from '../ai/index';
import type { DataLayer } from '../db/index';
import type { SettingsStore } from '../settings/store';
import type { Keychain } from '../secrets/keychain';
import { resolveHubCredential } from './device-token';
import { createPageLabelResolver } from './page-resolver';
import { createSqliteUsageEventStore } from './usage-store';
import { createSummaryHubHooks } from './summary-hooks';
import { mapUsagePayloadToHubEvent } from './usage-mapper';
import { z } from 'zod';
import { createFeatureAiGateway } from './ai-feature-gateway';
import { createAcceptanceReporter, createAcceptanceTracker } from './acceptance-reporter';
import type { AcceptanceEventInput, AcceptanceReporter, AcceptanceTracker } from './acceptance-reporter';
import type { AiFeatureGateway } from '../ai/gateway';

export { createPageLabelResolver, PAGE_LIST_CACHE_TTL_MS } from './page-resolver';
export type { PageLabelResolver, PageLabelResolverOptions } from './page-resolver';
export { createSqliteUsageEventStore } from './usage-store';
export { createSummaryHubHooks, HUB_PROFILE_MAX_BYTES } from './summary-hooks';
export type { HubSummarySyncState, SummaryHubHooksOptions } from './summary-hooks';
export { mapUsagePayloadToHubEvent, usageEventPayloadSchema } from './usage-mapper';
export type { MappedHubUsageEvent } from './usage-mapper';

export interface HubModuleOptions {
  data: DataLayer;
  settingsStore: SettingsStore;
  keychain: Pick<Keychain, 'getSecret'>;
  /** App version forwarded as the x-client-version header (Stage 4 / Proposal 4.1). */
  clientVersion?: string;
  /** Test seam over createHubClient — no live network in tests. */
  createClient?: (args: { baseUrl: string; apiKey: string; clientVersion?: string }) => HubClient;
  /** Telemetry-failure sink (defaults to console.warn); wired to the logger in main. */
  onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface HubModule {
  /**
   * Stable delegating hooks — attach once at coordinator creation; they track
   * reconfiguration internally (absent hub config behaves as absent hooks).
   */
  summaryHub: SummaryHubHooks;
  /** Stage 31: the kernel feature-service lane (AI mode 'feature'). */
  aiFeatureGateway: AiFeatureGateway;
  /** Stage 31: kernel persona CRUD delegators (null-tolerant at call sites). */
  personas: {
    list: () => Promise<Array<{ key: string; displayName: string; systemBlock: string; updatedAt: string }>>;
    upsert: (args: { key: string; displayName: string; systemBlock: string }) => Promise<unknown>;
    archive: (key: string) => Promise<unknown>;
  };
  /** Stage 31: acceptance lifecycle spool (KV-backed; drains when active). */
  acceptance: AcceptanceReporter;
  /** Stage 31: inserted-suggestion tracker for the sent/edited signal. */
  acceptanceTracker: AcceptanceTracker;
  /** Coordinator onAcceptanceEvent target ('shown'). */
  onAcceptanceEvent: (event: AcceptanceEventInput) => void;
  /** Stable delegator for C6b text-command intake/status recovery. */
  commandClient: Pick<HubClient, 'createOfapiCommand' | 'getOfapiCommand' | 'cancelOfapiCommand'>;
  /** Coordinator onUsageEvent target: raw payload → wire event → reporter. */
  onUsageEvent: (event: UsageEventRecord) => void;
  /** Page-scoped core OFAPI spend summary for Activity/diagnostics; null when hub is off/unreachable. */
  getOfapiCreditsSummary(): Promise<HubOfapiCreditsSummary | null>;
  /** Rebuilds client/reporter/hooks from current settings + keychain. */
  reconfigure(): Promise<void>;
  dispose(): void;
}

interface ActiveHub {
  client: HubClient;
  reporter: UsageReporter;
  hooks: SummaryHubHooks;
  aiFeatureGateway: AiFeatureGateway;
}

const personaSyncListSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string(),
    content: z.string().min(1),
    builtin: z.boolean().optional(),
  }).loose(),
);

export function createHubModule(options: HubModuleOptions): HubModule {
  const { data, settingsStore, keychain } = options;
  const createClient = options.createClient ?? ((args) => createHubClient(args));
  const onWarn = options.onWarn ?? ((message: string) => console.warn(message));
  const store = createSqliteUsageEventStore(data.db);

  let active: ActiveHub | null = null;
  const acceptance = createAcceptanceReporter({
    data,
    getClient: () => active?.client ?? null,
    onWarn,
  });
  const acceptanceTracker = createAcceptanceTracker();
  /** Invalidates in-flight reconfigures (config can change mid-await). */
  let generation = 0;
  let disposed = false;

  function teardown(): void {
    // Reporter dispose keeps queued events persisted (crash-safe store).
    active?.reporter.dispose();
    active = null;
  }

  return {
    summaryHub: {
      prefetchSummary: (args) =>
        active?.hooks.prefetchSummary?.(args) ?? Promise.resolve(null),
      pushSummary: (args) => active?.hooks.pushSummary?.(args) ?? Promise.resolve(),
    },

    personas: {
      list: async () => {
        if (active === null) {
          throw new HubError('bad-request', { message: 'Hub personas are not configured' });
        }
        return active.client.listAiPersonas();
      },
      upsert: async (args) => {
        if (active === null) {
          throw new HubError('bad-request', { message: 'Hub personas are not configured' });
        }
        return active.client.upsertAiPersona(args);
      },
      archive: async (key) => {
        if (active === null) {
          throw new HubError('bad-request', { message: 'Hub personas are not configured' });
        }
        return active.client.archiveAiPersona({ key });
      },
    },

    acceptance,
    acceptanceTracker,
    onAcceptanceEvent: (event) => acceptance.enqueue(event),

    aiFeatureGateway: {
      stream(req, cb) {
        if (active === null) {
          cb.onError?.(
            new HubError('bad-request', {
              message: 'Hub AI feature lane is not configured',
            }),
          );
          return () => {};
        }
        return active.aiFeatureGateway.stream(req, cb);
      },
    },

    commandClient: {
      createOfapiCommand(args) {
        if (active === null) {
          return Promise.reject(
            new HubError('bad-request', { message: 'Hub command transport is not configured' }),
          );
        }
        return active.client.createOfapiCommand(args);
      },
      getOfapiCommand(args) {
        if (active === null) {
          return Promise.reject(
            new HubError('bad-request', { message: 'Hub command transport is not configured' }),
          );
        }
        return active.client.getOfapiCommand(args);
      },
      cancelOfapiCommand(args) {
        if (active === null) {
          return Promise.reject(
            new HubError('bad-request', { message: 'Hub command transport is not configured' }),
          );
        }
        return active.client.cancelOfapiCommand(args);
      },
    },

    onUsageEvent(event) {
      if (active === null) {
        return; // unconfigured: the usage_events row stays parked
      }
      const mapped = mapUsagePayloadToHubEvent(event);
      if (mapped === null) {
        return; // malformed payload must never reach the wire (SPEC §8.6)
      }
      active.reporter.enqueue(mapped);
    },

    async getOfapiCreditsSummary() {
      if (active === null) {
        return null;
      }
      try {
        return await active.client.getOfapiCreditsSummary();
      } catch (error) {
        onWarn('[hub] OFAPI credit summary unavailable', {
          code: error instanceof HubError ? error.code : undefined,
          reason: error instanceof HubError ? error.reason : undefined,
        });
        return null;
      }
    },

    async reconfigure() {
      generation += 1;
      const myGeneration = generation;
      const [vm, apiKey] = await Promise.all([
        settingsStore.get(),
        // Stage 24: device token preferred; chatter key = fallback.
        resolveHubCredential(keychain),
      ]);
      if (disposed || myGeneration !== generation) {
        return;
      }
      teardown();
      if (vm.hubBaseUrl === null || apiKey === null || apiKey.trim().length === 0) {
        return; // hub off — delegators stay inert
      }
      const client = createClient({
        baseUrl: vm.hubBaseUrl,
        apiKey,
        ...(options.clientVersion !== undefined ? { clientVersion: options.clientVersion } : {}),
      });
      const resolver = createPageLabelResolver({
        listPages: () => client.listPages(),
        getAccountUsername: (accountId) => data.accounts.get(accountId)?.username ?? null,
        getOverrides: async () => (await settingsStore.get()).accountPageLabels,
      });
      const reporter = createUsageReporter({
        client,
        store,
        onError: (error, context) => {
          // Telemetry-only failures: log with the CG code, never interrupt.
          onWarn(`[hub] usage reporting ${context.kind} (${error.code})`, {
            code: error.code,
            clientEventIds: context.clientEventIds,
          });
        },
      });
      // Stage 31 Task 3: one-time custom-persona sync — local personas become
      // kernel config (upsert is idempotent; builtin is kernel-seeded).
      // Fire-and-forget: sync failure never blocks reconfigure.
      void (async () => {
        try {
          const stored = data.settings.getParsed(
            'personalities',
            personaSyncListSchema,
          );
          if (stored === undefined) {
            return;
          }
          for (const persona of stored) {
            if (persona.builtin === true) {
              continue;
            }
            await client.upsertAiPersona({
              key: persona.id,
              displayName: persona.name,
              systemBlock: persona.content,
            });
          }
        } catch (error) {
          onWarn(`[hub] persona sync failed (${error instanceof Error ? error.message : String(error)})`);
        }
      })();

      active = {
        client,
        reporter,
        hooks: createSummaryHubHooks({
          client,
          data,
          resolvePageLabel: (accountId) => resolver.resolve(accountId),
        }),
        aiFeatureGateway: createFeatureAiGateway({
          client,
          resolvePageLabel: (accountId) => resolver.resolve(accountId),
        }),
      };
    },

    dispose() {
      disposed = true;
      acceptance.dispose();
      teardown();
    },
  };
}
