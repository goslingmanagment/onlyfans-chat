// Supporters board data service (PLAN item 12; binding mockup
// docs/mockups/supporters.html). Tiers are OnlyMonster's user-lists — fetched
// STRICTLY READ-ONLY through the metered client (purpose 'supporters') and
// TTL-cached in memory; everything money/preview/counter-shaped joins from the
// LOCAL SQLite stores (0 credits): lifetime from fans.spending, 30-day from
// the fan_transactions sweep, МОДЕЛЬ/ФАН day counters from the message DB
// (vendor lastReplyAt is null — never used).

import {
  assignSupporterTiers,
  daysSince,
  fanSilenceBucket,
  sortBySilence,
} from '@chatgoose/shared';
import { htmlToPlainText } from '@chatgoose/shared/transcript/index';
import type { OfApiClient } from '../ofapi/client';
import type { DataLayer } from '../db/index';
import type { ChatRow, FanRow } from '../db/rows';
import type { SupporterListVM, SupporterRowVM } from '../../preload/contract';
import { deriveFanWaiting } from '../ipc/viewmodels';

export const SUPPORTERS_TTL_MS = 5 * 60_000;
export const LISTS_PAGE_LIMIT = 50;
export const LISTS_MAX_PAGES = 5;
export const ROSTER_PAGE_LIMIT = 100;
/** 10 pages × 100 = 1000 fans per list; beyond that the roster is truncated
 *  (flagged in the result — no silent caps). */
export const ROSTER_MAX_PAGES = 10;

const SPEND_WINDOW_MS = 30 * 24 * 60 * 60_000;

interface RosterMember {
  fanId: string;
  name: string | null;
  username: string | null;
  /** Raw OF CDN avatar URL from the roster payload (minted only on use). */
  avatarRemoteUrl: string | null;
  /** Lifetime total from the roster's subscribedOnData (fallback when no fan row). */
  totalSumm: number | null;
}

interface RosterCacheEntry {
  members: RosterMember[];
  truncated: boolean;
  fetchedAtMs: number;
}

interface ListsCacheEntry {
  lists: SupporterListVM[];
  fetchedAtMs: number;
}

export interface SupportersService {
  lists(accountId: string): Promise<{ lists: SupporterListVM[]; fetchedAt: string }>;
  roster(
    accountId: string,
    listId: string,
  ): Promise<{ rows: SupporterRowVM[]; truncated: boolean; fetchedAt: string }>;
  untiered(accountId: string): Promise<{ rows: SupporterRowVM[]; fetchedAt: string }>;
}

export interface SupportersServiceOptions {
  client: OfApiClient;
  data: DataLayer;
  /** Registering media:// mint (same seam as sync) for roster-only avatars. */
  toMediaUrl: (remoteUrl: string) => string | null;
  /** Owner-ordered mapped list ids for the account (settings). */
  getMappedListIds: (accountId: string) => Promise<string[]>;
  now?: () => number;
}

