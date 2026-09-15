// D35 §9: the first thing a new chatter sees. One login, one password, one
// button — the machinery behind them (custody, activation, the address) is not
// this screen's subject. It appears ONLY when this machine holds no device
// credential at all (hubSettingsLogic.requiresSignIn): a settling transition, a
// quarantined credential or an unreachable hub all keep the workspace.
//
// The address hides under "Advanced" because exactly one install in the fleet
// ever needs it (a loopback hub during development).

import { useState } from 'react';
import type { SettingsVM } from '../../../../preload/contract';
import { useHubDeviceTokenIssue, useUpdateSettings } from '../../bridge/queries';
import { localizedErrorText, useLocale, useT } from '../../lib/i18n';
import { Button } from '../../design/Button';
import { canIssueHubDeviceToken } from '../settings/sections/hubSettingsLogic';
import { signInOutcome } from './signInLogic';
import { HELP_SIGN_IN_URL } from './links';

const INPUT_CLASS =
  'w-full rounded-chip border border-line bg-bg1 px-3 py-2 text-[13px] outline-none placeholder:text-ink-low focus:border-clay-line';

export function SignInScreen({ settings }: { settings: SettingsVM }): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [baseUrl, setBaseUrl] = useState(settings.hubBaseUrl ?? '');
  const signIn = useHubDeviceTokenIssue();
  const updateSettings = useUpdateSettings();
  const t = useT();
  const locale = useLocale();

  const outcome = signInOutcome({ data: signIn.data, isError: signIn.isError });
  const canSubmit = canIssueHubDeviceToken({
    username,
    password,
    hasStoredDeviceToken: false,
    issuePending: signIn.isPending,
    signOutPending: updateSettings.isPending,
  });

  function submit(): void {
    if (!canSubmit) return;
    signIn.mutate(
      { username: username.trim(), password },
      {
        // Keep the login: a wrong password is the common failure and retyping
        // both is a needless second chance to mistype the login.
        onSuccess: (result) => {
          if (result.ok) setPassword('');
        },
      },
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-bg0 px-6 text-ink">
      <div className="w-full max-w-[380px]">
        <h1 className="font-serif text-[22px] font-semibold">{t('auth.title')}</h1>
        <p className="pt-1 text-[12.5px] text-ink-mid">{t('auth.subtitle')}</p>

        {settings.hubSignedOutReason !== null && (
          <p
            role="status"
            className="mt-4 rounded-chip border border-line bg-bg1 px-3 py-2 text-[12.5px] text-ink-mid"
          >
            {t('auth.signedOut')}
          </p>
        )}

        <form
          className="space-y-2.5 pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div>
            <label htmlFor="auth-username" className="block pb-1 text-[11.5px] text-ink-mid">
              {t('hub.deviceToken.username')}
            </label>
            <input
              id="auth-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              autoFocus
              spellCheck={false}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="block pb-1 text-[11.5px] text-ink-mid">
              {t('hub.deviceToken.password')}
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={INPUT_CLASS}
            />
          </div>
          <div className="pt-1">
            <Button variant="primary" disabled={!canSubmit} onClick={submit}>
              {signIn.isPending ? t('hub.deviceToken.signingIn') : t('hub.deviceToken.signIn')}
            </Button>
          </div>
        </form>

        <div aria-live="polite" className="min-h-[18px] pt-2">
          {outcome.kind === 'failed' && (
            <p className="text-[12px] text-bad">
              {localizedErrorText(
                locale,
                outcome.error.code,
                `${outcome.error.message} ${outcome.error.recovery}`,
              )}
            </p>
          )}
          {outcome.kind === 'unavailable' && (
            <p className="text-[12px] text-bad">{t('hub.deviceToken.failed')}</p>
          )}
        </div>

        <details className="pt-3">
          <summary className="cursor-pointer text-[11.5px] text-ink-mid">{t('hub.advanced')}</summary>
          <div className="flex items-end gap-2 pt-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="auth-base-url" className="block pb-1 text-[11px] text-ink-low">
                {t('hub.baseUrl.label')}
              </label>
              <input
                id="auth-base-url"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={INPUT_CLASS}
              />
            </div>
            <Button
              size="sm"
              disabled={updateSettings.isPending || baseUrl.trim() === (settings.hubBaseUrl ?? '')}
              onClick={() => {
                const trimmed = baseUrl.trim();
                updateSettings.mutate({ hubBaseUrl: trimmed === '' ? null : trimmed });
              }}
            >
              {t('common.save')}
            </Button>
          </div>
          {updateSettings.isError && (
            <p className="pt-1 text-[11.5px] text-bad">
              {t('common.saveFailed', {
                message: updateSettings.error instanceof Error ? updateSettings.error.message : '',
              })}
            </p>
          )}
        </details>

        <a
          href={HELP_SIGN_IN_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-[12px] text-ink-mid underline underline-offset-2 hover:text-clay-deep"
        >
          {t('auth.help')}
        </a>
      </div>
    </div>
  );
}
