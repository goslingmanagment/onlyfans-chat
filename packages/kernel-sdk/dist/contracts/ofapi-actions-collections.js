import { z } from "zod";
const pageId = z.number().int().positive();
// OF IDs are decimal strings, including values beyond Number.MAX_SAFE_INTEGER.
const nativeId = z.string().regex(/^[1-9][0-9]{0,63}$/);
// User lists also have provider-owned aliases such as friends and tagged.
const listId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const userListId = listId.refine(value => value.toLowerCase() !== "following", "Following membership changes are not supported");
const userListName = z.string().min(1).max(64).refine(value => value.trim().length > 0);
const vaultListName = z.string().min(1).max(255).refine(value => value.trim().length > 0);
const nativeIds = z.array(nativeId).min(1).max(1000)
    .refine(values => new Set(values).size === values.length, "Duplicate IDs are not allowed");
export const ofapiCollectionActionOptions = [
    z.strictObject({ action: z.literal("user_list_create"), pageId, name: userListName }),
    z.strictObject({ action: z.literal("user_list_update"), pageId, listId: userListId, name: userListName, isPinnedToFeed: z.boolean().nullable().optional() }),
    z.strictObject({ action: z.literal("user_list_delete"), pageId, listId: userListId }),
    z.strictObject({ action: z.literal("user_list_add_users"), pageId, listId: userListId, ids: nativeIds, skip_invalid: z.boolean().optional() }),
    z.strictObject({ action: z.literal("user_list_clear"), pageId, listId: userListId }),
    z.strictObject({ action: z.literal("user_list_remove_user"), pageId, listId: userListId, userId: nativeId }),
    // The provider offers a toggle, not an idempotent desired-state setter.
    z.strictObject({ action: z.literal("user_list_pin_toggle"), pageId, listId: userListId, userId: nativeId }),
    z.strictObject({ action: z.literal("vault_list_create"), pageId, name: vaultListName }),
    z.strictObject({ action: z.literal("vault_list_update"), pageId, listId, name: vaultListName }),
    z.strictObject({ action: z.literal("vault_list_delete"), pageId, listId }),
    z.strictObject({ action: z.literal("vault_list_add_media"), pageId, listId, mediaIds: nativeIds }),
    z.strictObject({ action: z.literal("vault_list_remove_media"), pageId, listId, mediaIds: nativeIds }),
    z.strictObject({ action: z.literal("vault_media_delete"), pageId, mediaIds: nativeIds }),
    z.strictObject({ action: z.literal("user_block"), pageId, userId: nativeId }),
    z.strictObject({ action: z.literal("user_unblock"), pageId, userId: nativeId }),
    z.strictObject({ action: z.literal("user_restrict"), pageId, userId: nativeId }),
    z.strictObject({ action: z.literal("user_unrestrict"), pageId, userId: nativeId }),
    // Provider notes are separate from the Hub's append-only local notes.
    z.strictObject({ action: z.literal("fan_notes_get"), pageId, fanId: nativeId }),
    z.strictObject({ action: z.literal("fan_notes_update"), pageId, fanId: nativeId, notes: z.string().max(16000) }),
    z.strictObject({ action: z.literal("fan_notes_clear"), pageId, fanId: nativeId }),
];
export const ofapiCollectionActionSchema = z.union(ofapiCollectionActionOptions);
