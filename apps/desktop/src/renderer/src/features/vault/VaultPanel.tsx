import { useComposerStore } from '../conversation/composerStore';
// Vault attach panel (PRD F7) — a dock-style surface above the composer (NOT
// a modal: the thread stays visible, DESIGN anti-goal "no modal dialogs inside
// the shift loop"). Album chips → search → virtualized thumb grid with ordered
// multi-select + preview-subset toggles → the mandatory PPV COMPOSE SUMMARY
// strip whose confirm button restates the price in words (misprice guard).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { VaultItemVM } from '../../../../preload/contract';
import { useGuardConfig, useVaultAlbums, useVaultMedia } from '../../bridge/queries';
import { useAiStore } from '../ai/aiStore';
import { pluralWord } from '@chatgoose/shared/i18n/index';
import { Chip } from '../../design/Chip';
import { Button } from '../../design/Button';
import { cx } from '../../lib/cx';
import { useT, useLocale } from '../../lib/i18n';
import { useVaultStore } from './vaultStore';
import {
  chunkRows,
  deriveComposeSummary,
  parsePpvPrice,
  selectionOrder,
} from './vaultLogic';
import { sendPpvCompose } from './ppvSendController';
import {
  compileRendererGuardPolicy,
  scanDraftForDisplay,
  setCurrentGuardState,
  verdictBlocks,
  verdictCategories,
} from '../conversation/guardLogic';

const GRID_COLUMNS = 6;
const CELL_HEIGHT = 96;

