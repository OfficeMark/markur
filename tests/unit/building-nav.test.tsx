import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  // NewBuildingDialog (rendered inside BuildingNav's NavList) calls this on
  // mount — needs a mutation-shaped stub or the dialog throws.
  useCreateBuilding: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock('@/hooks/useFloors', () => ({
  useFloors: () => ({ data: [ground], isLoading: false }),
  useFloor: () => ({ data: ground, isLoading: false }),
}));

// BuildingNav now reads buildings + their nested floors from the get_app_boot
// bundle instead of useBuildings/useFloors.
vi.mock('@/hooks/useBundles', () => ({
  useAppBoot: () => ({
    data: { buildings: [{ ...exampleBuilding, floors: [ground] }], branding: [], asset_types: [] },
    isLoading: false,
  }),
}));

// NewBuildingDialog reads the permissions context; without a real
// <PermissionsProvider> in the tree the hook throws, so stub the module.
vi.mock('@/lib/permissions-context', () => ({
  usePermissions: () => ({
    grants: [],
    loading: false,
    refreshGrants: vi.fn(async () => {}),
  }),
  useCan: () => false,
  useIsSuperAdmin: () => false,
}));

// NewBuildingDialog also pulls the org picker, which uses TanStack Query.
vi.mock('@/hooks/useOrgPickerOptions', () => ({
  useOrgPickerOptions: () => ({ options: [], loading: false }),
}));

// BuildingNav's tree (NewBuildingDialog) expects a QueryClient in context.
// The data hooks above are mocked, so this client never actually fetches.
function renderNav() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BuildingNav />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BuildingNav', () => {
  it('renders the buildings header and seeded building', () => {
    renderNav();
    expect(screen.getByText(/buildings/i)).toBeInTheDocument();
    expect(screen.getByText('161 Bay St.')).toBeInTheDocument();
  });

  // Item 8: floors are hidden at the top level and revealed on drill-in.
  it('hides floors until the building is expanded', () => {
    renderNav();
    expect(screen.queryByText('Ground')).not.toBeInTheDocument();
  });

  it('renders floors under their building once expanded', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: /show floors in 161 Bay St\./i }));
    expect(screen.getByText('Ground')).toBeInTheDocument();
  });

  it('floor links point to /floors/:id once expanded', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: /show floors in 161 Bay St\./i }));
    const link = screen.getByRole('link', { name: /ground/i });
    expect(link).toHaveAttribute('href', '/floors/f-ground');
  });
});
