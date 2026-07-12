// Plan Prep v2 — the DEFAULT display-plate producer.
//
// One law: all processing happens ONCE, at upload. Every uploaded plan —
// vector PDF, raster/scanned PDF, PNG/JPG/WebP/HEIC, SVG — is rendered here to
// a single capped display PNG that becomes `plan_url`. The floor-open path then
// only ever draws an image (cheap), never rasterizes a PDF at view time.
//
// Browser-only (uses canvas + pdfjs). This module lives in the lazy upload
// chunk, so its static pdfjs import never reaches the floor-open graph.

import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { prepareForUpload } from '@/lib/image-convert';
import type { PlanSource } from './types';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

/**
 * Hard output cap — the "super complex plan" guard. A dense tower plan yields a
 * bounded PNG (long edge ≤ this), not a 40 MB monster. Complexity costs upload
 * seconds, never open seconds.
 */
export const MAX_PLATE_EDGE = 4096;

export interface DisplayPlate {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Downscale factor to fit (w,h) within a maxEdge square. Never upscales (≤ 1) —
 * an already-small raster stays its own size. Pure; unit-tested.
 */
export function fitScale(w: number, h: number, maxEdge = MAX_PLATE_EDGE): number {
  const longest = Math.max(w, h);
  if (longest <= 0) return 1;
  return Math.min(1, maxEdge / longest);
}

/**
 * Render scale for a PDF page so its long edge ≈ maxEdge. Vector pages carry no
 * intrinsic pixels, so we DO upscale small pages for crispness — capped at 4×
 * so a tiny page can't explode past the edge cap in the other dimension. Pure.
 */
export function pdfRenderScale(baseW: number, baseH: number, maxEdge = MAX_PLATE_EDGE): number {
  const longest = Math.max(baseW, baseH);
  if (longest <= 0) return 1;
  return Math.min(maxEdge / longest, 4);
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  if (!blob) throw new Error('Could not encode the plan image.');
  return blob;
}

function newCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(w));
  canvas.height = Math.max(1, Math.floor(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  // Plans render on white — PDFs and transparent PNGs must not go through with a
  // black/transparent void behind the linework.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Rasterize page 1 of a PDF to a capped display PNG. `data` is consumed. */
export async function rasterizePdfToPlate(
  data: ArrayBuffer,
  maxEdge = MAX_PLATE_EDGE
): Promise<DisplayPlate> {
  const doc = await getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pdfRenderScale(base.width, base.height, maxEdge) });
    const { canvas, ctx } = newCanvas(viewport.width, viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { blob: await canvasToPng(canvas), width: canvas.width, height: canvas.height };
  } finally {
    await doc.destroy();
  }
}

async function loadImageFile(
  file: File
): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  // HEIC → JPEG up front (native decode) so canvas can draw it.
  const prepared = await prepareForUpload(file);
  const url = URL.createObjectURL(prepared);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.decoding = 'async';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read this image.'));
      el.src = url;
    });
    return { img, revoke: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/** Normalize an image File (png/jpg/webp/heic/svg) to a capped display PNG. */
export async function rasterizeImageToPlate(
  file: File,
  maxEdge = MAX_PLATE_EDGE
): Promise<DisplayPlate> {
  const { img, revoke } = await loadImageFile(file);
  try {
    // viewBox-only SVGs can report 0 — fall back to a sane raster size.
    const nw = img.naturalWidth || 1600;
    const nh = img.naturalHeight || 1200;
    const s = fitScale(nw, nh, maxEdge);
    const { canvas, ctx } = newCanvas(nw * s, nh * s);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { blob: await canvasToPng(canvas), width: canvas.width, height: canvas.height };
  } finally {
    revoke();
  }
}

/**
 * The DEFAULT plate for any uploaded file — the single entry point the upload
 * flow calls on plain Accept. PDFs render page 1; everything else normalizes as
 * an image. Output is always a capped PNG.
 */
export async function produceDisplayPlate(
  file: File,
  _source: PlanSource,
  maxEdge = MAX_PLATE_EDGE
): Promise<DisplayPlate> {
  if (file.type === 'application/pdf') {
    return rasterizePdfToPlate(await file.arrayBuffer(), maxEdge);
  }
  return rasterizeImageToPlate(file, maxEdge);
}

// ---------------------------------------------------------------------------
// Crop-to-plan (the "Enhance" for Plan Prep — drop the peripheral title block /
// legend / border without touching any content inside the frame).
// ---------------------------------------------------------------------------

/** Normalized crop rectangle, all in 0..1 of the plate's own dimensions. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The full-plate crop (no-op) — the conservative default: keep everything. */
export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Clamp a normalized crop rect into [0,1] with a minimum size, keeping x+w ≤ 1
 * and y+h ≤ 1. Pure; unit-tested.
 */
export function clampCrop(rect: CropRect, minFrac = 0.05): CropRect {
  const x = Math.min(Math.max(rect.x, 0), 1 - minFrac);
  const y = Math.min(Math.max(rect.y, 0), 1 - minFrac);
  const w = Math.min(Math.max(rect.w, minFrac), 1 - x);
  const h = Math.min(Math.max(rect.h, minFrac), 1 - y);
  return { x, y, w, h };
}

/** True when the rect keeps essentially the whole plate (nothing to crop). */
export function isFullCrop(rect: CropRect, eps = 0.005): boolean {
  return rect.x <= eps && rect.y <= eps && rect.w >= 1 - eps && rect.h >= 1 - eps;
}

async function loadBlobImage(blob: Blob): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the plan image.'));
      el.src = url;
    });
    return { img, revoke: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Crop a display-plate PNG to a normalized rect, returning a new capped PNG.
 * Everything inside the rect is preserved verbatim (walls, rooms, labels) — the
 * crop only removes what's outside it.
 */
export async function cropPlateBlob(
  blob: Blob,
  rect: CropRect,
  maxEdge = MAX_PLATE_EDGE
): Promise<DisplayPlate> {
  const c = clampCrop(rect);
  const { img, revoke } = await loadBlobImage(blob);
  try {
    const nw = img.naturalWidth || 1600;
    const nh = img.naturalHeight || 1200;
    const sx = Math.round(c.x * nw);
    const sy = Math.round(c.y * nh);
    const sw = Math.max(1, Math.round(c.w * nw));
    const sh = Math.max(1, Math.round(c.h * nh));
    const s = fitScale(sw, sh, maxEdge);
    const { canvas, ctx } = newCanvas(sw * s, sh * s);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return { blob: await canvasToPng(canvas), width: canvas.width, height: canvas.height };
  } finally {
    revoke();
  }
}
