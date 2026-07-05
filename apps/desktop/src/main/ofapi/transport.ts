import type { OfApiClient } from './client';
import { OfApiError } from './errors';

// Stage 24 / DP 8: reads are hub-only; the transport enum died with the
// direct branch (the settings field is a literal now).
export type OfApiReadTransport = 'hub';

export function buildHubOfApiReadBaseUrl(hubBaseUrl: string): string {
  const base = hubBaseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/api/v1')) {
    return `${base}/ofapi/read`;
  }
  return `${base}/api/v1/ofapi/read`;
}

function disabledDirectWrite(): OfApiError {
  return new OfApiError('CG-HUB-02', {
    message: 'Direct OFAPI writes are disabled. Use Agency Hub commands for OnlyFans writes.',
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
 * C6 custody bridge: every read uses `readClient`; app-level writes fail closed
 * here so the only supported write path is the Hub command outbox. Local file-byte
 * uploads are not app-supported and fail closed before any network call.
 */
export function createOfApiTransportClient(readClient: OfApiClient): OfApiClient {
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
    sendMessage: async () => {
      throw disabledDirectWrite();
    },
    deleteMessage: async () => {
      throw disabledDirectWrite();
    },
    likeMessage: async () => {
      throw disabledDirectWrite();
    },
    unlikeMessage: async () => {
      throw disabledDirectWrite();
    },
    startTyping: async () => {
      throw disabledDirectWrite();
    },
    markChatRead: async () => {
      throw disabledDirectWrite();
    },
  };
}
