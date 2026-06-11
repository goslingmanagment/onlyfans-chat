// Vault attach panel (PRD F7) — a dock-style surface above the composer (NOT
// a modal: the thread stays visible, DESIGN anti-goal "no modal dialogs inside
// the shift loop"). Album chips → search → virtualized thumb grid with ordered
// multi-select + preview-subset toggles → upload-from-disk with credit
// preflight → the mandatory PPV COMPOSE SUMMARY strip whose confirm button
// restates the price in words (misprice guard).

import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQueryClient } from '@tanstack/react-query';
import type { VaultItemVM } from '../../../../preload/contract';
import { getBridge } from '../../bridge/bridge';
import { useVaultAlbums, useVaultMedia } from '../../bridge/queries';
import { useAiStore } from '../ai/aiStore';
import { Chip } from '../../design/Chip';
import { Button } from '../../design/Button';
import { cx } from '../../lib/cx';
import { useVaultStore } from './vaultStore';
import {
  chunkRows,
  deriveComposeSummary,
  parsePpvPrice,
  selectionOrder,
} from './vaultLogic';
import { sendPpvCompose } from './ppvSendController';

const GRID_COLUMNS = 6;
const CELL_HEIGHT = 96;

function VaultCell({ item }: { item: VaultItemVM }): React.JSX.Element {
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
      title={item.isReady ? 'Attach / detach' : 'Still processing on OnlyFans'}
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
          title={isPreview ? 'Free preview — click to lock' : 'Locked — click to make a free preview'}
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

function UploadControls({ accountId }: { accountId: string }): React.JSX.Element {
  const upload = useVaultStore((s) => s.upload);
  const setUpload = useVaultStore((s) => s.setUpload);
  const queryClient = useQueryClient();

  async function pick(): Promise<void> {
    try {
      const picked = await getBridge().invoke('cmd:vault.pickFile', undefined);
      if (picked !== null) setUpload({ phase: 'picked', file: picked });
    } catch (error) {
      setUpload({ phase: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function confirmUpload(): Promise<void> {
    if (upload.phase !== 'picked') return;
    const file = upload.file;
    setUpload({ phase: 'uploading', file });
    try {
      await getBridge().invoke('cmd:vault.upload', { accountId, fileToken: file.token });
      setUpload({ phase: 'idle' });
      await queryClient.invalidateQueries({ queryKey: ['vault'] }); // new item lands in the grid
    } catch (error) {
      setUpload({ phase: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (upload.phase === 'picked' || upload.phase === 'uploading') {
    const { name, bytes, creditEstimate } = upload.file;
    return (
      <span className="num flex items-center gap-2 rounded-full border border-amber-line bg-amber-bg px-3 py-1 text-micro text-amber">
        {name} · {(bytes / 1_000_000).toFixed(1)} MB · ~{creditEstimate} credits
        {upload.phase === 'uploading' ? (
          <span className="animate-pulse font-bold">UPLOADING…</span>
        ) : (
          <>
            <button type="button" onClick={() => void confirmUpload()} className="cursor-pointer font-bold underline decoration-dotted">
              Upload
            </button>
            <button type="button" onClick={() => useVaultStore.getState().setUpload({ phase: 'idle' })} className="cursor-pointer underline decoration-dotted">
              Cancel
            </button>
          </>
        )}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {upload.phase === 'error' && (
        <span className="text-[12px] text-bad" title={upload.message}>
          upload failed
        </span>
      )}
      <Button size="sm" onClick={() => void pick()} title="Upload a file from disk into the vault (3 credits/MB)">
        ⤒ Upload
      </Button>
    </span>
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

  if (!open) return null;

  const price = parsePpvPrice(priceInput);
  const summary = deriveComposeSummary(selection, price, draft);
  const customAlbums = (albums.data ?? []).filter((album) => album.custom);

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
      {/* header: albums + search + upload */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="cap text-micro text-ink-low">VAULT</span>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <Chip selected={albumId === null} onClick={() => setAlbum(null)}>
            All
          </Chip>
          {customAlbums.map((album) => (
            <Chip
              key={album.id}
              selected={albumId === album.id}
              onClick={() => setAlbum(album.id)}
              title={`${album.mediaCount} items`}
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
          placeholder="Search vault…"
          className="w-[150px] rounded-chip border border-line bg-bg2 px-2.5 py-1 text-[12.5px] outline-none focus:border-clay-line"
        />
        <UploadControls accountId={accountId} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Close vault"
          className="cursor-pointer px-1 text-ink-low hover:text-ink-mid"
        >
          ✕
        </button>
      </div>

      {/* virtualized thumb grid */}
      <div ref={scrollRef} onScroll={onGridScroll} className="h-[208px] overflow-y-auto px-3 py-2">
        {media.isPending ? (
          <div className="num py-8 text-center text-micro tracking-[0.1em] text-ink-low">
            LOADING VAULT…
          </div>
        ) : items.length === 0 ? (
          <div className="num py-8 text-center text-micro tracking-[0.1em] text-ink-low">
            NO MEDIA FOUND
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
            Select media to attach — click again to detach, 🔒/FREE toggles the free-preview subset.
          </span>
        ) : (
          <>
            <span className="num text-[12.5px] font-semibold text-ink-mid">
              {selection.ids.length} {selection.ids.length === 1 ? 'item' : 'items'} ·{' '}
              {selection.previews.length} free preview{selection.previews.length === 1 ? '' : 's'}
            </span>
            <label className="flex items-center gap-1.5">
              <span className="cap text-micro text-ink-low">PRICE $</span>
              <input
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                placeholder="0 = free"
                inputMode="numeric"
                className={cx(
                  'num w-[72px] rounded-chip border bg-bg1 px-2 py-1 text-[13px] outline-none',
                  price.kind === 'invalid' ? 'border-bad text-bad' : 'border-line focus:border-clay-line',
                )}
              />
            </label>
            {price.kind === 'invalid' ? (
              <span className="text-[12px] text-bad">{price.reason}</span>
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
                caption: {summary.caption === 'none' ? 'none' : summary.caption === 'locked' ? 'locked behind paywall' : 'visible'}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="subtle" onClick={clearSelection}>
                Clear
              </Button>
              {/* Explicit confirm: price restated in words on the button itself. */}
              <Button
                size="sm"
                variant="primary"
                disabled={!canSend || summary === null}
                title={
                  canSend
                    ? 'Sends exactly what the summary states'
                    : 'OnlyFans does not allow messaging this fan right now'
                }
                onClick={() => sendPpvCompose({ accountId, chatId, canSend })}
              >
                {summary?.confirmLabel ?? 'Send'}
              </Button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
