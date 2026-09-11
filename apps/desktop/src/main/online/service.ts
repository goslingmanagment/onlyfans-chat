// Online-now surface (variant C, flat; mockup docs/mockups/experiments/online-flat.html).
// Owner rejected background auto-polling ("автопарс жрёт кредиты"): the ONLY
// OFAPI call is the explicit «Обновить» button → ONE read-only GET /fans/active
// ?filter[online]=1[&filter[total_spent]=1], 1 credit/page (≤20 fans/page),
// tagged purpose 'online'. /fans/active is a Hybrid fans-list read — it does
// NOT mark OnlyFans chats read (unlike GET /messages). Everything money/preview/
// waiting-shaped joins from the LOCAL SQLite stores (0 credits), reusing the
// exact Spenders join (db queries + deriveFanWaiting + silence bucket). Only the
// active-member snapshot lives in memory; local row joins are rebuilt on read.
// A per-(account,filter) freshness stamp persists (settings table — same
// key-value seam as spenders.refreshedAt.*) so «обновлено N назад» survives a
// restart even though the member rows are gone.

import { daysSince, fanSilenceBucket } from '@chatgoose/shared';
import { z } from 'zod';
import type { OfApiClient } from '../ofapi/client';
import type { OfApiUser } from '../ofapi/schemas';
import type { DataLayer } from '../db/index';
import type { ChatRow, FanRow } from '../db/rows';
import type { OnlineCountsVM, OnlineRowVM, OnlineSnapshotVM } from '../../preload/contract';
import { deriveFanWaiting } from '../ipc/viewmodels';

/** ≤20 fans/page (matches FANS_LIST_MAX_LIMIT) = 1 credit/page. */
const ONLINE_PAGE_LIMIT = 20;
/** Sane cap: a press fetches at most this many pages (≤100 online fans), then
 *  flags truncation — typical accounts have <20 online ⇒ 1 page = 1 credit. */
export const ONLINE_MAX_PAGES = 5;
/** «Только спендеры» server threshold: ≥ $1 (filter[total_spent] is a >= bound;
 *  send 1, NOT 0, so $0 fans are excluded). */
const SPENDERS_MIN_TOTAL_SPENT = 1;
const SPEND_WINDOW_MS = 30 * 24 * 60 * 60_000;

interface OnlineMember {
  fanId: string;
  name: string | null;
  username: string | null;
  avatarRemoteUrl: string | null;
  totalSumm: number | null;
  lastSeen: string | null;
}

interface OnlineSnapshotEntry {
  members: OnlineMember[];
  truncated: boolean;
  fetchedAtMs: number;
}

export interface OnlineService {
  /** Cached snapshot for (account, spendersOnly) — 0 credits (no OFAPI call). */
  snapshot(accountId: string, spendersOnly: boolean): OnlineSnapshotVM;
  /** «Обновить»: one forced read-only GET /fans/active (1 credit/page). */
  refresh(accountId: string, spendersOnly: boolean): Promise<OnlineSnapshotVM>;
}

export interface OnlineServiceOptions {
  client: OfApiClient;
  data: DataLayer;
  /** Registering media:// mint (same seam as sync) for list-only avatars. */
  toMediaUrl: (remoteUrl: string) => string | null;
  now?: () => number;
}

const stampsSchema = z.record(z.string(), z.string());

