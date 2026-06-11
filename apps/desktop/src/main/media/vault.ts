// Vault & PPV main-process service (PRD F7, SPEC §4/§15.1). Owns everything
// the renderer must never touch: raw OF CDN URLs (vault/gallery thumbs are
// minted into media:// tokens via the registering toMediaUrl seam), local
// filesystem paths (cmd:vault.pickFile returns an opaque one-shot token; the
// upload resolves it back to a path here in main), and the upload polling
// loop for async vault uploads.

import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { OfApiError } from '../ofapi/errors';
import { estimateUploadCredits, VAULT_UPLOAD_MAX_BYTES } from '../ofapi/client';
import type { OfApiClient } from '../ofapi/client';
import type { OfApiUploadStatus, OfApiVaultMedia } from '../ofapi/schemas';
import { mapMediaItem, type ToMediaUrl } from '../sync/mappers';
import type {
  GalleryItemVM,
  VaultAlbumVM,
  VaultItemVM,
  VaultPickedFileVM,
  VaultUploadResultVM,
} from '../../preload/contract';
import type { MessageMediaItem } from '../db/rows';

export const VAULT_PAGE_LIMIT = 60; // within the documented 10–100 range
export const GALLERY_PAGE_LIMIT = 40;
/** Async upload polling cadence / deadline (status endpoint is free). */
export const UPLOAD_POLL_INTERVAL_MS = 2_000;
export const UPLOAD_POLL_TIMEOUT_MS = 5 * 60_000;

/** The narrow client surface this service touches (stubbed in tests). */
export type VaultClient = Pick<
  OfApiClient,
  | 'listVaultMedia'
  | 'listVaultLists'
  | 'getVaultMedia'
  | 'listChatMedia'
  | 'uploadVaultMedia'
  | 'getUploadStatus'
>;

/** Structural Electron dialog (no Electron import — testable in plain node).
 *  The composition root adapts electron.dialog and owns the Electron-typed
 *  `properties: ['openFile']` option. */
