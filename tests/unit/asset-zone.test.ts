import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the payload createAsset sends to supabase.from('assets').insert(...).
const insertMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        insertMock(payload);
        return { select: () => ({ single: async () => ({ data: { ...payload, id: 'a1' }, error: null }) }) };
      },
    }),
  },
}));

import { createAsset } from '@/lib/queries/assets';

describe('createAsset — zone (Feature #3a)', () => {
  beforeEach(() => insertMock.mockClear());

  it('includes the zone in the insert payload', async () => {
    await createAsset({
      floor_id: 'f1', type: 'directory', category: 'signage', zone: 'North wing', x: 0.1, y: 0.2,
    });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ zone: 'North wing' }));
  });

  it('defaults zone to null when omitted', async () => {
    await createAsset({ floor_id: 'f1', type: 'directory', category: 'signage', x: 0.1, y: 0.2 });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ zone: null }));
  });
});
