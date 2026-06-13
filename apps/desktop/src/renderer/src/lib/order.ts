// Pure ordering helpers for the drag-sortable account rail (settings.accountOrder).
// Unit tested in tests/renderer/order.test.ts.

/**
 * Stable reorder: items whose id appears in `orderedIds` come first, in that
 * order; the rest keep their original relative order, appended after. Unknown
 * ids in `orderedIds` are ignored, so a stale saved order self-heals.
 */
export function applyOrder<T>(
  items: readonly T[],
  getId: (item: T) => string,
  orderedIds: readonly string[],
): T[] {
  const rank = new Map<string, number>();
  orderedIds.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const ranked: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (rank.has(getId(item)) ? ranked : rest).push(item);
  }
  ranked.sort((a, b) => (rank.get(getId(a)) ?? 0) - (rank.get(getId(b)) ?? 0));
  return [...ranked, ...rest];
}

/** Move the element at `from` to index `to`, returning a new array. */
export function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

/**
 * New id order after dropping `dragId` onto `targetId`, inserting before or
 * after the target. Returns the unchanged array when the drop is a no-op
 * (dropping onto itself or its current neighbour edge).
 */
export function computeReorder(
  ids: readonly string[],
  dragId: string,
  targetId: string,
  pos: 'before' | 'after',
): string[] {
  const from = ids.indexOf(dragId);
  const targetIndex = ids.indexOf(targetId);
  if (from === -1 || targetIndex === -1) return [...ids];
  // Index where the dragged item should land, in the pre-removal coordinate space.
  let to = pos === 'after' ? targetIndex + 1 : targetIndex;
  // Removing the dragged item shifts everything after it left by one.
  if (from < to) to -= 1;
  if (to === from) return [...ids];
  return arrayMove(ids, from, to);
}