export interface FileDialogLike {
  showOpenDialog(options: {
    filters: { name: string; extensions: string[] }[];
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export interface VaultServiceOptions {
  client: VaultClient;
  toMediaUrl: ToMediaUrl;
  dialog: FileDialogLike;
  /** Injectable fs for tests. */
  statFile?: (path: string) => Promise<{ size: number }>;
  readFileBytes?: (path: string) => Promise<Uint8Array>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface VaultService {
  listVault(args: {
    accountId: string;
    albumId?: string;
    query?: string;
    offset?: number;
  }): Promise<{ items: VaultItemVM[]; hasMore: boolean; nextOffset: number | null }>;
  listAlbums(args: { accountId: string }): Promise<VaultAlbumVM[]>;
  chatGallery(args: {
    accountId: string;
    chatId: string;
    offset?: number;
  }): Promise<{ items: GalleryItemVM[]; hasMore: boolean; nextOffset: number | null }>;
  /** Main-process dialog → one-shot token; null when cancelled. */
  pickFile(): Promise<VaultPickedFileVM | null>;
  /** Resolves the token, uploads to the VAULT, polls async jobs to completion. */
  upload(args: {
    accountId: string;
    fileToken: string;
    useAsync?: boolean;
  }): Promise<VaultUploadResultVM>;
}

const VAULT_TYPES = new Set(['photo', 'video', 'audio', 'gif']);

function mediaUnavailable(message: string): OfApiError {
  return new OfApiError('CG-OF-08', { message, detail: { provider: 'ofapi' } });
}

export function mapVaultItem(media: OfApiVaultMedia, toMediaUrl: ToMediaUrl): VaultItemVM {
  const files = media.files ?? null;
  const thumbRemote =
    files?.thumb?.url ?? files?.squarePreview?.url ?? files?.preview?.url ?? files?.full?.url ?? null;
  const type =
    media.type != null && VAULT_TYPES.has(media.type)
      ? (media.type as VaultItemVM['type'])
      : 'other';
  return {
    id: String(media.id),
    type,
    thumbUrl: thumbRemote !== null ? toMediaUrl(thumbRemote) : null,
    isReady: media.isReady !== false && media.hasError !== true,
    durationSeconds: media.duration != null && media.duration > 0 ? media.duration : null,
    createdAt: media.createdAt ?? null,
    likesCount: media.counters?.likesCount ?? 0,
    tipsTotal: media.counters?.tipsSumm ?? 0,
  };
}

export function createVaultService(options: VaultServiceOptions): VaultService {
  const { client, toMediaUrl, dialog } = options;
  const statFile = options.statFile ?? (async (path) => ({ size: (await stat(path)).size }));
  const readFileBytes = options.readFileBytes ?? ((path) => readFile(path));
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;

  /** token → picked file; consumed (deleted) by upload — never re-usable. */
  const pickedFiles = new Map<string, { path: string; name: string; bytes: number }>();

  async function pollUntilSettled(accountId: string, uploadId: string): Promise<OfApiUploadStatus> {
    const deadline = now() + UPLOAD_POLL_TIMEOUT_MS;
    for (;;) {
      const status = await client.getUploadStatus({ accountId, uploadId, purpose: 'vault' });
      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }
      if (now() >= deadline) {
        throw mediaUnavailable('Vault upload is still processing — check the vault again shortly.');
      }
      await sleep(UPLOAD_POLL_INTERVAL_MS);
    }
  }

  return {
    async listVault({ accountId, albumId, query, offset }) {
      const from = offset ?? 0;
      const { items, hasMore } = await client.listVaultMedia({
        purpose: 'vault',
        accountId,
        limit: VAULT_PAGE_LIMIT,
        offset: from,
        ...(albumId !== undefined ? { listId: albumId } : {}),
        ...(query !== undefined && query !== '' ? { query } : {}),
      });
      return {
        items: items.map((item) => mapVaultItem(item, toMediaUrl)),
        hasMore,
        nextOffset: hasMore ? from + items.length : null,
      };
    },

    async listAlbums({ accountId }) {
      // One page covers realistic album counts; system buckets come first upstream.
      const { lists } = await client.listVaultLists({ accountId, limit: 100, purpose: 'vault' });
      return lists.map((list) => ({
        id: String(list.id),
        name: list.name ?? String(list.id),
        custom: list.type === 'custom',
        mediaCount:
          (list.videosCount ?? 0) +
          (list.photosCount ?? 0) +
          (list.gifsCount ?? 0) +
          (list.audiosCount ?? 0),
      }));
    },

    async chatGallery({ accountId, chatId, offset }) {
      const from = offset ?? 0;
      const { messages, hasMore } = await client.listChatMedia({
        purpose: 'media',
        accountId,
        chatId,
        limit: GALLERY_PAGE_LIMIT,
        offset: from,
      });
      const fanId = Number(chatId); // chat_id === fan.id (two-namespace rule)
      const items = messages.map((message): GalleryItemVM => {
        const media = (message.media ?? [])
          .map((raw) => mapMediaItem(raw, toMediaUrl))
          .filter((item): item is MessageMediaItem => item !== null);
        return {
          messageId: String(message.id),
          createdAt: message.createdAt ?? null,
          isSentByMe: message.fromUser?.id != null && message.fromUser.id !== fanId,
          price: message.price ?? 0,
          isOpened: message.isOpened ?? null,
          mediaCount: message.mediaCount ?? media.length,
          media,
        };
      });
      return { items, hasMore, nextOffset: hasMore ? from + messages.length : null };
    },

    async pickFile() {
      const result = await dialog.showOpenDialog({
        filters: [
          { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'm4v', 'webm', 'mp3', 'm4a', 'wav'] },
        ],
      });
      const path = result.filePaths[0];
      if (result.canceled || path === undefined) {
        return null;
      }
      const { size } = await statFile(path);
      if (size > VAULT_UPLOAD_MAX_BYTES) {
        throw mediaUnavailable(
          `File is too large for a direct upload (max ${Math.round(VAULT_UPLOAD_MAX_BYTES / 1_000_000)} MB).`,
        );
      }
      const token = randomUUID();
      const name = basename(path);
      pickedFiles.set(token, { path, name, bytes: size });
      return { token, name, bytes: size, creditEstimate: estimateUploadCredits(size) };
    },

    async upload({ accountId, fileToken, useAsync }) {
      const picked = pickedFiles.get(fileToken);
      if (picked === undefined) {
        throw new Error('vault.upload: unknown or already-used file token — pick the file again');
      }
      pickedFiles.delete(fileToken); // one-shot: a retry must re-pick (re-preflight)
      const data = await readFileBytes(picked.path);
      const outcome = await client.uploadVaultMedia({
        purpose: 'vault',
        accountId,
        fileName: picked.name,
        data,
        ...(useAsync !== undefined ? { useAsync } : {}),
      });
      if (outcome.kind === 'completed') {
        return {
          vaultId: String(outcome.media.id),
          isReady: outcome.media.isReady !== false,
          creditsUsed: null, // sync path: cost arrives via the _meta credit meter
        };
      }
      const settled = await pollUntilSettled(accountId, outcome.prefixedId);
      if (settled.status === 'failed' || settled.media?.id == null) {
        throw mediaUnavailable(
          settled.error ?? 'Vault upload failed — the file was not added to the vault.',
        );
      }
      return {
        vaultId: String(settled.media.id),
        isReady: settled.media.isReady !== false,
        creditsUsed: settled.credits_used ?? null,
      };
    },
  };
}
