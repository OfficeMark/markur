import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

describe('peekBuildingShare', () => {
  beforeEach(() => rpcMock.mockReset());

  it('maps status, name, expiry, and photo from the RPC', async () => {
    rpcMock.mockResolvedValue({
      data: { status: 'ok', building_name: 'Capital One', expires_at: '2026-07-13', photo_url: 'b1.jpg' },
      error: null,
    });
    const { peekBuildingShare } = await import('@/lib/queries/building-shares');
    expect(await peekBuildingShare('tok')).toEqual({
      status: 'ok',
      building_name: 'Capital One',
      expires_at: '2026-07-13',
      photo_url: 'b1.jpg',
    });
  });

  it('defaults photo_url to null when the RPC omits it (pre-update)', async () => {
    rpcMock.mockResolvedValue({
      data: { status: 'ok', building_name: 'X', expires_at: null },
      error: null,
    });
    const { peekBuildingShare } = await import('@/lib/queries/building-shares');
    expect((await peekBuildingShare('tok')).photo_url).toBeNull();
  });
});
