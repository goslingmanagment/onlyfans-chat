import type { OfApiClient } from './client';
import { OfApiError } from './errors';

export const OFAPI_READ_TRANSPORTS = ['direct', 'hub'] as const;
export type OfApiReadTransport = (typeof OFAPI_READ_TRANSPORTS)[number];

export function buildHubOfApiReadBaseUrl(hubBaseUrl: string): string {
  const base = hubBaseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/api/v1')) {
    return `${base}/ofapi/read`;
  }
  return `${base}/api/v1/ofapi/read`;
}

function missingDirectWriter(): OfApiError {
  return new OfApiError('CG-OF-01', {
    message: 'A direct OFAPI key is required for Direct rollback writes.',
    detail: { provider: 'ofapi' },
  });
}

function disabledDiskUpload(): OfApiError {
  return new OfApiError('CG-OF-08', {
    message: 'Local file upload into Vault is disabled in ChatGoose Desktop.',
    detail: { provider: 'ofapi' },
  });
}

/**
 * C6 custody bridge: every read uses `readClient`; legacy Direct writes remain
 * available only for explicit rollback paths. Local file-byte uploads are not
 * app-supported and fail closed before any network call.
 */
export function createOfApiTransportClient(
  readClient: OfApiClient,
  writeClient: OfApiClient | null,
): OfApiClient {
  if (writeClient !== null && writeClient.creditMeter !== readClient.creditMeter) {
    throw new Error('OFAPI read/write clients must share one credit meter');
  }

  function requireWriteClient(): OfApiClient {
    if (writeClient === null) {
      throw missingDirectWriter();
    }
    return writeClient;
  }

  return {
    creditMeter: readClient.creditMeter,
    listAccounts: (params) => readClient.listAccounts(params),
    whoami: (params) => readClient.whoami(params),
    listChats: (params) => readClient.listChats(params),
    listMessages: (params) => readClient.listMessages(params),
    getMessage: (params) => readClient.getMessage(params),
    getUserByUsername: (params) => readClient.getUserByUsername(params),
    getUsersByIds: (params) => readClient.getUsersByIds(params),
    listTransactions: (params) => readClient.listTransactions(params),
    listFansAll: (params) => readClient.listFansAll(params),
    listFansActive: (params) => readClient.listFansActive(params),
    listUserLists: (params) => readClient.listUserLists(params),
    listUserListUsers: (params) => readClient.listUserListUsers(params),
    listVaultMedia: (params) => readClient.listVaultMedia(params),
    listVaultLists: (params) => readClient.listVaultLists(params),
    getVaultMedia: (params) => readClient.getVaultMedia(params),
    listChatMedia: (params) => readClient.listChatMedia(params),
    getUploadStatus: (params) => readClient.getUploadStatus(params),

    uploadVaultMedia: async () => {
      throw disabledDiskUpload();
    },
    sendMessage: async (params) => requireWriteClient().sendMessage(params),
    deleteMessage: async (params) => requireWriteClient().deleteMessage(params),
    likeMessage: async (params) => requireWriteClient().likeMessage(params),
    unlikeMessage: async (params) => requireWriteClient().unlikeMessage(params),
    startTyping: async (params) => requireWriteClient().startTyping(params),
    markChatRead: async (params) => requireWriteClient().markChatRead(params),
  };
}
