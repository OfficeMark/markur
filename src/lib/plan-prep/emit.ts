// Plan Prep — emit a cleaned plate from kept color groups.
//
// SVG: recolored to a muted neutral gray (the plan is the stage; pins are the
// show, in waymarks-gold), cropped to the locked frame, Y-flipped from PDF
// user space (Y-up) into SVG space (Y-down). PNG: the same SVG rasterized to
// 6000px wide for heavy plans where a multi-MB SVG would render slowly.

import type { Bbox, ColorGroup, PlanPlate } from './types';

/** Muted neutral stroke for cleaned linework. A literal, not a theme token —
 * this is generated image content, not component styling. */
const PLAN_STROKE = '#4b5563';

/** Heavy plans rasterize to this width (height follows the crop aspect). */
export const PNG_WIDTH = 6000;

export interface EmitOptions {
  groups: ColorGroup[];
  keepKeys: string[];
  crop: Bbox;
}

/** Build the cleaned SVG document string. Pure — no DOM. */
export function emitSvg({ groups, keepKeys, crop }: EmitOptions): string {
  const [x0, y0, x1, y1] = crop;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(w)} ${round(h)}" width="${round(w)}" height="${round(h)}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    // Flip Y (PDF is Y-up) and shift the crop origin to (0,0).
    `<g transform="translate(${round(-x0)}, ${round(y1)}) scale(1,-1)" stroke="${PLAN_STROKE}" fill="none" stroke-linecap="round" stroke-linejoin="round">`,
  ];
  const keep = new Set(keepKeys);
  for (const g of groups) {
    if (!keep.has(g.key)) continue;
    for (const p of g.paths) {
      if (!intersects(p.bbox, crop)) continue; // legends/title block fall away free
      parts.push(`<path d="${p.d}" stroke-width="${round(p.strokeWidth)}"/>`);
    }
  }
  parts.push('</g></svg>');
  return parts.join('');
}

/** Count the paths that will actually be drawn for a given crop + selection. */
export function keptPathCount({ groups, keepKeys, crop }: EmitOptions): number {
  const keep = new Set(keepKeys);
  let n = 0;
  for (const g of groups) {
    if (!keep.has(g.key)) continue;
    for (const p of g.paths) if (intersects(p.bbox, crop)) n++;
  }
  return n;
}

export function svgPlate(opts: EmitOptions): PlanPlate {
  const svg = emitSvg(opts);
  const [x0, y0, x1, y1] = opts.crop;
  return {
    blob: new Blob([svg], { type: 'image/svg+xml' }),
    mime: 'image/svg+xml',
    ext: 'svg',
    width: Math.round(x1 - x0),
    height: Math.round(y1 - y0),
  };
}

/** Rasterize the cleaned SVG to a PNG at PNG_WIDTH. Browser-only (uses canvas). */
export async function pngPlate(opts: EmitOptions): Promise<PlanPlate> {
  const svg = emitSvg(opts);
  const [x0, y0, x1, y1] = opts.crop;
  const aspect = (y1 - y0) / Math.max(1, x1 - x0);
  const outW = PNG_WIDTH;
  const outH = Math.max(1, Math.round(PNG_WIDTH * aspect));

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable for Plan Prep rasterization.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
    const blob = await canvasToBlob(canvas, 'image/png');
    return { blob, mime: 'image/png', ext: 'png', width: outW, height: outH };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterize the cleaned plan.'));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the cleaned plan.'))), type);
  });
}

function intersects(b: Bbox, crop: Bbox): boolean {
  return !(b[2] < crop[0] || b[0] > crop[2] || b[3] < crop[1] || b[1] > crop[3]);
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
