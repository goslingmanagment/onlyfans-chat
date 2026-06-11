// Credits/rate-limit telemetry (SPEC §5): parses `_meta._credits` +
// `x-ofapi-credits-*` + `x-rate-limit-remaining-minute` whenever present and
// publishes {balance, usedToday, rpmRemaining} plus per-purpose request/credit
// tallies (PLAN item 9 Activity ledger). The daily counters reset on UTC day
// flip; persistence is the db layer's job — it consumes the published events
// and rehydrates via `hydrate()`.

import { z } from 'zod';

const responseMetaSchema = z.looseObject({
  _credits: z
    .looseObject({
      used: z.number().nullish(),
      balance: z.number().nullish(),
    })
    .nullish(),
  _rate_limits: z
    .looseObject({
      remaining_minute: z.number().nullish(),
      limit_minute: z.number().nullish(),
    })
    .nullish(),
});

export interface HeadersLike {
  get(name: string): string | null;
}

/** Per-purpose daily counters. Requests count every response, even 0-credit ones. */
export interface PurposeTally {
  requests: number;
  credits: number;
}

export interface CreditMeterSnapshot {
  balance: number | null;
  usedToday: number;
  rpmRemaining: number | null;
  /** UTC day (YYYY-MM-DD) the daily counters belong to. */
  utcDay: string;
  /** Keyed by OfApiPurpose (string-keyed: hydrated rows may carry legacy keys). */
  usedTodayByPurpose: Record<string, PurposeTally>;
}

export type CreditMeterListener = (snapshot: CreditMeterSnapshot) => void;

export interface CreditMeter {
  /** Feed headers and/or the parsed body `_meta` of any OFAPI response. */
  record(input: { headers?: HeadersLike; meta?: unknown; purpose?: string }): void;
  snapshot(): CreditMeterSnapshot;
  /** Restore persisted daily counters; ignored when the persisted day is stale. */
  hydrate(state: {
    utcDay: string;
    usedToday: number;
    usedTodayByPurpose?: Record<string, PurposeTally>;
  }): void;
  subscribe(listener: CreditMeterListener): () => void;
}

function utcDayOf(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function createCreditMeter(
  options: { onMeta?: CreditMeterListener; now?: () => number } = {},
): CreditMeter {
  const now = options.now ?? Date.now;
  const listeners = new Set<CreditMeterListener>();
  if (options.onMeta) listeners.add(options.onMeta);

  let balance: number | null = null;
  let rpmRemaining: number | null = null;
  let usedToday = 0;
  let byPurpose = new Map<string, PurposeTally>();
  let utcDay = utcDayOf(now());

  function rollDay(): void {
    const day = utcDayOf(now());
    if (day !== utcDay) {
      utcDay = day;
      usedToday = 0;
      byPurpose = new Map();
    }
  }

  function snapshot(): CreditMeterSnapshot {
    rollDay();
    const usedTodayByPurpose: Record<string, PurposeTally> = {};
    for (const [purpose, tally] of byPurpose) {
      usedTodayByPurpose[purpose] = { ...tally };
    }
    return { balance, usedToday, rpmRemaining, utcDay, usedTodayByPurpose };
  }

  function emit(): void {
    const current = snapshot();
    for (const listener of listeners) listener(current);
  }

  function headerNumber(headers: HeadersLike | undefined, name: string): number | null {
    const raw = headers?.get(name);
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  return {
    record(input): void {
      const parsedMeta = responseMetaSchema.safeParse(input.meta);
      const meta = parsedMeta.success ? parsedMeta.data : undefined;

      const used =
        headerNumber(input.headers, 'x-ofapi-credits-used') ?? meta?._credits?.used ?? null;
      const newBalance =
        headerNumber(input.headers, 'x-ofapi-credits-balance') ?? meta?._credits?.balance ?? null;
      const newRpmRemaining =
        headerNumber(input.headers, 'x-rate-limit-remaining-minute') ??
        meta?._rate_limits?.remaining_minute ??
        null;

      // Untagged responses with no telemetry stay invisible (legacy behavior);
      // a tagged response always counts as a request, even a free one.
      if (input.purpose === undefined && used === null && newBalance === null && newRpmRemaining === null) {
        return;
      }

      rollDay();
      if (input.purpose !== undefined) {
        const tally = byPurpose.get(input.purpose) ?? { requests: 0, credits: 0 };
        tally.requests += 1;
        tally.credits += used ?? 0;
        byPurpose.set(input.purpose, tally);
      }
      if (used !== null) usedToday += used;
      if (newBalance !== null) balance = newBalance;
      if (newRpmRemaining !== null) rpmRemaining = newRpmRemaining;
      emit();
    },
    snapshot,
    hydrate(state): void {
      rollDay();
      if (state.utcDay === utcDay) {
        usedToday = state.usedToday;
        byPurpose = new Map(
          Object.entries(state.usedTodayByPurpose ?? {}).map(([purpose, tally]) => [
            purpose,
            { ...tally },
          ]),
        );
        emit();
      }
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
