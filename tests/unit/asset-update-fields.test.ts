import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the patch updateAsset sends to supabase.from('assets').update(...).
const updateMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        updateMock(patch);
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { id: 'a1', ...patch }, error: null }) }),
          }),
        };
      },
    }),
  },
}));

import { updateAsset } from '@/lib/queries/assets';

describe('updateAsset — Feature #3b drawer fields', () => {
  beforeEach(() => updateMock.mockClear());

  it('forwards a long note (~400 words) plus room/zone in the patch', async () => {
    const longNote = 'word '.repeat(420).trim(); // ~420 words, well over 2000 chars
    await updateAsset('a1', { notes: longNote, room_number: '301', zone: 'North wing' });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ notes: longNote, room_number: '301', zone: 'North wing' })
    );
    // sanity: the note is genuinely long but within the DB's 4000-char cap
    expect(longNote.length).toBeGreaterThan(2000);
    expect(longNote.length).toBeLessThanOrEqual(4000);
  });

  it('does not send the removed location_notes field', async () => {
    await updateAsset('a1', { notes: 'hi' });
    const patch = updateMock.mock.calls[0][0];
    expect(patch).not.toHaveProperty('location_notes');
  });
});
