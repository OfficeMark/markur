import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a chainable query mock that lets us script the final resolved result.
// The Supabase client supports .from(...).select().eq().is().order().maybeSingle()
// in any plausible order — our wrappers call select+is+order or select+eq+is+maybeSingle.
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const noop = () => chain;
  chain.select = vi.fn(noop);
  chain.eq = vi.fn(noop);
  chain.is = vi.fn(noop);
  chain.order = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return chain;
}

const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

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

describe('queries/buildings', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('listBuildings returns rows on success', async () => {
    fromMock.mockReturnValue(makeChain({ data: [exampleBuilding], error: null }));
    const { listBuildings } = await import('@/lib/queries/buildings');
    const out = await listBuildings();
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe('161 Bay St.');
    expect(fromMock).toHaveBeenCalledWith('buildings');
  });

  it('listBuildings throws on error', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: { message: 'nope' } }));
    const { listBuildings } = await import('@/lib/queries/buildings');
    await expect(listBuildings()).rejects.toMatchObject({ message: 'nope' });
  });

  it('getBuilding returns a single row or null', async () => {
    fromMock.mockReturnValue(makeChain({ data: exampleBuilding, error: null }));
    const { getBuilding } = await import('@/lib/queries/buildings');
    const out = await getBuilding('b-1');
    expect(out?.id).toBe('b-1');
  });

  it('updateBuildingName updates name by id and returns the renamed row', async () => {
    const singleMock = vi.fn(() =>
      Promise.resolve({ data: { ...exampleBuilding, name: 'North Tower' }, error: null })
    );
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const eqMock = vi.fn(() => ({ select: selectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });
    const { updateBuildingName } = await import('@/lib/queries/buildings');

    const out = await updateBuildingName('b-1', 'North Tower');

    expect(fromMock).toHaveBeenCalledWith('buildings');
    expect(updateMock).toHaveBeenCalledWith({ name: 'North Tower' });
    expect(eqMock).toHaveBeenCalledWith('id', 'b-1');
    expect(selectMock).toHaveBeenCalledWith('*');
    expect(out.name).toBe('North Tower');
  });

  it('updateBuildingName throws when RLS rejects the update', async () => {
    const singleMock = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: 'rls denied' } })
    );
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const eqMock = vi.fn(() => ({ select: selectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });
    const { updateBuildingName } = await import('@/lib/queries/buildings');

    await expect(updateBuildingName('b-1', 'x')).rejects.toMatchObject({ message: 'rls denied' });
  });
});

describe('queries/floors', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  const f = {
    id: 'f-1',
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

  it('listFloorsByBuilding orders by sort_order', async () => {
    fromMock.mockReturnValue(makeChain({ data: [f], error: null }));
    const { listFloorsByBuilding } = await import('@/lib/queries/floors');
    const out = await listFloorsByBuilding('b-1');
    expect(out).toHaveLength(1);
    expect(out[0]?.label).toBe('Ground');
  });

  it('getFloor returns null when not found', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: null }));
    const { getFloor } = await import('@/lib/queries/floors');
    const out = await getFloor('missing');
    expect(out).toBeNull();
  });

  it('softDeleteFloor stamps deleted_at on the row', async () => {
    const eqMock = vi.fn((_col: string, _val: string) => Promise.resolve({ error: null }));
    const updateMock = vi.fn((_payload: { deleted_at: string }) => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });
    const { softDeleteFloor } = await import('@/lib/queries/floors');

    await softDeleteFloor('f-1');

    expect(fromMock).toHaveBeenCalledWith('floors');
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0]![0];
    expect(payload.deleted_at).toEqual(expect.any(String));
    expect(new Date(payload.deleted_at).toString()).not.toBe('Invalid Date');
    expect(eqMock).toHaveBeenCalledWith('id', 'f-1');
  });

  it('softDeleteFloor throws when supabase returns an error', async () => {
    const eqMock = vi.fn((_col: string, _val: string) =>
      Promise.resolve({ error: { message: 'rls denied' } })
    );
    const updateMock = vi.fn((_payload: { deleted_at: string }) => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });
    const { softDeleteFloor } = await import('@/lib/queries/floors');

    await expect(softDeleteFloor('f-1')).rejects.toMatchObject({ message: 'rls denied' });
  });
});
