// Pure view-model for the Supporters board list (binding mockup
// docs/mockups/supporters.html): «Все» = tier sections with per-shelf previews
// and collapsed big tiers; a tier chip = flat list. Kept pure for tests.

import { shelfPresentation, splitTierLabel } from '@chatgoose/shared';
import type { SupporterListVM, SupporterRowVM } from '../../../../preload/contract';

export interface ShelfData {
  list: SupporterListVM;
  /** undefined = roster query not loaded yet (or not enabled). */
  rows: SupporterRowVM[] | undefined;
  truncated: boolean;
}

export type BoardItem =
  | { kind: 'tier'; key: string; listId: string; title: string; band: string | null; count: number }
  | { kind: 'row'; key: string; row: SupporterRowVM }
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
  fanRows: SupporterRowVM[];
}

const UNTIERED_ID = '__untiered__';

export function buildAllView(args: {
  shelves: ShelfData[];
  expanded: Record<string, true>;
  untiered: { open: boolean; rows: SupporterRowVM[] | undefined; loading: boolean };
}): BoardModel {
  const items: BoardItem[] = [];
  const fanRows: SupporterRowVM[] = [];

  args.shelves.forEach((shelf, index) => {
    const { list, rows } = shelf;
    const label = splitTierLabel(list.name);
    const isExpanded = args.expanded[list.id] === true;
    const presentation = shelfPresentation(index, list.usersCount);

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
    if (rows === undefined) {
      items.push({ kind: 'loading', key: `loading:${list.id}` });
      return;
    }
    const visible = isExpanded ? rows : rows.slice(0, presentation.kind === 'preview' ? presentation.previewCount : rows.length);
    for (const row of visible) {
      items.push({ kind: 'row', key: `row:${row.fanId}`, row });
      fanRows.push(row);
    }
    const hidden = rows.length - visible.length;
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
  if (!args.untiered.open) {
    items.push({
      kind: 'collapsed',
      key: `collapsed:${UNTIERED_ID}`,
      listId: UNTIERED_ID,
      title: '', // rendered via the catalog ('sup.untiered') by the surface
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
      for (const row of args.untiered.rows) {
        items.push({ kind: 'row', key: `row:${row.fanId}`, row });
        fanRows.push(row);
      }
    }
  }

  return { items, fanRows };
}

export function buildFlatView(shelf: ShelfData | null): BoardModel {
  if (shelf === null || shelf.rows === undefined) {
    return { items: [{ kind: 'loading', key: 'loading:flat' }], fanRows: [] };
  }
  const items: BoardItem[] = shelf.rows.map((row) => ({
    kind: 'row' as const,
    key: `row:${row.fanId}`,
    row,
  }));
  if (shelf.truncated) items.push({ kind: 'truncated', key: 'truncated:flat' });
  return { items, fanRows: shelf.rows };
}

export { UNTIERED_ID };
