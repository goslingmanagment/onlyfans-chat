import { splitUpdateStamp } from '@chatgoose/shared';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import type { SpendersRefreshRunVM } from '../../../../preload/contract';

export function historyStatusText(stampIso: string | null, run: SpendersRefreshRunVM | null, now: number, t: UiTranslator): string {
  if (run?.scopeChanged) return t('sp.refreshScopeChanged');
  if (run?.state === 'skipped') return t('sp.refreshSkipped');
  if (run?.state === 'partial' || run?.state === 'stopped') {
    return t(run.state === 'stopped' ? 'sp.refreshStopped' : 'sp.refreshPartial', { known: run.fetched + run.ttlSkipped, total: run.total });
  }
  const stampMs = stampIso === null ? Number.NaN : Date.parse(stampIso);
  if (!Number.isFinite(stampMs)) return t('sp.historyNotVerified');
  const parts = splitUpdateStamp(stampMs, now);
  const when = parts.kind === 'today'
    ? `${t('sp.today')} ${parts.time}`
    : parts.kind === 'yesterday' ? `${t('sp.yesterdayCap')} ${parts.time}` : `${parts.date} ${parts.time}`;
  return t('sp.historyVerified', { when });
}
