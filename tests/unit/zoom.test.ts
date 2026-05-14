import { describe, it, expect } from 'vitest';
import { ZOOM_MIN, ZOOM_MAX, clampZoom } from '@/lib/zoom';

describe('floor plan zoom bounds', () => {
  it('caps the maximum zoom at 1000%', () => {
    expect(ZOOM_MAX).toBe(10);
    expect(clampZoom(999)).toBe(10);
    expect(clampZoom(10.0001)).toBe(10);
  });

  it('allows zoom levels up to the 1000% cap unchanged', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(6)).toBe(6); // previously the hard cap
    expect(clampZoom(9.5)).toBe(9.5);
    expect(clampZoom(10)).toBe(10);
  });

  it('floors the minimum zoom at 30%', () => {
    expect(ZOOM_MIN).toBe(0.3);
    expect(clampZoom(0.001)).toBe(0.3);
  });
});
