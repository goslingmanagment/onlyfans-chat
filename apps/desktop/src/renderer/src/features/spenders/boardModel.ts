// Pure view-model for the Spenders board list (binding mockup
// docs/mockups/spenders-contact-columns.html): «Все» = tier sections with per-shelf previews
// and collapsed big tiers; a tier chip = flat list. Kept pure for tests.

import { shelfPresentation, splitTierLabel } from '@chatgoose/shared';
import type { SpenderListVM, SpenderRowVM } from '../../../../preload/contract';
import { DEFAULT_CONTACT_SORT, sortRowsByContact, type ContactSort } from './contactAge';
import { EMPTY_BOARD_FILTERS, filterBoardRows, hasBoardFilters, type BoardFilters } from './boardFilters';

export interface ShelfData {
  list: SpenderListVM;
  /** undefined = roster query not loaded yet (or not enabled). */
  rows: SpenderRowVM[] | undefined;
  truncated: boolean;
  error?: boolean;
  fetching?: boolean;
}

export type BoardItem =
  | { kind: 'tier'; key: string; listId: string; title: string; band: string | null; count: number; matches?: number }
  | { kind: 'row'; key: string; row: SpenderRowVM }
  | { kind: 'more'; key: string; listId: string; tierTitle: string; hidden: number }
  | {
      kind: 'collapsed';
      key: string;
      listId: string;
      title: string;
      band: string | null;
      count: number | null;
    }
  | { kind: 'loading'; key: string }
  | { kind: 'error'; key: string; listId: string; stale: boolean; fetching: boolean }
  | { kind: 'truncated'; key: string };

export interface BoardModel {
  items: BoardItem[];
  /** Flat fan rows in display order — the J/K navigation pool. */
  fanRows: SpenderRowVM[];
  /** All loaded rows in the same order, before shelf previews are clipped.
   *  Keeps an open fan resolvable when a new message moves it out of a preview. */
  loadedRows: SpenderRowVM[];
}

const UNTIERED_ID = '__untiered__';

