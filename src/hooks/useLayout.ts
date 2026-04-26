import { useEffect, useState } from 'react';

/**
 * Layout breakpoint detection (M8). Per spec 02 / 08:
 *   * phone   — < 768px  (single-column, bottom-sheet drawer, hamburger nav)
 *   * tablet  — 768..1023 (collapsible sidebar via hamburger, side drawer)
 *   * desktop — ≥ 1024px (full sidebar visible, side drawer)
 *
 * Also exposes `isTouch` (no fine pointer or coarse-only) for tap-target
 * sizing. SSR-safe — defaults to desktop / no-touch on first render.
 */

export type LayoutKind = 'phone' | 'tablet' | 'desktop';

export type Layout = {
  kind: LayoutKind;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** True iff the primary input is coarse (touch). */
  isTouch: boolean;
  /** Latest viewport width in CSS pixels. Useful for fine-grained decisions. */
  width: number;
};

const PHONE_MAX = 767;
const TABLET_MAX = 1023;

function readLayout(): Layout {
  if (typeof window === 'undefined') {
    return {
      kind: 'desktop',
      isPhone: false,
      isTablet: false,
      isDesktop: true,
      isTouch: false,
      width: 1280,
    };
  }
  const w = window.innerWidth;
  const kind: LayoutKind =
    w <= PHONE_MAX ? 'phone' : w <= TABLET_MAX ? 'tablet' : 'desktop';
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  return {
    kind,
    isPhone: kind === 'phone',
    isTablet: kind === 'tablet',
    isDesktop: kind === 'desktop',
    isTouch,
    width: w,
  };
}

export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(() => readLayout());

  useEffect(() => {
    let frame = 0;
    function onResize() {
      // Coalesce resize events to one rerender per animation frame.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setLayout((prev) => {
          const next = readLayout();
          if (
            next.kind === prev.kind &&
            next.isTouch === prev.isTouch &&
            next.width === prev.width
          ) {
            return prev;
          }
          return next;
        });
      });
    }
    window.addEventListener('resize', onResize);
    // Pointer-coarse can change on Surface-style devices that toggle modes.
    const mql = window.matchMedia('(pointer: coarse)');
    const onPointerChange = () => onResize();
    mql.addEventListener?.('change', onPointerChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      mql.removeEventListener?.('change', onPointerChange);
    };
  }, []);

  return layout;
}
