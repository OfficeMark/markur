import { jsPDF } from 'jspdf';
import type { Asset, Building, Flag, Floor } from '@/types/database';
import { labelForType, formatPinNumber } from '@/lib/pin-types';
import { statusLabel, type AssetStatus } from '@/lib/asset-status';

/**
 * Building Audit / Survey Report PDF generator (audit-report-export #1).
 *
 * Companion to `src/lib/floor-catalogue.ts`: the catalogue is one floor, this
 * is the whole building. Two variants share one document; `mode='audit'`
 * shows flag evidence and a status breakdown, `mode='survey'` shows the asset
 * register (and vendor / supplier info when present).
 *
 * Pure jsPDF — no html2canvas. The report DOM and the PDF are independent
 * renderings of the same data; the PDF doesn't try to be a screen capture.
 */

export type ReportMode = 'audit' | 'survey';

/** Photo evidence URLs that have already been resolved to JPEG data URLs. */
export type ReportFlagWithPhotos = Flag & { photoDataUrls: string[] };

export type ReportAssetEntry = {
  asset: Asset;
  pinLabel: string;
  typeLabel: string;
  conditionLabel: string;
  /** Cover photo as a JPEG data URL, or null. */
  photoDataUrl: string | null;
  /** Flags raised on this asset (newest first), with photos resolved. */
  flags: ReportFlagWithPhotos[];
};

export type ReportFloorSection = {
  floor: Floor;
  entries: ReportAssetEntry[];
};

export type ReportStats = {
  totalAssets: number;
  signageCount: number;
  facilityCount: number;
  flaggedCount: number;
  attentionCount: number;
  goodCount: number;
  /** Open + resolved + closed counts — gives the reader the "raised vs. fixed" picture. */
  openFlagCount: number;
  resolvedFlagCount: number;
};

export type BuildReportParams = {
  mode: ReportMode;
  building: Building;
  /** Author / generator name (signed-in user, or "Markur user" fallback). */
  generatedBy: string | null;
  generatedOn: Date;
  sections: ReportFloorSection[];
  stats: ReportStats;
};

// =============================================================================
// Pure helpers (filename, sectioning, stats) — exported for tests + the page.
// =============================================================================

/**
 * Pure: turn a building's data into ordered floor sections with per-asset
 * entries. Used by both the HTML preview and the PDF generator so they
 * never drift. Asset sort = pinned first by pin_number, then unpinned by name.
 */
export function buildReportSections(
  floors: Floor[],
  assetsByFloor: Map<string, Asset[]>,
  flagsByAsset: Map<string, Flag[]>
): ReportFloorSection[] {
  return floors.map((floor) => {
    // Sort here (instead of upstream) so the function is self-contained and
    // testable without the caller having to remember to pre-sort. Pinned
    // assets first by pin_number, then unpinned alphabetically by name —
    // mirrors the floor catalogue's order.
    const assets = [...(assetsByFloor.get(floor.id) ?? [])].sort((x, y) => {
      const xp = x.pin_number;
      const yp = y.pin_number;
      if (xp != null && yp != null) return xp - yp;
      if (xp != null) return -1;
      if (yp != null) return 1;
      return (x.name ?? '').localeCompare(y.name ?? '');
    });
    const entries: ReportAssetEntry[] = assets.map((asset) => ({
      asset,
      pinLabel: formatPinNumber(asset.pin_number) ?? '—',
      typeLabel: labelForType(asset.type),
      conditionLabel: statusLabel(asset.status as AssetStatus),
      photoDataUrl: null,
      flags: (flagsByAsset.get(asset.id) ?? []).map((flag) => ({
        ...flag,
        photoDataUrls: [],
      })),
    }));
    return { floor, entries };
  });
}

/**
 * Pure: collect headline numbers used by the cover + summary page. Counts
 * status from the asset's stored value (computed nightly server-side); the
 * flag splits use the live `status` column on `flags`.
 */
export function computeReportStats(sections: ReportFloorSection[]): ReportStats {
  let totalAssets = 0;
  let signageCount = 0;
  let facilityCount = 0;
  let flaggedCount = 0;
  let attentionCount = 0;
  let goodCount = 0;
  let openFlagCount = 0;
  let resolvedFlagCount = 0;

  for (const section of sections) {
    for (const { asset, flags } of section.entries) {
      totalAssets++;
      if (asset.category === 'facility') facilityCount++;
      else signageCount++;
      switch (asset.status as AssetStatus) {
        case 'flagged':
          flaggedCount++;
          break;
        case 'attention':
          attentionCount++;
          break;
        default:
          goodCount++;
      }
      for (const flag of flags) {
        if (flag.status === 'resolved' || flag.resolved_at) resolvedFlagCount++;
        else openFlagCount++;
      }
    }
  }

  return {
    totalAssets,
    signageCount,
    facilityCount,
    flaggedCount,
    attentionCount,
    goodCount,
    openFlagCount,
    resolvedFlagCount,
  };
}

