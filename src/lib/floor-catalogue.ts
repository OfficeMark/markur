import { jsPDF } from 'jspdf';
import type { Asset } from '@/types/database';
import { formatPinNumber, labelForType } from '@/lib/pin-types';
import { statusLabel, type AssetStatus } from '@/lib/asset-status';

/**
 * Floor photo catalogue (markur-changes #4).
 *
 * Generates a clean, client-sendable PDF of every asset on a floor: one card
 * per asset with its photo, prominent pin ID, name, type, condition, and the
 * building / floor reference. jsPDF builds the document; this module keeps the
 * pure layout + ordering logic separate from the (async, network-bound) photo
 * loading, which lives in the Floor route.
 */

export type CatalogueEntry = {
  assetId: string;
  pinNumber: number | null;
  /** Zero-padded display form, or "—" when the asset has no pin number. */
  pinLabel: string;
  name: string;
  typeLabel: string;
  conditionLabel: string;
  /** A JPEG data URL, or null when the asset has no photo / it failed to load. */
  photoDataUrl: string | null;
};

/** A catalogue entry before its photo has been loaded. */
export type CatalogueEntryDraft = Omit<CatalogueEntry, 'photoDataUrl'>;

/**
 * Pure: turn a floor's assets into ordered catalogue entries. Pinned assets
 * come first, ordered by pin number; any without a number sort to the end by
 * name. Photo data URLs are filled in later by the async loader in Floor.tsx.
 */
export function prepareCatalogueEntries(assets: Asset[]): CatalogueEntryDraft[] {
  return assets
    .map((a) => ({
      assetId: a.id,
      pinNumber: a.pin_number ?? null,
      pinLabel: formatPinNumber(a.pin_number) ?? '—',
      name: a.name?.trim() || 'Untitled',
      typeLabel: labelForType(a.type),
      conditionLabel: statusLabel(a.status as AssetStatus),
    }))
    .sort((a, b) => {
      if (a.pinNumber != null && b.pinNumber != null) return a.pinNumber - b.pinNumber;
      if (a.pinNumber != null) return -1;
      if (b.pinNumber != null) return 1;
      return a.name.localeCompare(b.name);
    });
}

