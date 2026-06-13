import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
const fromMock = vi.fn((..._args: unknown[]) => ({ insert: insertMock }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

describe('submitFeatureSuggestion', () => {
  beforeEach(() => {
    fromMock.mockClear();
    insertMock.mockReset();
  });

  it('inserts a trimmed body with optional context (submitted_by left to the DB)', async () => {
    insertMock.mockResolvedValue({ error: null });
    const { submitFeatureSuggestion } = await import('@/lib/queries/feature-suggestions');
    await submitFeatureSuggestion({ body: '  add csv export  ', orgId: 'o1' });
    expect(fromMock).toHaveBeenCalledWith('feature_suggestions');
    expect(insertMock).toHaveBeenCalledWith({
      body: 'add csv export',
      org_id: 'o1',
      building_id: null,
    });
  });

  it('throws when the insert is rejected', async () => {
    insertMock.mockResolvedValue({ error: { message: 'denied' } });
    const { submitFeatureSuggestion } = await import('@/lib/queries/feature-suggestions');
    await expect(submitFeatureSuggestion({ body: 'a real suggestion' })).rejects.toMatchObject({
      message: 'denied',
    });
  });
});
