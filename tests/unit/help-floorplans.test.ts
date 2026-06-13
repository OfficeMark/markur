import { describe, it, expect } from 'vitest';
import { SECTIONS } from '@/routes/Help';

describe('Help — Preparing your floor plans section', () => {
  const section = SECTIONS.find((s) => s.id === 'floorplans');

  it('exists with an anchor id so /help#floorplans deep-links work', () => {
    expect(section).toBeDefined();
    expect(section?.title).toMatch(/floor plan/i);
  });

  it('covers the main plan sources (PDF, AutoCAD, scan, naming)', () => {
    const labels = (section?.steps ?? []).map((s) => s.label.toLowerCase()).join(' | ');
    expect(labels).toContain('pdf');
    expect(labels).toContain('autocad');
    expect(labels).toMatch(/scan|photo/);
    expect(section?.steps.length).toBeGreaterThanOrEqual(4);
  });

  it('gives concrete export guidance (300 DPI, monochrome, one floor per file)', () => {
    const detail = (section?.steps ?? []).map((s) => s.detail).join(' ');
    expect(detail).toMatch(/300\s*DPI/i);
    expect(detail.toLowerCase()).toContain('monochrome');
    expect(detail.toLowerCase()).toContain('one floor per');
  });
});
