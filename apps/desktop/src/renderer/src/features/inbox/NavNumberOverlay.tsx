// ⌘1..9 number overlay — a SINGLE layer over the chat list (DESIGN §3: no
// per-row badge inside ChatRow, which would re-render up to N memoized rows on
// every hold/release). Mounts as a sibling of the virtual rows inside the same
// `relative` sized container, so its absolute children share that scrolled
// coordinate space. While the mod key is held it paints one neutral badge over
// each of the first ≤9 rows; on release it unmounts entirely (one render, zero
// badges). The N virtualized rows never re-render.

import { useNavOverlayStore } from '../../state/navOverlayStore';

/** ⌘1..9 address the first nine chats; the rest stay on J/K/⌘U/⌘K. */
const MAX_NAV_BADGES = 9;

export function NavNumberOverlay({
  count,
  rowHeight,
}: {
  /** Length of the current filtered list — badges cover min(count, 9). */
  count: number;
  /** Fixed row height (must match ChatRow `h-16` / the virtualizer estimate). */
  rowHeight: number;
}): React.JSX.Element | null {
  // The ONLY subscriber to modHeld — holding/releasing the mod key re-renders
  // just this layer, never the rows.
  const modHeld = useNavOverlayStore((s) => s.modHeld);
  if (!modHeld) return null;

  const badges = Math.min(count, MAX_NAV_BADGES);
  if (badges === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: badges }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 left-0 flex h-16 w-[54px] items-center justify-center pl-[14px]"
          style={{ transform: `translateY(${i * rowHeight}px)` }}
        >
          {/* neutral ink chip (not the clay attention color) centered over the
              avatar; a bg1 ring separates it from the photo underneath. Text is
              bg1 (the chip's own inverse), NOT literal white, so the digit
              flips WITH the theme: on dark the ink fill lifts to ivory and the
              digit drops to the panel tone, staying legible — a pure-white
              digit would all but vanish on that light chip. */}
          <span className="num flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-semibold text-bg1 shadow-pop ring-2 ring-bg1">
            {i + 1}
          </span>
        </div>
      ))}
    </div>
  );
}
