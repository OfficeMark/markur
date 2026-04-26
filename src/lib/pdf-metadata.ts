// Browser-side PDF metadata extraction. Heuristic logic for mismatch detection
// lives in pdf-mismatch.ts (zero dependencies, easier to unit-test).

import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfMetadata } from './pdf-mismatch';

export type { PdfMetadata, MismatchWarning, MismatchContext } from './pdf-mismatch';
export { detectMismatch } from './pdf-mismatch';

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

/**
 * Read the file as a PDF and pull metadata + first-page text.
 * Throws if the file isn't a valid PDF.
 */
export async function readPdfMetadata(file: File): Promise<PdfMetadata> {
  const buf = await file.arrayBuffer();
  const doc = await getDocument({ data: buf }).promise;
  const meta = await doc.getMetadata().catch(() => null);
  // PDF.js typings for getMetadata mark `info` as `Object` — narrow it ourselves.
  const info = (meta?.info ?? {}) as Record<string, unknown>;

  let firstPageText = '';
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    firstPageText = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .filter(Boolean)
      .join(' ')
      .trim()
      .slice(0, 2000);
  } catch {
    // Pages without text (pure raster) just leave firstPageText empty.
  }

  return {
    title: stringOrNull(info.Title),
    author: stringOrNull(info.Author),
    subject: stringOrNull(info.Subject),
    keywords: stringOrNull(info.Keywords),
    pageCount: doc.numPages,
    firstPageText,
  };
}

function stringOrNull(v: unknown): string | null {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}
