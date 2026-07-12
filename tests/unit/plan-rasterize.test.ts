import { describe, expect, it } from 'vitest';
import { MAX_PLATE_EDGE, fitScale, pdfRenderScale } from '@/lib/plan-prep/rasterize';
import { platePathForFloor } from '@/lib/upload';
import { stampPlanPrep, PLAN_PIPELINE_VERSION } from '@/lib/plan-prep/types';

describe('plan prep v2 — cap scaling (raster)', () => {
  it('fitScale never upscales and caps the long edge at MAX_PLATE_EDGE', () => {
    // Already small → no change.
    expect(fitScale(800, 600)).toBe(1);
    // Exactly at cap → no change.
    expect(fitScale(MAX_PLATE_EDGE, 2000)).toBe(1);
    // Over cap on the long edge → downscale so long edge hits the cap.
    expect(fitScale(8192, 4096)).toBeCloseTo(0.5, 5);
    expect(8192 * fitScale(8192, 4096)).toBeCloseTo(MAX_PLATE_EDGE, 5);
  });

  it('fitScale is orientation-agnostic (uses the longest edge)', () => {
    expect(fitScale(4096, 8192)).toBeCloseTo(0.5, 5);
  });
});

describe('plan prep v2 — pdf render scale (vector)', () => {
  it('upscales small vector pages toward the cap, bounded at 4x', () => {
    // A 612×792pt page: long edge 792 → 4096/792 ≈ 5.17, capped to 4.
    expect(pdfRenderScale(612, 792)).toBe(4);
    // A large page downscales to hit the cap exactly.
    expect(pdfRenderScale(8192, 4096)).toBeCloseTo(0.5, 5);
    expect(8192 * pdfRenderScale(8192, 4096)).toBeCloseTo(MAX_PLATE_EDGE, 5);
  });
});

describe('plan prep v2 — metadata stamp + plate path', () => {
  it('platePathForFloor is the canonical plate slot', () => {
    expect(platePathForFloor('abc-123')).toBe('abc-123.plate.png');
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
