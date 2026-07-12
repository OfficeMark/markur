// Plan Prep — public API (v2).
//
// The pipeline: at upload, rasterize a capped display PNG for every plan
// (vector PDF, raster PDF, image, SVG) — that PNG becomes plan_url, so the
// floor-open path only ever draws an image. Two OPTIONAL, content-preserving
// enhances are offered before/after with Accept / Keep original:
//   - crop-to-plan: drop the peripheral title block / legend / border; keeps
//     everything inside the frame (walls, circulation, rooms, labels).
//   - scan cleanup: deskew / contrast / despeckle for scans and poor images.
//
// The former vector color-declutter was RETIRED: it stripped text (room numbers
// and labels are never decomposed) and bucketed by pen color, not building
// element, so it could not retain the structure/circulation/labels a usable
// plan needs (see the 2026-07-12 refinement report).

export type { FloorPlanMetadata, PlanSource } from './types';
export { PLAN_PIPELINE_VERSION, stampPlanPrep } from './types';
export {
  MAX_PLATE_EDGE,
  FULL_CROP,
  clampCrop,
  cropPlateBlob,
  fitScale,
  isFullCrop,
  pdfRenderScale,
  produceDisplayPlate,
  rasterizeImageToPlate,
  rasterizePdfToPlate,
  type CropRect,
  type DisplayPlate,
} from './rasterize';
export { enhanceScanFile, type ScanEnhanceResult } from './enhance-scan';
