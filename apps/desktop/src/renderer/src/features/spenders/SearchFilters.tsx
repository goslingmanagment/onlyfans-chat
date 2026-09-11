import { useEffect, useRef, useState } from 'react';
import type { UiTranslator } from '@chatgoose/shared/i18n/index';
import { useSpendersStore } from './spendersStore';
import { cx } from '../../lib/cx';

export function SearchFilters({ t }: { t: UiTranslator }): React.JSX.Element {
  const filters = useSpendersStore((s) => s.filters);
  const setFilters = useSpendersStore((s) => s.setFilters);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const count = Number(filters.author !== 'all') + Number(filters.history !== 'all');

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="flex flex-none items-center gap-2 border-b border-line px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-bg1 px-2.5 focus-within:border-ink-low">
        <svg className="h-3.5 w-3.5 flex-none text-ink-low" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
        <input
          ref={input}
          data-spenders-search
          type="search"
          value={filters.query}
          onChange={(event) => setFilters({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              if (filters.query) setFilters({ query: '' });
              else event.currentTarget.blur();
            }
          }}
          aria-label={t('sp.search')}
          placeholder={t('sp.searchPlaceholder')}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[12px] text-ink outline-none placeholder:text-ink-low [&::-webkit-search-cancel-button]:hidden"
        />
        {filters.query ? <button type="button" aria-label={t('sp.searchClear')} onClick={() => { setFilters({ query: '' }); input.current?.focus(); }} className="cursor-pointer px-1 text-ink-low hover:text-ink">×</button> : <span className="num text-[10px] text-ink-low" aria-hidden="true">/</span>}
      </div>
      <div ref={panel} className="relative" onKeyDown={(event) => {
        if (open) {
          event.stopPropagation();
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
        }
      }}>
        <button ref={trigger} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="spender-filters" className={cx('cursor-pointer rounded-md border px-2.5 py-1.5 text-[12px]', count ? 'border-ink-low bg-bg2 text-ink' : 'border-line text-ink-mid hover:bg-bg2')}>
          {t('sp.filters')}{count > 0 ? ` · ${count}` : ''}
        </button>
        {open && <div id="spender-filters" role="group" aria-label={t('sp.filters')} className="absolute top-full right-0 z-30 mt-2 w-[240px] space-y-3 rounded-lg border border-line bg-bg1 p-3 shadow-lg">
          <label className="block text-[11px] text-ink-mid">
            {t('sp.filterAuthor')}
            <select aria-label={t('sp.filterAuthor')} value={filters.author} onChange={(event) => setFilters({ author: event.target.value as typeof filters.author })} className="mt-1 block w-full rounded border border-line bg-bg1 p-1.5 text-[12px] text-ink">
              <option value="all">{t('sp.filterAuthorAll')}</option>
              <option value="model">{t('sp.filterAuthorModel')}</option>
              <option value="fan">{t('sp.filterAuthorFan')}</option>
            </select>
          </label>
          <label className="block text-[11px] text-ink-mid">
            {t('sp.filterHistory')}
            <select aria-label={t('sp.filterHistory')} value={filters.history} onChange={(event) => setFilters({ history: event.target.value as typeof filters.history })} className="mt-1 block w-full rounded border border-line bg-bg1 p-1.5 text-[12px] text-ink">
              <option value="all">{t('sp.filterHistoryAll')}</option>
              <option value="known">{t('sp.filterHistoryKnown')}</option>
              <option value="unknown">{t('sp.filterHistoryUnknown')}</option>
            </select>
          </label>
          {count > 0 && <button type="button" className="cursor-pointer text-[12px] text-clay-deep hover:underline" onClick={() => setFilters({ author: 'all', history: 'all' })}>{t('sp.clearFilters')}</button>}
        </div>}
      </div>
    </div>
  );
}
