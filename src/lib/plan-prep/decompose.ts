// Plan Prep — decompose a vector PDF into color-bucketed paths by walking
// PDF.js's operator list. This is the JS port of the proven PyMuPDF
// `get_drawings()` decomposition (reference_pdf_decompose.py): for each painted
// path we record its color, geometry, and bbox in PDF page space, then bucket
// by quantized color so the detector can separate the architectural background
// from discipline clutter.
//
// PDF.js gives us low-level ops, so we track graphics state ourselves:
//   - the CTM (current transformation matrix), via transform/save/restore,
//     applied to every coordinate so paths land in page space
//   - the current fill/stroke color (normalized to RGB 0–255)
//   - the current line width
// Paths are built during `constructPath` and committed to a color bucket on the
// following paint op (fill/stroke), exactly like the PDF imaging model.

import { GlobalWorkerOptions, OPS, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Bbox, ColorGroup, DecomposeResult, RGB, VectorPath } from './types';

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

type Matrix = [number, number, number, number, number, number];

/** Compose two PDF matrices: the returned matrix applies m1 first, then m2. */
function multiply(m1: Matrix, m2: Matrix): Matrix {
  // PDF convention: applying m1 then m2 to a point.
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

/** Apply a matrix to a point: [a,b,c,d,e,f] · (x,y). */
function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

interface GState {
  ctm: Matrix;
  fill: RGB | null;
  stroke: RGB | null;
  lineWidth: number;
}

function cloneState(s: GState): GState {
  return { ctm: [...s.ctm] as Matrix, fill: s.fill, stroke: s.stroke, lineWidth: s.lineWidth };
}

function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  // Args are 0–1. Standard naive conversion (good enough for color bucketing).
  return [
    Math.round(255 * (1 - Math.min(1, c + k))),
    Math.round(255 * (1 - Math.min(1, m + k))),
    Math.round(255 * (1 - Math.min(1, y + k))),
  ];
}

/** Best-effort color extraction from a *ColorN op's variadic args. */
function colorNToRgb(args: unknown[]): RGB | null {
  const nums = args.filter((a): a is number => typeof a === 'number');
  if (nums.length === 1) {
    const g = nums[0] <= 1 ? Math.round(nums[0] * 255) : Math.round(nums[0]);
    return [g, g, g];
  }
  if (nums.length === 3) {
    const scale = nums.every((n) => n <= 1) ? 255 : 1;
    return [
      Math.round(nums[0] * scale),
      Math.round(nums[1] * scale),
      Math.round(nums[2] * scale),
    ];
  }
  if (nums.length === 4) return cmykToRgb(nums[0], nums[1], nums[2], nums[3]);
  return null; // pattern / unsupported
}

/** Accumulates the in-progress path until a paint op commits it. */
class PathBuilder {
  d = '';
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  empty = true;
  curX = 0;
  curY = 0;

  private bump(x: number, y: number) {
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
    this.empty = false;
  }

  moveTo(m: Matrix, x: number, y: number) {
    const [px, py] = apply(m, x, y);
    this.d += `M${fmt(px)} ${fmt(py)}`;
    this.curX = px;
    this.curY = py;
    this.bump(px, py);
  }

  lineTo(m: Matrix, x: number, y: number) {
    const [px, py] = apply(m, x, y);
    this.d += `L${fmt(px)} ${fmt(py)}`;
    this.curX = px;
    this.curY = py;
    this.bump(px, py);
  }