export function buildAllView(args: {
  shelves: ShelfData[];
  expanded: Record<string, true>;
  untiered: { open: boolean; rows: SpenderRowVM[] | undefined; loading: boolean; error?: boolean; fetching?: boolean };
  sort?: ContactSort;
  filters?: BoardFilters;
}): BoardModel {
  const items: BoardItem[] = [];
  const fanRows: SpenderRowVM[] = [];
  const loadedRows: SpenderRowVM[] = [];
  const filters = args.filters ?? EMPTY_BOARD_FILTERS;
  const filtering = hasBoardFilters(filters);

  args.shelves.forEach((shelf, index) => {
    const { list, rows } = shelf;
    const label = splitTierLabel(list.name);
    const isExpanded = args.expanded[list.id] === true;
    const presentation = shelfPresentation(index, list.usersCount);
    const allRows = rows === undefined ? undefined : sortRowsByContact(rows, args.sort ?? DEFAULT_CONTACT_SORT);
    if (allRows !== undefined) loadedRows.push(...allRows);
    const ordered = allRows === undefined ? undefined : filterBoardRows(allRows, filters);
    if (filtering && ordered?.length === 0 && !shelf.error && !shelf.truncated) return;

    if (!isExpanded && presentation.kind === 'collapsed' && !(filtering && ordered !== undefined) && !shelf.error) {
      items.push({
        kind: 'collapsed',
        key: `collapsed:${list.id}`,
        listId: list.id,
        title: label.title,
        band: label.band,
        count: list.usersCount,
      });
      return;
    }

    items.push({
      kind: 'tier',
      key: `tier:${list.id}`,
      listId: list.id,
      title: label.title,
      band: label.band,
      count: list.usersCount,
      ...(filtering && ordered !== undefined ? { matches: ordered.length } : {}),
    });
    if (shelf.error) {
      items.push({ kind: 'error', key: `error:${list.id}`, listId: list.id, stale: ordered !== undefined, fetching: shelf.fetching === true });
    }
    if (ordered === undefined) {
      if (!shelf.error) items.push({ kind: 'loading', key: `loading:${list.id}` });
      return;
    }
    const visible = isExpanded || filtering ? ordered : ordered.slice(0, presentation.kind === 'preview' ? presentation.previewCount : ordered.length);
    for (const row of visible) {
      items.push({ kind: 'row', key: `row:${row.fanId}`, row });
      fanRows.push(row);
    }
    const hidden = ordered.length - visible.length;
    if (hidden > 0) {
      items.push({
        kind: 'more',
        key: `more:${list.id}`,
        listId: list.id,
        tierTitle: label.title,
        hidden,
      });
    }
    if ((isExpanded || filtering) && shelf.truncated) {
      items.push({ kind: 'truncated', key: `truncated:${list.id}` });
    }
  });

  // «Без тира» — final section; count unknown until its rosters are loaded.
  const allUntiered = sortRowsByContact(args.untiered.rows ?? [], args.sort ?? DEFAULT_CONTACT_SORT);
  loadedRows.push(...allUntiered);
  const untieredRows = filterBoardRows(allUntiered, filters);
  if (filtering && args.untiered.rows !== undefined && untieredRows.length === 0 && !args.untiered.error) {
    return { items, fanRows, loadedRows };
  }
  if (!args.untiered.open && !(filtering && args.untiered.rows !== undefined) && !args.untiered.error) {
    items.push({
      kind: 'collapsed',
      key: `collapsed:${UNTIERED_ID}`,
      listId: UNTIERED_ID,
      title: '', // rendered via the catalog ('sp.untiered') by the surface
      band: null,
      count: null,
    });
  } else {
    items.push({
      kind: 'tier',
      key: `tier:${UNTIERED_ID}`,
      listId: UNTIERED_ID,
      title: '',
      band: null,
      count: args.untiered.rows?.length ?? 0,
      ...(filtering && args.untiered.rows !== undefined ? { matches: untieredRows.length } : {}),
    });
    if (args.untiered.error) {
      items.push({ kind: 'error', key: `error:${UNTIERED_ID}`, listId: UNTIERED_ID, stale: args.untiered.rows !== undefined, fetching: args.untiered.fetching === true });
    }
    if (args.untiered.rows === undefined) {
      if (!args.untiered.error) items.push({ kind: 'loading', key: `loading:${UNTIERED_ID}` });
    } else {
      for (const row of untieredRows) {
        items.push({ kind: 'row', key: `row:${row.fanId}`, row });
        fanRows.push(row);
      }
    }
  }

  return { items, fanRows, loadedRows };
}

export function buildFlatView(shelf: ShelfData | null, sort: ContactSort = DEFAULT_CONTACT_SORT, filters: BoardFilters = EMPTY_BOARD_FILTERS): BoardModel {
  if (shelf === null) return { items: [], fanRows: [], loadedRows: [] };
  if (shelf.rows === undefined) {
    if (shelf.error) return { items: [{ kind: 'error', key: 'error:flat', listId: shelf.list.id, stale: false, fetching: shelf.fetching === true }], fanRows: [], loadedRows: [] };
    return { items: [{ kind: 'loading', key: 'loading:flat' }], fanRows: [], loadedRows: [] };
  }
  const loadedRows = sortRowsByContact(shelf.rows, sort);
  const rows = filterBoardRows(loadedRows, filters);
  const items: BoardItem[] = rows.map((row) => ({
    kind: 'row' as const,
    key: `row:${row.fanId}`,
    row,
  }));
  if (shelf.error) items.unshift({ kind: 'error', key: 'error:flat', listId: shelf.list.id, stale: true, fetching: shelf.fetching === true });
  if (shelf.truncated) items.push({ kind: 'truncated', key: 'truncated:flat' });
  return { items, fanRows: rows, loadedRows };
}

export { UNTIERED_ID };
