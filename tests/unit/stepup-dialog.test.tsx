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

  it('keeps the confirm button disabled until the user types the exact word', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    const confirmBtn = screen.getByRole('button', { name: /^delete asset$/i });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByRole('textbox');
    await user.type(input, 'delete');
    expect(confirmBtn).toBeDisabled(); // case-sensitive

    await user.clear(input);
    await user.type(input, 'DELETE');
    expect(confirmBtn).toBeEnabled();

    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Enter submits when matched, but does nothing when not matched', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    const input = screen.getByRole('textbox');
    await user.type(input, 'delete{Enter}'); // wrong case
    expect(onConfirm).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'DELETE{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders an error message when provided', () => {
    renderDialog({ errorMessage: 'Network down' });
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
  });
});
