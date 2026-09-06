// Hub cluster composition (SPEC §8.5/§8.6/§9.3): one module owns the REST
// client, the persisted usage reporter and the summary hooks, rebuilt whenever
// the hub config (base URL + chatter key) changes. Unconfigured hub = inert
// delegators — prefetch resolves null, push no-ops, and usage events stay
// parked in usage_events. Provenance-free pre-cutover usage rows are
// quarantined locally instead of being attributed to whichever Hub logs in next.

import {
  createHubClient,
  createUsageReporter,
  hubUsageEventSchema,
} from '@chatgoose/shared/hub/index';
import { HubError } from '@chatgoose/shared/hub/index';
import type {
  HubAiPersonaCatalogEntry,
  HubClient,
  HubOfapiCreditsSummary,
  UsageReporter,
} from '@chatgoose/shared/hub/index';
import type { SummaryHubHooks, UsageEventRecord } from '../ai/index';
import type { DataLayer } from '../db/index';
import type { SettingsStore } from '../settings/store';
import type { Keychain } from '../secrets/keychain';
import { createPageLabelResolver } from './page-resolver';
import { createSqliteUsageEventStore } from './usage-store';
import { createSummaryHubHooks } from './summary-hooks';
import { isCurrentPersonaSummary } from '../personas/summary';
import { effectivePersistedAccountPageLabels } from '../settings/store';
import type { SummaryHubSyncHooks } from './summary-hooks';
import { mapUsagePayloadToHubEvent } from './usage-mapper';
import { createFeatureAiGateway } from './ai-feature-gateway';
import {
  acceptanceDestinationIdentity,
  createAcceptanceReporter,
  createAcceptanceTracker,
} from './acceptance-reporter';
import type { AcceptanceEventInput, AcceptanceReporter, AcceptanceTracker } from './acceptance-reporter';
import type { AiFeatureGateway } from '../ai/gateway';
import { ensurePersonaStorageScope, type PersonaStorageScope } from '../personas/pending';
import {
  ensureLegacyPersonaSnapshot,
  inspectPersonaCatalogReplacement,
  loadPersonaCatalog,
  storePersonaCatalog,
} from '../personas/catalog';

export { createPageLabelResolver, PAGE_LIST_CACHE_TTL_MS } from './page-resolver';
export type { PageLabelResolver, PageLabelResolverOptions } from './page-resolver';
export { createSqliteUsageEventStore } from './usage-store';
export { createSummaryHubHooks, HUB_PROFILE_MAX_BYTES } from './summary-hooks';
export type { HubSummarySyncState, SummaryHubHooksOptions } from './summary-hooks';
export { mapUsagePayloadToHubEvent, usageEventPayloadSchema } from './usage-mapper';
export type { MappedHubUsageEvent } from './usage-mapper';

export const PERSONA_CATALOG_REFRESH_MS = 5 * 60_000;

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
  /** Metadata-only persona catalog. Global definitions are owner-managed. */
  personas: {
    list: (expectedHubOrigin?: string) => Promise<HubAiPersonaCatalogEntry[]>;
  };
  /** Stage 31: acceptance lifecycle spool (KV-backed; drains when active). */
  acceptance: AcceptanceReporter;
  /** Stage 31: inserted-suggestion tracker for the sent/edited signal. */
  acceptanceTracker: AcceptanceTracker;
  /** Coordinator onAcceptanceEvent target ('shown'). */
  onAcceptanceEvent: (event: AcceptanceEventInput) => void;
  /** Stable delegator for C6b text-command intake/status recovery. */
  commandClient: Pick<HubClient, 'createOfapiCommand' | 'getOfapiCommand' | 'cancelOfapiCommand' | 'previewBannedWords' | 'readComposerReferences'>;
  /** DRAIN-ONLY (Stage 31): nothing calls this post-cutover — the coordinator
   * stopped writing usage_events. Pre-cutover rows have no destination actor
   * and stay quarantined; this compatibility seam accepts only events created
   * while the current credential-bound runtime is active. */
  onUsageEvent: (event: UsageEventRecord) => void;
  /** Page-scoped core OFAPI spend summary for Activity/diagnostics; null when hub is off/unreachable. */
  getOfapiCreditsSummary(): Promise<HubOfapiCreditsSummary | null>;
  /** Rebuilds client/reporter/hooks from current settings + keychain. */
  reconfigure(): Promise<void>;
  /** Retires network producers and awaits reporter continuations before DB close. */
  quiesce(): Promise<void>;
  dispose(): void;
}

