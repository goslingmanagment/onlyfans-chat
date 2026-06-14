// The feature map that lets ONE <ConversationView> body serve both the full
// workspace chat and the compact Spenders quick-look preview. This is the
// single, explicit home for "preview shows less than the full chat" — never an
// `if (preview)` scattered through JSX. It covers only the conversation BODY
// (tabs / thread / dock / pills / composer / vault). The header is shell-owned
// (full chat = ConversationHeader; preview = its own compact header), and the
// read-only / 0-credit lifecycle (no mark-read, no aggressive poll) is owned by
// the shell too. Visual tightness is a separate axis — the `density` prop +
// the --cv-* tokens (styles/index.css).

export type AiPill = 'reply' | 'improve' | 'help' | 'ping' | 'hi';

export interface ConversationFeatures {
  /** THREAD / GALLERY tab switch + the gallery grid. */
  galleryTab: boolean;
  /** 📎 vault attach + VaultPanel + the mandatory PPV compose-summary confirm. */
  vault: boolean;
  /** Which AI pills appear, in this order. */
  pills: readonly AiPill[];
  /** Reply pill exposes the tone split-menu. */
  replyTone: boolean;
  /** The "fan is typing" indicator row. */
  typingIndicator: boolean;
  /** Compact one-line AI dock (auto-insert single drafts) vs the full streaming dock. */
  dock: 'full' | 'compact';
}

export const FULL_CHAT_FEATURES: ConversationFeatures = {
  galleryTab: true,
  vault: true,
  pills: ['reply', 'improve', 'help', 'ping', 'hi'],
  replyTone: true,
  typingIndicator: true,
  dock: 'full',
};

// Owner-locked preview map (2026-06-14): vault ON (send PPV from the preview),
// Improve ON, Scan OFF (Scan is a header menu, shell-owned — off here),
// subscription chips ON (added in the preview header, shell-owned). Lighter
// everywhere else; compact dock + compact density.
export const PREVIEW_FEATURES: ConversationFeatures = {
  galleryTab: false,
  vault: true,
  pills: ['ping', 'reply', 'hi', 'improve'],
  replyTone: false,
  typingIndicator: false,
  dock: 'compact',
};
