// Plan Prep v2 — the optional "Enhance" pass for scanned/photographed plans.
// Never the default: the user opens it deliberately and gets a before/after
// with Accept / Keep original.
//
// It operates on the already-baked display PNG (the default plate), so it's
// uniform for EVERY upload — image or PDF — and needs no pdfjs and no
// vector/scan detector. Pipeline (all client-side canvas): deskew → grayscale →
// auto-levels contrast → light despeckle (median 3×3) → upscale only if small.
// Output is a capped PNG, same as the default plate.
//
// Browser-only. Lives in the lazy upload chunk.

import { MAX_PLATE_EDGE, fitScale } from './rasterize';

export interface ScanEnhanceResult {
  blob: Blob;
  width: number;
  height: number;
}

/** Draw a baked display-plate PNG into a canvas for the cleanup pass. */
async function plateCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the plan image.'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, img.naturalWidth || 1600);
    canvas.height = Math.max(1, img.naturalHeight || 1200);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convert RGBA in place to grayscale (luma), leaving alpha opaque. */
function grayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const y = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) | 0;
    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
    data[i + 3] = 255;
  }
}

/** Stretch contrast to the 2nd–98th luma percentiles (auto-levels). In place. */
function autoLevels(data: Uint8ClampedArray): void {
  const hist = new Array<number>(256).fill(0);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    hist[data[i]!]!++;
    n++;
  }
  const loCut = n * 0.02;
  const hiCut = n * 0.02;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= loCut) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]!;
    if (acc >= hiCut) {
      hi = v;
      break;
    }
  }
  if (hi <= lo) return;
  const scale = 255 / (hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.max(0, Math.min(255, Math.round((v - lo) * scale)));
  }
  for (let i = 0; i < data.length; i += 4) {
    const g = lut[data[i]!]!;
    data[i] = g;
    data[i + 1] = g;
    data[i + 2] = g;
  }
}

/** 3×3 median filter on the (already grayscale) luma channel — despeckle. */
function medianDespeckle(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const win: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      win.length = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          win.push(data[((y + dy) * w + (x + dx)) * 4]!);
        }
      }
      win.sort((a, b) => a - b);
      const m = win[4]!;
      const idx = (y * w + x) * 4;
      out[idx] = m;
      out[idx + 1] = m;
      out[idx + 2] = m;
    }
  }
  return out;
}

/**
 * Estimate skew angle (degrees, -limit..+limit) via projection-profile variance
 * on a downsampled binary of dark pixels: the true text/line angle maximizes
 * the variance of the per-row ink count. Coarse but robust for scanned plans.
 */
function estimateSkew(gray: Uint8ClampedArray, w: number, h: number, limit = 5): number {
  // Downsample to ~600px wide for speed.
  const step = Math.max(1, Math.floor(w / 600));
  const sw = Math.floor(w / step);
  const sh = Math.floor(h / step);
  const dark: number[] = [];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      dark.push(gray[(y * step * w + x * step) * 4]! < 128 ? 1 : 0);
    }
  }
  let bestAngle = 0;
  let bestScore = -1;
  for (let deg = -limit; deg <= limit; deg += 0.5) {
    const rad = (deg * Math.PI) / 180;
    const tan = Math.tan(rad);
    const rows = new Array<number>(sh + sw).fill(0);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (!dark[y * sw + x]) continue;
        const ry = Math.round(y - x * tan) + sw;
        if (ry >= 0 && ry < rows.length) rows[ry]!++;
      }
    }
    let mean = 0;
    for (const r of rows) mean += r;
    mean /= rows.length;
    let variance = 0;
    for (const r of rows) variance += (r - mean) * (r - mean);
    if (variance > bestScore) {
      bestScore = variance;
      bestAngle = deg;
    }
  }
  return bestAngle;
}

/** Rotate a canvas by `deg` about its centre onto a white background. */
function rotateCanvas(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  if (Math.abs(deg) < 0.25) return src;
  const rad = (deg * Math.PI) / 180;
  const dst = document.createElement('canvas');
  dst.width = src.width;
  dst.height = src.height;
  const ctx = dst.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dst.width, dst.height);
  ctx.translate(dst.width / 2, dst.height / 2);
  ctx.rotate(-rad);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return dst;
}

/** Upscale a small plan toward 1600px long edge (bounded ≤ 2×) for legibility. */
function upscaleIfSmall(src: HTMLCanvasElement): HTMLCanvasElement {
  const longest = Math.max(src.width, src.height);
  const target = 1600;
  if (longest >= target) return src;
  const factor = Math.min(2, target / longest);
  const dst = document.createElement('canvas');
  dst.width = Math.round(src.width * factor);
  dst.height = Math.round(src.height * factor);
  const ctx = dst.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, dst.width, dst.height);
  return dst;
}

/**
 * Run the full Enhance pass on a baked display-plate PNG, returning a cleaned
 * display PNG. Deliberate + reversible: the caller shows before/after and only
 * keeps this if the user Accepts. Works for any upload — image or PDF — because
 * it starts from the already-rasterized plate.
 */
export async function enhanceScanBlob(plateBlob: Blob): Promise<ScanEnhanceResult> {
  let canvas = await plateCanvas(plateBlob);
  const ctx0 = canvas.getContext('2d')!;
  let img = ctx0.getImageData(0, 0, canvas.width, canvas.height);

  // Deskew first (on grayscale luma so the estimate isn't color-biased).
  grayscale(img.data);
  const angle = estimateSkew(img.data, canvas.width, canvas.height);
  if (Math.abs(angle) >= 0.25) {
    ctx0.putImageData(img, 0, 0);
    canvas = rotateCanvas(canvas, angle);
    const ctx1 = canvas.getContext('2d')!;
    img = ctx1.getImageData(0, 0, canvas.width, canvas.height);
    grayscale(img.data);
  }

  // Contrast + despeckle.
  autoLevels(img.data);
  const despeckled = medianDespeckle(img.data, canvas.width, canvas.height);
  img.data.set(despeckled);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(img, 0, 0);

  // Upscale if the source was small.
  const finalCanvas = upscaleIfSmall(canvas);

  const blob = await new Promise<Blob | null>((resolve) =>
    finalCanvas.toBlob(resolve, 'image/png')
  );
  if (!blob) throw new Error('Could not encode the enhanced plan.');
  const capped = Math.max(finalCanvas.width, finalCanvas.height) <= MAX_PLATE_EDGE;
  if (!capped) {
    // Extremely unlikely (source already capped), but guard the output cap.
    const s = fitScale(finalCanvas.width, finalCanvas.height);
    const c2 = document.createElement('canvas');
    c2.width = Math.round(finalCanvas.width * s);
    c2.height = Math.round(finalCanvas.height * s);
    const cx = c2.getContext('2d')!;
    cx.drawImage(finalCanvas, 0, 0, c2.width, c2.height);
    const b2 = await new Promise<Blob | null>((r) => c2.toBlob(r, 'image/png'));
    if (!b2) throw new Error('Could not encode the enhanced plan.');
    return { blob: b2, width: c2.width, height: c2.height };
  }
  return { blob, width: finalCanvas.width, height: finalCanvas.height };
}
