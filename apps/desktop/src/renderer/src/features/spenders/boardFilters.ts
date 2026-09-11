import type { SpenderRowVM } from '../../../../preload/contract';

export interface BoardFilters {
  query: string;
  author: 'all' | 'model' | 'fan';
  history: 'all' | 'known' | 'unknown';
}

export const EMPTY_BOARD_FILTERS: BoardFilters = { query: '', author: 'all', history: 'all' };

/** Message evidence, not chat existence or the default false author flag. */
export function hasMessageEvidence(row: SpenderRowVM): boolean {
  return row.lastMessagePreview.trim().length > 0 ||
    [row.lastModelMessageAt, row.lastFanMessageAt].some((stamp) =>
      stamp !== null && Number.isFinite(Date.parse(stamp)),
    );
}

export function hasBoardFilters(filters: BoardFilters): boolean {
  return filters.query.trim().length > 0 || filters.author !== 'all' || filters.history !== 'all';
}

/** Filters only the supplied local roster. It never initiates history reads. */
export function filterBoardRows(rows: readonly SpenderRowVM[], filters: BoardFilters): SpenderRowVM[] {
  const needle = filters.query.trim().normalize('NFKC').toLocaleLowerCase();
  return rows.filter((row) => {
    if (needle && ![row.name, row.username ?? '', row.fanId].some((value) =>
      value.normalize('NFKC').toLocaleLowerCase().includes(needle),
    )) return false;
    const known = hasMessageEvidence(row);
    if (filters.history === 'known' && !known) return false;
    if (filters.history === 'unknown' && known) return false;
    if (filters.author !== 'all' && (!known || row.lastMessageIsSentByMe !== (filters.author === 'model'))) return false;
    return true;
  });
}

/** A saved chip can belong to a different account or a removed OM list. */
export function validBoardChip(chip: string, listIds: readonly string[]): string {
  return chip === 'all' || listIds.includes(chip) ? chip : 'all';
}