export function createSupportersService(options: SupportersServiceOptions): SupportersService {
  const { client, data, toMediaUrl, getMappedListIds } = options;
  const now = options.now ?? Date.now;

  const listsCache = new Map<string, ListsCacheEntry>();
  const rosterCache = new Map<string, RosterCacheEntry>();
  // Single-flight: concurrent IPC calls must not double-spend credits.
  const listsInFlight = new Map<string, Promise<ListsCacheEntry>>();
  const rosterInFlight = new Map<string, Promise<RosterCacheEntry>>();

  function rosterKey(accountId: string, listId: string): string {
    return `${accountId}|${listId}`;
  }

  async function fetchLists(accountId: string): Promise<ListsCacheEntry> {
    const lists: SupporterListVM[] = [];
    let offset = 0;
    for (let page = 0; page < LISTS_MAX_PAGES; page += 1) {
      const result = await client.listUserLists({
        purpose: 'supporters',
        accountId,
        limit: LISTS_PAGE_LIMIT,
        offset,
      });
      for (const list of result.lists) {
        lists.push({
          id: String(list.id),
          // Live names are HTML-entity-encoded ('&lt; 45 days') — decode for display.
          name: list.name !== undefined && list.name !== null ? htmlToPlainText(list.name) : String(list.id),
          usersCount: list.usersCount ?? 0,
          custom: list.type === 'custom',
        });
      }
      if (!result.hasMore || result.lists.length === 0) break;
      offset += result.lists.length;
    }
    return { lists, fetchedAtMs: now() };
  }

  async function loadLists(accountId: string): Promise<ListsCacheEntry> {
    const cached = listsCache.get(accountId);
    if (cached !== undefined && now() - cached.fetchedAtMs < SUPPORTERS_TTL_MS) {
      return cached;
    }
    let pending = listsInFlight.get(accountId);
    if (pending === undefined) {
      pending = fetchLists(accountId)
        .then((entry) => {
          listsCache.set(accountId, entry);
          return entry;
        })
        .finally(() => listsInFlight.delete(accountId));
      listsInFlight.set(accountId, pending);
    }
    return pending;
  }

  async function fetchRoster(accountId: string, listId: string): Promise<RosterCacheEntry> {
    const members: RosterMember[] = [];
    const seen = new Set<string>();
    let offset = 0;
    let truncated = false;
    for (let page = 0; page < ROSTER_MAX_PAGES; page += 1) {
      const result = await client.listUserListUsers({
        purpose: 'supporters',
        accountId,
        userListId: listId,
        limit: ROSTER_PAGE_LIMIT,
        offset,
      });
      for (const user of result.users) {
        const fanId = String(user.id);
        if (seen.has(fanId)) continue;
        seen.add(fanId);
        members.push({
          fanId,
          name: user.displayName !== undefined && user.displayName !== null && user.displayName !== ''
            ? user.displayName
            : (user.name ?? null),
          username: user.username ?? null,
          avatarRemoteUrl: user.avatar ?? user.avatarThumbs?.c144 ?? user.avatarThumbs?.c50 ?? null,
          totalSumm: user.subscribedOnData?.totalSumm ?? null,
        });
      }
      if (!result.hasMore) break;
      offset = result.nextOffset ?? offset + ROSTER_PAGE_LIMIT;
      if (page === ROSTER_MAX_PAGES - 1) truncated = true;
    }
    return { members, truncated, fetchedAtMs: now() };
  }

  async function loadRoster(accountId: string, listId: string): Promise<RosterCacheEntry> {
    const key = rosterKey(accountId, listId);
    const cached = rosterCache.get(key);
    if (cached !== undefined && now() - cached.fetchedAtMs < SUPPORTERS_TTL_MS) {
      return cached;
    }
    let pending = rosterInFlight.get(key);
    if (pending === undefined) {
      pending = fetchRoster(accountId, listId)
        .then((entry) => {
          rosterCache.set(key, entry);
          return entry;
        })
        .finally(() => rosterInFlight.delete(key));
      rosterInFlight.set(key, pending);
    }
    return pending;
  }

  function buildRows(accountId: string, members: readonly RosterMember[]): SupporterRowVM[] {
    const nowMs = now();
    const ids = members.map((member) => member.fanId);
    const fans = data.fans.getMany(accountId, ids);
    const chats = data.chats.getMany(accountId, ids);
    const lastTimes = data.messages.latestBySender(accountId, ids);
    const spend30d = data.fanTransactions.sumByFanSince(
      accountId,
      new Date(nowMs - SPEND_WINDOW_MS).toISOString(),
    );

    const rows = members.map((member) => {
      const fan: FanRow | undefined = fans.get(member.fanId);
      const chat: ChatRow | undefined = chats.get(member.fanId);
      const last = lastTimes.get(member.fanId);
      // Counter sources, both LOCAL (vendor lastReplyAt is null — never used):
      // the message store when the thread was ever fetched, plus the chat
      // row's own last-message stamp from list payloads — hydration is
      // LIST-ONLY (SPEC §6.1), so for never-opened chats the list stamp is
      // the only signal and it is exact for whichever side wrote last.
      let fanLastMs = last?.lastFanAt != null ? Date.parse(last.lastFanAt) : null;
      let modelLastMs = last?.lastModelAt != null ? Date.parse(last.lastModelAt) : null;
      const chatLastMs = chat?.lastMessageAt != null ? Date.parse(chat.lastMessageAt) : null;
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
      const avatarUrl =
        chat?.avatar ??
        fan?.avatar ??
        (member.avatarRemoteUrl !== null ? toMediaUrl(member.avatarRemoteUrl) : null);
      return {
        fanId: member.fanId,
        name,
        avatarUrl,
        lifetimeSpend: lifetime ?? null,
        spend30d: spend30d.get(member.fanId) ?? null,
        lastMessagePreview: chat?.lastMessagePreview ?? '',
        lastMessageIsSentByMe: chat?.lastMessageIsSentByMe ?? false,
        fanWaiting: chat !== undefined ? deriveFanWaiting(chat) : false,
        modelDays,
        fanDays,
        silence: fanSilenceBucket(fanDays),
        // No chat row ⇒ the send engine rejects ('unknown chat') — surface as
        // not sendable instead of letting the mini-chat composer hit the error.
        canSendMessage: chat?.canSendMessage ?? false,
        canNotSendReason: chat?.canNotSendReason ?? null,
        hasChat: chat !== undefined,
      } satisfies SupporterRowVM;
    });

    return sortBySilence(
      rows.map((row) => ({ ...row, fanSilenceDays: row.fanDays, lifetimeSpend: row.lifetimeSpend })),
    ).map(({ fanSilenceDays: _drop, ...row }) => row);
  }

  return {
    async lists(accountId) {
      const entry = await loadLists(accountId);
      return { lists: entry.lists, fetchedAt: new Date(entry.fetchedAtMs).toISOString() };
    },

    async roster(accountId, listId) {
      const mapped = await getMappedListIds(accountId);
      const index = mapped.indexOf(listId);
      if (index === -1) {
        throw new Error('Supporters roster: list is not mapped to a board shelf');
      }
      // A fan in several mapped lists belongs to the FIRST (highest) shelf —
      // dedupe against every earlier shelf's roster (loaded on demand; higher
      // tiers are the small ones, so this stays cheap).
      const earlier = mapped.slice(0, index);
      const claimed = new Set<string>();
      for (const earlierId of earlier) {
        const roster = await loadRoster(accountId, earlierId);
        for (const member of roster.members) claimed.add(member.fanId);
      }
      const entry = await loadRoster(accountId, listId);
      const members = entry.members.filter((member) => !claimed.has(member.fanId));
      return {
        rows: buildRows(accountId, members),
        truncated: entry.truncated,
        fetchedAt: new Date(entry.fetchedAtMs).toISOString(),
      };
    },

    async untiered(accountId) {
      const mapped = await getMappedListIds(accountId);
      const rosterByList = new Map<string, string[]>();
      for (const listId of mapped) {
        const roster = await loadRoster(accountId, listId);
        rosterByList.set(
          listId,
          roster.members.map((member) => member.fanId),
        );
      }
      const assignment = assignSupporterTiers({
        orderedListIds: mapped,
        rosterByList,
        spenderIds: data.fans.listSpenderIds(accountId),
      });
      const members = assignment.untiered.map((fanId) => ({
        fanId,
        name: null,
        username: null,
        avatarRemoteUrl: null,
        totalSumm: null,
      }));
      return { rows: buildRows(accountId, members), fetchedAt: new Date(now()).toISOString() };
    },
  };
}
