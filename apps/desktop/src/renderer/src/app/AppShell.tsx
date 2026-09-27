import { useEffect } from 'react';
import { useAccounts, useSettings } from '../bridge/queries';
import { getBridge } from '../bridge/bridge';
import { signalRendererReady } from '../bridge/rendererReady';
import { useUiStore } from '../state/uiStore';
import { useSettingsCache } from '../state/settingsCache';
import { applyThemeSetting } from '../lib/theme';
import { firstOrderedId } from '../lib/order';
import { Titlebar } from './Titlebar';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';
import { HotkeyCheatsheet } from './HotkeyCheatsheet';
import { ToastHost } from './ToastHost';
import { MediaLightbox } from '../features/media/MediaLightbox';
import { AccountRail } from '../features/inbox/AccountRail';
import { ChatListPane } from '../features/inbox/ChatListPane';
import { ConversationPane } from '../features/conversation/ConversationPane';
import { FanPanel } from '../features/fan-panel/FanPanel';
import { SettingsSurface } from '../features/settings/SettingsSurface';
import { SpendersSurface } from '../features/spenders/SpendersSurface';
import { FollowersSurface } from '../features/followers/FollowersSurface';
import { OnlineSurface } from '../features/online/OnlineSurface';
import { SignInScreen } from '../features/auth/SignInScreen';
import {
  hubDeviceTokenStatus,
  requiresSignIn,
} from '../features/settings/sections/hubSettingsLogic';
import { useT } from '../lib/i18n';

export function AppShell(): React.JSX.Element {
  const view = useUiStore((s) => s.view);
  const listCollapsed = useUiStore((s) => s.listCollapsed);
  const panelCollapsed = useUiStore((s) => s.panelCollapsed);
  const selectedAccountId = useUiStore((s) => s.selectedAccountId);
  const reconcileAccountSelection = useUiStore((s) => s.reconcileAccountSelection);

  const accounts = useAccounts();
  const settings = useSettings();
  const setFromSettings = useSettingsCache((s) => s.setFromSettings);
  const t = useT();

  // This effect runs only when the healthy AppShell subtree commits. Its first
  // invoke proves preload/main IPC before the second releases the boot gate.
  // StrictMode may repeat it in dev; late duplicate acknowledgements are no-ops.
  useEffect(() => {
    void signalRendererReady();
  }, []);

  // Keep selection inside the authoritative grant set. This is selection only,
  // never a view switch (a boot into Settings must stay there).
  useEffect(() => {
    if (accounts.data === undefined || settings.data === undefined) return;
    if (
      selectedAccountId !== null &&
      accounts.data.some((account) => account.id === selectedAccountId)
    ) {
      return;
    }
    const firstId = firstOrderedId(
      accounts.data,
      (account) => account.id,
      settings.data.accountOrder,
    );
    reconcileAccountSelection(firstId);
  }, [accounts.data, reconcileAccountSelection, selectedAccountId, settings.data]);

  // mirror notification-relevant settings for the event layer
  useEffect(() => {
    if (settings.data !== undefined) setFromSettings(settings.data);
  }, [settings.data, setFromSettings]);

  useEffect(() => {
    void getBridge().invoke('cmd:sync.focusAccount', { accountId: selectedAccountId });
  }, [selectedAccountId]);

  // Apply the color theme; resolves 'system' against the OS scheme and tracks
  // OS flips. Drives the `dark` class on <html> — every color flips via CSS
  // variables, so no component re-renders on theme change. Skip until settings
  // load: bootstrapTheme() (main.tsx) already painted from the localStorage
  // echo, so coercing undefined→'light' here would repaint light over a dark
  // user's correct first frame (a dark→light→dark flash every launch).
  const uiTheme = settings.data?.uiTheme;
  useEffect(() => {
    if (uiTheme === undefined) return;
    return applyThemeSetting(uiTheme);
  }, [uiTheme]);

  // D35 §9: the first-run gate. Only a machine with no device custody at all
  // lands here; everything else (settling transition, quarantine, unreachable
  // hub) keeps the workspace with its own banner or status.
  const deviceStatus = settings.data === undefined
    ? null
    : hubDeviceTokenStatus(settings.data);
  if (settings.data !== undefined && deviceStatus !== null && requiresSignIn(deviceStatus)) {
    return <SignInScreen settings={settings.data} />;
  }

  const transition = settings.data?.hubDeviceTokenTransition ?? null;

  return (
    <div className="relative flex h-screen flex-col bg-bg0 font-sans text-base text-ink">
      <Titlebar />
      {transition !== null && (
        // A durable sign-in/sign-out owns the credential until it settles;
        // say so instead of letting the workspace look merely disconnected.
        <div
          role="status"
          className="border-b border-line bg-bg1 px-3 py-1 text-center text-[12px] text-ink-mid"
        >
          {transition === 'activation'
            ? t('auth.transition.activation')
            : t('auth.transition.revocation')}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <AccountRail />
        {view === 'settings' ? (
          <SettingsSurface />
        ) : view === 'spenders' ? (
          // Spenders is a SEPARATE page (owner v2 2026-06-13): no workspace
          // chat list — the board owns the screen, stats column right.
          <SpendersSurface />
        ) : view === 'followers' ? (
          <FollowersSurface />
        ) : view === 'online' ? (
          // Online-now is a SEPARATE flat-list page (owner variant C): no
          // workspace chat list — the surface owns the screen.
          <OnlineSurface />
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
      <MediaLightbox />
      <ToastHost />
    </div>
  );
}
