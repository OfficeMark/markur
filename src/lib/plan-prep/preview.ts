// Plan Prep — render the original PDF's first page to a data URL for the
// "before" half of the before/after comparison. Browser-only (uses canvas).
// Kept out of decompose.ts so that module stays DOM-free and unit-testable.

import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface PageRaster {
  url: string; // data URL (PNG)
  width: number;
  height: number;
}

/**
 * Rasterize page 1 of a PDF to a PNG data URL no wider than `maxWidth`.
 * `data` is consumed by PDF.js — pass a clone if you need the buffer again.
 */
export async function renderPdfFirstPage(data: ArrayBuffer, maxWidth = 600): Promise<PageRaster> {
  const doc = await getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / base.width, 2);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable for plan preview.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  } finally {
    await doc.destroy();
  }
}
