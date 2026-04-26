import { describe, it, expect } from 'vitest';
import { detectMismatch, type PdfMetadata } from '@/lib/pdf-mismatch';

const base: PdfMetadata = {
  title: null,
  author: null,
  subject: null,
  keywords: null,
  pageCount: 1,
  firstPageText: '',
};

describe('detectMismatch', () => {
  it('returns no warnings for a clean match', () => {
    const meta: PdfMetadata = {
      ...base,
      title: '161 Bay - Ground Floor',
    };
    const warnings = detectMismatch(meta, { buildingName: '161 Bay St.', floorLabel: 'Ground' });
    expect(warnings).toEqual([]);
  });

  it('warns on multi-page PDFs', () => {
    const meta: PdfMetadata = { ...base, pageCount: 3 };
    const warnings = detectMismatch(meta, { buildingName: '161 Bay St.', floorLabel: 'Ground' });
    expect(warnings.some((w) => w.field === 'pageCount')).toBe(true);
  });

  it('warns on mismatched title', () => {
    const meta: PdfMetadata = { ...base, title: 'Simcoe Place — Floor 4' };
    const warnings = detectMismatch(meta, { buildingName: '161 Bay St.', floorLabel: 'Ground' });
    expect(warnings.some((w) => w.field === 'title')).toBe(true);
  });

  it('does not warn when title contains the floor label', () => {
    const meta: PdfMetadata = { ...base, title: 'Ground Floor Plan' };
    const warnings = detectMismatch(meta, { buildingName: '161 Bay St.', floorLabel: 'Ground' });
    expect(warnings.find((w) => w.field === 'title')).toBeUndefined();
  });

  it('warns when first-page text is long but never mentions the building', () => {
    const long = Array.from({ length: 30 }, () => 'wallpaper drywall hvac sprinkler').join(' ');
    const meta: PdfMetadata = { ...base, firstPageText: long };
    const warnings = detectMismatch(meta, { buildingName: '161 Bay St.', floorLabel: 'Ground' });
    expect(warnings.some((w) => w.field === 'firstPageText')).toBe(true);
  });

  it('skips first-page warning when text is too short to be meaningful', () => {
    const meta: PdfMetadata = { ...base, firstPageText: 'wallpaper drywall' };
    const warnings = detectMismatch(meta, { buildingName: '161 Bay St.', floorLabel: 'Ground' });
    expect(warnings.find((w) => w.field === 'firstPageText')).toBeUndefined();
  });
});
