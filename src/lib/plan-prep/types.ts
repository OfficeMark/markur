// Plan Prep — shared types for the floor-plan PDF cleanup pipeline.
//
// The pipeline: decompose a vector PDF into color-bucketed vector paths
// (page-space coords), auto-detect the architectural background (dominant gray
// screen) vs discipline clutter (black), crop to the architectural bbox, and
// emit a recolored cleaned plate as SVG (light plans) or rasterized PNG (heavy
// plans). See `markur-feature-brief-plan-prep-2026-06-09.md` for the rationale
// and `reference_pdf_decompose.py` for the proven algorithm we port here.

/** RGB triple, each channel 0–255. */
export type RGB = readonly [number, number, number];

/** [minX, minY, maxX, maxY] in PDF page user space (points, Y-up). */
export type Bbox = readonly [number, number, number, number];

/** One painted vector path, already transformed into page space. */
export interface VectorPath {
  /** SVG path data in raw page-space coords (Y-up; the emitter flips Y). */
  d: string;
  bbox: Bbox;
  /** Stroke width in points (>= a small floor so hairlines stay visible). */
  strokeWidth: number;
}

/** A bucket of paths sharing one quantized color. */
export interface ColorGroup {
  /** Quantized color key, e.g. "170,170,170". Stable across runs. */
  key: string;
  color: RGB;
  paths: VectorPath[];
  pathCount: number;
  /** Union bbox of every path in the group. */
  bbox: Bbox;
}

export interface DecomposeResult {
  groups: ColorGroup[];
  pageWidth: number;
  pageHeight: number;
  totalPaths: number;
}

/**
 * The cleanup recipe — everything needed to reproduce a cleaned plate
 * deterministically. Stored in `floors.plan_metadata` so cleanup is
 * non-destructive and re-runnable. `crop` is the locked coordinate frame:
 * once a floor has pins, re-runs MUST reuse it so normalized pin coords
 * never drift.
 */
export interface PlanPrepRecipe {
  version: 1;
  /** Color group keys the user chose to KEEP. */
  keepKeys: string[];
  /** Locked crop frame, page-space. */
  crop: Bbox;
  format: 'svg' | 'png';
  /** Storage path of the retained original upload (e.g. "<floorId>.pdf"). */
  originalPath: string;
  /** Output pixel dimensions of the produced plate (reference, not the lock). */
  outputWidth: number;
  outputHeight: number;
}

export type OutputFormat = 'svg' | 'png';

/**
 * Current Plan Prep pipeline version. This is the REPROCESSING GATE: a floor is
 * reprocessed only if a future build ships a higher version AND the user
 * explicitly asks ("Re-enhance this plan") — never automatically, never in bulk,
 * never on open. Bump this when the pipeline improves in a way worth re-running.
 */
export const PLAN_PIPELINE_VERSION = 1;

/** What the uploaded source was — drives which Enhance is offered + reporting. */
export type PlanSource = 'vector' | 'scan' | 'image';

/**
 * Shape stored in `floors.plan_metadata` (jsonb). Written on EVERY upload now
 * (Plan Prep v2): the default path rasterizes a capped display PNG for all
 * formats and stamps this. Absence means a pre-v2 raw upload. `recipe` is
 * present only when the optional vector-declutter Enhance was applied;
 * `recipe.crop` is the locked coordinate frame re-runs must reuse once the
 * floor has pins.
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
    /** True only when the optional Enhance pass was applied AND accepted. */
    enhanced: boolean;
    /** ISO timestamp of when this plate was produced (processed_at). */
    processedAt: string;
    /** Present only for the vector-declutter Enhance (the reproducible recipe). */
    recipe?: PlanPrepRecipe;
  };
}

/** Build the planPrep metadata stamp for a floors.plan_metadata write. */
export function stampPlanPrep(fields: {
  processed: boolean;
  source: PlanSource;
  enhanced: boolean;
  recipe?: PlanPrepRecipe;
}): NonNullable<FloorPlanMetadata['planPrep']> {
  return {
    version: PLAN_PIPELINE_VERSION,
    processed: fields.processed,
    source: fields.source,
    enhanced: fields.enhanced,
    processedAt: new Date().toISOString(),
    ...(fields.recipe ? { recipe: fields.recipe } : {}),
  };
}

/** Result of analyzing an uploaded PDF before the user decides anything. */
export interface PlanPrepAnalysis {
  /** 'raster' => no meaningful vector content; skip Plan Prep entirely. */
  kind: 'vector' | 'raster';
  decompose: DecomposeResult;
  /** Detected architectural background bucket key, or null if ambiguous. */
  autoArchKey: string | null;
  /** Auto-crop bbox (arch bucket bbox, or full page if locked/ambiguous). */
  autoCrop: Bbox;
  /** Whether the crop is frozen because the floor already has pins. */
  cropLocked: boolean;
  /** SVG for light plans, PNG for heavy ones. */
  suggestedFormat: OutputFormat;
}

/** The produced cleaned plate, ready to upload. */
export interface PlanPlate {
  blob: Blob;
  mime: 'image/svg+xml' | 'image/png';
  ext: 'svg' | 'png';
  width: number;
  height: number;
}
