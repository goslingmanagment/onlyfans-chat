// Settings → Updates (PLAN item 11): manual "check now", live download
// progress, and a Restart & install action when a build is ready. The app
// also updates itself in the background (main/platform/updater.ts) — this is
// the on-demand control. Off win32-packaged builds the phase is `unsupported`
// and the section shows a one-line note instead of the button.

import type { UpdateStatusVM } from '../../../../../preload/contract';
import { useCheckUpdates, useInstallUpdate, useUpdateStatus } from '../../../bridge/queries';
import { useT } from '../../../lib/i18n';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import { Button } from '../../../design/Button';
import { Section } from '../SettingsSurface';

function statusLine(status: UpdateStatusVM, t: UiTranslator): string | null {
  switch (status.phase) {
    case 'checking':
      return t('update.checking');
    case 'up-to-date':
      return t('update.upToDate');
    case 'available':
      return t('update.preparing', { version: status.version ?? '' });
    case 'downloading':
      return t('update.downloading', {
        version: status.version ?? '',
        percent: String(status.percent ?? 0),
      });
    case 'downloaded':
      return t('update.ready', { version: status.version ?? '' });
    case 'manual':
      return t('update.manualAvailable', { version: status.version ?? '' });
    case 'error':
      return t('update.error', { message: status.message ?? '' });
    default:
      return null;
  }
}

export function UpdateSettings(): React.JSX.Element {
  const t = useT();
  const status = useUpdateStatus(true);
  const check = useCheckUpdates();
  const install = useInstallUpdate();

  const data = status.data;
  const phase = data?.phase ?? 'idle';
  const unsupported = phase === 'unsupported';
  const busy = phase === 'checking' || phase === 'available' || phase === 'downloading' || check.isPending;
  const line = data ? statusLine(data, t) : null;

  return (
    <Section title={t('update.title')} hint={t('update.hint')}>
      <div className="space-y-3">
        {data !== undefined && (
          <p className="num text-[11.5px] text-ink-low">
            {t('update.current', { version: data.currentVersion })}
          </p>
        )}

        {unsupported ? (
          <p className="text-[12.5px] text-ink-mid">{t('update.unsupported')}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {phase === 'downloaded' ? (
              <Button size="sm" variant="primary" onClick={() => install.mutate()}>
                {t('update.install')}
              </Button>
            ) : phase === 'manual' ? (
              // macOS: no self-install (D20) — the action opens the download page.
              <Button size="sm" variant="primary" onClick={() => install.mutate()}>
                {t('update.download')}
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => check.mutate()}>
                {busy ? t('update.checking') : t('update.check')}
              </Button>
            )}
            {line !== null && (
              <span
                className={
                  phase === 'error'
                    ? 'text-[12px] text-bad'
                    : phase === 'downloaded' || phase === 'manual'
                      ? 'text-[12px] font-medium text-green'
                      : 'num text-[12px] text-ink-mid'
                }
              >
                {line}
              </span>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