interface ActiveHub {
  client: HubClient;
  personaScope: PersonaStorageScope;
  acceptanceDestinationIdentity: string;
  reporter: UsageReporter;
  hooks: SummaryHubSyncHooks;
  aiFeatureGateway: AiFeatureGateway;
  catalogRefreshTimer: ReturnType<typeof setInterval> | null;
  catalogRefreshRunning: boolean;
  catalogRefreshRequested: boolean;
  catalogRequestGeneration: number;
}

export function createHubModule(options: HubModuleOptions): HubModule {
  const { data, settingsStore } = options;
  const createClient = options.createClient ?? ((args) => createHubClient(args));
  const onWarn = options.onWarn ?? ((message: string) => console.warn(message));
  const store = createSqliteUsageEventStore(data.db);
  const unscopedLegacyUsage = store.load().filter(
    (pending) => !pending.quarantined && hubUsageEventSchema.safeParse(pending.event).success,
  );
  if (unscopedLegacyUsage.length > 0) {
    store.markQuarantined(unscopedLegacyUsage.map((pending) => pending.id));
    onWarn(
      `[hub] quarantined ${String(unscopedLegacyUsage.length)} provenance-free legacy usage event(s)`,
    );
  }

  let active: ActiveHub | null = null;
  const acceptance = createAcceptanceReporter({
    data,
    getClient: () => active?.client ?? null,
    getDestinationIdentity: () => active?.acceptanceDestinationIdentity ?? null,
    onWarn,
  });
  const acceptanceTracker = createAcceptanceTracker();
  /** Invalidates in-flight reconfigures (config can change mid-await). */
  let generation = 0;
  let disposed = false;
  const reconfigureTasks = new Set<Promise<void>>();
  let quiescePromise: Promise<void> | null = null;
  let retirementTail: Promise<void> = Promise.resolve();
  const personaOperations = new Set<Promise<unknown>>();

  function trackPersonaOperation<Result>(operation: Promise<Result>): Promise<Result> {
    personaOperations.add(operation);
    const clear = (): void => {
      personaOperations.delete(operation);
    };
    void operation.then(clear, clear);
    return operation;
  }

  async function drainPersonaOperations(): Promise<void> {
    while (personaOperations.size > 0) {
      await Promise.allSettled([...personaOperations]);
    }
  }

  async function fetchPersonaCatalog(
    activeHub: ActiveHub,
    expectedGeneration: number,
  ): Promise<HubAiPersonaCatalogEntry[]> {
    const requestGeneration = ++activeHub.catalogRequestGeneration;
    ensureLegacyPersonaSnapshot(data.settings, activeHub.personaScope.origin);
    const catalog = await activeHub.client.listAiPersonaCatalog();
    if (
      disposed
      || generation !== expectedGeneration
      || active !== activeHub
    ) {
      throw new HubError('network', {
        message: 'Hub persona catalog belonged to a retired runtime',
      });
    }
    if (requestGeneration !== activeHub.catalogRequestGeneration) {
      // A newer request was started for this runtime. Never let this older
      // response win merely because it settled last.
      const current = loadPersonaCatalog(data.settings, activeHub.personaScope);
      if (current === null) {
        throw new HubError('network', {
          message: 'Hub persona catalog response was superseded before any cache committed',
        });
      }
      return current;
    }
    const previous = loadPersonaCatalog(data.settings, activeHub.personaScope);
    const regression = inspectPersonaCatalogReplacement(previous, catalog);
    if (regression !== null) {
      // The latest-started full snapshot wins even across Core DR. This write
      // invalidates renderer catalog/account/fan queries. definitionId prevents
      // reuse after an observed definition change, while the feature lane's
      // expected/applied identity fence prevents a catalog-to-generation race.
      onWarn('[hub] persona catalog incarnation changed; accepting full replacement', {
        hubOrigin: activeHub.personaScope.origin,
        missingKeys: regression.missingKeys,
        lowerVersions: regression.lowerVersions,
      });
    }
    return storePersonaCatalog(data.settings, activeHub.personaScope, catalog);
  }

  function refreshPersonaCatalog(activeHub: ActiveHub, expectedGeneration: number): void {
    if (activeHub.catalogRefreshRunning) {
      // A stale-generation signal must not disappear behind a cadence fetch
      // that may have started just before the owner edit. Coalesce to exactly
      // one follow-up full snapshot after the current request settles.
      activeHub.catalogRefreshRequested = true;
      return;
    }
    activeHub.catalogRefreshRunning = true;
    activeHub.catalogRefreshRequested = false;
    void trackPersonaOperation(fetchPersonaCatalog(
      activeHub,
      expectedGeneration,
    )).catch((error: unknown) => {
      onWarn('[hub] persona catalog refresh failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }).finally(() => {
      activeHub.catalogRefreshRunning = false;
      if (
        activeHub.catalogRefreshRequested
        && active === activeHub
        && generation === expectedGeneration
        && !disposed
      ) {
        refreshPersonaCatalog(activeHub, expectedGeneration);
      }
    });
  }

  function rethrowFirstRejected(results: PromiseSettledResult<unknown>[]): void {
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (rejected !== undefined) {
      throw rejected.reason;
    }
  }

  async function performRetirement(waitForAcceptance: boolean): Promise<void> {
    const retiring = active;
    if (retiring?.catalogRefreshTimer !== null && retiring?.catalogRefreshTimer !== undefined) {
      clearInterval(retiring.catalogRefreshTimer);
      retiring.catalogRefreshTimer = null;
    }
    active = null;
    // A metadata request can outlive the client pointer. Drain it before a
    // replacement Hub is published so an A response cannot populate B's cache.
    await drainPersonaOperations();
    const owners: Promise<unknown>[] = [];
    if (retiring !== null) {
      retiring.hooks.dispose();
      retiring.reporter.dispose();
      owners.push(retiring.hooks.quiesce(), retiring.reporter.quiesce());
    }
    if (waitForAcceptance) {
      // active=null makes an old in-flight acceptance request finish without
      // enrolling replacement work; the new client is installed only after
      // that store-owning continuation has settled.
      owners.push(acceptance.flushNow());
    }
    rethrowFirstRejected(await Promise.allSettled(owners));
  }

  function retireActive(waitForAcceptance: boolean): Promise<void> {
    const retirement = retirementTail.then(
      () => performRetirement(waitForAcceptance),
      () => performRetirement(waitForAcceptance),
    );
    retirementTail = retirement.then(
      () => undefined,
      () => undefined,
    );
    return retirement;
  }

  function trackReconfigure(task: Promise<void>): Promise<void> {
    reconfigureTasks.add(task);
    const clear = (): void => {
      reconfigureTasks.delete(task);
    };
    void task.then(clear, clear);
    return task;
  }

  function teardown(): void {
    // Reporter dispose keeps queued events persisted (crash-safe store).
    if (active?.catalogRefreshTimer !== null && active?.catalogRefreshTimer !== undefined) {
      clearInterval(active.catalogRefreshTimer);
    }
    active?.reporter.dispose();
    active?.hooks.dispose();
    active = null;
  }

  return {
    summaryHub: {
      pushSummary: (args) => active?.hooks.pushSummary?.(args) ?? Promise.resolve(),
    },

    personas: {
      list: async (expectedHubOrigin) => {
        if (
          active === null
          || (expectedHubOrigin !== undefined && active.personaScope.origin !== expectedHubOrigin)
        ) {
          throw new HubError('network', { message: 'Hub personas are not configured' });
        }
        const requestOwner = active;
        const requestGeneration = generation;
        return trackPersonaOperation(fetchPersonaCatalog(
          requestOwner,
          requestGeneration,
        ));
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
      previewBannedWords(text) {
        if (!active) return Promise.reject(new HubError('bad-request', {message:'Hub is not configured'}));
        return active.client.previewBannedWords(text);
      },
      readComposerReferences(args) {
        if (!active) return Promise.reject(new HubError('bad-request', {message:'Hub is not configured'}));
        return active.client.readComposerReferences(args);
      },
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

    reconfigure() {
      if (disposed) {
        return Promise.resolve();
      }
      const task = (async () => {
      generation += 1;
      const myGeneration = generation;
      const connection = await settingsStore.getHubConnection();
      const vm = connection.settings;
      const apiKey = connection.bearer;
      if (disposed || myGeneration !== generation) {
        return;
      }
      await retireActive(true);
      if (disposed || myGeneration !== generation) {
        return;
      }
      if (vm.hubBaseUrl === null || apiKey === null || apiKey.trim().length === 0) {
        return; // hub off — delegators stay inert
      }
      const personaScope = ensurePersonaStorageScope(data.settings, vm.hubBaseUrl);
      if (personaScope === null) {
        throw new Error('configured Hub did not resolve a persona storage scope');
      }
      // This synchronous, one-transaction snapshot is the migration boundary:
      // no persona network read may begin before it succeeds.
      ensureLegacyPersonaSnapshot(data.settings, personaScope.origin);
      const client = createClient({
        baseUrl: vm.hubBaseUrl,
        apiKey,
        ...(options.clientVersion !== undefined ? { clientVersion: options.clientVersion } : {}),
      });
      const resolver = createPageLabelResolver({
        listPages: () => client.listPages(),
        getAccountUsername: (accountId) => data.accounts.get(accountId)?.username ?? null,
        getOverrides: () => effectivePersistedAccountPageLabels(
          data.settings.get('accountPageLabels'),
        ),
      });
      const isPageLabelCurrent = (accountId: string, pageLabel: string): boolean =>
        resolver.current(accountId) === pageLabel;
      // No coordinator producer remains (the kernel gateway ledger is
      // authoritative). The reporter remains only as a compatibility seam for
      // an event produced in this credential-bound runtime; pre-cutover rows
      // were quarantined above because they carry no destination provenance.
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

      const hooks = createSummaryHubHooks({
        client,
        data,
        resolvePageLabel: (accountId) => resolver.resolve(accountId),
        isSummaryCurrent: (accountId, entry) => isCurrentPersonaSummary(
          data.settings,
          personaScope,
          accountId,
          entry,
        ),
        isPageLabelCurrent,
      });
      const nextActive: ActiveHub = {
        client,
        personaScope,
        acceptanceDestinationIdentity: acceptanceDestinationIdentity(
          personaScope.origin,
          apiKey,
        ),
        reporter,
        hooks,
        aiFeatureGateway: createFeatureAiGateway({
          client,
          resolvePageLabel: (accountId) => resolver.resolve(accountId),
          isPageLabelCurrent,
          onPersonaDefinitionStale: (details) => {
            const requestOwner = active;
            if (
              requestOwner === null
              || requestOwner.client !== client
              || generation !== myGeneration
              || disposed
            ) {
              return;
            }
            onWarn('[hub] persona definition proof rejected; refreshing full catalog', {
              hubOrigin: personaScope.origin,
              personaKey: details.personaKey,
              expectedDefinitionId: details.expectedDefinitionId,
              appliedDefinitionId: details.appliedDefinitionId,
              reason: details.reason,
            });
            // Full-snapshot refresh only. Never patch or max-merge one key;
            // the latest-started response owns the atomic replacement.
            refreshPersonaCatalog(requestOwner, myGeneration);
          },
        }),
        catalogRefreshTimer: null,
        catalogRefreshRunning: false,
        catalogRefreshRequested: false,
        catalogRequestGeneration: 0,
      };
      active = nextActive;
      // Refresh metadata at runtime activation so AI cache validation does not
      // depend on opening Settings first. Failure keeps the last catalog and
      // never falls back to uploading legacy full-text rows.
      refreshPersonaCatalog(nextActive, myGeneration);
      nextActive.catalogRefreshTimer = setInterval(() => {
        if (active === nextActive && generation === myGeneration && !disposed) {
          refreshPersonaCatalog(nextActive, myGeneration);
        }
      }, PERSONA_CATALOG_REFRESH_MS);
      // A40 (W4.6): drain the acceptance spool as soon as a working client
      // exists — flushNow had zero product callers, so events parked while
      // the hub was unconfigured waited for the next enqueue to reschedule.
      void acceptance.flushNow().catch(() => undefined);
      // Pending summaries are durable. Reconfiguration is the immediate
      // reconnect/configure signal; failures retain the row and arm the hook's
      // periodic retry until the Hub is reachable again.
      void hooks.replayPending().catch((error: unknown) => {
        onWarn(`[hub] summary replay failed (${error instanceof Error ? error.message : String(error)})`);
      });
      })();
      return trackReconfigure(task);
    },

    quiesce() {
      if (quiescePromise !== null) {
        return quiescePromise;
      }
      disposed = true;
      generation += 1;
      const terminal = (async () => {
        const results: PromiseSettledResult<unknown>[] = [];
        while (reconfigureTasks.size > 0) {
          results.push(...await Promise.allSettled([...reconfigureTasks]));
        }
        await drainPersonaOperations();
        results.push(...await Promise.allSettled([
          retireActive(false),
          acceptance.quiesce(),
        ]));
        rethrowFirstRejected(results);
      })();
      quiescePromise = terminal;
      return terminal;
    },

    dispose() {
      disposed = true;
      acceptance.dispose();
      teardown();
    },
  };
}
