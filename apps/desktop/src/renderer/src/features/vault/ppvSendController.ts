// PPV send command path (PRD F7): the ONLY caller of cmd:send.ppv. Mirrors
// sendController's pre-accept guard — a second confirm click before the invoke
// resolves must not create a second send. The renderer validates for UX; the
// engine re-validates (price bounds, previews ⊆ mediaFiles) before enqueue.

import { getBridge } from '../../bridge/bridge';
import { setDraftText, useAiStore } from '../ai/aiStore';
import { scanTextForSend } from '../conversation/guardLogic';
import { useVaultStore } from './vaultStore';
import { deriveComposeSummary, parsePpvPrice } from './vaultLogic';

const inFlight = new Set<string>();

export function sendPpvCompose(args: {
  accountId: string;
  chatId: string;
  canSend: boolean;
}): void {
  if (!args.canSend) return;
  const key = `${args.accountId}/${args.chatId}`;
  if (inFlight.has(key)) return;

  const { selection, priceInput } = useVaultStore.getState();
  const price = parsePpvPrice(priceInput);
  const draft = useAiStore.getState().draftText;
  const summary = deriveComposeSummary(selection, price, draft);
  if (summary === null) return; // nothing selected or invalid price — no send
  if (scanTextForSend(draft.trim()) !== 'allow') return;

  inFlight.add(key);
  void getBridge()
    .invoke('cmd:send.ppv', {
      accountId: args.accountId,
      chatId: args.chatId,
      text: draft.trim(),
      price: summary.price,
      mediaFiles: [...selection.ids],
      previews: [...selection.previews],
    })
    .then(() => {
      // clear only if the chatter hasn't typed more since the accept
      if (useAiStore.getState().draftText === draft) setDraftText('');
      useVaultStore.getState().reset(); // selection consumed; panel closes
    })
    .catch(() => {
      // invoke-level rejection ⇒ no outbox row was persisted; keep the compose
    })
    .finally(() => {
      inFlight.delete(key);
    });
}