/**
 * Suggested filename shown in the OS Save dialog. Mirrors the catalogue's
 * naming convention (`Markur-<Type>-<Building>-<YYYY-MM-DD>.pdf`).
 */
export function reportDownloadName(
  buildingName: string,
  mode: ReportMode,
  date: Date
): string {
  const part = (s: string) =>
    s.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const ymd = date.toLocaleDateString('en-CA');
  const kind = mode === 'audit' ? 'AuditReport' : 'SurveyReport';
  return `Markur-${kind}-${part(buildingName) || 'Building'}-${ymd}.pdf`;
}

export function reportTitle(mode: ReportMode): string {
  return mode === 'audit' ? 'Building Audit Report' : 'Building Survey Report';
}

// =============================================================================
// Save-target picker (mirrors floor-catalogue.ts)
// =============================================================================

type ReportFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};
type ShowSaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<ReportFileHandle>;

export type ReportSaveTarget =
  | { kind: 'handle'; handle: ReportFileHandle }
  | { kind: 'download' }
  | { kind: 'cancelled' };

export async function pickReportSaveTarget(
  suggestedName: string
): Promise<ReportSaveTarget> {
  const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;
  if (typeof picker !== 'function') return { kind: 'download' };
  try {
    const handle = await picker({
      suggestedName,
      types: [
        { description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } },
      ],
    });
    return { kind: 'handle', handle };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    return { kind: 'download' };
  }
}

export async function writeReport(
  doc: jsPDF,
  target: ReportSaveTarget,
  fallbackName: string
): Promise<void> {
  if (target.kind === 'handle') {
    try {
      const writable = await target.handle.createWritable();
      await writable.write(doc.output('blob'));
      await writable.close();
      return;
    } catch {
      // Fall through to a plain download.
    }
  }
  doc.save(fallbackName);
}

// =============================================================================
// PDF builder
// =============================================================================

// Colors (rgb). Match the catalogue tokens: ink + gold.
const INK: [number, number, number] = [29, 27, 26];
const GOLD: [number, number, number] = [214, 188, 122];
const MUTED: [number, number, number] = [110, 110, 110];
const FAINT: [number, number, number] = [150, 145, 138];
const HAIRLINE: [number, number, number] = [230, 227, 220];
const FLAG_BG: [number, number, number] = [253, 247, 234];
const FLAG_BG_RESOLVED: [number, number, number] = [248, 248, 246];
const FLAG_BORDER: [number, number, number] = [214, 188, 122];

const PHOTO_MAX_PX = 50; // mm, matches catalogue card photo width

export function buildReportDoc(params: BuildReportParams): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 16;

  drawCover(doc, params, PW, PH, M);

  doc.addPage();
  drawSummary(doc, params, PW, PH, M);

  for (const section of params.sections) {
    doc.addPage();
    drawFloorSection(doc, params, section, PW, PH, M);
  }

  // Footer + page numbers on every page after the cover.
  const pageCount = doc.getNumberOfPages();
  for (let p = 2; p <= pageCount; p++) {
    doc.setPage(p);
    drawRunningFooter(doc, params, p, pageCount, PW, PH, M);
  }

  return doc;
}

// =============================================================================
// Page renderers
// =============================================================================

function drawCover(
  doc: jsPDF,
  params: BuildReportParams,
  PW: number,
  PH: number,
  M: number
): void {
  // Gold accent bar.
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, PW, 6, 'F');

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  // Heading band starts at ~PH/3.
  const heading = reportTitle(params.mode);
  doc.text(heading, M, PH / 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(18);
  doc.text(params.building.name, M, PH / 3 + 14);

  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  const addressLine = formatAddress(params.building);
  if (addressLine) {
    doc.text(addressLine, M, PH / 3 + 22);
  }

  // Generated block, bottom-left.
  const blockY = PH - 50;
  doc.setFontSize(9);
  doc.setTextColor(...FAINT);
  doc.text('REPORT DATE', M, blockY);
  doc.setTextColor(...INK);
  doc.setFontSize(11);
  doc.text(
    params.generatedOn.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    M,
    blockY + 5
  );

  doc.setFontSize(9);
  doc.setTextColor(...FAINT);
  doc.text('GENERATED BY', M, blockY + 14);
  doc.setTextColor(...INK);
  doc.setFontSize(11);
  doc.text(params.generatedBy || 'Markur user', M, blockY + 19);

  // Markur wordmark, bottom-right.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text('Markur', PW - M, PH - 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('by OfficeMark', PW - M, PH - 11, { align: 'right' });
}

