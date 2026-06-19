import { describe, it, expect } from 'vitest';
import {
  prepareCatalogueEntries,
  catalogueFilename,
  catalogueDownloadName,
  buildCatalogueDoc,
  type CatalogueEntry,
} from '@/lib/floor-catalogue';
import type { Asset } from '@/types/database';

function fakeAsset(over: Partial<Asset>): Asset {
  return {
    id: 'a1',
    floor_id: 'f1',
    type: 'directory',
    category: 'signage',
    name: 'Asset',
    location_notes: null,
    x: 0.5,
    y: 0.5,
    manufacturer: null,
    installed_at: null,
    audit_cycle_days: null,
    status: 'good',
    tenant_scope_id: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: null,
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    is_locked: false,
    room_number: null,
    notes: null,
    vendor_contact: null,
    pin_number: null,
    contact_id: null,
    zone: null,
    ...over,
  };
}

describe('prepareCatalogueEntries', () => {
  it('orders pinned assets by pin number, then unpinned by name', () => {
    const entries = prepareCatalogueEntries([
      fakeAsset({ id: 'c', name: 'Zeta', pin_number: null }),
      fakeAsset({ id: 'b', name: 'Beta', pin_number: 3 }),
      fakeAsset({ id: 'a', name: 'Alpha', pin_number: 1 }),
      fakeAsset({ id: 'd', name: 'Apple', pin_number: null }),
    ]);
    expect(entries.map((e) => e.assetId)).toEqual(['a', 'b', 'd', 'c']);
    expect(entries.map((e) => e.pinLabel)).toEqual(['001', '003', '—', '—']);
  });

  it('formats the name fallback and a condition label', () => {
    const entries = prepareCatalogueEntries([
      fakeAsset({ name: '   ', status: 'flagged', pin_number: 7 }),
    ]);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry?.name).toBe('Untitled');
    expect(entry?.pinLabel).toBe('007');
    expect(entry?.conditionLabel.length ?? 0).toBeGreaterThan(0);
  });
});

describe('catalogueFilename', () => {
  it('slugifies the building and floor', () => {
    expect(catalogueFilename('161 Bay St.', 'Floor 3')).toBe('161-bay-st-floor-3-catalogue.pdf');
  });
  it('falls back when names have no usable characters', () => {
    expect(catalogueFilename('   ', '!!!')).toBe('building-floor-catalogue.pdf');
  });
});

describe('catalogueDownloadName', () => {
  it('builds a readable, dated filename for the Save dialog', () => {
    expect(
      catalogueDownloadName('Crescent School', 'Level 300', new Date(2026, 4, 22))
    ).toBe('Markur-Catalogue-Crescent-School-Level-300-2026-05-22.pdf');
  });
  it('falls back when names have no usable characters', () => {
    expect(catalogueDownloadName('   ', '!!!', new Date(2026, 4, 22))).toBe(
      'Markur-Catalogue-Building-Floor-2026-05-22.pdf'
    );
  });
});

describe('buildCatalogueDoc', () => {
  it('builds a PDF document with at least one page', () => {
    const entries: CatalogueEntry[] = prepareCatalogueEntries([
      fakeAsset({ id: 'a', name: 'Lobby directory', pin_number: 1 }),
      fakeAsset({ id: 'b', name: 'Suite 200 plate', pin_number: 2, status: 'attention' }),
    ]).map((d) => ({ ...d, photoDataUrl: null }));
    const doc = buildCatalogueDoc({
      buildingName: '161 Bay St.',
      floorLabel: 'Floor 3',
      addressLine: '161 Bay Street, Toronto, ON',
      generatedOn: new Date('2026-05-14T12:00:00Z'),
      entries,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('paginates a large floor across multiple pages', () => {
    const many: CatalogueEntry[] = Array.from({ length: 30 }, (_, i) => ({
      assetId: `a${i}`,
      pinNumber: i + 1,
      pinLabel: String(i + 1).padStart(3, '0'),
      name: `Asset ${i + 1}`,
      typeLabel: 'Directory',
      conditionLabel: 'Good',
      photoDataUrl: null,
    }));
    const doc = buildCatalogueDoc({
      buildingName: 'Tower',
      floorLabel: 'L1',
      addressLine: null,
      generatedOn: new Date('2026-05-14T12:00:00Z'),
      entries: many,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