export function createOnlineService(options: OnlineServiceOptions): OnlineService {
  const { client, data, toMediaUrl } = options;
  const now = options.now ?? Date.now;

  const snapshotCache = new Map<string, OnlineSnapshotEntry>();
  // Single-flight: a double «Обновить» (or rail+surface racing the same key)
  // must not double-spend credits.
  const inFlight = new Map<string, Promise<OnlineSnapshotEntry>>();

  function cacheKey(accountId: string, spendersOnly: boolean): string {
    return `${accountId}|${spendersOnly ? '1' : '0'}`;
  }
  function filterKey(spendersOnly: boolean): string {
    return spendersOnly ? 'spenders' : 'all';
  }
  function stampsKey(accountId: string): string {
    return `online.refreshedAt.${accountId}`;
  }
  function readStamp(accountId: string, spendersOnly: boolean): string | null {
    const stamps = data.settings.getParsed(stampsKey(accountId), stampsSchema) ?? {};
    return stamps[filterKey(spendersOnly)] ?? null;
  }
  function writeStamp(accountId: string, spendersOnly: boolean, iso: string): void {
    const stamps = data.settings.getParsed(stampsKey(accountId), stampsSchema) ?? {};
    stamps[filterKey(spendersOnly)] = iso;
    data.settings.set(stampsKey(accountId), stamps);
  }

  function toMember(user: OfApiUser): OnlineMember {
    return {
      fanId: String(user.id),
      name:
        user.displayName !== undefined && user.displayName !== null && user.displayName !== ''
          ? user.displayName
          : (user.name ?? null),
      username: user.username ?? null,
      avatarRemoteUrl: user.avatar ?? user.avatarThumbs?.c144 ?? user.avatarThumbs?.c50 ?? null,
      totalSumm: user.subscribedOnData?.totalSumm ?? null,
      lastSeen: user.lastSeen ?? null,
    };
  }

  function buildRows(accountId: string, members: readonly OnlineMember[]): OnlineRowVM[] {
    const nowMs = now();
    const ids = members.map((m) => m.fanId);
    const fans = data.fans.getMany(accountId, ids);
    const chats = data.chats.getMany(accountId, ids);
    const lastTimes = data.messages.latestBySender(accountId, ids);
    const deletedChatHeads = data.messages.deletedChatHeadIds(accountId, ids);
    const newestTexts = data.messages.newestPerChat(
      accountId,
      members.filter((m) => !chats.has(m.fanId)).map((m) => m.fanId),
    );
    const spend30d = data.fanTransactions.sumByFanSince(
      accountId,
      new Date(nowMs - SPEND_WINDOW_MS).toISOString(),
    );

    return members.map((member) => {
      const fan: FanRow | undefined = fans.get(member.fanId);
      const chat: ChatRow | undefined = chats.get(member.fanId);
      const last = lastTimes.get(member.fanId);
      const fanMs = last?.lastFanAt != null ? Date.parse(last.lastFanAt) : NaN;
      const modelMs = last?.lastModelAt != null ? Date.parse(last.lastModelAt) : NaN;
      let fanLastMs = Number.isFinite(fanMs) ? fanMs : null;
      let modelLastMs = Number.isFinite(modelMs) ? modelMs : null;
      const chatLastMs = chat?.lastMessageAt != null && !deletedChatHeads.has(member.fanId)
        ? Date.parse(chat.lastMessageAt)
        : null;
      if (chat !== undefined && chatLastMs !== null && Number.isFinite(chatLastMs)) {
        if (chat.lastMessageIsSentByMe) {
          modelLastMs = modelLastMs === null ? chatLastMs : Math.max(modelLastMs, chatLastMs);
        } else {
          fanLastMs = fanLastMs === null ? chatLastMs : Math.max(fanLastMs, chatLastMs);
        }
      }
      const fanDays = fanLastMs !== null ? daysSince(fanLastMs, nowMs) : null;
      const modelDays = modelLastMs !== null ? daysSince(modelLastMs, nowMs) : null;
      const lifetime = fan?.spending?.total ?? member.totalSumm;
      const name =
        (fan?.customName !== null && fan?.customName !== undefined && fan.customName !== ''
          ? fan.customName
          : null) ??
        chat?.fanName ??
        fan?.name ??
        member.name ??
        member.username ??
        member.fanId;
      const username =
        fan?.username !== undefined && fan.username.length > 0
          ? fan.username
          : member.username !== null && member.username.length > 0
            ? member.username
            : null;
      const avatarUrl =
        chat?.avatar ??
        fan?.avatar ??
        (member.avatarRemoteUrl !== null ? toMediaUrl(member.avatarRemoteUrl) : null);
      return {
        fanId: member.fanId,
        name,
        username,
        avatarUrl,
        lifetimeSpend: lifetime ?? null,
        spend30d: spend30d.get(member.fanId) ?? null,
        lastMessagePreview:
          chat?.lastMessagePreview ?? newestTexts.get(member.fanId)?.textPlain ?? '',
        lastMessageIsSentByMe:
          chat?.lastMessageIsSentByMe ?? newestTexts.get(member.fanId)?.isSentByMe ?? false,
        fanWaiting: chat !== undefined ? deriveFanWaiting(chat) : false,
        lastModelMessageAt: modelLastMs !== null ? new Date(modelLastMs).toISOString() : null,
        lastFanMessageAt: fanLastMs !== null ? new Date(fanLastMs).toISOString() : null,
        modelDays,
        fanDays,
        silence: fanSilenceBucket(fanDays),
        // No chat row ⇒ the send engine rejects ('unknown chat') — surface as
        // not sendable so the mini-composer never hits the error.
        canSendMessage: chat?.canSendMessage ?? false,
        canNotSendReason: chat?.canNotSendReason ?? null,
        hasChat: chat !== undefined,
        // Prefer the live active-fans stamp; fall back to the local fan row.
        lastSeen: member.lastSeen ?? fan?.lastSeen ?? null,
      } satisfies OnlineRowVM;
    });
  }

  function countRows(rows: readonly OnlineRowVM[]): OnlineCountsVM {
    let spenders = 0;
    let waiting = 0;
    for (const row of rows) {
      if ((row.lifetimeSpend ?? 0) > 0) spenders += 1;
      if (row.fanWaiting) waiting += 1;
    }
    return { online: rows.length, spenders, waiting };
  }

  function toVM(
    accountId: string,
    spendersOnly: boolean,
    entry: OnlineSnapshotEntry | undefined,
  ): OnlineSnapshotVM {
    if (entry === undefined) {
      // No in-memory snapshot (first open this session / post-restart): empty
      // rows ⇒ the surface shows the «нажмите Обновить» CTA, but the persisted
      // stamp still tells the owner when they last checked.
      return {
        rows: [],
        counts: { online: 0, spenders: 0, waiting: 0 },
        fetchedAt: readStamp(accountId, spendersOnly),
        truncated: false,
      };
    }
    const rows = buildRows(accountId, entry.members);
    return {
      rows,
      counts: countRows(rows),
      fetchedAt: new Date(entry.fetchedAtMs).toISOString(),
      truncated: entry.truncated,
    };
  }

  async function fetchSnapshot(
    accountId: string,
    spendersOnly: boolean,
  ): Promise<OnlineSnapshotEntry> {
    const members: OnlineMember[] = [];
    const seen = new Set<string>();
    let offset = 0;
    let truncated = false;
    for (let page = 0; page < ONLINE_MAX_PAGES; page += 1) {
      const result = await client.listFansActive({
        purpose: 'online',
        accountId,
        limit: ONLINE_PAGE_LIMIT,
        offset,
        online: true,
        ...(spendersOnly ? { minTotalSpent: SPENDERS_MIN_TOTAL_SPENT } : {}),
      });
      for (const user of result.fans) {
        const fanId = String(user.id);
        if (seen.has(fanId)) continue;
        seen.add(fanId);
        members.push(toMember(user));
      }
      if (!result.hasMore) break;
      offset += ONLINE_PAGE_LIMIT;
      if (page === ONLINE_MAX_PAGES - 1) truncated = true;
    }
    return { members, truncated, fetchedAtMs: now() };
  }

  return {
    snapshot(accountId, spendersOnly) {
      return toVM(accountId, spendersOnly, snapshotCache.get(cacheKey(accountId, spendersOnly)));
    },

    async refresh(accountId, spendersOnly) {
      const key = cacheKey(accountId, spendersOnly);
      let pending = inFlight.get(key);
      if (pending === undefined) {
        pending = fetchSnapshot(accountId, spendersOnly)
          .then((entry) => {
            snapshotCache.set(key, entry);
            writeStamp(accountId, spendersOnly, new Date(entry.fetchedAtMs).toISOString());
            return entry;
          })
          .finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      const entry = await pending;
      return toVM(accountId, spendersOnly, entry);
    },
  };
}
