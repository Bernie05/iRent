import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const SWIPE_PX = 40;

/**
 * Shared carousel state (public promos, renter announcements): one slide at a time, wraps around, ← → keys and a
 * touch/pen swipe on the region. No autoplay and no animation, so reduced motion needs nothing extra.
 * Spread `regionProps` on the carousel region and give it `touch-pan-y` so vertical scrolling still works.
 */
export function useCarousel(count: number) {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const current = Math.min(index, Math.max(count - 1, 0));
  const many = count > 1;
  const go = (i: number) => setIndex(((i % count) + count) % count);

  const regionProps = {
    onKeyDown: (e: KeyboardEvent) => {
      if (!many) return;
      if (e.key === 'ArrowLeft') go(current - 1);
      if (e.key === 'ArrowRight') go(current + 1);
    },
    onPointerDown: (e: PointerEvent) => {
      startX.current = e.pointerType === 'mouse' ? null : e.clientX;
    },
    onPointerUp: (e: PointerEvent) => {
      const dx = startX.current === null ? 0 : e.clientX - startX.current;
      startX.current = null;
      if (many && Math.abs(dx) > SWIPE_PX) go(current + (dx < 0 ? 1 : -1));
    },
    onPointerCancel: () => {
      startX.current = null;
    },
  };

  return { current, many, go, prev: () => go(current - 1), next: () => go(current + 1), regionProps };
}
