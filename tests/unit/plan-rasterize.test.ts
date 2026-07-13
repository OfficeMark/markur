import { describe, expect, it } from 'vitest';
import {
  MAX_PLATE_EDGE,
  clampCrop,
  fitScale,
  isFullCrop,
  pdfRenderScale,
  pickSmallerPlate,
} from '@/lib/plan-prep/rasterize';
import { plateExtForBlob, platePathForFloor } from '@/lib/upload';
import { stampPlanPrep, PLAN_PIPELINE_VERSION } from '@/lib/plan-prep/types';

describe('plan prep — cap scaling (raster)', () => {
  it('pins the bytes-diet cap (deliberate: half the pixels of the old 4096)', () => {
    expect(MAX_PLATE_EDGE).toBe(3000);
  });

  it('fitScale never upscales and caps the long edge at MAX_PLATE_EDGE', () => {
    // Already small → no change.
    expect(fitScale(800, 600)).toBe(1);
    // Exactly at cap → no change.
    expect(fitScale(MAX_PLATE_EDGE, 2000)).toBe(1);
    // Over cap on the long edge → downscale so long edge hits the cap.
    const big = MAX_PLATE_EDGE * 2;
    expect(fitScale(big, MAX_PLATE_EDGE)).toBeCloseTo(0.5, 5);
    expect(big * fitScale(big, MAX_PLATE_EDGE)).toBeCloseTo(MAX_PLATE_EDGE, 5);
  });

  it('fitScale is orientation-agnostic (uses the longest edge)', () => {
    expect(fitScale(MAX_PLATE_EDGE, MAX_PLATE_EDGE * 2)).toBeCloseTo(0.5, 5);
  });
});

describe('plan prep — pdf render scale (vector)', () => {
  it('upscales small vector pages toward the cap, bounded at 4x', () => {
    // A page whose long edge quarters the cap (or less) hits the 4× bound.
    const smallEdge = MAX_PLATE_EDGE / 4;
    expect(pdfRenderScale(smallEdge * 0.8, smallEdge)).toBe(4);
    // A large page downscales to hit the cap exactly.
    const big = MAX_PLATE_EDGE * 2;
    expect(pdfRenderScale(big, MAX_PLATE_EDGE)).toBeCloseTo(0.5, 5);
    expect(big * pdfRenderScale(big, MAX_PLATE_EDGE)).toBeCloseTo(MAX_PLATE_EDGE, 5);
  });
});

describe('plan prep — plate encoder format choice (bytes diet)', () => {
  const blob = (size: number, type: string) =>
    new Blob([new Uint8Array(size)], { type });

  it('keeps the smaller encoding; ties go to PNG (lossless)', () => {
    const png = blob(1000, 'image/png');
    const jpg = blob(300, 'image/jpeg');
    expect(pickSmallerPlate(png, jpg)).toBe(jpg);
    const bigJpg = blob(2000, 'image/jpeg');
    expect(pickSmallerPlate(png, bigJpg)).toBe(png);
    const tie = blob(1000, 'image/jpeg');
    expect(pickSmallerPlate(png, tie)).toBe(png);
  });

  it('plateExtForBlob maps the winner to its storage extension', () => {
    expect(plateExtForBlob(blob(1, 'image/jpeg'))).toBe('jpg');
    expect(plateExtForBlob(blob(1, 'image/png'))).toBe('png');
    // Anything unexpected falls back to png (safe, lossless).
    expect(plateExtForBlob(blob(1, ''))).toBe('png');
  });
});

describe('plan prep — metadata stamp + plate path', () => {
  it('platePathForFloor is the canonical plate slot, extension by format', () => {
    expect(platePathForFloor('abc-123')).toBe('abc-123.plate.png');
    expect(platePathForFloor('abc-123', 'jpg')).toBe('abc-123.plate.jpg');
  });

  it('stampPlanPrep carries the pipeline version + fields; recipe only when given', () => {
    const m = stampPlanPrep({ processed: true, source: 'image', enhanced: false });
    expect(m.version).toBe(PLAN_PIPELINE_VERSION);
    expect(m.processed).toBe(true);
    expect(m.source).toBe('image');
    expect(m.enhanced).toBe(false);
    expect(typeof m.processedAt).toBe('string');
    expect('recipe' in m).toBe(false);

    const fallback = stampPlanPrep({ processed: false, source: 'scan', enhanced: false });
    expect(fallback.processed).toBe(false);
  });
});

describe('plan prep v2 — crop-to-plan math', () => {
  it('clampCrop keeps the rect inside [0,1] with a minimum size and x+w ≤ 1', () => {
    // In-bounds rect unchanged.
    expect(clampCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 })).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    // Over-right: width shrinks so x+w ≤ 1.
    const r = clampCrop({ x: 0.8, y: 0, w: 0.5, h: 1 });
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    // Negative origin clamps to 0.
    expect(clampCrop({ x: -0.3, y: -0.3, w: 0.5, h: 0.5 }).x).toBe(0);
    // Below-minimum size is bumped up to the floor.
    expect(clampCrop({ x: 0, y: 0, w: 0.001, h: 0.001 }).w).toBeGreaterThanOrEqual(0.05);
  });

  it('isFullCrop recognizes the whole-plate rect (nothing to crop)', () => {
    expect(isFullCrop({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isFullCrop({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(false);
    expect(isFullCrop({ x: 0, y: 0, w: 0.5, h: 1 })).toBe(false);
  });
});
