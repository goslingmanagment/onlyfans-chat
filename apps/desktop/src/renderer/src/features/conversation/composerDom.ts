// The composer textarea's DOM identity — leaf module so both the keymap layer
// and the AI store can focus it without importing each other.

export const COMPOSER_TEXTAREA_ID = 'composer-draft';

export function focusComposer(): void {
  const el = document.getElementById(COMPOSER_TEXTAREA_ID);
  if (el instanceof HTMLTextAreaElement && !el.disabled) el.focus();
}
