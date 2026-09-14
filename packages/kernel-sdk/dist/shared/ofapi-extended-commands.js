export const OFAPI_EXTENDED_COMMAND_KINDS = [
    "send_message_v2", "set_fan_custom_name_v1", "like_message_v1", "unlike_message_v1",
    "pin_message_v1", "unpin_message_v1", "mark_chat_unread_v1", "mute_chat_v1", "unmute_chat_v1", "hide_chat_v1",
];
/** A follower greeting is one immediate, free, stand-alone text message. */
export function isOfapiFollowerGreetingPayload(payload) {
    return payload.text.trim().length > 0 && payload.priceCents === 0
        && payload.mediaFiles.length === 0 && payload.previews.length === 0
        && payload.lockedText === false && payload.replyToMessageId === null
        && payload.giphyId === null && payload.rfTag.length === 0
        && payload.rfPartner.length === 0 && payload.rfGuest.length === 0
        && payload.reuseProviderOperation === false;
}
