import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../src/renderer/src/state/uiStore';

describe('uiStore account grant reconciliation', () => {
  beforeEach(() => {
    useUiStore.setState({
      view: 'settings',
      selectedAccountId: 'acct_old',
      selectedChatId: 'fan_1',
    });
  });

  it('moves a stale selection to the first granted account without leaving the current view', () => {
    useUiStore.getState().reconcileAccountSelection('acct_new');

    expect(useUiStore.getState()).toMatchObject({
      view: 'settings',
      selectedAccountId: 'acct_new',
      selectedChatId: null,
    });
  });

  it('clears selection for an authenticated empty grant set', () => {
    useUiStore.getState().reconcileAccountSelection(null);

    expect(useUiStore.getState()).toMatchObject({
      view: 'settings',
      selectedAccountId: null,
      selectedChatId: null,
    });
  });

  it('does not notify subscribers when the selected account remains valid', () => {
    const notifications: unknown[] = [];
    const unsubscribe = useUiStore.subscribe((state) => notifications.push(state));

    useUiStore.getState().reconcileAccountSelection('acct_old');

    expect(notifications).toEqual([]);
    unsubscribe();
  });
});
