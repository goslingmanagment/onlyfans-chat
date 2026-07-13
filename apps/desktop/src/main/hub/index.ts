// Hub cluster composition (SPEC §8.5/§8.6/§9.3): one module owns the REST
// client, the persisted usage reporter and the summary hooks, rebuilt whenever
// the hub config (base URL + chatter key) changes. Unconfigured hub = inert
// delegators — prefetch resolves null, push no-ops, and usage events stay
// parked in usage_events for a later configured session (today's behavior).

import { createHubClient, createUsageReporter } from '@chatgoose/shared/hub/index';
import { HubError } from '@chatgoose/shared/hub/index';
import type {
  HubAiPersona,
  HubAiPersonaArchiveResult,
  HubAiPersonaState,
  HubClient,
  HubOfapiCreditsSummary,
  UsageReporter,
} from '@chatgoose/shared/hub/index';
import type { Personality } from '@chatgoose/shared/types';
import type { SummaryHubHooks, UsageEventRecord } from '../ai/index';
import type { DataLayer } from '../db/index';
import type { SettingsStore } from '../settings/store';
import type { Keychain } from '../secrets/keychain';
import { createPageLabelResolver } from './page-resolver';
import { createSqliteUsageEventStore } from './usage-store';
import { createSummaryHubHooks } from './summary-hooks';
import type { SummaryHubSyncHooks } from './summary-hooks';
import { mapUsagePayloadToHubEvent } from './usage-mapper';
import { createFeatureAiGateway } from './ai-feature-gateway';
import { createAcceptanceReporter, createAcceptanceTracker } from './acceptance-reporter';
import type { AcceptanceEventInput, AcceptanceReporter, AcceptanceTracker } from './acceptance-reporter';
import type { AiFeatureGateway } from '../ai/gateway';
import {
  applyPendingPersonaIntents,
  bootstrapPersonalitiesSchema,
  classifyPersonaMutationFailure,
  clearPendingPersonaIntent,
  ensurePersonaStorageScope,
  isLegacyPersonaBootstrapRequired,
  isCurrentPendingPersonaIntent,
  isWritablePersonality,
  legacyRecoveredPersona,
  loadPersonaAccountMappings,
  loadPendingPersonaIntents,
  markLegacyPersonaBootstrapComplete,
  personaCacheKey,
  storePersonaAccountMappings,
  storeLegacyPersonaRecovery,
  type PendingPersonaIntent,
  type PersonaStorageScope,
} from '../personas/pending';
import {
  reconcilePersonaUpsertConflict,
  type PersonaConflictResolution,
} from '../personas/reconcile';

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
    list: (expectedHubOrigin?: string) => Promise<HubAiPersona[]>;
    upsert: (args: {
      key: string;
      displayName: string;
      systemBlock: string;
      expectedVersion: number | null;
      expectedHubOrigin?: string;
    }) => Promise<PersonaUpsertOutcome>;
    archive: (args: {
      key: string;
      expectedVersion: number | null;
      expectedHubOrigin?: string;
    }) => Promise<HubAiPersonaArchiveResult>;
  };
  /** Stage 31: acceptance lifecycle spool (KV-backed; drains when active). */
  acceptance: AcceptanceReporter;
  /** Stage 31: inserted-suggestion tracker for the sent/edited signal. */
  acceptanceTracker: AcceptanceTracker;
  /** Coordinator onAcceptanceEvent target ('shown'). */
  onAcceptanceEvent: (event: AcceptanceEventInput) => void;
  /** Stable delegator for C6b text-command intake/status recovery. */
  commandClient: Pick<HubClient, 'createOfapiCommand' | 'getOfapiCommand' | 'cancelOfapiCommand'>;
  /** DRAIN-ONLY (Stage 31): nothing calls this post-cutover — the coordinator
   * stopped writing usage_events. It stays one release so rows parked by
   * pre-cutover versions still map and flush; remove with the drain lane. */
  onUsageEvent: (event: UsageEventRecord) => void;
  /** Page-scoped core OFAPI spend summary for Activity/diagnostics; null when hub is off/unreachable. */
  getOfapiCreditsSummary(): Promise<HubOfapiCreditsSummary | null>;
  /** Rebuilds client/reporter/hooks from current settings + keychain. */
  reconfigure(): Promise<void>;
  /** Retires network producers and awaits reporter continuations before DB close. */
  quiesce(): Promise<void>;
  dispose(): void;
}

