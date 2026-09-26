import { describe, expect, it } from 'vitest';
import { purchaseToast, type PurchaseToastContext } from '../../src/renderer/src/bridge/purchaseToast';

const CONTEXT: PurchaseToastContext = {
  selectedAccountId: 'acct_1',
  selectedChatId: '999',
  windowFocused: true,
  notificationsEnabled: true,
  locale: 'ru',
  chatFanName: undefined,
};

const PPV = {
  type: 'ppvUnlocked' as const,
  accountId: 'acct_1',
  chatId: '101',
  messageId: '11365803781187',
  amountUsd: 89,
  fanName: 'Neil/US',
  live: true,
};

describe('purchaseToast (D39)', () => {
  it('shows «<фан> купил(а) PPV $89» and opens the chat on click', () => {
    expect(purchaseToast(PPV, CONTEXT)).toEqual({
      title: 'Neil/US',
      body: 'купил(а) PPV $89',
      accountId: 'acct_1',
      chatId: '101',
    });
    expect(purchaseToast(
      { type: 'tipReceived', accountId: 'acct_1', chatId: '101', amountUsd: 5, live: true },
      { ...CONTEXT, chatFanName: 'Kev (list)' },
    )).toMatchObject({ title: 'Kev (list)', body: 'отправил(а) чаевые $5' });
  });

  it('is silent for the chat that is open in a focused window', () => {
    const open = { ...CONTEXT, selectedChatId: '101' };
    expect(purchaseToast(PPV, open)).toBeNull();
    // The same chat in a backgrounded window is not "being looked at".
    expect(purchaseToast(PPV, { ...open, windowFocused: false })).not.toBeNull();
    // Same chat id on another account is another chat.
    expect(purchaseToast({ ...PPV, accountId: 'acct_2' }, open)).not.toBeNull();
  });

  it('needs main\'s explicit yes and the notifications setting', () => {
    expect(purchaseToast({ ...PPV, live: false }, CONTEXT)).toBeNull();
    const { live: _live, ...unstamped } = PPV;
    expect(purchaseToast(unstamped, CONTEXT)).toBeNull();
    expect(purchaseToast(PPV, { ...CONTEXT, notificationsEnabled: false })).toBeNull();
  });
});