function VaultCell({ item }: { item: VaultItemVM }): React.JSX.Element {
  const t = useT();
  const selection = useVaultStore((s) => s.selection);
  const toggleItem = useVaultStore((s) => s.toggleItem);
  const togglePreviewItem = useVaultStore((s) => s.togglePreviewItem);
  const order = selectionOrder(selection, item.id);
  const isPreview = selection.previews.includes(item.id);

  return (
    <button
      type="button"
      disabled={!item.isReady}
      onClick={() => toggleItem(item.id)}
      title={item.isReady ? t('vault.cellAttachTip') : t('vault.cellProcessingTip')}
      className={cx(
        'relative h-[88px] overflow-hidden rounded-[8px] border text-left',
        order !== null ? 'border-clay ring-2 ring-clay/50' : 'border-line',
        item.isReady ? 'cursor-pointer' : 'cursor-default opacity-70',
      )}
    >
      {item.thumbUrl !== null && item.isReady ? (
        <img src={item.thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-bg3">
          <span className={cx('text-[13px] opacity-60', !item.isReady && 'animate-pulse')}>
            {item.isReady ? (item.type === 'audio' ? '♪' : '∅') : '⏳'}
          </span>
          {!item.isReady && (
            <span className="num text-micro tracking-[0.08em] text-ink-mid">PROCESSING</span>
          )}
        </span>
      )}
      {item.type === 'video' && item.durationSeconds !== null && (
        <span className="num absolute right-1 bottom-1 rounded-[4px] bg-bg1/90 px-1 text-micro text-ink-mid">
          ▶ {Math.floor(item.durationSeconds / 60)}:{String(item.durationSeconds % 60).padStart(2, '0')}
        </span>
      )}
      {order !== null && (
        <span className="num absolute top-1 left-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-clay px-1 text-micro font-bold text-white">
          {order}
        </span>
      )}
      {order !== null && (
        <span
          role="button"
          tabIndex={0}
          title={isPreview ? t('vault.previewToggleFree') : t('vault.previewToggleLocked')}
          onClick={(event) => {
            event.stopPropagation();
            togglePreviewItem(item.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation();
              togglePreviewItem(item.id);
            }
          }}
          className={cx(
            'num absolute right-1 top-1 cursor-pointer rounded-[4px] border px-1 text-micro font-bold',
            isPreview
              ? 'border-green-line bg-green-bg text-green'
              : 'border-line bg-bg1/90 text-ink-mid',
          )}
        >
          {isPreview ? 'FREE' : '🔒'}
        </span>
      )}
    </button>
  );
}

export function VaultPanel({
  accountId,
  chatId,
  canSend,
}: {
  accountId: string;
  chatId: string;
  canSend: boolean;
}): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const open = useVaultStore((s) => s.open);
  const albumId = useVaultStore((s) => s.albumId);
  const search = useVaultStore((s) => s.search);
  const selection = useVaultStore((s) => s.selection);
  const priceInput = useVaultStore((s) => s.priceInput);
  const setAlbum = useVaultStore((s) => s.setAlbum);
  const setSearch = useVaultStore((s) => s.setSearch);
  const setPriceInput = useVaultStore((s) => s.setPriceInput);
  const setOpen = useVaultStore((s) => s.setOpen);
  const clearSelection = useVaultStore((s) => s.clearSelection);
  const draft = useAiStore((s) => s.draftText);
  const [searchInput, setSearchInput] = useState(search);
  const guardConfig = useGuardConfig();
  const guardState = useMemo(
    () => compileRendererGuardPolicy(guardConfig.data ?? null),
    [guardConfig.data],
  );

  const albums = useVaultAlbums(open ? accountId : null, open);
  const media = useVaultMedia(open ? accountId : null, albumId, search, open);
  const items = useMemo(
    () => (media.data?.pages ?? []).flatMap((page) => page.items),
    [media.data],
  );
  const rows = useMemo(() => chunkRows(items, GRID_COLUMNS), [items]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CELL_HEIGHT,
    overscan: 4,
  });

  const lockedText=useComposerStore(s=>s.options.lockedText);
  const price = parsePpvPrice(priceInput);
  const summary = deriveComposeSummary(selection, price, draft, lockedText);
  const guardVerdict = useMemo(
    () => scanDraftForDisplay(guardState, draft.trim()),
    [draft, guardState],
  );
  const guardReady = guardState.kind === 'ready';
  const guardBlocked = !guardReady || verdictBlocks(guardVerdict);
  const guardCategories = verdictCategories(guardVerdict);
  const customAlbums = (albums.data ?? []).filter((album) => album.custom);

  useEffect(() => {
    setCurrentGuardState(guardState);
  }, [guardState]);

  if (!open) return null;

  function onGridScroll(): void {
    const el = scrollRef.current;
    if (el === null) return;
    if (
      el.scrollHeight - el.scrollTop - el.clientHeight < 200 &&
      media.hasNextPage &&
      !media.isFetchingNextPage
    ) {
      void media.fetchNextPage();
    }
  }

  return (
    <div className="mx-[18px] mt-[9px] flex-none rounded-card border border-line-strong bg-bg1 shadow-soft">
      {/* header: albums + search */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="cap text-micro text-ink-low">VAULT</span>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <Chip selected={albumId === null} onClick={() => setAlbum(null)}>
            {t('sp.all')}
          </Chip>
          {customAlbums.map((album) => (
            <Chip
              key={album.id}
              selected={albumId === album.id}
              onClick={() => setAlbum(album.id)}
              title={`${album.mediaCount} ${pluralWord(locale, album.mediaCount, ['item', 'items'], ['элемент', 'элемента', 'элементов'])}`}
            >
              {album.name}
            </Chip>
          ))}
        </div>
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setSearch(searchInput);
          }}
          placeholder={t('vault.searchPh')}
          className="w-[150px] rounded-chip border border-line bg-bg2 px-2.5 py-1 text-[12.5px] outline-none focus:border-clay-line"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          title={t('vault.closeTip')}
          className="cursor-pointer px-1 text-ink-low hover:text-ink-mid"
        >
          ✕
        </button>
      </div>

      {/* virtualized thumb grid */}
      <div ref={scrollRef} onScroll={onGridScroll} className="h-[208px] overflow-y-auto px-3 py-2">
        {media.isPending ? (
          <div className="num py-8 text-center text-micro tracking-[0.1em] text-ink-low">
            {t('vault.loadingVault')}
          </div>
        ) : items.length === 0 ? (
          <div className="num py-8 text-center text-micro tracking-[0.1em] text-ink-low">
            {t('vault.noMediaFound')}
          </div>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              if (row === undefined) return null;
              return (
                <div
                  key={vi.key}
                  className="absolute top-0 left-0 grid w-full gap-2"
                  style={{
                    transform: `translateY(${vi.start}px)`,
                    gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                  }}
                >
                  {row.map((item) => (
                    <VaultCell key={item.id} item={item} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PPV COMPOSE SUMMARY — the mandatory misprice guard (PRD F7) */}
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-bg2 px-3 py-2">
        {selection.ids.length === 0 ? (
          <span className="text-[12.5px] text-ink-low">
            {t('vault.selectHint')}
          </span>
        ) : (
          <>
            <span className="num text-[12.5px] font-semibold text-ink-mid">
              {t('vault.selectionSummary', {
                items: `${selection.ids.length} ${pluralWord(locale, selection.ids.length, ['item', 'items'], ['элемент', 'элемента', 'элементов'])}`,
                previews: `${selection.previews.length} ${pluralWord(locale, selection.previews.length, ['free preview', 'free previews'], ['бесплатное превью', 'бесплатных превью', 'бесплатных превью'])}`,
              })}
            </span>
            <label className="flex items-center gap-1.5">
              <span className="cap text-micro text-ink-low">{t('vault.priceLabel')}</span>
              <input
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                placeholder={t('vault.pricePh')}
                inputMode="decimal"
                className={cx(
                  'num w-[72px] rounded-chip border bg-bg1 px-2 py-1 text-[13px] outline-none',
                  price.kind === 'invalid' ? 'border-bad text-bad' : 'border-line focus:border-clay-line',
                )}
              />
            </label>
            {price.kind === 'invalid' ? (
              <span className="text-[12px] text-bad">{t(price.reason.key, price.reason.params)}</span>
            ) : (
              <span
                className={cx(
                  'num rounded-full border px-2.5 py-0.5 text-micro font-semibold',
                  price.kind === 'paid'
                    ? 'border-green-line bg-green-bg text-green'
                    : 'border-line bg-bg1 text-ink-mid',
                )}
              >
                {price.kind === 'paid' ? `PPV $${price.dollars}` : 'FREE'}
              </span>
            )}
            {summary !== null && (
              <span className="num text-micro tracking-[0.06em] text-ink-low">
                {t('vault.captionLabel', {
                  state:
                    summary.caption === 'none'
                      ? t('vault.captionNone')
                      : summary.caption === 'locked'
                        ? t('vault.captionLocked')
                        : t('vault.captionVisible'),
                })}
              </span>
            )}
            {guardVerdict?.decision === 'block' && (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-[12px] text-bad">
                  {t('guard.ppvBlockedBanner')}
                </span>
                {guardCategories.map((category) => (
                  <span
                    key={category}
                    className="num rounded-full border border-bad/30 bg-bad/10 px-2 py-0.5 text-micro font-semibold text-bad"
                  >
                    {category === 'off_platform'
                      ? t('guard.chip.off_platform')
                      : category === 'red'
                        ? t('guard.chip.red')
                        : category === 'yellow'
                          ? t('guard.chip.yellow')
                          : t('guard.chip.custom')}
                  </span>
                ))}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="subtle" onClick={clearSelection}>
                {t('vault.clear')}
              </Button>
              {/* Explicit confirm: price restated in words on the button itself. */}
              <Button
                size="sm"
                variant="primary"
                disabled={!canSend || summary === null || guardBlocked}
                title={
                  !canSend
                    ? t('conv.cannotSendFallback')
                    : guardBlocked
                      ? t('guard.sendBlockedTooltip')
                      : t('vault.confirmTipCanSend')
                }
                onClick={() => sendPpvCompose({ accountId, chatId, canSend })}
              >
                {summary !== null
                  ? t(summary.confirmLabel.key, {
                      items: `${summary.confirmLabel.itemCount} ${pluralWord(locale, summary.confirmLabel.itemCount, ['item', 'items'], ['элемент', 'элемента', 'элементов'])}`,
                      dollars: summary.confirmLabel.dollars,
                    })
                  : t('vault.send')}
              </Button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