export type PersonaUpsertOutcome =
  | { kind: 'upserted'; persona: HubAiPersona }
  | PersonaConflictResolution;

interface ActiveHub {
  client: HubClient;
  personaScope: PersonaStorageScope;
  reporter: UsageReporter;
  hooks: SummaryHubSyncHooks;
  aiFeatureGateway: AiFeatureGateway;
}

export function createHubModule(options: HubModuleOptions): HubModule {
  const { data, settingsStore } = options;
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
  const reconfigureTasks = new Set<Promise<void>>();
  let quiescePromise: Promise<void> | null = null;
  let retirementTail: Promise<void> = Promise.resolve();
  /**
   * Persona writes are global Core configuration. Keep one mutation lane per
   * key so a stale bootstrap request already on the wire always settles before
   * a later user save or archive starts its revision-checked mutation.
   */
  const personaMutationTails = new Map<string, Promise<void>>();
  const personaOperations = new Set<Promise<unknown>>();
  type LatestPersonaIntent =
    | {
        kind: 'upsert';
        args: {
          key: string;
          displayName: string;
          systemBlock: string;
          expectedVersion: number | null;
        };
      }
    | { kind: 'archive' };
  // The same custom key may legitimately exist in two different Hub tenants.
  // Keep the bootstrap/user-intent arbitration tenant-scoped as well as the
  // durable cache; otherwise an unfinished migration on A could reuse a later
  // same-key edit made on B when the user switches back to A.
  const latestPersonaIntents = new Map<string, LatestPersonaIntent>();

  function errorStatus(error: unknown): number | null {
    if (error === null || typeof error !== 'object') {
      return null;
    }
    const record = error as Record<string, unknown>;
    if (typeof record['status'] === 'number') {
      return record['status'];
    }
    const detail = record['detail'];
    if (detail !== null && typeof detail === 'object') {
      const status = (detail as Record<string, unknown>)['status'];
      return typeof status === 'number' ? status : null;
    }
    return null;
  }

  function personaIntentIdentity(origin: string, key: string): string {
    return JSON.stringify([origin, key]);
  }

  function restoreLatestPersonaIntent(
    identity: string,
    rejected: LatestPersonaIntent,
    previous: LatestPersonaIntent | undefined,
  ): void {
    if (latestPersonaIntents.get(identity) !== rejected) {
      return;
    }
    if (previous === undefined) {
      latestPersonaIntents.delete(identity);
    } else {
      latestPersonaIntents.set(identity, previous);
    }
  }

  function serializePersonaMutation<Result>(
    key: string,
    mutation: () => Promise<Result>,
  ): Promise<Result> {
    const previous = personaMutationTails.get(key) ?? Promise.resolve();
    const task = previous.then(mutation, mutation);
    const settled = task.then(
      () => undefined,
      () => undefined,
    );
    personaMutationTails.set(key, settled);
    void settled.then(() => {
      if (personaMutationTails.get(key) === settled) {
        personaMutationTails.delete(key);
      }
    });
    return task;
  }

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

  async function drainPersonaMutations(): Promise<void> {
    while (personaMutationTails.size > 0) {
      await Promise.allSettled([...personaMutationTails.values()]);
    }
  }

  async function projectConfirmedPendingPersona(
    scope: PersonaStorageScope,
    intent: PendingPersonaIntent,
    confirmedVersion?: number,
  ): Promise<boolean> {
    if (!isCurrentPendingPersonaIntent(data.settings, scope, intent)) {
      return false;
    }
    const cacheKey = personaCacheKey(scope);
    const raw = data.settings.get(cacheKey);
    const cached = raw === undefined
      ? []
      // These values came through JSON-backed settings. The schema supplies
      // updatedAt for pre-cutover rows and strips explicit undefined values.
      : bootstrapPersonalitiesSchema.parse(raw) as Personality[];
    const projectedIntent = intent.kind === 'upsert' && confirmedVersion !== undefined
      ? {
          ...intent,
          personality: { ...intent.personality, remoteVersion: confirmedVersion },
        }
      : intent;
    if (intent.kind === 'archive') {
      // Mapping removal is the safety gate. Persist it before the cache
      // projection so a crash cannot leave AI enabled for an archived key.
      const mappings = Object.fromEntries(
        Object.entries(loadPersonaAccountMappings(data.settings, scope))
          .filter(([, pid]) => pid !== intent.key),
      );
      storePersonaAccountMappings(data.settings, scope, mappings);
    }
    data.settings.set(
      cacheKey,
      applyPendingPersonaIntents(cached, [projectedIntent]),
    );
    return true;
  }

  async function upsertPendingPersona(
    client: HubClient,
    scope: PersonaStorageScope,
    intent: Extract<PendingPersonaIntent, { kind: 'upsert' }>,
  ): Promise<PersonaUpsertOutcome> {
    try {
      const persona = await client.upsertAiPersona({
        key: intent.key,
        displayName: intent.personality.name,
        systemBlock: intent.personality.content,
        expectedVersion: intent.expectedVersion,
      });
      return { kind: 'upserted', persona };
    } catch (error) {
      if (errorStatus(error) !== 409) {
        throw error;
      }
      return reconcilePersonaUpsertConflict({
        settings: data.settings,
        scope,
        intent,
        remote: {
          listStates: () => client.listAiPersonaStates(),
          upsertCreateOnly: (args) => client.upsertAiPersona({
            ...args,
            expectedVersion: null,
          }),
          upsertExpectedVersion: (args) => client.upsertAiPersona(args),
        },
      });
    }
  }

  function activePersonaStateToPersona(
    state: Extract<HubAiPersonaState, { state: 'active' }>,
  ): HubAiPersona {
    return {
      key: state.key,
      displayName: state.displayName,
      systemBlock: state.systemBlock,
      updatedAt: state.updatedAt,
      version: state.version,
    };
  }

  function projectArchiveConflict(
    scope: PersonaStorageScope,
    intent: Extract<PendingPersonaIntent, { kind: 'archive' }>,
    state: Extract<HubAiPersonaState, { state: 'active' }>,
  ): void {
    if (!isCurrentPendingPersonaIntent(data.settings, scope, intent)) {
      return;
    }
    const persona = activePersonaStateToPersona(state);
    const updatedAt = Date.parse(persona.updatedAt);
    const local: Personality = {
      id: persona.key,
      name: persona.displayName,
      content: persona.systemBlock,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      remoteVersion: persona.version,
      ...(persona.key === 'builtin:lora' ? { builtin: true } : {}),
    };
    const key = personaCacheKey(scope);
    const raw = data.settings.get(key);
    const cached = raw === undefined
      ? []
      : bootstrapPersonalitiesSchema.parse(raw) as Personality[];
    data.settings.set(
      key,
      cached.some((candidate) => candidate.id === local.id)
        ? cached.map((candidate) => candidate.id === local.id ? local : candidate)
        : [...cached, local],
    );
    clearPendingPersonaIntent(data.settings, scope, intent);
  }

  async function listPersonaStatesForArchive(client: HubClient): Promise<HubAiPersonaState[]> {
    try {
      return await client.listAiPersonaStates();
    } catch (error) {
      if (errorStatus(error) === 404) {
        // Do not let the generic DELETE-404 idempotency classifier mistake a
        // missing preflight route on an old Core for an already archived row.
        throw new HubError('invalid-response', {
          message: 'Core does not expose revision-safe persona archive state',
        });
      }
      throw error;
    }
  }

  async function archivePendingPersona(
    client: HubClient,
    scope: PersonaStorageScope,
    intent: Extract<PendingPersonaIntent, { kind: 'archive' }>,
  ): Promise<HubAiPersonaArchiveResult> {
    // Capability + lifecycle preflight is mandatory. An old Core ignores
    // unknown DELETE query fields and would otherwise archive unconditionally
    // before its revision-less response failed validation.
    const preflight = (await listPersonaStatesForArchive(client))
      .find((state) => state.key === intent.key);
    if (preflight?.state === 'archived') {
      return { archived: true, version: preflight.version };
    }
    const firstExpectedVersion =
      preflight?.state === 'active'
      && intent.expectedVersion === null
      && intent.basePersonality !== null
      && preflight.displayName === intent.basePersonality.name
      && preflight.systemBlock === intent.basePersonality.content
        ? preflight.version
        : intent.expectedVersion;
    try {
      return await client.archiveAiPersona({
        key: intent.key,
        expectedVersion: firstExpectedVersion,
      });
    } catch (error) {
      if (errorStatus(error) !== 409) {
        throw error;
      }

      let current = (await listPersonaStatesForArchive(client))
        .find((state) => state.key === intent.key);
      if (current?.state === 'archived') {
        return { archived: true, version: current.version };
      }

      // A create-only save may have committed while its response was lost. An
      // exact payload match proves that this is the row the user deleted; retry
      // with the now-observed revision. Legacy journals without the base remain
      // fail-closed.
      if (
        current?.state === 'active'
        && intent.expectedVersion === null
        && intent.basePersonality !== null
        && current.displayName === intent.basePersonality.name
        && current.systemBlock === intent.basePersonality.content
      ) {
        try {
          return await client.archiveAiPersona({
            key: intent.key,
            expectedVersion: current.version,
          });
        } catch (retryError) {
          if (errorStatus(retryError) !== 409) {
            throw retryError;
          }
          current = (await listPersonaStatesForArchive(client))
            .find((state) => state.key === intent.key);
          if (current?.state === 'archived') {
            return { archived: true, version: current.version };
          }
          if (current?.state === 'active') {
            projectArchiveConflict(scope, intent, current);
          }
          throw retryError;
        }
      }

      if (current?.state === 'active') {
        // A newer active revision won. Make that row visible again and clear
        // the stale tombstone before surfacing the 409 to an interactive caller.
        projectArchiveConflict(scope, intent, current);
      }
      throw error;
    }
  }

  function projectLegacyConfirmedVersion(
    scope: PersonaStorageScope,
    source: Personality,
    confirmed: HubAiPersona,
  ): void {
    if (
      confirmed.key !== source.id
      || latestPersonaIntents.has(personaIntentIdentity(scope.origin, source.id))
      || loadPendingPersonaIntents(data.settings, scope).some((intent) => intent.key === source.id)
    ) {
      return;
    }
    const key = personaCacheKey(scope);
    const parsed = bootstrapPersonalitiesSchema.safeParse(data.settings.get(key));
    if (!parsed.success) {
      return;
    }
    const index = parsed.data.findIndex((candidate) =>
      candidate.id === source.id
      && candidate.name === source.name
      && candidate.content === source.content
      && candidate.updatedAt === source.updatedAt);
    if (index === -1) {
      return;
    }
    const updatedAt = Date.parse(confirmed.updatedAt);
    const next = [...parsed.data];
    next[index] = {
      ...next[index]!,
      name: confirmed.displayName,
      content: confirmed.systemBlock,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      remoteVersion: confirmed.version,
    };
    data.settings.set(key, next);
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
    active = null;
    // Reads and the one-time legacy migration can outlive the client pointer.
    // Drain them before a replacement Hub is published so an A response cannot
    // populate B's cache after a runtime switch.
    await Promise.all([drainPersonaOperations(), drainPersonaMutations()]);
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
    active?.reporter.dispose();
    active?.hooks.dispose();
    active = null;
  }

  return {
    summaryHub: {
      prefetchSummary: (args) =>
        active?.hooks.prefetchSummary?.(args) ?? Promise.resolve(null),
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
        const client = active.client;
        const requestScope = active.personaScope;
        const requestGeneration = generation;
        return trackPersonaOperation((async () => {
          const result = await client.listAiPersonas();
          if (
            disposed
            || requestGeneration !== generation
            || active?.client !== client
            || active.personaScope.origin !== requestScope.origin
          ) {
            throw new HubError('network', { message: 'Hub persona list belonged to a retired runtime' });
          }
          return result;
        })());
      },
      upsert: async ({ expectedHubOrigin, ...args }) => {
        const requestGeneration = generation;
        const requestOrigin = expectedHubOrigin ?? active?.personaScope.origin ?? null;
        const identity = requestOrigin === null
          ? null
          : personaIntentIdentity(requestOrigin, args.key);
        const previous = identity === null ? undefined : latestPersonaIntents.get(identity);
        const intent: LatestPersonaIntent = { kind: 'upsert', args };
        if (identity !== null) {
          latestPersonaIntents.set(identity, intent);
        }
        try {
          return await serializePersonaMutation(args.key, async () => {
            if (
              disposed
              || active === null
              || requestGeneration !== generation
              || (expectedHubOrigin !== undefined && active.personaScope.origin !== expectedHubOrigin)
            ) {
              throw new HubError('network', { message: 'Hub personas are not configured' });
            }
            const currentActive = active;
            const pending = loadPendingPersonaIntents(data.settings, currentActive.personaScope)
              .find((candidate): candidate is Extract<PendingPersonaIntent, { kind: 'upsert' }> =>
                candidate.kind === 'upsert'
                && candidate.key === args.key
                && candidate.expectedVersion === args.expectedVersion
                && candidate.personality.name === args.displayName
                && candidate.personality.content === args.systemBlock);
            if (pending !== undefined) {
              return upsertPendingPersona(currentActive.client, currentActive.personaScope, pending);
            }
            const persona = await currentActive.client.upsertAiPersona(args);
            return { kind: 'upserted' as const, persona };
          });
        } catch (error) {
          if (identity !== null) {
            restoreLatestPersonaIntent(identity, intent, previous);
          }
          throw error;
        }
      },
      archive: async ({ key, expectedVersion, expectedHubOrigin }) => {
        const requestGeneration = generation;
        const requestOrigin = expectedHubOrigin ?? active?.personaScope.origin ?? null;
        const identity = requestOrigin === null
          ? null
          : personaIntentIdentity(requestOrigin, key);
        const previous = identity === null ? undefined : latestPersonaIntents.get(identity);
        const intent: LatestPersonaIntent = { kind: 'archive' };
        if (identity !== null) {
          latestPersonaIntents.set(identity, intent);
        }
        try {
          return await serializePersonaMutation(key, async () => {
            if (
              disposed
              || active === null
              || requestGeneration !== generation
              || (expectedHubOrigin !== undefined && active.personaScope.origin !== expectedHubOrigin)
            ) {
              throw new HubError('network', { message: 'Hub personas are not configured' });
            }
            const currentActive = active;
            const pending = loadPendingPersonaIntents(data.settings, currentActive.personaScope)
              .find((candidate): candidate is Extract<PendingPersonaIntent, { kind: 'archive' }> =>
                candidate.kind === 'archive'
                && candidate.key === key
                && candidate.expectedVersion === expectedVersion);
            if (pending !== undefined) {
              return archivePendingPersona(currentActive.client, currentActive.personaScope, pending);
            }
            // A new Desktop must never let an old Core strip the CAS query and
            // perform an unconditional archive. The state operation is the
            // additive capability probe and completes before DELETE.
            await listPersonaStatesForArchive(currentActive.client);
            return currentActive.client.archiveAiPersona({ key, expectedVersion });
          });
        } catch (error) {
          if (identity !== null) {
            restoreLatestPersonaIntent(identity, intent, previous);
          }
          throw error;
        }
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
      // Stage 31 drain mode: no producer remains (the kernel gateway ledger is
      // authoritative); the reporter only flushes usage_events rows parked by
      // pre-cutover releases. Planned removal once the fleet's diagnostics
      // show the drain counter at zero (§5).
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
      // Durable offline intents replay on every reconnect. The old Stage-31
      // cache migration is separate and genuinely one-time: it belongs only to
      // the Hub that claimed the legacy global keys and uses Core's lifecycle
      // state/create-only contract. Client clocks never decide which payload
      // wins, and an archived tombstone can never be resurrected by migration.
      const personaRecovery = (async () => {
        try {
          // Durable intents are replayed before the legacy local bootstrap.
          // The compare-and-swap clear is intentionally after the confirmed
          // Core response, so crash/timeout windows remain safely retryable.
          const replayedKeys = new Set<string>();
          const pendingSnapshot = loadPendingPersonaIntents(data.settings, personaScope);
          for (const intent of pendingSnapshot) {
            if (disposed || myGeneration !== generation) {
              return;
            }
            try {
              await serializePersonaMutation(intent.key, async () => {
                if (
                  disposed ||
                  myGeneration !== generation ||
                  !isCurrentPendingPersonaIntent(data.settings, personaScope, intent)
                ) {
                  return;
                }
                if (intent.kind === 'upsert') {
                  const outcome = await upsertPendingPersona(client, personaScope, intent);
                  if (outcome.kind === 'upserted') {
                    // Cache projection is part of acknowledgement. Clearing
                    // first would let a crash leave stale local content with no
                    // revision token and the next bootstrap could write it back.
                    if (
                      await projectConfirmedPendingPersona(
                        personaScope,
                        intent,
                        outcome.persona.version,
                      ) &&
                      clearPendingPersonaIntent(data.settings, personaScope, intent)
                    ) {
                      replayedKeys.add(intent.key);
                    }
                  } else if (!isCurrentPendingPersonaIntent(data.settings, personaScope, intent)) {
                    // Conflict reconciliation owns its projection + CAS clear.
                    replayedKeys.add(intent.key);
                  }
                  return;
                }
                try {
                  await archivePendingPersona(client, personaScope, intent);
                } catch (error) {
                  if (classifyPersonaMutationFailure(error, intent.kind) !== 'already-archived') {
                    throw error;
                  }
                }
                // Cache projection is part of acknowledgement. Clearing first
                // would let a crash leave stale local content that the next
                // legacy bootstrap could write back over Core.
                if (
                  await projectConfirmedPendingPersona(personaScope, intent) &&
                  clearPendingPersonaIntent(data.settings, personaScope, intent)
                ) {
                  replayedKeys.add(intent.key);
                }
              });
            } catch (error) {
              const failure = classifyPersonaMutationFailure(error, intent.kind);
              onWarn('[hub] pending persona replay deferred', {
                personaKey: intent.key,
                mutation: intent.kind,
                failure,
                reason: error instanceof HubError ? error.reason : undefined,
              });
              if (failure === 'retryable') {
                // One blackholed request is enough to establish that this
                // trigger cannot make progress. Preserve the remaining bounded
                // journal and avoid serially paying up to 128 timeouts.
                return;
              }
            }
          }

          if (!isLegacyPersonaBootstrapRequired(data.settings, personaScope)) {
            return;
          }
          let stateByKey = new Map(
            (await client.listAiPersonaStates()).map((state) => [state.key, state] as const),
          );
          const refreshPersonaStates = async (): Promise<void> => {
            stateByKey = new Map(
              (await client.listAiPersonaStates()).map((state) => [state.key, state] as const),
            );
          };
          if (disposed || myGeneration !== generation) {
            return;
          }
          const cacheKey = personaCacheKey(personaScope);
          const rawStored = data.settings.get(cacheKey);
          if (rawStored === undefined) {
            markLegacyPersonaBootstrapComplete(data.settings, personaScope);
            return;
          }
          const parsedStored = bootstrapPersonalitiesSchema.safeParse(rawStored);
          if (!parsedStored.success) {
            onWarn('[hub] legacy persona cache could not be migrated', {
              scope: personaScope.origin,
              reason: 'invalid-cache',
            });
            return;
          }
          const stored: Personality[] = parsedStored.data.map((persona) => ({
            id: persona.id,
            name: persona.name,
            content: persona.content,
            updatedAt: persona.updatedAt,
            ...(persona.remoteVersion !== undefined
              ? { remoteVersion: persona.remoteVersion }
              : {}),
            ...(persona.builtin !== undefined ? { builtin: persona.builtin } : {}),
            ...(persona.builtinVersion !== undefined
              ? { builtinVersion: persona.builtinVersion }
              : {}),
          }));
          for (const persona of stored) {
            // Reconfigure/dispose can retire this client while an earlier
            // persona request is in flight. Do not start another request with
            // credentials that are no longer active.
            if (disposed || myGeneration !== generation) {
              return;
            }
            if (persona.builtin === true) {
              continue;
            }
            if (
              replayedKeys.has(persona.id) ||
              loadPendingPersonaIntents(data.settings, personaScope)
                .some((intent) => intent.key === persona.id)
            ) {
              // A still-pending intent is the sole source of truth. Never let a
              // cached bootstrap PUT undo its tombstone or newer content.
              continue;
            }
            if (!isWritablePersonality(persona)) {
              // Pre-fix builds accepted empty/100k content. Preserve it in the
              // cache for repair rather than dropping every persona or sending
              // a deterministic Core 400.
              onWarn('[hub] local persona is outside the Core write contract', {
                personaKey: persona.id,
                contentLength: persona.content.length,
              });
              storeLegacyPersonaRecovery(data.settings, personaScope, {
                personality: persona as Personality,
                reason: 'outside-core-contract',
                remoteVersion: stateByKey.get(persona.id)?.version ?? null,
              });
              continue;
            }
            const latestIntent = latestPersonaIntents.get(
              personaIntentIdentity(personaScope.origin, persona.id),
            );
            if (latestIntent !== undefined) {
              // Interactive intent is serialized on the same key and already
              // owns both the cache and Core mutation. Bootstrap must not turn
              // the older captured row into a recovery duplicate.
              continue;
            }

            // At most one refresh is needed to close a state-list -> create
            // race. A second 409 defers the whole migration to a later trigger;
            // it never falls back to an unconditional LWW PUT.
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const remote = stateByKey.get(persona.id);
              if (remote?.state === 'archived') {
                storeLegacyPersonaRecovery(data.settings, personaScope, {
                  personality: persona,
                  reason: 'remote-archived',
                  remoteVersion: remote.version,
                });
                const mappings = Object.fromEntries(
                  Object.entries(loadPersonaAccountMappings(data.settings, personaScope))
                    .filter(([, personaId]) => personaId !== persona.id),
                );
                storePersonaAccountMappings(data.settings, personaScope, mappings);
                break;
              }
              if (
                remote?.state === 'active'
                && remote.displayName === persona.name
                && remote.systemBlock === persona.content
              ) {
                projectLegacyConfirmedVersion(personaScope, persona, remote);
                break;
              }

              let createArgs = {
                key: persona.id,
                displayName: persona.name,
                systemBlock: persona.content,
              };
              if (remote?.state === 'active') {
                storeLegacyPersonaRecovery(data.settings, personaScope, {
                  personality: persona,
                  reason: 'active-conflict',
                  remoteVersion: remote.version,
                });
                createArgs = legacyRecoveredPersona(persona);
                const recoveryState = stateByKey.get(createArgs.key);
                if (recoveryState?.state === 'archived') {
                  storeLegacyPersonaRecovery(data.settings, personaScope, {
                    personality: persona,
                    reason: 'recovery-key-archived',
                    remoteVersion: recoveryState.version,
                  });
                  break;
                }
                if (recoveryState?.state === 'active') {
                  if (
                    recoveryState.displayName !== createArgs.displayName
                    || recoveryState.systemBlock !== createArgs.systemBlock
                  ) {
                    storeLegacyPersonaRecovery(data.settings, personaScope, {
                      personality: persona,
                      reason: 'recovery-key-conflict',
                      remoteVersion: recoveryState.version,
                    });
                    onWarn('[hub] deterministic legacy persona recovery key is occupied', {
                      personaKey: persona.id,
                      recoveryKey: createArgs.key,
                    });
                  }
                  break;
                }
              }

              try {
                const created = await serializePersonaMutation(createArgs.key, async () => {
                  // This task may have waited behind a mutation from the
                  // retiring generation. Re-check immediately before wire IO.
                  if (disposed || myGeneration !== generation) {
                    return null;
                  }
                  return client.upsertAiPersona({ ...createArgs, expectedVersion: null });
                });
                if (created !== null) {
                  stateByKey.set(createArgs.key, {
                    state: 'active',
                    ...created,
                  } satisfies HubAiPersonaState);
                  projectLegacyConfirmedVersion(personaScope, persona, created);
                }
                break;
              } catch (error) {
                if (errorStatus(error) !== 409 || attempt === 1) {
                  throw error;
                }
                await refreshPersonaStates();
              }
            }
          }
          if (!disposed && myGeneration === generation) {
            markLegacyPersonaBootstrapComplete(data.settings, personaScope);
          }
        } catch (error) {
          onWarn(`[hub] persona sync failed (${error instanceof Error ? error.message : String(error)})`);
        }
      })();
      void trackPersonaOperation(personaRecovery);

      const hooks = createSummaryHubHooks({
        client,
        data,
        resolvePageLabel: (accountId) => resolver.resolve(accountId),
      });
      active = {
        client,
        personaScope,
        reporter,
        hooks,
        aiFeatureGateway: createFeatureAiGateway({
          client,
          resolvePageLabel: (accountId) => resolver.resolve(accountId),
        }),
      };
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
        await Promise.all([drainPersonaOperations(), drainPersonaMutations()]);
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
