import { z } from "zod";
export declare const ofapiCollectionActionOptions: readonly [z.ZodObject<{
    action: z.ZodLiteral<"user_list_create">;
    pageId: z.ZodNumber;
    name: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_update">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    name: z.ZodString;
    isPinnedToFeed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_delete">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_add_users">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    ids: z.ZodArray<z.ZodString>;
    skip_invalid: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_clear">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_remove_user">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_pin_toggle">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_create">;
    pageId: z.ZodNumber;
    name: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_update">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    name: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_delete">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_add_media">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    mediaIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_remove_media">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    mediaIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_media_delete">;
    pageId: z.ZodNumber;
    mediaIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_block">;
    pageId: z.ZodNumber;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_unblock">;
    pageId: z.ZodNumber;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_restrict">;
    pageId: z.ZodNumber;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_unrestrict">;
    pageId: z.ZodNumber;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"fan_notes_get">;
    pageId: z.ZodNumber;
    fanId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"fan_notes_update">;
    pageId: z.ZodNumber;
    fanId: z.ZodString;
    notes: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"fan_notes_clear">;
    pageId: z.ZodNumber;
    fanId: z.ZodString;
}, z.core.$strict>];
export declare const ofapiCollectionActionSchema: z.ZodUnion<readonly [z.ZodObject<{
    action: z.ZodLiteral<"user_list_create">;
    pageId: z.ZodNumber;
    name: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_update">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    name: z.ZodString;
    isPinnedToFeed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_delete">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_add_users">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    ids: z.ZodArray<z.ZodString>;
    skip_invalid: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_clear">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_remove_user">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_list_pin_toggle">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_create">;
    pageId: z.ZodNumber;
    name: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_update">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    name: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_delete">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_add_media">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    mediaIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_list_remove_media">;
    pageId: z.ZodNumber;
    listId: z.ZodString;
    mediaIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"vault_media_delete">;
    pageId: z.ZodNumber;
    mediaIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_block">;
    pageId: z.ZodNumber;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_unblock">;
    pageId: z.ZodNumber;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_restrict">;
    pageId: z.ZodNumber;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"user_unrestrict">;
    pageId: z.ZodNumber;
    userId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"fan_notes_get">;
    pageId: z.ZodNumber;
    fanId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"fan_notes_update">;
    pageId: z.ZodNumber;
    fanId: z.ZodString;
    notes: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"fan_notes_clear">;
    pageId: z.ZodNumber;
    fanId: z.ZodString;
}, z.core.$strict>]>;
export type OfapiCollectionAction = z.infer<typeof ofapiCollectionActionSchema>;
