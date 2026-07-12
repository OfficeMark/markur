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
