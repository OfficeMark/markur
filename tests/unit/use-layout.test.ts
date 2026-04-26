import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayout } from '@/hooks/useLayout';

function setViewport(width: number, isCoarse = false) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  // matchMedia mock
  window.matchMedia = ((query: string) => ({
    matches: query === '(pointer: coarse)' ? isCoarse : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe('useLayout', () => {
  const realInnerWidth = window.innerWidth;
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    // jsdom doesn't ship matchMedia; install our mock per-test.
    setViewport(1280);
    // Stabilize requestAnimationFrame for synchronous reads.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: realInnerWidth });
    if (realMatchMedia) window.matchMedia = realMatchMedia;
    vi.unstubAllGlobals();
  });

  it('reports desktop at 1280', () => {
    setViewport(1280);
    const { result } = renderHook(() => useLayout());
    expect(result.current.kind).toBe('desktop');
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isPhone).toBe(false);
    expect(result.current.isTablet).toBe(false);
  });

  it('reports tablet at 900', () => {
    setViewport(900);
    const { result } = renderHook(() => useLayout());
    expect(result.current.kind).toBe('tablet');
    expect(result.current.isTablet).toBe(true);
  });

  it('reports phone at 390', () => {
    setViewport(390);
    const { result } = renderHook(() => useLayout());
    expect(result.current.kind).toBe('phone');
    expect(result.current.isPhone).toBe(true);
  });

  it('reads pointer:coarse when matchMedia matches', () => {
    setViewport(390, true);
    const { result } = renderHook(() => useLayout());
    expect(result.current.isTouch).toBe(true);
  });

  it('updates kind on resize', () => {
    setViewport(1280);
    const { result } = renderHook(() => useLayout());
    expect(result.current.kind).toBe('desktop');

    act(() => {
      setViewport(700);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.kind).toBe('phone');
  });

  it('maps boundary widths cleanly: 768 = tablet, 1024 = desktop', () => {
    setViewport(768);
    const a = renderHook(() => useLayout());
    expect(a.result.current.kind).toBe('tablet');
    a.unmount();
    setViewport(1024);
    const b = renderHook(() => useLayout());
    expect(b.result.current.kind).toBe('desktop');
    b.unmount();
  });
});
