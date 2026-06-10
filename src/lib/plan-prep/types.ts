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
