// Pure heuristics — no PDF.js dependency, so the unit tests can run in
// happy-dom without pulling in the worker.

export type PdfMetadata = {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  pageCount: number;
  /** First page's text content, joined and truncated. */
  firstPageText: string;
};

export type MismatchWarning = {
  field: 'title' | 'author' | 'pageCount' | 'firstPageText';
  message: string;
};

export type MismatchContext = {
  buildingName: string;
  floorLabel: string;
};

/**
 * Heuristic mismatch detection. All warnings are advisory, never blocking.
 *
 * Rules:
 *   * pageCount > 1 — only page 1 is rendered
 *   * Title doesn't mention the building or the floor
 *   * First-page text doesn't mention the building (only fires when text is
 *     long enough to be meaningful, to avoid false positives on minimal CAD plans)
 */
export function detectMismatch(
  metadata: PdfMetadata,
  ctx: MismatchContext
): MismatchWarning[] {
  const warnings: MismatchWarning[] = [];

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const buildingTokens = norm(ctx.buildingName).split(/\s+/).filter((t) => t.length >= 3);
  const floorNorm = norm(ctx.floorLabel);

  if (metadata.pageCount > 1) {
    warnings.push({
      field: 'pageCount',
      message: `This PDF has ${metadata.pageCount} pages — only the first page will be used as the floor plan.`,
    });
  }

  if (metadata.title) {
    const titleNorm = norm(metadata.title);
    const buildingHit = buildingTokens.some((t) => titleNorm.includes(t));
    const floorHit = floorNorm ? titleNorm.includes(floorNorm) : true;
    if (!buildingHit && !floorHit && titleNorm.length > 3) {
      warnings.push({
        field: 'title',
        message: `PDF title is "${metadata.title}" — doesn't mention "${ctx.buildingName}" or "${ctx.floorLabel}". Make sure this is the right plan.`,
      });
    }
  }

  if (metadata.firstPageText.length > 200) {
    const textNorm = norm(metadata.firstPageText);
    const buildingHit = buildingTokens.some((t) => textNorm.includes(t));
    if (!buildingHit) {
      warnings.push({
        field: 'firstPageText',
        message: `First page text doesn't mention "${ctx.buildingName}". Verify this plan matches the building.`,
      });
    }
  }

  return warnings;
}
