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
import { createPageLabelResolver } from './page-resolver';
import { createSqliteUsageEventStore } from './usage-store';
import { createSummaryHubHooks } from './summary-hooks';
import { mapUsagePayloadToHubEvent } from './usage-mapper';
import { createHubAiGateway } from './ai-gateway';
import type { AiGateway } from '../ai/gateway';

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
  /** Test seam over createHubClient — no live network in tests. */
  createClient?: (args: { baseUrl: string; apiKey: string }) => HubClient;
  /** Telemetry-failure sink (defaults to console.warn); wired to the logger in main. */
  onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface HubModule {
  /**
   * Stable delegating hooks — attach once at coordinator creation; they track
   * reconfiguration internally (absent hub config behaves as absent hooks).
   */
  summaryHub: SummaryHubHooks;
  /** Future P6 AI transport. Inert until hub config exists and AI mode is set to hub. */
  aiGateway: AiGateway;
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
  aiGateway: AiGateway;
}

export function createHubModule(options: HubModuleOptions): HubModule {
  const { data, settingsStore, keychain } = options;
  const createClient = options.createClient ?? ((args) => createHubClient(args));
  const onWarn = options.onWarn ?? ((message: string) => console.warn(message));
  const store = createSqliteUsageEventStore(data.db);

  let active: ActiveHub | null = null;
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

    aiGateway: {
      stream(req, cb) {
        if (active === null) {
          cb.onError?.(
            new HubError('bad-request', {
              message: 'Hub AI gateway is not configured',
            }),
          );
          return () => {};
        }
        return active.aiGateway.stream(req, cb);
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
        keychain.getSecret('hubApiKey'),
      ]);
      if (disposed || myGeneration !== generation) {
        return;
      }
      teardown();
      if (vm.hubBaseUrl === null || apiKey === null || apiKey.trim().length === 0) {
        return; // hub off — delegators stay inert
      }
      const client = createClient({ baseUrl: vm.hubBaseUrl, apiKey });
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
      active = {
        client,
        reporter,
        hooks: createSummaryHubHooks({
          client,
          data,
          resolvePageLabel: (accountId) => resolver.resolve(accountId),
        }),
        aiGateway: createHubAiGateway({
          client,
          resolvePageLabel: (accountId) => resolver.resolve(accountId),
        }),
      };
    },

    dispose() {
      disposed = true;
      teardown();
    },
  };
}