function drawSummary(
  doc: jsPDF,
  params: BuildReportParams,
  PW: number,
  PH: number,
  M: number
): void {
  // Heading band — keep the same gold underline used by the catalogue.
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Summary', M, M + 4);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(M, M + 8, PW - M, M + 8);

  let y = M + 18;

  // Intro paragraph — one prose sentence summing up the report.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const intro = introCopy(params);
  const introLines = doc.splitTextToSize(intro, PW - 2 * M);
  doc.text(introLines, M, y);
  y += introLines.length * 5 + 6;

  // Stat cards — two columns, label + value pairs.
  const labels: Array<{ label: string; value: string }> = [
    { label: 'Floors', value: String(params.sections.length) },
    { label: 'Total assets', value: String(params.stats.totalAssets) },
    { label: 'Signage', value: String(params.stats.signageCount) },
    { label: 'Facilities', value: String(params.stats.facilityCount) },
  ];

  if (params.mode === 'audit') {
    labels.push({ label: 'Open flags', value: String(params.stats.openFlagCount) });
    labels.push({
      label: 'Resolved flags',
      value: String(params.stats.resolvedFlagCount),
    });
    labels.push({ label: 'Needs attention', value: String(params.stats.attentionCount) });
    labels.push({ label: 'OK', value: String(params.stats.goodCount) });
  }

  const cardW = (PW - 2 * M - 6) / 2;
  for (let i = 0; i < labels.length; i++) {
    const { label, value } = labels[i]!;
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = M + col * (cardW + 6);
    const cy = y + row * 22;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy, cardW, 18, 1.5, 1.5, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...FAINT);
    doc.text(label.toUpperCase(), cx + 4, cy + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text(value, cx + 4, cy + 14);
  }
  y += Math.ceil(labels.length / 2) * 22 + 4;

  // Floors at-a-glance list.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text('Floors covered', M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  for (const section of params.sections) {
    if (y > PH - 25) break; // summary is one page; long lists overflow elsewhere
    const count = section.entries.length;
    doc.text(
      `• ${section.floor.label} — ${count} asset${count === 1 ? '' : 's'}`,
      M,
      y
    );
    y += 5;
  }
}

function drawFloorSection(
  doc: jsPDF,
  params: BuildReportParams,
  section: ReportFloorSection,
  PW: number,
  PH: number,
  M: number
): void {
  // Floor heading.
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(section.floor.label, M, M + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...FAINT);
  doc.text(
    `${section.entries.length} asset${section.entries.length === 1 ? '' : 's'}`,
    PW - M,
    M + 4,
    { align: 'right' }
  );
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(M, M + 8, PW - M, M + 8);

  let y = M + 14;

  if (section.entries.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('No assets recorded on this floor yet.', M, y + 6);
    return;
  }

  for (const entry of section.entries) {
    const cardH = estimateEntryHeight(params, entry);
    if (y + cardH > PH - M - 8) {
      doc.addPage();
      y = M + 4;
    }
    drawAssetEntry(doc, params, entry, PW, M, y);
    y += cardH + 2;
  }
}

