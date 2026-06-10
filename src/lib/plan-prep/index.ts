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
  /** When the floor already has pins, the crop frame is frozen to this bbox so
   * normalized pin coordinates can't drift. */
  lockedCrop?: Bbox | null;
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

  const cropLocked = !!opts.lockedCrop;
  const autoArchKey = pickArchBucket(groups);
  const autoCrop: Bbox = cropLocked
    ? (opts.lockedCrop as Bbox)
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
