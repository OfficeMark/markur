import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BuildingNav } from '@/components/waymarks/BuildingNav';

const exampleBuilding = {
  id: 'b-1',
  name: '161 Bay St.',
  address: '161 Bay Street',
  city: 'Toronto',
  region: 'ON',
  country: 'CA',
  total_floors: 5,
  owner_org_id: null,
  settings: {},
  created_at: '2026-04-26T00:00:00Z',
  updated_at: '2026-04-26T00:00:00Z',
  deleted_at: null,
};

const ground = {
  id: 'f-ground',
  building_id: 'b-1',
  label: 'Ground',
  sort_order: 2,
  plan_url: null,
  plan_metadata: null,
  width_px: null,
  height_px: null,
  audit_cycle_days: null,
  created_at: '2026-04-26T00:00:00Z',
  updated_at: '2026-04-26T00:00:00Z',
  deleted_at: null,
};

vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: () => ({ data: [exampleBuilding], isLoading: false }),
  useBuilding: () => ({ data: exampleBuilding, isLoading: false }),
}));

vi.mock('@/hooks/useFloors', () => ({
  useFloors: () => ({ data: [ground], isLoading: false }),
  useFloor: () => ({ data: ground, isLoading: false }),
}));

describe('BuildingNav', () => {
  it('renders the buildings header and seeded building', () => {
    render(
      <MemoryRouter>
        <BuildingNav />
      </MemoryRouter>
    );
    expect(screen.getByText(/buildings/i)).toBeInTheDocument();
    expect(screen.getByText('161 Bay St.')).toBeInTheDocument();
  });

  it('renders floors under their building', () => {
    render(
      <MemoryRouter>
        <BuildingNav />
      </MemoryRouter>
    );
    expect(screen.getByText('Ground')).toBeInTheDocument();
  });

  it('floor links point to /floors/:id', () => {
    render(
      <MemoryRouter>
        <BuildingNav />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /ground/i });
    expect(link).toHaveAttribute('href', '/floors/f-ground');
  });
});