function drawAssetEntry(
  doc: jsPDF,
  params: BuildReportParams,
  entry: ReportAssetEntry,
  PW: number,
  M: number,
  yTop: number
): void {
  const PHOTO_H = 37;
  // Photo / placeholder.
  doc.setFillColor(238, 235, 228);
  doc.rect(M, yTop, PHOTO_MAX_PX, PHOTO_H, 'F');
  if (entry.photoDataUrl) {
    try {
      doc.addImage(
        entry.photoDataUrl,
        'JPEG',
        M,
        yTop,
        PHOTO_MAX_PX,
        PHOTO_H,
        undefined,
        'FAST'
      );
    } catch {
      // Leave the placeholder box if the embed fails.
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...FAINT);
    doc.text('No photo', M + PHOTO_MAX_PX / 2, yTop + PHOTO_H / 2, { align: 'center' });
  }

  const tx = M + PHOTO_MAX_PX + 6;
  let ty = yTop + 3;

  // Pin number chip.
  doc.setFillColor(...INK);
  doc.roundedRect(tx, ty, 20, 9, 1.4, 1.4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`#${entry.pinLabel}`, tx + 10, ty + 6.2, { align: 'center' });

  // Asset name.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  const namex = tx + 24;
  const nameMax = PW - M - namex;
  const nameLines = doc.splitTextToSize(entry.asset.name?.trim() || 'Untitled', nameMax);
  doc.text(String(nameLines[0] ?? ''), namex, ty + 6.4);
  ty += 12;

  // Meta lines (type, condition, location).
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Type: ${entry.typeLabel}`, tx, ty);
  ty += 4.5;
  doc.text(`Condition: ${entry.conditionLabel}`, tx, ty);
  ty += 4.5;
  if (entry.asset.location_notes?.trim()) {
    const loc = entry.asset.location_notes.trim();
    const locLines = doc.splitTextToSize(`Location: ${loc}`, PW - M - tx);
    doc.text(String(locLines[0] ?? ''), tx, ty);
    ty += 4.5;
  }

  // Vendor info — Survey only. Audit reports hide the noise.
  if (params.mode === 'survey') {
    const v = entry.asset.vendor_contact as
      | { name?: string | null; company?: string | null; url?: string | null }
      | null
      | undefined;
    if (v && (v.name || v.company || v.url)) {
      doc.setTextColor(...FAINT);
      doc.setFontSize(8);
      const bits = [v.company, v.name, v.url].filter(Boolean).join(' · ');
      const vLines = doc.splitTextToSize(`Vendor: ${bits}`, PW - M - tx);
      doc.text(String(vLines[0] ?? ''), tx, ty);
    }
  }

  // Audit-mode flag list.
  if (params.mode === 'audit' && entry.flags.length > 0) {
    let fy = yTop + PHOTO_H + 3;
    for (const flag of entry.flags) {
      const isOpen = flag.status !== 'resolved' && !flag.resolved_at;
      const bgY = fy - 1;
      const bgH = flagBoxHeight(doc, flag, PW, M);
      doc.setFillColor(...(isOpen ? FLAG_BG : FLAG_BG_RESOLVED));
      doc.setDrawColor(...(isOpen ? FLAG_BORDER : HAIRLINE));
      doc.setLineWidth(0.3);
      doc.roundedRect(M, bgY, PW - 2 * M, bgH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      const badge = isOpen ? 'FLAGGED' : 'RESOLVED';
      doc.text(badge, M + 3, fy + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...FAINT);
      const meta = flag.created_at
        ? new Date(flag.created_at).toLocaleDateString('en-CA')
        : '';
      if (meta) doc.text(meta, PW - M - 3, fy + 4, { align: 'right' });

      doc.setTextColor(...INK);
      doc.setFontSize(9);
      const descLines = doc.splitTextToSize(
        flag.description || '(no description)',
        PW - 2 * M - 6
      );
      doc.text(descLines, M + 3, fy + 9);
      fy += bgH + 2;
    }
  }
}

function drawRunningFooter(
  doc: jsPDF,
  params: BuildReportParams,
  page: number,
  pageCount: number,
  PW: number,
  PH: number,
  M: number
): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...FAINT);
  doc.text('Markur, by OfficeMark', M, PH - 8);
  const dateStr = params.generatedOn.toLocaleDateString('en-CA');
  doc.text(`${params.building.name} · ${dateStr}`, PW / 2, PH - 8, { align: 'center' });
  doc.text(`Page ${page} of ${pageCount}`, PW - M, PH - 8, { align: 'right' });
}

// =============================================================================
// Small layout helpers
// =============================================================================

function estimateEntryHeight(
  params: BuildReportParams,
  entry: ReportAssetEntry
): number {
  let h = 44; // base card (photo + meta)
  if (params.mode === 'audit') {
    for (const flag of entry.flags) {
      h += flagBoxHeight(undefined, flag, undefined, undefined) + 2;
    }
  }
  return h;
}

function flagBoxHeight(
  doc: jsPDF | undefined,
  flag: Flag,
  PW: number | undefined,
  M: number | undefined
): number {
  // Heuristic: 13mm minimum, plus 4mm per wrapped description line beyond the
  // first. Without a doc to measure, ~80 chars per line gives a safe overshoot.
  const desc = flag.description ?? '';
  let lines = 1;
  if (doc && PW != null && M != null) {
    const wrapped = doc.splitTextToSize(desc, PW - 2 * M - 6) as string[];
    lines = Math.max(1, wrapped.length);
  } else {
    lines = Math.max(1, Math.ceil(desc.length / 80));
  }
  return 13 + Math.max(0, lines - 1) * 4;
}

function formatAddress(building: Building): string | null {
  const bits = [building.address, building.city, building.region].filter(Boolean);
  return bits.length > 0 ? bits.join(', ') : null;
}

function introCopy(params: BuildReportParams): string {
  if (params.mode === 'audit') {
    return (
      `This report summarises the current audit state of ${params.building.name}. ` +
      `It includes every flagged asset, the description of each issue raised, ` +
      `and any photo evidence captured during the most recent walkaround. Assets ` +
      `marked OK are listed for completeness so the reader can confirm the full ` +
      `register was reviewed.`
    );
  }
  return (
    `This report is the install record for ${params.building.name}: every asset ` +
    `tracked in Markur, grouped by floor, with cover photos, type, condition, and ` +
    `vendor / supplier information where it has been recorded.`
  );
}
