// Local data tools: cache footprint, open-folder / diagnostics-export
// shortcuts, and the purge flow. Purge is rare and destructive-looking (the
// upstream is untouched), so it is deliberately slow: arm → type the word →
// confirm.

import { useState } from 'react';
import {
  useExportDiagnostics,
  useLocalDataStats,
  useOpenDataFolder,
  usePurgeData,
} from '../../../bridge/queries';
import { pluralWord, type UiLocale } from '@chatgoose/shared/i18n/index';
import { useLocale, useT } from '../../../lib/i18n';
import { Button } from '../../../design/Button';
import { Section } from '../SettingsSurface';

const CONFIRM_WORD = 'purge';

function formatMb(locale: UiLocale, bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const figure = mb >= 100 ? String(Math.round(mb)) : mb.toFixed(1);
  return `${figure} ${locale === 'ru' ? 'МБ' : 'MB'}`;
}

export function DangerZone(): React.JSX.Element {
  const purge = usePurgeData();
  const stats = useLocalDataStats(true);
  const openFolder = useOpenDataFolder();
  const exportDiag = useExportDiagnostics();
  const t = useT();
  const locale = useLocale();
  const [arming, setArming] = useState(false);
  const [typed, setTyped] = useState('');
  const [copied, setCopied] = useState(false);

  const filesWord =
    stats.data !== undefined
      ? pluralWord(locale, stats.data.mediaFiles, ['file', 'files'], ['файл', 'файла', 'файлов'])
      : '';

  return (
    <Section title={t('danger.title')} hint={t('danger.hint')}>
      <div className="space-y-3">
        {stats.data !== undefined && (
          <p className="num text-[11.5px] text-ink-low">
            {t('danger.stats', {
              db: formatMb(locale, stats.data.dbBytes),
              media: formatMb(locale, stats.data.mediaBytes),
              files: `${stats.data.mediaFiles} ${filesWord}`,
            })}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => openFolder.mutate()}>
            {t('danger.openFolder')}
          </Button>
          <Button size="sm" disabled={exportDiag.isPending} onClick={() => exportDiag.mutate()}>
            {t('danger.exportDiagnostics')}
          </Button>
          <span className="text-[11px] text-ink-low">{t('danger.diagHint')}</span>
        </div>
        <p className="text-[11.5px] text-ink-mid">{t('danger.diagSend')}</p>
        {exportDiag.data !== undefined && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="num text-[11px] text-green">
              {t('danger.exported', { path: exportDiag.data.path })}
            </p>
            <button
              type="button"
              className="text-[11px] text-ink-low underline-offset-2 hover:underline"
              onClick={() => {
                const path = exportDiag.data?.path;
                if (path === undefined) {
                  return;
                }
                void navigator.clipboard.writeText(path).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? t('danger.copied') : t('danger.copyPath')}
            </button>
          </div>
        )}

        {arming ? (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-[12.5px] font-semibold text-bad">{t('danger.confirmQuestion')}</p>
            <div className="flex items-center gap-3">
              <span className="text-[11.5px] text-ink-low">
                {t('danger.typeToConfirm', { word: CONFIRM_WORD })}
              </span>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="num w-32 rounded-chip border border-line bg-bg1 px-3 py-1 text-[12.5px] outline-none focus:border-clay-line"
              />
              <Button
                size="sm"
                variant="danger"
                disabled={typed.trim().toLowerCase() !== CONFIRM_WORD || purge.isPending}
                onClick={() => {
                  purge.mutate(undefined, {
                    onSettled: () => {
                      setArming(false);
                      setTyped('');
                    },
                  });
                }}
              >
                {t('danger.yesPurge')}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setArming(false);
                  setTyped('');
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-line pt-3">
            <Button size="sm" variant="danger" onClick={() => setArming(true)}>
              {t('danger.purgeBtn')}
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}
