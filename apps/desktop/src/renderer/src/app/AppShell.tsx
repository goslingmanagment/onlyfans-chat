import { useEffect } from 'react';
import { useAccounts, useSettings } from '../bridge/queries';
import { useUiStore } from '../state/uiStore';
import { useSettingsCache } from '../state/settingsCache';
import { Titlebar } from './Titlebar';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';
import { HotkeyCheatsheet } from './HotkeyCheatsheet';
import { ToastHost } from './ToastHost';
import { AccountRail } from '../features/inbox/AccountRail';
import { ChatListPane } from '../features/inbox/ChatListPane';
import { ConversationPane } from '../features/conversation/ConversationPane';
import { FanPanel } from '../features/fan-panel/FanPanel';
import { SettingsSurface } from '../features/settings/SettingsSurface';

export function AppShell(): React.JSX.Element {
  const view = useUiStore((s) => s.view);
  const listCollapsed = useUiStore((s) => s.listCollapsed);
  const panelCollapsed = useUiStore((s) => s.panelCollapsed);
  const selectedAccountId = useUiStore((s) => s.selectedAccountId);
  const selectAccount = useUiStore((s) => s.selectAccount);

  const accounts = useAccounts();
  const settings = useSettings();
  const setFromSettings = useSettingsCache((s) => s.setFromSettings);

  // default account selection once accounts load
  useEffect(() => {
    if (selectedAccountId === null) {
      const first = accounts.data?.[0];
      if (first !== undefined) selectAccount(first.id);
    }
  }, [accounts.data, selectedAccountId, selectAccount]);

  // mirror notification-relevant settings for the event layer
  useEffect(() => {
    if (settings.data !== undefined) setFromSettings(settings.data);
  }, [settings.data, setFromSettings]);

  return (
    <div className="relative flex h-screen flex-col bg-bg0 font-sans text-base text-ink">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <AccountRail />
        {view === 'settings' ? (
          <SettingsSurface />
        ) : (
          <>
            {!listCollapsed && <ChatListPane />}
            <ConversationPane />
            {!panelCollapsed && <FanPanel />}
          </>
        )}
      </div>
      <StatusBar />
      <CommandPalette />
      <HotkeyCheatsheet />
      <ToastHost />
    </div>
  );
}
