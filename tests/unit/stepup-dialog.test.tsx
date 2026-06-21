import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StepUpDialog } from '@/components/waymarks/StepUpDialog';

describe('StepUpDialog', () => {
  function renderDialog(overrides: Partial<React.ComponentProps<typeof StepUpDialog>> = {}) {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <StepUpDialog
        open
        onOpenChange={onOpenChange}
        title="Delete asset"
        description="This soft-deletes the pin."
        confirmWord="DELETE"
        confirmLabel="Delete asset"
        onConfirm={onConfirm}
        {...overrides}
      />
    );
    return { onConfirm, onOpenChange };
  }

  it('keeps the confirm button disabled until the word matches (case-insensitive + trimmed)', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    const confirmBtn = screen.getByRole('button', { name: /^delete asset$/i });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByRole('textbox');
    await user.type(input, 'nope');
    expect(confirmBtn).toBeDisabled(); // non-matching word

    // Lowercase + surrounding whitespace still matches "DELETE".
    await user.clear(input);
    await user.type(input, '  delete  ');
    expect(confirmBtn).toBeEnabled();

    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Enter submits when the word matches (any case), but does nothing otherwise', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    const input = screen.getByRole('textbox');
    await user.type(input, 'nope{Enter}'); // non-matching
    expect(onConfirm).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'delete{Enter}'); // lowercase now matches
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders an error message when provided', () => {
    renderDialog({ errorMessage: 'Network down' });
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
  });
});