  curveTo(m: Matrix, p: number[]) {
    const [c1x, c1y] = apply(m, p[0], p[1]);
    const [c2x, c2y] = apply(m, p[2], p[3]);
    const [ex, ey] = apply(m, p[4], p[5]);
    this.d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(ex)} ${fmt(ey)}`;
    this.curX = ex;
    this.curY = ey;
    this.bump(c1x, c1y);
    this.bump(c2x, c2y);
    this.bump(ex, ey);
  }

  /** curveTo2 (PDF 'v'): first control point is the current point. */
  curveTo2(m: Matrix, p: number[]) {
    const [c2x, c2y] = apply(m, p[0], p[1]);
    const [ex, ey] = apply(m, p[2], p[3]);
    this.d += `C${fmt(this.curX)} ${fmt(this.curY)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(ex)} ${fmt(ey)}`;
    this.curX = ex;
    this.curY = ey;
    this.bump(c2x, c2y);
    this.bump(ex, ey);
  }

  /** curveTo3 (PDF 'y'): second control point is the end point. */
  curveTo3(m: Matrix, p: number[]) {
    const [c1x, c1y] = apply(m, p[0], p[1]);
    const [ex, ey] = apply(m, p[2], p[3]);
    this.d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(ex)} ${fmt(ey)} ${fmt(ex)} ${fmt(ey)}`;
    this.curX = ex;
    this.curY = ey;
    this.bump(c1x, c1y);
    this.bump(ex, ey);
  }

  rect(m: Matrix, x: number, y: number, w: number, h: number) {
    const c = [
      apply(m, x, y),
      apply(m, x + w, y),
      apply(m, x + w, y + h),
      apply(m, x, y + h),
    ];
    this.d += `M${fmt(c[0][0])} ${fmt(c[0][1])}L${fmt(c[1][0])} ${fmt(c[1][1])}L${fmt(c[2][0])} ${fmt(c[2][1])}L${fmt(c[3][0])} ${fmt(c[3][1])}Z`;
    for (const [px, py] of c) this.bump(px, py);
    this.curX = c[0][0];
    this.curY = c[0][1];
  }

  close() {
    this.d += 'Z';
  }

  take(strokeWidth: number): VectorPath | null {
    if (this.empty || !this.d) return null;
    return {
      d: this.d,
      bbox: [this.minX, this.minY, this.maxX, this.maxY],
      strokeWidth,
    };
  }

  reset() {
    this.d = '';
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -Infinity;
    this.empty = true;
  }
}

function fmt(n: number): string {
  // 1 decimal keeps the SVG compact without visible precision loss at plan scale.
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Walk a single page's operator list and return color-bucketed paths.
 * Exported separately so it can be unit-tested against a synthetic page.
 */
export function bucketOperatorList(
  fnArray: number[],
  argsArray: unknown[][],
  baseTransform: Matrix
): Map<string, ColorGroup> {
  const buckets = new Map<string, ColorGroup>();
  const stack: GState[] = [];
  let gs: GState = { ctm: baseTransform, fill: [0, 0, 0], stroke: [0, 0, 0], lineWidth: 1 };
  const pb = new PathBuilder();

  const commit = (color: RGB | null) => {
    const path = pb.take(Math.max(gs.lineWidth, 0.3));
    pb.reset();
    if (!path) return;
    const c: RGB = color ?? [0, 0, 0];
    const key = quantKey(c);
    let g = buckets.get(key);
    if (!g) {
      g = { key, color: quantColor(c), paths: [], pathCount: 0, bbox: [Infinity, Infinity, -Infinity, -Infinity] };
      buckets.set(key, g);
    }
    g.paths.push(path);
    g.pathCount++;
    g.bbox = unionBbox(g.bbox, path.bbox);
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i] || [];
    switch (fn) {
      case OPS.save:
        stack.push(cloneState(gs));
        break;
      case OPS.restore:
        if (stack.length) gs = stack.pop() as GState;
        break;
      case OPS.transform:
        gs.ctm = multiply(a as unknown as Matrix, gs.ctm);
        break;
      case OPS.setLineWidth:
        gs.lineWidth = (a[0] as number) ?? gs.lineWidth;
        break;
      case OPS.setFillRGBColor:
        gs.fill = [a[0] as number, a[1] as number, a[2] as number];
        break;
      case OPS.setStrokeRGBColor:
        gs.stroke = [a[0] as number, a[1] as number, a[2] as number];
        break;
      case OPS.setFillGray:
        gs.fill = grayToRgb(a[0] as number);
        break;
      case OPS.setStrokeGray:
        gs.stroke = grayToRgb(a[0] as number);
        break;
      case OPS.setFillCMYKColor:
        gs.fill = cmykToRgb(a[0] as number, a[1] as number, a[2] as number, a[3] as number);
        break;
      case OPS.setStrokeCMYKColor:
        gs.stroke = cmykToRgb(a[0] as number, a[1] as number, a[2] as number, a[3] as number);
        break;
      case OPS.setFillColorN:
        gs.fill = colorNToRgb(a) ?? gs.fill;
        break;
      case OPS.setStrokeColorN:
        gs.stroke = colorNToRgb(a) ?? gs.stroke;
        break;
      case OPS.constructPath:
        buildPath(pb, gs.ctm, a);
        break;
      // Paint ops commit the current path under the appropriate color.
      case OPS.stroke:
      case OPS.closeStroke:
        commit(gs.stroke);
        break;
      case OPS.fill:
      case OPS.eoFill:
        commit(gs.fill);
        break;
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
        commit(gs.stroke ?? gs.fill); // linework color is the stroke
        break;
      case OPS.endPath:
        pb.reset(); // path used only for clipping; not painted
        break;
      default:
        break;
    }
  }
  return buckets;
}

