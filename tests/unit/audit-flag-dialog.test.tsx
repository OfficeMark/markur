import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditFlagDialog } from '@/components/waymarks/AuditFlagDialog';
import type { Asset } from '@/types/database';

// The contact picker reads the org's contacts via TanStack Query; stub it so
// the dialog renders without a QueryClient in the test tree.
vi.mock('@/hooks/useContacts', () => ({
  useContacts: () => ({ list: [], orgId: null, isLoading: false }),
}));

// The dialog only reads asset.name; a minimal cast keeps the fixture small.
const fakeAsset = { id: 'a1', name: 'Lobby directory' } as Asset;

describe('AuditFlagDialog', () => {
  function renderDialog(
    overrides: Partial<React.ComponentProps<typeof AuditFlagDialog>> = {}
  ) {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <AuditFlagDialog
        open
        asset={fakeAsset}
        busy={false}
        error={null}
        onCancel={onCancel}
        onSubmit={onSubmit}
        {...overrides}
      />
    );
    return { onSubmit, onCancel };
  }

  it('keeps Save flag disabled until a description is entered', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    const saveBtn = screen.getByRole('button', { name: /save flag/i });
    expect(saveBtn).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'Sign is cracked');
    expect(saveBtn).toBeEnabled();

    await user.click(saveBtn);
    expect(onSubmit).toHaveBeenCalledWith('Sign is cracked', [], null);
  });

  it('treats a whitespace-only description as empty', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByRole('textbox'), '    ');
    expect(screen.getByRole('button', { name: /save flag/i })).toBeDisabled();
  });

  it('surfaces a save error', () => {
    renderDialog({ error: 'Upload failed' });
    expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
  });
});
