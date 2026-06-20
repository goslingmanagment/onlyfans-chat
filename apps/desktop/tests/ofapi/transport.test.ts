import { describe, expect, it, vi } from 'vitest';

import type { OfApiClient } from '@main/ofapi/client';
import { createCreditMeter } from '@main/ofapi/credit-meter';
import {
  buildHubOfApiReadBaseUrl,
  createOfApiTransportClient,
} from '@main/ofapi/transport';

const READ_METHODS = [
  'listAccounts',
  'whoami',
  'listChats',
  'listMessages',
  'getMessage',
  'getUserByUsername',
  'getUsersByIds',
  'listTransactions',
  'listFansAll',
  'listFansActive',
  'listUserLists',
  'listUserListUsers',
  'listVaultMedia',
  'listVaultLists',
  'getVaultMedia',
  'listChatMedia',
  'getUploadStatus',
] as const;

const WRITE_METHODS = [
  'sendMessage',
  'deleteMessage',
  'likeMessage',
  'unlikeMessage',
  'startTyping',
  'markChatRead',
] as const;

function fakeClient(meter = createCreditMeter()) {
  const methods = Object.fromEntries(
    [...READ_METHODS, ...WRITE_METHODS, 'uploadVaultMedia' as const].map((name) => [
      name,
      vi.fn(async () => ({ source: name })),
    ]),
  );
  return {
    client: { creditMeter: meter, ...methods } as unknown as OfApiClient,
    methods,
  };
}

describe('OFAPI transport client', () => {
  it('normalizes hub origins and /api/v1 bases', () => {
    expect(buildHubOfApiReadBaseUrl('https://hub.example.com/')).toBe(
      'https://hub.example.com/api/v1/ofapi/read',
    );
    expect(buildHubOfApiReadBaseUrl('https://hub.example.com/api/v1')).toBe(
      'https://hub.example.com/api/v1/ofapi/read',
    );
  });

  it('routes every read to hub and rollback writes to the direct client', async () => {
    const meter = createCreditMeter();
    const read = fakeClient(meter);
    const write = fakeClient(meter);
    const client = createOfApiTransportClient(read.client, write.client);

    for (const method of READ_METHODS) {
      await (client[method] as (params?: unknown) => Promise<unknown>)({});
      expect(read.methods[method]).toHaveBeenCalledTimes(1);
      expect(write.methods[method]).not.toHaveBeenCalled();
    }
    for (const method of WRITE_METHODS) {
      await (client[method] as (params?: unknown) => Promise<unknown>)({});
      expect(write.methods[method]).toHaveBeenCalledTimes(1);
      expect(read.methods[method]).not.toHaveBeenCalled();
    }
    expect(client.creditMeter).toBe(meter);
  });

  it('fails closed for app-level local file uploads without calling Direct', async () => {
    const meter = createCreditMeter();
    const read = fakeClient(meter);
    const write = fakeClient(meter);
    const client = createOfApiTransportClient(read.client, write.client);

    await expect(client.uploadVaultMedia({} as never)).rejects.toMatchObject({
      code: 'CG-OF-08',
      message: 'Local file upload into Vault is disabled in ChatGoose Desktop.',
    });
    expect(write.methods.uploadVaultMedia).not.toHaveBeenCalled();
    expect(read.methods.uploadVaultMedia).not.toHaveBeenCalled();
  });

  it('keeps read-only mode usable without a direct key and fails writes before network', async () => {
    const read = fakeClient();
    const client = createOfApiTransportClient(read.client, null);

    await expect(client.listAccounts()).resolves.toEqual({ source: 'listAccounts' });
    await expect(client.sendMessage({} as never)).rejects.toMatchObject({
      code: 'CG-OF-01',
    });
    await expect(client.uploadVaultMedia({} as never)).rejects.toMatchObject({
      code: 'CG-OF-08',
    });
    expect(read.methods.sendMessage).not.toHaveBeenCalled();
    expect(read.methods.uploadVaultMedia).not.toHaveBeenCalled();
  });

  it('rejects split clients that would make the desktop budget meter incomplete', () => {
    const read = fakeClient();
    const write = fakeClient();
    expect(() => createOfApiTransportClient(read.client, write.client)).toThrow(
      'must share one credit meter',
    );
  });
});
