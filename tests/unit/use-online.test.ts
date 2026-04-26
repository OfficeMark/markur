import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnline } from '@/hooks/useOnline';

describe('useOnline', () => {
  let onLineValue = true;

  beforeEach(() => {
    onLineValue = true;
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => onLineValue,
    });
    vi.useFakeTimers();
    // Stub fetch so the ping doesn't try to reach the network in tests.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 401 }))));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports the initial navigator.onLine value', () => {
    onLineValue = true;
    const { result } = renderHook(() => useOnline());
    expect(result.current.online).toBe(true);
  });

  it('flips to offline on the offline event', () => {
    const { result } = renderHook(() => useOnline());
    act(() => {
      onLineValue = false;
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.online).toBe(false);
  });

  it('flips back to online on the online event and updates lastSeen', () => {
    onLineValue = false;
    const { result } = renderHook(() => useOnline());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    const before = result.current.lastSeen;
    act(() => {
      vi.advanceTimersByTime(50);
      onLineValue = true;
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.online).toBe(true);
    expect(result.current.lastSeen).toBeGreaterThanOrEqual(before);
  });
});
