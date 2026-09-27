// D42: images load only while really visible (IntersectionObserver, rootMargin
// 0 — not `loading="lazy"`, which starts 1250–2500 px early). At most four at
// once, and visibility is re-checked right before a waiting cell gets a slot.

import { describe, expect, it } from 'vitest';
import { createMediaGate, type IntersectionObserverFactory } from '../../src/renderer/src/features/media/mediaGate';

function fakeIo() {
  let callback: Parameters<IntersectionObserverFactory>[0] = () => undefined;
  const observed = new Set<Element>();
  const factory: IntersectionObserverFactory = (cb) => {
    callback = cb;
    return {
      observe: (el) => observed.add(el),
      unobserve: (el) => observed.delete(el),
      disconnect: () => observed.clear(),
    };
  };
  return {
    factory,
    observed,
    show: (el: Element, isIntersecting = true) => callback([{ target: el, isIntersecting }]),
  };
}

const el = (name: string) => ({ name }) as unknown as Element;

describe('media visibility gate', () => {
  it('grants nothing until the element is visible', () => {
    const io = fakeIo();
    const gate = createMediaGate(io.factory, 4);
    const granted: string[] = [];
    const a = el('a');
    gate.watch(a, () => granted.push('a'));
    expect(io.observed.has(a)).toBe(true);
    expect(granted).toEqual([]);
    io.show(a);
    expect(granted).toEqual(['a']);
  });

  it('holds at most four slots and re-checks visibility before handing the next one out', () => {
    const io = fakeIo();
    const gate = createMediaGate(io.factory, 4);
    const tickets = new Map<string, { release(): void }>();
    const cells = ['a', 'b', 'c', 'd', 'e', 'f'].map(el);
    for (const cell of cells) {
      const name = (cell as unknown as { name: string }).name;
      gate.watch(cell, (ticket) => tickets.set(name, ticket));
      io.show(cell);
    }
    expect([...tickets.keys()]).toEqual(['a', 'b', 'c', 'd']);
    expect(gate.activeCount()).toBe(4);
    // `e` scrolled away while it waited: it must not start when a slot frees.
    io.show(cells[4]!, false);
    tickets.get('a')?.release();
    expect([...tickets.keys()]).toEqual(['a', 'b', 'c', 'd', 'f']);
    // Visible again → queued again.
    tickets.get('b')?.release();
    io.show(cells[4]!, true);
    expect([...tickets.keys()]).toContain('e');
    expect(gate.activeCount()).toBeLessThanOrEqual(4);
  });

  it('a released ticket frees exactly one slot, and stop() cancels a waiting cell', () => {
    const io = fakeIo();
    const gate = createMediaGate(io.factory, 1);
    const granted: string[] = [];
    const tickets: Array<{ release(): void }> = [];
    const x = el('x');
    const y = el('y');
    gate.watch(x, (ticket) => {
      granted.push('x');
      tickets.push(ticket);
    });
    const stopY = gate.watch(y, () => granted.push('y'));
    io.show(x);
    io.show(y); // no free slot: y waits
    stopY(); // …and is cancelled while waiting
    tickets[0]?.release();
    tickets[0]?.release(); // idempotent
    expect(granted).toEqual(['x']);
    expect(gate.activeCount()).toBe(0);
  });
});