/** Filesystem-safe catalogue filename, e.g. "161-bay-st-floor-3-catalogue.pdf". */
export function catalogueFilename(buildingName: string, floorLabel: string): string {
  const slug = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slug(buildingName) || 'building'}-${slug(floorLabel) || 'floor'}-catalogue.pdf`;
}

/**
 * Suggested filename shown in the OS Save dialog, e.g.
 * "Markur-Catalogue-Crescent-School-Level-300-2026-05-22.pdf". Keeps the
 * building / floor words readable (hyphen-joined, original casing) and dates
 * it with the en-CA locale, which formats as YYYY-MM-DD.
 */
export function catalogueDownloadName(
  buildingName: string,
  floorLabel: string,
  date: Date
): string {
  const part = (s: string) =>
    s.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const ymd = date.toLocaleDateString('en-CA');
  return `Markur-Catalogue-${part(buildingName) || 'Building'}-${
    part(floorLabel) || 'Floor'
  }-${ymd}.pdf`;
}

// Minimal structural types for the File System Access API. It is not in every
// TS DOM lib version, and we only touch the handful of members used below.
type CatalogueFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};
type ShowSaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<CatalogueFileHandle>;

/**
 * Where the finished catalogue PDF should be written:
 *  - `handle`    — the user picked a location via the OS Save dialog (Chromium)
 *  - `tab`       — no Save dialog (Safari/iOS/Firefox); show the PDF in a new
 *                  browser tab. iOS Safari ignores `<a download>`, so a plain
 *                  `doc.save()` there silently does nothing — opening a tab is
 *                  the reliable delivery. The tab is opened up front (while the
 *                  click's user activation is live) so a popup blocker can't
 *                  kill it after the async build.
 *  - `download`  — tab couldn't be opened (popup-blocked); plain download
 *  - `cancelled` — the user dismissed the Save dialog; do nothing
 */
export type CatalogueSaveTarget =
  | { kind: 'handle'; handle: CatalogueFileHandle }
  | { kind: 'tab'; win: Window }
  | { kind: 'download' }
  | { kind: 'cancelled' };

/**
 * Step 1 — open the OS "Save As" dialog. MUST be called synchronously-ish from
 * the click handler, before the slow photo-loading work: showSaveFilePicker
 * needs the click's user activation, which expires after a few seconds.
 * Falls back to `download` where the API is unavailable.
 */
export async function pickCatalogueSaveTarget(
  suggestedName: string
): Promise<CatalogueSaveTarget> {
  const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;
  if (typeof picker !== 'function') {
    // No OS Save dialog (Safari/iOS/Firefox). Open a tab NOW, while the click's
    // user activation is still live, so the popup blocker lets it through; we
    // navigate it to the finished PDF in writeCatalogue. A placeholder keeps
    // the tab from looking broken during the (slow) photo load.
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalogue</title></head>' +
          '<body style="margin:0;font:16px/1.5 system-ui,sans-serif;color:#1F2938;background:#f5f3ee;display:flex;align-items:center;justify-content:center;height:100vh">' +
          'Generating your catalogue…</body></html>'
      );
      win.document.close();
      return { kind: 'tab', win };
    }
    return { kind: 'download' };
  }
  try {
    const handle = await picker({
      suggestedName,
      types: [
        { description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } },
      ],
    });
    return { kind: 'handle', handle };
  } catch (err) {
    // AbortError = the user dismissed the dialog. Any other failure degrades
    // to a plain download so the export still completes.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    return { kind: 'download' };
  }
}

/**
 * Step 2 — write the built PDF to the chosen target. Run after the document is
 * assembled. If writing to the picked handle fails, falls back to a download.
 */
export async function writeCatalogue(
  doc: jsPDF,
  target: CatalogueSaveTarget,
  fallbackName: string
): Promise<void> {
  if (target.kind === 'handle') {
    try {
      const writable = await target.handle.createWritable();
      await writable.write(doc.output('blob'));
      await writable.close();
      return;
    } catch {
      // Fall through to a plain download if the write fails.
    }
  }
  if (target.kind === 'tab') {
    try {
      const url = URL.createObjectURL(doc.output('blob'));
      target.win.location.href = url;
      // Don't revoke immediately — the tab is now displaying this URL.
      return;
    } catch {
      // Couldn't hand the blob to the tab; close it and fall back to download.
      try {
        target.win.close();
      } catch {
        /* ignore */
      }
    }
  }
  doc.save(fallbackName);
}

/**
 * Close a pre-opened catalogue tab (used by callers when the build fails before
 * the PDF was handed over, so a stuck "Generating…" tab doesn't linger).
 */
export function abortCatalogueTarget(target: CatalogueSaveTarget): void {
  if (target.kind === 'tab') {
    try {
      target.win.close();
    } catch {
      /* ignore */
    }
  }
}

export type BuildCatalogueParams = {
  buildingName: string;
  floorLabel: string;
  addressLine: string | null;
  generatedOn: Date;
  entries: CatalogueEntry[];
  /** Plan provenance caption (null when none). */
  provenanceLabel?: string | null;
};

/**
 * Build the catalogue PDF document. Pure given its inputs (no network) — the
 * caller loads photo data URLs first. Returns the jsPDF instance so the caller
 * can `.save()` it (or, in tests, inspect it).
 */
export function buildCatalogueDoc(params: BuildCatalogueParams): jsPDF {
  const { buildingName, floorLabel, addressLine, generatedOn, entries, provenanceLabel } = params;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 14;

  // ---- Header band (first page only) ----
  doc.setFillColor(29, 27, 26); // waymarks-ink
  doc.rect(0, 0, PW, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Markur', M, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(214, 188, 122); // gold
  doc.text('SIGNAGE CATALOGUE', M, 19);
  doc.setTextColor(255, 255, 255);
  doc.text(
    generatedOn.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
    PW - M,
    19,
    { align: 'right' }
  );

  let y = 38;
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${buildingName} — ${floorLabel}`, M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  if (addressLine) {
    doc.text(addressLine, M, y);
    y += 5;
  }
  const pinned = entries.filter((e) => e.pinNumber != null).length;
  doc.text(
    `${entries.length} asset${entries.length === 1 ? '' : 's'} · ${pinned} pinned on plan`,
    M,
    y
  );
  y += 5;
  if (provenanceLabel) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 140, 140);
    doc.text(provenanceLabel, M, y);
    doc.setFont('helvetica', 'normal');
    y += 5;
  }
  doc.setDrawColor(214, 188, 122);
  doc.setLineWidth(0.4);
  doc.line(M, y, PW - M, y);
  y += 7;

  // ---- Asset cards ----
  const CARD_H = 44;
  const PHOTO_W = 50;
  const PHOTO_H = 37;
  for (const entry of entries) {
    if (y + CARD_H > PH - M) {
      doc.addPage();
      y = M;
    }
    const top = y;

    // photo (or a placeholder box)
    doc.setFillColor(238, 235, 228);
    doc.rect(M, top, PHOTO_W, PHOTO_H, 'F');
    if (entry.photoDataUrl) {
      try {
        doc.addImage(entry.photoDataUrl, 'JPEG', M, top, PHOTO_W, PHOTO_H, undefined, 'FAST');
      } catch {
        // Leave the placeholder box if the image can't be embedded.
      }
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150, 145, 138);
      doc.text('No photo', M + PHOTO_W / 2, top + PHOTO_H / 2, { align: 'center' });
    }

    const tx = M + PHOTO_W + 6;
    let ty = top + 3;

    // prominent ID chip
    doc.setFillColor(29, 27, 26);
    doc.roundedRect(tx, ty, 20, 9, 1.4, 1.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(`#${entry.pinLabel}`, tx + 10, ty + 6.2, { align: 'center' });

    // name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    const nameLines = doc.splitTextToSize(entry.name, PW - M - (tx + 24));
    doc.text(String(nameLines[0] ?? entry.name), tx + 24, ty + 6.4);
    ty += 13;

    // type + condition
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(`Type: ${entry.typeLabel}`, tx, ty);
    ty += 5.5;
    doc.text(`Condition: ${entry.conditionLabel}`, tx, ty);

    // building / floor reference
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 145, 138);
    doc.text(`${buildingName} · ${floorLabel}`, tx, top + PHOTO_H - 1);

    y = top + CARD_H;
    doc.setDrawColor(230, 227, 220);
    doc.setLineWidth(0.3);
    doc.line(M, y - 4, PW - M, y - 4);
  }

  // ---- Footer on every page ----
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 145, 138);
    doc.text(`${buildingName} — ${floorLabel} · Signage Catalogue`, M, PH - 6);
    doc.text(`Page ${p} of ${pageCount}`, PW - M, PH - 6, { align: 'right' });
  }

  return doc;
}
