import { describe, it, expect, vi, beforeEach } from 'vitest';

// A thenable query stub: every builder method returns the chain, and awaiting
// the chain resolves to the scripted { data, error }. Works regardless of which
// method ends the call (listAssetTypes ends in .order(); listOverrides in .eq()).
function thenable(result: unknown) {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = vi.fn(ret);
  chain.eq = vi.fn(ret);
  chain.is = vi.fn(ret);
  chain.order = vi.fn(ret);
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

const ORG = 'org-1';
const orgType = {
  id: 't1',
  org_id: ORG,
  key: 'wayfinding',
  label: 'Wayfinding',
  color: '#112233',
  category: 'signage',
  sort_order: 1,
};

describe('listEffectiveAssetTypes — guest colour resilience', () => {
  beforeEach(() => fromMock.mockReset());

  it("keeps org type colours when the overrides table isn't readable (guest)", async () => {
    // org_asset_types reads fine; org_asset_type_overrides is RLS-denied.
    fromMock.mockImplementation((table: string) =>
      table === 'org_asset_type_overrides'
        ? thenable({ data: null, error: { message: 'permission denied' } })
        : thenable({ data: [orgType], error: null })
    );
    const { listEffectiveAssetTypes } = await import('@/lib/queries/asset-types');

    // Must NOT throw just because overrides were unreadable.
    const res = await listEffectiveAssetTypes(ORG);
    const wf = res.effective.find((t) => t.key === 'wayfinding');
    expect(wf?.color).toBe('#112233');
    expect(wf?.label).toBe('Wayfinding');
  });
});
