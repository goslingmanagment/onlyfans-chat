// Send command path shared by the composer button and the ⌘↵ keymap binding.
// The renderer never retries anything (SPEC §15.5); the one guard it owns is
// the pre-accept window — a second ⌘↵ before cmd:send.message resolves must
// not create a second send (main's single-flight queue starts at the row,
// which only exists after the invoke is accepted).

import { getBridge } from '../../bridge/bridge';
import { setDraftText, useAiStore } from '../ai/aiStore';
import { useVaultStore } from '../vault/vaultStore';
import { splitDraftParts } from './sendLogic';

const inFlight = new Set<string>();

export function sendCurrentDraft(args: {
  accountId: string;
  chatId: string;
  canSend: boolean;
}): void {
  if (!args.canSend) return;
  // PPV compose active (vault media attached): the draft is the locked-text
  // caption — only the vault strip's explicit confirm may send (PRD F7).
  if (useVaultStore.getState().selection.ids.length > 0) return;
  const key = `${args.accountId}/${args.chatId}`;
  if (inFlight.has(key)) return;
  const draft = useAiStore.getState().draftText;
  const parts = splitDraftParts(draft);
  if (parts.length === 0) return;
  inFlight.add(key);
  void getBridge()
    .invoke('cmd:send.message', { accountId: args.accountId, chatId: args.chatId, parts })
    .then(() => {
      // clear only if the chatter hasn't typed more since the accept
      if (useAiStore.getState().draftText === draft) setDraftText('');
    })
    .catch(() => {
      // invoke-level rejection ⇒ no outbox row was persisted; keep the draft
    })
    .finally(() => {
      inFlight.delete(key);
    });
}
