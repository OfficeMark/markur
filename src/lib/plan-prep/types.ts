// Plan Prep — shared types (v2).
//
// At upload every plan is rasterized to a capped display PNG (rasterize.ts).
// Two optional content-preserving enhances (crop-to-plan, scan cleanup) refine
// that PNG. The old vector color-declutter pipeline (decompose/detect/emit) was
// retired — it stripped labels and mapped pen color, not building element. See
// index.ts and the 2026-07-12 refinement report.

/**
 * Current Plan Prep pipeline version. This is the REPROCESSING GATE: a floor is
 * reprocessed only if a future build ships a higher version AND the user
 * explicitly asks — never automatically, never in bulk, never on open.
 */
export const PLAN_PIPELINE_VERSION = 1;

/** What the uploaded source was — informational + drives which Enhance fits. */
export type PlanSource = 'vector' | 'scan' | 'image';

/**
 * Shape stored in `floors.plan_metadata` (jsonb). Written on EVERY upload:
 * the default path rasterizes a capped display PNG for all formats and stamps
 * this. Absence means a pre-v2 raw upload.
 */
export interface FloorPlanMetadata {
  planPrep?: {
    /** Pipeline version this plate was produced with (reprocessing gate). */
    version: number;
    /** True when a display plate was produced; false = fell back to the
     *  untouched original after a processing failure/timeout. */
    processed: boolean;
    /** vector PDF, raster/scanned PDF, or uploaded image. */
    source: PlanSource;
    /** True when an optional Enhance (crop / scan cleanup) was applied. */
    enhanced: boolean;
    /** ISO timestamp of when this plate was produced (processed_at). */
    processedAt: string;
  };
}

/** Build the planPrep metadata stamp for a floors.plan_metadata write. */
export function stampPlanPrep(fields: {
  processed: boolean;
  source: PlanSource;
  enhanced: boolean;
}): NonNullable<FloorPlanMetadata['planPrep']> {
  return {
    version: PLAN_PIPELINE_VERSION,
    processed: fields.processed,
    source: fields.source,
    enhanced: fields.enhanced,
    processedAt: new Date().toISOString(),
  };
}
