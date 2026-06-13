import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FloorCatalogueView } from '@/components/waymarks/FloorCatalogueView';
import type { Asset, Building, Floor } from '@/types/database';

// The view loads thumbnail URLs in an effect; stub the photo layer so the test
// stays synchronous and offline.
vi.mock('@/lib/queries/asset-photos', () => ({
  listFirstPhotoPaths: vi.fn(async () => new Map<string, string>()),
  signedAssetPhotoUrl: vi.fn(async () => ''),
}));

const building = { id: 'b1', name: 'Capital One', address: '1 Bay', city: 'Toronto', region: 'ON' } as unknown as Building;
const floor = { id: 'f1', label: '16', building_id: 'b1' } as unknown as Floor;
const assets = [
  { id: 'a1', name: 'Lobby directory', type: 'directory', status: 'good', pin_number: 1 },
  { id: 'a2', name: 'Stairwell A', type: 'egress', status: 'flagged', pin_number: 2 },
] as unknown as Asset[];

describe('FloorCatalogueView', () => {
  it('renders a header, a card per sign, and Print/Download actions', () => {
    render(
      <FloorCatalogueView
        building={building}
        floor={floor}
        assets={assets}
        onBack={() => {}}
        generatedOn={new Date('2026-06-13T12:00:00Z')}
      />
    );
    expect(screen.getByText(/Capital One — Floor 16/)).toBeInTheDocument();
    expect(screen.getByText('Lobby directory')).toBeInTheDocument();
    expect(screen.getByText('Stairwell A')).toBeInTheDocument();
    expect(screen.getByText(/2 signs/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });
});
