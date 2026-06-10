import { describe, it, expect } from 'vitest';
import {
  chooseFormat,
  cropForBucket,
  cropForKeys,
  isGrayish,
  isNearBlack,
  isRaster,
  pickArchBucket,
  RASTER_PATH_FLOOR,
  SVG_PATH_LIMIT,
} from '@/lib/plan-prep/detect';
import type { ColorGroup, DecomposeResult } from '@/lib/plan-prep/types';

function group(key: string, color: [number, number, number], pathCount: number, bbox: ColorGroup['bbox']): ColorGroup {
  return { key, color, pathCount, bbox, paths: [] };
}

function result(groups: ColorGroup[]): DecomposeResult {
  return {
    groups,
    pageWidth: 1000,
    pageHeight: 800,
    totalPaths: groups.reduce((n, g) => n + g.pathCount, 0),
  };
}

describe('color predicates', () => {
  it('detects gray vs non-gray', () => {
    expect(isGrayish([170, 170, 170])).toBe(true);
    expect(isGrayish([168, 170, 166])).toBe(true); // within tolerance
    expect(isGrayish([170, 40, 40])).toBe(false);
  });
  it('detects near-black', () => {
    expect(isNearBlack([0, 0, 0])).toBe(true);
    expect(isNearBlack([20, 10, 5])).toBe(true);
    expect(isNearBlack([120, 120, 120])).toBe(false);
  });
});

describe('pickArchBucket', () => {
  it('picks the dominant mid-gray screen', () => {
    const groups = [
      group('168,168,168', [168, 168, 168], 8000, [50, 50, 900, 700]), // arch screen
      group('0,0,0', [0, 0, 0], 2000, [0, 0, 1000, 800]), // black discipline
      group('255,255,255', [255, 255, 255], 500, [0, 0, 1000, 800]), // white
    ];
    expect(pickArchBucket(groups)).toBe('168,168,168');
  });

  it('returns null when no gray screen dominates (ambiguous)', () => {
    const groups = [
      group('0,0,0', [0, 0, 0], 5000, [0, 0, 1000, 800]),
      group('200,30,30', [200, 30, 30], 4000, [0, 0, 1000, 800]),
    ];
    expect(pickArchBucket(groups)).toBeNull();
  });

  it('ignores an incidental gray that is a tiny share of the drawing', () => {
    const groups = [
      group('0,0,0', [0, 0, 0], 9000, [0, 0, 1000, 800]),
      group('150,150,150', [150, 150, 150], 50, [10, 10, 30, 30]), // stray gray note
    ];
    expect(pickArchBucket(groups)).toBeNull();
  });
});

describe('isRaster', () => {
  it('flags PDFs with almost no vector content', () => {
    expect(isRaster(result([group('0,0,0', [0, 0, 0], RASTER_PATH_FLOOR - 1, [0, 0, 1, 1])]))).toBe(true);
    expect(isRaster(result([group('0,0,0', [0, 0, 0], RASTER_PATH_FLOOR + 1, [0, 0, 1, 1])]))).toBe(false);
  });
});

describe('cropForBucket', () => {
  it('crops to the arch bbox with slight padding, clamped to the page', () => {
    const groups = [group('168,168,168', [168, 168, 168], 8000, [100, 100, 900, 700])];
    const crop = cropForBucket(groups, '168,168,168', 1000, 800);
    expect(crop[0]).toBeLessThanOrEqual(100);
    expect(crop[1]).toBeLessThanOrEqual(100);
    expect(crop[2]).toBeGreaterThanOrEqual(900);
    expect(crop[2]).toBeLessThanOrEqual(1000);
    expect(crop[3]).toBeLessThanOrEqual(800);
  });
  it('falls back to the full page when no key', () => {
    expect(cropForBucket([], null, 1000, 800)).toEqual([0, 0, 1000, 800]);
  });
});

describe('cropForKeys', () => {
  it('unions the bboxes of the kept groups', () => {
    const groups = [
      group('a', [1, 1, 1], 10, [100, 100, 200, 200]),
      group('b', [2, 2, 2], 10, [300, 50, 400, 600]),
      group('c', [3, 3, 3], 10, [0, 0, 1000, 800]),
    ];
    expect(cropForKeys(groups, ['a', 'b'], 1000, 800)).toEqual([100, 50, 400, 600]);
  });
});

describe('chooseFormat', () => {
  it('uses SVG under the path limit and PNG above it', () => {
    expect(chooseFormat(SVG_PATH_LIMIT - 1)).toBe('svg');
    expect(chooseFormat(SVG_PATH_LIMIT)).toBe('svg');
    expect(chooseFormat(SVG_PATH_LIMIT + 1)).toBe('png');
  });
});
