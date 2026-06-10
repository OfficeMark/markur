// Plan Prep — public API. Orchestrates decompose → detect → emit for the
// floor-plan upload flow. See ./types.ts for the data shapes and the feature
// brief markur-feature-brief-plan-prep-2026-06-09.md for rationale.

import { decomposePdf } from './decompose';
import { chooseFormat, cropForBucket, cropForKeys, isRaster, pickArchBucket } from './detect';
import { keptPathCount, pngPlate, svgPlate, type EmitOptions } from './emit';
import type { Bbox, DecomposeResult, OutputFormat, PlanPlate, PlanPrepAnalysis } from './types';

export type {
  Bbox,
  ColorGroup,
  DecomposeResult,
  FloorPlanMetadata,
  OutputFormat,
  PlanPlate,
  PlanPrepAnalysis,
  PlanPrepRecipe,
  RGB,
  VectorPath,
} from './types';
export { emitSvg, keptPathCount } from './emit';
export { SVG_PATH_LIMIT } from './detect';
export { decomposePdf } from './decompose';

export interface AnalyzeOptions {
  /** When the floor was already Plan-Prepped and has pins, the crop frame is
   * frozen to this exact bbox so normalized pin coordinates can't drift. */
  lockedCrop?: Bbox | null;
  /** When the floor has pins but no prior Plan Prep frame (e.g. a raw plan that
   * pins were placed on), we may declutter but must NOT crop — cropping would
   * change the extent and shift every pin. */
  forceFullPage?: boolean;
}

/**
 * Analyze an uploaded PDF: decompose it, decide whether it's worth cleaning
 * (raster PDFs are not), auto-detect the architectural background, and propose a
 * crop + output format. Pure inspection — produces nothing to upload yet.
 */
export async function analyzePlan(
  data: ArrayBuffer,
  opts: AnalyzeOptions = {}
): Promise<PlanPrepAnalysis> {
  const decompose = await decomposePdf(data);
  const { pageWidth, pageHeight, groups } = decompose;

  // Surface what the walker actually found, so a "Plan Prep silently skipped"
  // is diagnosable rather than invisible. Dev-only (the :5180 demo runs in dev;
  // the app.markur.ca production build strips this).
  if (import.meta.env.DEV) {
    console.info('[plan-prep] decompose', {
      totalPaths: decompose.totalPaths,
      buckets: groups.length,
      page: [Math.round(pageWidth), Math.round(pageHeight)],
      raster: isRaster(decompose),
      topColors: groups.slice(0, 10).map((g) => `${g.key}×${g.pathCount}`),
    });
  }

  if (isRaster(decompose)) {
    return {
      kind: 'raster',
      decompose,
      autoArchKey: null,
      autoCrop: [0, 0, pageWidth, pageHeight],
      cropLocked: false,
      suggestedFormat: 'svg',
    };
  }

  const cropLocked = !!opts.lockedCrop || !!opts.forceFullPage;
  const autoArchKey = pickArchBucket(groups);
  const autoCrop: Bbox = opts.lockedCrop
    ? opts.lockedCrop
    : opts.forceFullPage
      ? [0, 0, pageWidth, pageHeight]
      : cropForBucket(groups, autoArchKey, pageWidth, pageHeight);

  const defaultKeep = defaultKeepKeys(decompose, autoArchKey);
  const count = keptPathCount({ groups, keepKeys: defaultKeep, crop: autoCrop });

  return {
    kind: 'vector',
    decompose,
    autoArchKey,
    autoCrop,
    cropLocked,
    suggestedFormat: chooseFormat(count),
  };
}

/**
 * Default color groups to KEEP: the detected architectural bucket if found,
 * otherwise every non-trivial group (the user prunes via the picker).
 */
export function defaultKeepKeys(decompose: DecomposeResult, archKey: string | null): string[] {
  if (archKey) return [archKey];
  // Ambiguous: keep all groups so the preview shows the full drawing; the user
  // then taps groups off in the fallback picker.
  return decompose.groups.map((g) => g.key);
}

export { cropForKeys };

/** Produce the cleaned plate to upload, honoring the chosen format. */
export async function producePlate(
  decompose: DecomposeResult,
  selection: { keepKeys: string[]; crop: Bbox; format: OutputFormat }
): Promise<PlanPlate> {
  const opts: EmitOptions = {
    groups: decompose.groups,
    keepKeys: selection.keepKeys,
    crop: selection.crop,
  };
  return selection.format === 'png' ? pngPlate(opts) : svgPlate(opts);
}
