import { describe, expect, it } from 'vitest';
import { applyOrder, arrayMove, computeReorder } from '../../src/renderer/src/lib/order';

const id = (x: string): string => x;

describe('applyOrder', () => {
  it('orders ranked items first, in saved order', () => {
    expect(applyOrder(['a', 'b', 'c'], id, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('appends unranked items after, keeping their original order', () => {
    // d, e are not in the saved order → stay alphabetical (input order) at the end
    expect(applyOrder(['a', 'b', 'c', 'd', 'e'], id, ['c', 'a'])).toEqual([
      'c',
      'a',
      'b',
      'd',
      'e',
    ]);
  });

  it('ignores stale ids in the saved order (self-healing)', () => {
    expect(applyOrder(['a', 'b'], id, ['ghost', 'b', 'gone', 'a'])).toEqual(['b', 'a']);
  });

  it('is identity for an empty saved order', () => {
    expect(applyOrder(['a', 'b', 'c'], id, [])).toEqual(['a', 'b', 'c']);
  });

  it('works on objects via getId', () => {
    const items = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    expect(applyOrder(items, (o) => o.id, ['z', 'x']).map((o) => o.id)).toEqual(['z', 'x', 'y']);
  });
});

describe('arrayMove', () => {
  it('moves an element forward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('moves an element backward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('computeReorder', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('drops before a later tile', () => {
    expect(computeReorder(ids, 'a', 'c', 'before')).toEqual(['b', 'a', 'c', 'd']);
  });

  it('drops after a later tile (to the end)', () => {
    expect(computeReorder(ids, 'a', 'd', 'after')).toEqual(['b', 'c', 'd', 'a']);
  });

  it('drops before an earlier tile', () => {
    expect(computeReorder(ids, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('drops after an earlier tile', () => {
    expect(computeReorder(ids, 'd', 'a', 'after')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a no-op when dropping onto itself', () => {
    expect(computeReorder(ids, 'b', 'b', 'before')).toEqual(ids);
    expect(computeReorder(ids, 'b', 'b', 'after')).toEqual(ids);
  });

  it('is a no-op when the drop lands on the dragged tile’s current edge', () => {
    // 'a' is already right before 'b' → before('b') changes nothing
    expect(computeReorder(ids, 'a', 'b', 'before')).toEqual(ids);
    // 'b' is already right after 'a' → after('a') changes nothing
    expect(computeReorder(ids, 'b', 'a', 'after')).toEqual(ids);
  });

  it('returns a copy when an id is unknown', () => {
    const out = computeReorder(ids, 'ghost', 'a', 'before');
    expect(out).toEqual(ids);
    expect(out).not.toBe(ids);
  });
});
