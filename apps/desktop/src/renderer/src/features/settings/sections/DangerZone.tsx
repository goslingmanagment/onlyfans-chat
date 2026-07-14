// Local data tools: cache footprint, open-folder / diagnostics-export
// shortcuts, and the purge flow. Purge is rare and destructive-looking (the
// upstream is untouched), so it is deliberately slow: arm → type the word →
// confirm.

import { useState } from 'react';
import {
  useExportDiagnostics,
  useHarvestPause,
  useHarvestPrepareIdentity,
  useHarvestStart,
  useHarvestStatus,
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
  const harvestStatus = useHarvestStatus();
  const harvestPrepareIdentity = useHarvestPrepareIdentity();
  const harvestStart = useHarvestStart();
  const harvestPause = useHarvestPause();
  const t = useT();
  const locale = useLocale();
  const [arming, setArming] = useState(false);
  const [typed, setTyped] = useState('');
  const [copied, setCopied] = useState(false);
  const [identityCopied, setIdentityCopied] = useState(false);

  const harvestMachineId =
    harvestStatus.data?.machineId ?? harvestPrepareIdentity.data?.machineId ?? null;

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

        {/* Stage 12: one-time history upload to the kernel. Progress is
            status-polled; the run is resumable — deterministic ids make
            re-uploads free. */}
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-[12.5px] font-semibold">{t('danger.harvestTitle')}</p>
          <p className="text-[11.5px] text-ink-low">{t('danger.harvestHint')}</p>
          <div className="space-y-1.5 rounded-chip border border-line bg-bg0 px-3 py-2">
            <p className="text-[11.5px] text-ink-low">{t('danger.harvestIdentityHint')}</p>
            {harvestMachineId === null ? (
              <Button
                size="sm"
                disabled={harvestPrepareIdentity.isPending}
                onClick={() => harvestPrepareIdentity.mutate()}
              >
                {t('danger.harvestIdentityPrepare')}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-ink-mid">
                  {t('danger.harvestIdentityLabel')}:
                </span>
                <code className="num break-all text-[11px] text-ink">{harvestMachineId}</code>
                <button
                  type="button"
                  className="text-[11px] text-ink-low underline-offset-2 hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(harvestMachineId).then(() => {
                      setIdentityCopied(true);
                      window.setTimeout(() => setIdentityCopied(false), 1500);
                    });
                  }}
                >
                  {identityCopied
                    ? t('danger.harvestIdentityCopied')
                    : t('danger.harvestIdentityCopy')}
                </button>
              </div>
            )}
            {harvestPrepareIdentity.isError && (
              <p className="text-[11px] text-bad">
                {t('danger.harvestIdentityError', {
                  error:
                    harvestPrepareIdentity.error instanceof Error
                      ? harvestPrepareIdentity.error.message
                      : String(harvestPrepareIdentity.error),
                })}
              </p>
            )}
          </div>
          {harvestStatus.data?.state === 'running' ? (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => harvestPause.mutate()}>
                {t('danger.harvestPause')}
              </Button>
              <span className="num text-[11.5px] text-ink-mid">
                {t('danger.harvestRunning', {
                  table: harvestStatus.data.currentTable ?? '…',
                  uploaded: String(
                    Object.values(harvestStatus.data.tables).reduce((sum, p) => sum + p.uploaded, 0),
                  ),
                  duplicates: String(
                    Object.values(harvestStatus.data.tables).reduce((sum, p) => sum + p.duplicates, 0),
                  ),
                })}
              </span>
            </div>
          ) : harvestStatus.data?.state === 'complete' ? (
            <p className="text-[11.5px] text-green">{t('danger.harvestComplete')}</p>
          ) : (
            <div className="space-y-1">
              {harvestStatus.data?.state === 'error' && harvestStatus.data.error !== null && (
                <p className="text-[11.5px] text-bad">
                  {t('danger.harvestError', { error: harvestStatus.data.error })}
                </p>
              )}
              <Button
                size="sm"
                disabled={harvestStart.isPending || harvestMachineId === null}
                onClick={() => harvestStart.mutate()}
              >
                {harvestStatus.data?.state === 'paused' || harvestStatus.data?.state === 'error'
                  ? t('danger.harvestResume')
                  : t('danger.harvestStart')}
              </Button>
            </div>
          )}
          {harvestStatus.data !== undefined &&
            harvestStatus.data.state !== 'idle' &&
            harvestStatus.data.state !== 'complete' && (
              <p className="text-[11px] text-ink-low">{t('danger.harvestPurgeBlocked')}</p>
            )}
        </div>

        {arming ? (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-[12.5px] font-semibold text-bad">{t('danger.confirmQuestion')}</p>
            {/* Stage 4 interim warning: until the kernel capture lane exists
                (Stage 11), purge is permanent loss of local-only facts. */}
            <p className="text-[11.5px] text-bad">{t('danger.purgeKernelWarning')}</p>
            <Button size="sm" disabled={exportDiag.isPending} onClick={() => exportDiag.mutate()}>
              {t('danger.purgeExportFirst')}
            </Button>
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
        {purge.isError && (
          <p className="text-[11.5px] text-bad">
            {t('danger.purgeFailed', {
              error: purge.error instanceof Error ? purge.error.message : String(purge.error),
            })}
          </p>
        )}
      </div>
    </Section>
  );
}
