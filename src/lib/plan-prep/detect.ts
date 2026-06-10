// Plan Prep — pure detection heuristics over decomposed color groups.
// No PDF.js, no DOM: easy to unit-test. Ports the conventions proven in
// reference_pdf_decompose.py (dominant gray screen = architectural background;
// black = discipline clutter) but auto-detects the gray bucket rather than
// hardcoding 67%, since the screen value varies by plotter.

import type { Bbox, ColorGroup, DecomposeResult, OutputFormat, RGB } from './types';

/** SVG below this path count; PNG (6000px) above. Tunable per the brief. */
export const SVG_PATH_LIMIT = 20_000;

/** Fewer painted vector paths than this ⇒ treat as raster/scanned, skip prep. */
export const RASTER_PATH_FLOOR = 40;

export function isGrayish(c: RGB, tol = 14): boolean {
  const [r, g, b] = c;
  return Math.abs(r - g) <= tol && Math.abs(g - b) <= tol && Math.abs(r - b) <= tol;
}

export function isNearBlack(c: RGB, max = 28): boolean {
  return c[0] <= max && c[1] <= max && c[2] <= max;
}

export function isNearWhite(c: RGB, min = 232): boolean {
  return c[0] >= min && c[1] >= min && c[2] >= min;
}

/**
 * A PDF with almost no painted vector content is a scan/raster — Plan Prep has
 * nothing to decompose, so the upload should pass through unchanged.
 */
export function isRaster(result: DecomposeResult): boolean {
  return result.totalPaths < RASTER_PATH_FLOOR;
}

/**
 * Pick the architectural-background bucket: the dominant mid-gray screen.
 * Returns its key, or null when no gray screen dominates (ambiguous — the UI
 * then falls back to the manual color-group picker).
 */
export function pickArchBucket(groups: ColorGroup[]): string | null {
  const candidates = groups.filter(
    (g) => isGrayish(g.color) && !isNearBlack(g.color) && !isNearWhite(g.color)
  );
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (b.pathCount > a.pathCount ? b : a));
  // Require the screen to be a real share of the drawing, else it's incidental
  // (a stray gray note rather than the building's linework).
  if (best.pathCount < result_totalShare(groups) * 0.15) return null;
  return best.key;
}

function result_totalShare(groups: ColorGroup[]): number {
  return groups.reduce((n, g) => n + g.pathCount, 0);
}

/** Auto-crop = the architectural bucket's bbox, padded slightly. */
export function cropForBucket(groups: ColorGroup[], key: string | null, pageW: number, pageH: number): Bbox {
  const g = key ? groups.find((x) => x.key === key) : null;
  if (!g || !isFiniteBbox(g.bbox)) return [0, 0, pageW, pageH];
  const padX = (g.bbox[2] - g.bbox[0]) * 0.01;
  const padY = (g.bbox[3] - g.bbox[1]) * 0.01;
  return [
    Math.max(0, g.bbox[0] - padX),
    Math.max(0, g.bbox[1] - padY),
    Math.min(pageW, g.bbox[2] + padX),
    Math.min(pageH, g.bbox[3] + padY),
  ];
}

/** Union bbox of the kept groups — used when the user hand-picks buckets. */
export function cropForKeys(groups: ColorGroup[], keys: string[], pageW: number, pageH: number): Bbox {
  const kept = groups.filter((g) => keys.includes(g.key) && isFiniteBbox(g.bbox));
  if (kept.length === 0) return [0, 0, pageW, pageH];
  let bb: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const g of kept) {
    bb = [
      Math.min(bb[0], g.bbox[0]),
      Math.min(bb[1], g.bbox[1]),
      Math.max(bb[2], g.bbox[2]),
      Math.max(bb[3], g.bbox[3]),
    ];
  }
  return bb;
}

export function chooseFormat(pathCount: number): OutputFormat {
  return pathCount > SVG_PATH_LIMIT ? 'png' : 'svg';
}

function isFiniteBbox(b: Bbox): boolean {
  return b.every((n) => Number.isFinite(n)) && b[2] > b[0] && b[3] > b[1];
}
