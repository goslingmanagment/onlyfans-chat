// Pure view-model for the Spenders board list (binding mockup
// docs/mockups/spenders-contact-columns.html): «Все» = tier sections with per-shelf previews
// and collapsed big tiers; a tier chip = flat list. Kept pure for tests.

import { shelfPresentation, splitTierLabel } from '@chatgoose/shared';
import type { SpenderListVM, SpenderRowVM } from '../../../../preload/contract';
import { DEFAULT_CONTACT_SORT, sortRowsByContact, type ContactSort } from './contactAge';

export interface ShelfData {
  list: SpenderListVM;
  /** undefined = roster query not loaded yet (or not enabled). */
  rows: SpenderRowVM[] | undefined;
  truncated: boolean;
}

export type BoardItem =
  | { kind: 'tier'; key: string; listId: string; title: string; band: string | null; count: number }
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
  untiered: { open: boolean; rows: SpenderRowVM[] | undefined; loading: boolean };
  sort?: ContactSort;
}): BoardModel {
  const items: BoardItem[] = [];
  const fanRows: SpenderRowVM[] = [];
  const loadedRows: SpenderRowVM[] = [];

  args.shelves.forEach((shelf, index) => {
    const { list, rows } = shelf;
    const label = splitTierLabel(list.name);
    const isExpanded = args.expanded[list.id] === true;
    const presentation = shelfPresentation(index, list.usersCount);
    const ordered = rows === undefined ? undefined : sortRowsByContact(rows, args.sort ?? DEFAULT_CONTACT_SORT);
    if (ordered !== undefined) loadedRows.push(...ordered);

    if (!isExpanded && presentation.kind === 'collapsed') {
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
    });
    if (ordered === undefined) {
      items.push({ kind: 'loading', key: `loading:${list.id}` });
      return;
    }
    const visible = isExpanded ? ordered : ordered.slice(0, presentation.kind === 'preview' ? presentation.previewCount : ordered.length);
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
    if (isExpanded && shelf.truncated) {
      items.push({ kind: 'truncated', key: `truncated:${list.id}` });
    }
  });

  // «Без тира» — final section; count unknown until its rosters are loaded.
  const untieredRows = sortRowsByContact(args.untiered.rows ?? [], args.sort ?? DEFAULT_CONTACT_SORT);
  loadedRows.push(...untieredRows);
  if (!args.untiered.open) {
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
    });
    if (args.untiered.rows === undefined || args.untiered.loading) {
      items.push({ kind: 'loading', key: `loading:${UNTIERED_ID}` });
    } else {
      for (const row of untieredRows) {
        items.push({ kind: 'row', key: `row:${row.fanId}`, row });
        fanRows.push(row);
      }
    }
  }

  return { items, fanRows, loadedRows };
}

export function buildFlatView(shelf: ShelfData | null, sort: ContactSort = DEFAULT_CONTACT_SORT): BoardModel {
  if (shelf === null || shelf.rows === undefined) {
    return { items: [{ kind: 'loading', key: 'loading:flat' }], fanRows: [], loadedRows: [] };
  }
  const rows = sortRowsByContact(shelf.rows, sort);
  const items: BoardItem[] = rows.map((row) => ({
    kind: 'row' as const,
    key: `row:${row.fanId}`,
    row,
  }));
  if (shelf.truncated) items.push({ kind: 'truncated', key: 'truncated:flat' });
  return { items, fanRows: rows, loadedRows: rows };
}

export { UNTIERED_ID };
