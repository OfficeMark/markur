import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

// Mutable mock state, set per test.
type Grant = { role: string; scope_type: string; scope_id: string | null; expires_at: string | null };
let mockGrants: Grant[] = [];
let mockSuper = false;
let mockOrg: { id: string; name: string; subscription_status: string; trial_ends_at: string | null } | null = null;

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false, signOut: vi.fn() }),
}));
vi.mock('@/lib/permissions-context', () => ({
  usePermissions: () => ({ grants: mockGrants, loading: false, refreshGrants: vi.fn() }),
  useIsSuperAdmin: () => mockSuper,
}));
vi.mock('@/lib/queries/organizations', () => ({
  getOrgStatus: vi.fn(async () => mockOrg),
}));

const ORG_ID = '124afbb7-d91e-494f-bf33-731c083e3ad1';
const orgAdminGrant: Grant = {
  role: 'building_admin',
  scope_type: 'organization',
  scope_id: ORG_ID,
  expires_at: null,
};

function renderRoute() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProtectedRoute>
          <div>APP CONTENT</div>
        </ProtectedRoute>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProtectedRoute — trial lockout gate', () => {
  beforeEach(() => {
    mockGrants = [];
    mockSuper = false;
    mockOrg = null;
  });

  it('shows the lockout screen for an org admin of an EXPIRED org', async () => {
    mockGrants = [orgAdminGrant];
    mockOrg = { id: ORG_ID, name: 'Test Lockout Org', subscription_status: 'expired', trial_ends_at: null };
    renderRoute();
    expect(await screen.findByText(/subscription has expired/i)).toBeInTheDocument();
    expect(screen.queryByText('APP CONTENT')).toBeNull();
  });

  it('never locks out a global super_admin, even on an expired org', async () => {
    mockGrants = [orgAdminGrant];
    mockSuper = true;
    mockOrg = { id: ORG_ID, name: 'Test Lockout Org', subscription_status: 'expired', trial_ends_at: null };
    renderRoute();
    expect(await screen.findByText('APP CONTENT')).toBeInTheDocument();
  });

  it('renders the app for an active org', async () => {
    mockGrants = [orgAdminGrant];
    mockOrg = { id: ORG_ID, name: 'OfficeMark Demo', subscription_status: 'active', trial_ends_at: null };
    renderRoute();
    expect(await screen.findByText('APP CONTENT')).toBeInTheDocument();
    expect(screen.queryByText(/subscription has expired/i)).toBeNull();
  });
});