function buildPath(pb: PathBuilder, m: Matrix, a: unknown[]) {
  // constructPath(ops, args, minMax): ops is the sub-op sequence, args the flat
  // coordinate stream consumed per op.
  const ops = a[0] as number[];
  const args = a[1] as number[];
  if (!ops || !args) return;
  let j = 0;
  for (let k = 0; k < ops.length; k++) {
    switch (ops[k]) {
      case OPS.moveTo:
        pb.moveTo(m, args[j++], args[j++]);
        break;
      case OPS.lineTo:
        pb.lineTo(m, args[j++], args[j++]);
        break;
      case OPS.curveTo:
        pb.curveTo(m, [args[j++], args[j++], args[j++], args[j++], args[j++], args[j++]]);
        break;
      case OPS.curveTo2:
        pb.curveTo2(m, [args[j++], args[j++], args[j++], args[j++]]);
        break;
      case OPS.curveTo3:
        pb.curveTo3(m, [args[j++], args[j++], args[j++], args[j++]]);
        break;
      case OPS.rectangle:
        pb.rect(m, args[j++], args[j++], args[j++], args[j++]);
        break;
      case OPS.closePath:
        pb.close();
        break;
      default:
        break;
    }
  }
}

function grayToRgb(g: number): RGB {
  const v = Math.round((g ?? 0) * 255);
  return [v, v, v];
}

/** Quantize to a stable bucket key (round to nearest 6 to merge near-screens). */
function quantKey(c: RGB): string {
  const q = quantColor(c);
  return `${q[0]},${q[1]},${q[2]}`;
}
function quantColor(c: RGB): RGB {
  const q = (n: number) => Math.min(255, Math.max(0, Math.round(n / 6) * 6));
  return [q(c[0]), q(c[1]), q(c[2])];
}

function unionBbox(a: Bbox, b: Bbox): Bbox {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

/**
 * Decompose the first page of a vector PDF into color buckets, in page space.
 */
export async function decomposePdf(data: ArrayBuffer): Promise<DecomposeResult> {
  const doc = await getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const view = page.view; // [x0, y0, x1, y1] in page units
    const pageWidth = view[2] - view[0];
    const pageHeight = view[3] - view[1];
    // Translate so the page origin sits at (0,0); rotation is ignored (plans are
    // upright). This keeps page-space coords positive and matches getViewport at
    // scale 1 / rotation 0 closely enough for cropping and re-rendering.
    const base: Matrix = [1, 0, 0, 1, -view[0], -view[1]];
    const opList = await page.getOperatorList();
    const buckets = bucketOperatorList(opList.fnArray, opList.argsArray, base);

    const groups = [...buckets.values()].sort((a, b) => b.pathCount - a.pathCount);
    const totalPaths = groups.reduce((n, g) => n + g.pathCount, 0);
    return { groups, pageWidth, pageHeight, totalPaths };
  } finally {
    await doc.destroy();
  }
}
