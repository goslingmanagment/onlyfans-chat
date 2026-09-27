// Vault & PPV main-process service (PRD F7, SPEC §4/§15.1). Owns the read
// surfaces the renderer must never touch directly: raw OF CDN URLs are minted
// into media:// tokens via the registering toMediaUrl seam. Local file-byte
// upload is intentionally absent from the app surface.

import type { OfApiClient } from '../ofapi/client';
import type { OfApiVaultMedia } from '../ofapi/schemas';
import { mapMediaItem, type ToMediaUrl } from '../sync/mappers';
import type {
  GalleryItemVM,
  VaultAlbumVM,
  VaultItemVM,
} from '../../preload/contract';
import type { MessageMediaItem } from '../db/rows';

export const VAULT_PAGE_LIMIT = 60; // within the documented 10–100 range
export const GALLERY_PAGE_LIMIT = 40;

/** The narrow client surface this service touches (stubbed in tests). */
export type VaultClient = Pick<
  OfApiClient,
  'listVaultMedia' | 'listVaultLists' | 'listChatMedia'
>;

export interface VaultServiceOptions {
  client: VaultClient;
  toMediaUrl: ToMediaUrl;
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
}

const VAULT_TYPES = new Set(['photo', 'video', 'audio', 'gif']);

export function mapVaultItem(media: OfApiVaultMedia, toMediaUrl: ToMediaUrl, accountId?: string): VaultItemVM {
  const files = media.files ?? null;
  const type =
    media.type != null && VAULT_TYPES.has(media.type)
      ? (media.type as VaultItemVM['type'])
      : 'other';
  const isReady = media.isReady !== false && media.hasError !== true;
  // D42: no automatic thumbnail ever falls back to the full file (a video
  // without a preview used to download the whole video as its "thumbnail",
  // and a full MP3 is not an image). With an id-token minter the cell names
  // the file by id and Core picks thumb → squarePreview → preview.
  let thumbUrl: string | null;
  if (accountId !== undefined && toMediaUrl.ofapiMedia !== undefined) {
    thumbUrl = isReady && type !== 'audio' ? toMediaUrl.ofapiMedia(accountId, String(media.id), 'thumb') : null;
  } else {
    const previewRemote = files?.thumb?.url ?? files?.squarePreview?.url ?? files?.preview?.url ?? null;
    thumbUrl = previewRemote !== null && type !== 'audio' ? toMediaUrl(previewRemote) : null;
  }
  return {
    id: String(media.id),
    type,
    thumbUrl,
    isReady,
    durationSeconds: media.duration != null && media.duration > 0 ? media.duration : null,
    createdAt: media.createdAt ?? null,
    likesCount: media.counters?.likesCount ?? 0,
    tipsTotal: media.counters?.tipsSumm ?? 0,
  };
}

export function createVaultService(options: VaultServiceOptions): VaultService {
  const { client, toMediaUrl } = options;

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
        items: items.map((item) => mapVaultItem(item, toMediaUrl, accountId)),
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
          .map((raw) => mapMediaItem(raw, toMediaUrl, accountId))
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
  };
}
