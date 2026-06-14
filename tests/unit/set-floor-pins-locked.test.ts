import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

describe('setFloorPinsLocked', () => {
  beforeEach(() => rpcMock.mockReset());

  it('calls the RPC with the floor id + lock flag and returns the count changed', async () => {
    rpcMock.mockResolvedValue({ data: 12, error: null });
    const { setFloorPinsLocked } = await import('@/lib/queries/assets');

    const n = await setFloorPinsLocked('floor-1', false);

    expect(rpcMock).toHaveBeenCalledWith('set_floor_pins_locked', {
      p_floor_id: 'floor-1',
      p_locked: false,
    });
    expect(n).toBe(12);
  });

  it('coerces a null/absent count to 0 (no pins changed)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { setFloorPinsLocked } = await import('@/lib/queries/assets');
    expect(await setFloorPinsLocked('floor-1', true)).toBe(0);
  });

  it('throws when the RPC errors so the caller can surface it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('denied') });
    const { setFloorPinsLocked } = await import('@/lib/queries/assets');
    await expect(setFloorPinsLocked('floor-1', true)).rejects.toThrow('denied');
  });
});
