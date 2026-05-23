import { describe, it, expect } from 'vitest';
import {
  buildReportDoc,
  buildReportSections,
  computeReportStats,
  reportDownloadName,
  reportTitle,
} from '@/lib/audit-report';
import type { Asset, Building, Flag, Floor } from '@/types/database';

function fakeBuilding(over: Partial<Building> = {}): Building {
  return {
    id: 'b1',
    name: 'BAS Tower',
    address: '100 Main St',
    city: 'Toronto',
    region: 'ON',
    country: 'CA',
    photo_url: null,
    total_floors: 0,
    settings: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    owner_org_id: null,
    ...(over as Building),
  } as Building;
}

function fakeFloor(over: Partial<Floor>): Floor {
  return {
    id: 'f1',
    building_id: 'b1',
    label: 'Ground floor',
    sort_order: 10,
    plan_url: null,
    plan_metadata: null,
    width_px: null,
    height_px: null,
    audit_cycle_days: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  } as Floor;
}

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
    ...over,
  } as Asset;
}

function fakeFlag(over: Partial<Flag>): Flag {
  return {
    id: 'g1',
    asset_id: 'a1',
    raised_by: 'u1',
    resolved_by: null,
    resolved_at: null,
    description: 'Sign missing',
    photo_urls: [],
    status: 'open',
    severity: 'medium',
    created_at: '2026-05-22T12:00:00Z',
    ...over,
  } as Flag;
}

describe('reportTitle', () => {
  it('labels the audit and survey variants distinctly', () => {
    expect(reportTitle('audit')).toBe('Building Audit Report');
    expect(reportTitle('survey')).toBe('Building Survey Report');
  });
});

describe('reportDownloadName', () => {
  it('builds a readable, dated Audit filename', () => {
    expect(
      reportDownloadName('BAS Tower', 'audit', new Date(2026, 4, 23))
    ).toBe('Markur-AuditReport-BAS-Tower-2026-05-23.pdf');
  });
  it('uses SurveyReport for the survey variant', () => {
    expect(
      reportDownloadName('Crescent School', 'survey', new Date(2026, 4, 23))
    ).toBe('Markur-SurveyReport-Crescent-School-2026-05-23.pdf');
  });
  it('falls back when the building name has no usable characters', () => {
    expect(reportDownloadName('   ', 'audit', new Date(2026, 4, 23))).toBe(
      'Markur-AuditReport-Building-2026-05-23.pdf'
    );
  });
});

describe('buildReportSections', () => {
  it('groups assets by floor and orders pinned-first, then unpinned by name', () => {
    const floors = [fakeFloor({ id: 'f1', label: 'L1' }), fakeFloor({ id: 'f2', label: 'L2' })];
    const assets = new Map<string, Asset[]>([
      [
        'f1',
        [
          fakeAsset({ id: 'a-zeta', floor_id: 'f1', name: 'Zeta', pin_number: null }),
          fakeAsset({ id: 'a-001', floor_id: 'f1', name: 'A1', pin_number: 1 }),
          fakeAsset({ id: 'a-002', floor_id: 'f1', name: 'A2', pin_number: 2 }),
        ],
      ],
      ['f2', [fakeAsset({ id: 'a-l2', floor_id: 'f2', name: 'Only', pin_number: 7 })]],
    ]);
    const flags = new Map<string, Flag[]>([
      ['a-002', [fakeFlag({ id: 'g-001', asset_id: 'a-002' })]],
    ]);
    const sections = buildReportSections(floors, assets, flags);
    expect(sections.map((s) => s.floor.id)).toEqual(['f1', 'f2']);
    const f1Ids = sections[0]!.entries.map((e) => e.asset.id);
    expect(f1Ids[0]).toBe('a-001');
    expect(f1Ids[1]).toBe('a-002');
    expect(f1Ids[2]).toBe('a-zeta');
    expect(sections[0]!.entries[1]!.flags).toHaveLength(1);
    expect(sections[0]!.entries[1]!.pinLabel).toBe('002');
  });
});

describe('computeReportStats', () => {
  it('tallies categories, statuses, and flag open/resolved buckets', () => {
    const floors = [fakeFloor({ id: 'f1' })];
    const assets = new Map<string, Asset[]>([
      [
        'f1',
        [
          fakeAsset({ id: 'a1', status: 'good' }),
          fakeAsset({ id: 'a2', status: 'attention', category: 'facility' }),
          fakeAsset({ id: 'a3', status: 'flagged' }),
        ],
      ],
    ]);
    const flags = new Map<string, Flag[]>([
      [
        'a3',
        [
          fakeFlag({ id: 'g-open', asset_id: 'a3', status: 'open' }),
          fakeFlag({
            id: 'g-resolved',
            asset_id: 'a3',
            status: 'resolved',
            resolved_at: '2026-05-22T13:00:00Z',
          }),
        ],
      ],
    ]);
    const sections = buildReportSections(floors, assets, flags);
    const stats = computeReportStats(sections);
    expect(stats.totalAssets).toBe(3);
    expect(stats.signageCount).toBe(2);
    expect(stats.facilityCount).toBe(1);
    expect(stats.goodCount).toBe(1);
    expect(stats.attentionCount).toBe(1);
    expect(stats.flaggedCount).toBe(1);
    expect(stats.openFlagCount).toBe(1);
    expect(stats.resolvedFlagCount).toBe(1);
  });
});

describe('buildReportDoc', () => {
  it('renders a multi-page document for both modes', () => {
    const building = fakeBuilding();
    const floors = [fakeFloor({ id: 'f1', label: 'L1' }), fakeFloor({ id: 'f2', label: 'L2' })];
    const assetsByFloor = new Map<string, Asset[]>([
      ['f1', [fakeAsset({ id: 'a1', floor_id: 'f1', name: 'Lobby directory', pin_number: 1 })]],
      [
        'f2',
        [
          fakeAsset({
            id: 'a2',
            floor_id: 'f2',
            name: 'Suite 200',
            pin_number: 2,
            status: 'flagged',
          }),
        ],
      ],
    ]);
    const flagsByAsset = new Map<string, Flag[]>([
      ['a2', [fakeFlag({ id: 'g1', asset_id: 'a2' })]],
    ]);
    const sections = buildReportSections(floors, assetsByFloor, flagsByAsset);
    const stats = computeReportStats(sections);

    for (const mode of ['audit', 'survey'] as const) {
      const doc = buildReportDoc({
        mode,
        building,
        generatedBy: 'Randy',
        generatedOn: new Date('2026-05-23T12:00:00Z'),
        sections,
        stats,
      });
      // Cover + summary + 2 floors = 4 pages minimum.
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    }
  });
});
