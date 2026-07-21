import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataLayer, FanUpsert } from '@main/db/index';
import { memoryDataLayer, sampleChat } from './helpers';

let layer: DataLayer;

beforeEach(() => {
  layer = memoryDataLayer();
});

afterEach(() => {
  layer.close();
});

describe('accounts queries', () => {
  it('upserts by id and lists with summed unread counts', () => {
    layer.accounts.upsertMany([
      { id: 'acct_1', username: 'modelone', displayName: 'Model One', avatar: null, authState: 'authenticated', raw: {} },
      { id: 'acct_2', username: 'another', displayName: 'Another', avatar: null, authState: 'authenticated', raw: {} },
    ]);
    layer.accounts.upsert({
      id: 'acct_1',
      username: 'modelone',
      displayName: 'Model One Renamed',
      avatar: null,
      authState: 'authenticated',
      raw: { fresh: true },
    });
    layer.chats.upsertMany([
      sampleChat({ accountId: 'acct_1', chatId: '1', unreadCount: 2 }),
      sampleChat({ accountId: 'acct_1', chatId: '2', unreadCount: 3 }),
      sampleChat({ accountId: 'acct_2', chatId: '3', unreadCount: 0 }),
    ]);

    const rows = layer.accounts.list();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.id, row.unreadTotal])).toEqual([
      ['acct_2', 0],
      ['acct_1', 5],
    ]);
    expect(layer.accounts.get('acct_1')?.displayName).toBe('Model One Renamed');
  });

  it('preserves richer account identity when a gateway payload is partial', () => {
    layer.accounts.upsert({
      id: 'acct_1',
      username: 'loravie',
      displayName: 'LoraVie',
      avatar: 'media://avatar-token',
      authState: 'authenticated',
      raw: { source: 'direct' },
    });

    layer.accounts.upsert({
      id: 'acct_1',
      username: 'loravie',
      displayName: 'loravie',
      avatar: null,
      authState: 'authenticated',
      raw: { source: 'hub-partial' },
    });

    expect(layer.accounts.get('acct_1')).toMatchObject({
      username: 'loravie',
      displayName: 'LoraVie',
      avatar: 'media://avatar-token',
      authState: 'authenticated',
    });
  });

  it('accepts fresher non-generic account identity and avatar values', () => {
    layer.accounts.upsert({
      id: 'acct_1',
      username: 'loravie',
      displayName: 'LoraVie',
      avatar: 'media://old-avatar-token',
      authState: 'authenticated',
      raw: {},
    });

    layer.accounts.upsert({
      id: 'acct_1',
      username: 'loravievip',
      displayName: 'LoraVie VIP',
      avatar: 'media://new-avatar-token',
      authState: 'authenticated',
      raw: {},
    });

    expect(layer.accounts.get('acct_1')).toMatchObject({
      username: 'loravievip',
      displayName: 'LoraVie VIP',
      avatar: 'media://new-avatar-token',
    });
  });

  it('updates auth state and publishes an accounts event', () => {
    const flushed: unknown[] = [];
    layer.bus.subscribe((events) => flushed.push(...events));
    layer.accounts.upsert({
      id: 'acct_1',
      username: 'modelone',
      displayName: 'Model One',
      avatar: null,
      authState: 'authenticated',
      raw: {},
    });
    layer.accounts.setAuthState('acct_1', 'session_expired');
    expect(layer.accounts.get('acct_1')?.authState).toBe('session_expired');
    layer.bus.flushNow();
    expect(flushed).toEqual([{ scope: 'accounts', accountId: 'acct_1' }]);
  });

  it('reconciles the authoritative grant set without deleting revoked cache', () => {
    layer.accounts.upsert({
      id: 'acct_old',
      username: 'loravie',
      displayName: 'Lora Vie',
      avatar: null,
      authState: 'authenticated',
      raw: {},
    });
    layer.chats.upsert(sampleChat({ accountId: 'acct_old', chatId: '101', unreadCount: 4 }));

    layer.accounts.reconcileGrants([{
      id: 'acct_new',
      username: 'loravie',
      displayName: 'Lora Vie',
      avatar: null,
      authState: 'authenticated',
      raw: {},
    }]);

    expect(layer.accounts.get('acct_old')).toMatchObject({
      authState: 'unauthenticated',
      grantState: 'revoked',
    });
    expect(layer.accounts.get('acct_new')).toMatchObject({
      authState: 'authenticated',
      grantState: 'granted',
    });
    expect(layer.accounts.listGranted().map((row) => row.id)).toEqual(['acct_new']);
    expect(layer.chats.get('acct_old', '101')).not.toBeNull();
  });

  it('keeps a granted account visible when its vendor session needs re-authentication', () => {
    layer.accounts.reconcileGrants([{
      id: 'acct_current',
      username: 'loravie',
      displayName: 'Lora Vie',
      avatar: null,
      authState: 'unauthenticated',
      raw: {},
    }]);

    expect(layer.accounts.listGranted()).toEqual([
      expect.objectContaining({
        id: 'acct_current',
        authState: 'unauthenticated',
        grantState: 'granted',
      }),
    ]);
  });

  it('accepts an authenticated empty grant set and ignores late auth events for revoked rows', () => {
    layer.accounts.upsert({
      id: 'acct_old',
      username: 'loravie',
      displayName: 'Lora Vie',
      avatar: null,
      authState: 'authenticated',
      raw: {},
    });

    layer.accounts.reconcileGrants([]);
    layer.accounts.setAuthState('acct_old', 'authenticated');

    expect(layer.accounts.listGranted()).toEqual([]);
    expect(layer.accounts.get('acct_old')).toMatchObject({
      authState: 'unauthenticated',
      grantState: 'revoked',
    });
  });

  it('returns null for unknown accounts', () => {
    expect(layer.accounts.get('acct_missing')).toBeNull();
  });
});

const fan: FanUpsert = {
  accountId: 'acct_1',
  fanId: '101',
  username: 'fan_user',
  name: 'Fan One',
  customName: 'Big Spender',
  avatar: null,
  about: 'hi, I am a fan',
  lastSeen: '2026-06-01T09:00:00.000Z',
  spending: { total: 250.5, subscriptions: 50, tips: 120.5, messages: 60, posts: 20, streams: 0 },
  subscription: {
    status: 'active',
    priceUsd: 9.99,
    subscribedAt: '2026-01-01T00:00:00.000Z',
    renewsAt: '2026-07-01T00:00:00.000Z',
    autoRenewOff: true,
    durationLabel: '5 months',
  },
  fetchedAt: '2026-06-01T10:00:00.000Z',
};

describe('fans queries', () => {
  it('round-trips spending and subscription JSON', () => {
    layer.fans.upsert(fan);
    expect(layer.fans.get('acct_1', '101')).toEqual(fan);
  });

  it('upserts by (account, fan)', () => {
    layer.fans.upsert(fan);
    layer.fans.upsert({ ...fan, customName: null, spending: null });
    const row = layer.fans.get('acct_1', '101');
    expect(row?.customName).toBeNull();
    expect(row?.spending).toBeNull();
    expect(row?.subscription).toEqual(fan.subscription);
  });

  it('reads corrupt spending JSON as null instead of crashing (legacy tolerance)', () => {
    layer.fans.upsert(fan);
    layer.db.prepare("UPDATE fans SET spending = '{not json', subscription = '{\"status\":42}'").run();
    const row = layer.fans.get('acct_1', '101');
    expect(row?.spending).toBeNull();
    expect(row?.subscription).toBeNull();
    expect(row?.name).toBe('Fan One');
  });
});
