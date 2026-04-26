import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepositionToolbar } from '@/components/waymarks/RepositionToolbar';

describe('RepositionToolbar', () => {
  it('armed state shows the drag instruction and Cancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<RepositionToolbar state="armed" onCancel={onCancel} />);

    expect(screen.getByText(/drag the pin to a new location/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('pending state shows from→to coords and routes Confirm/Cancel separately', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onDismissPending = vi.fn();
    const onCancel = vi.fn(); // shouldn't be called by either button in pending state

    render(
      <RepositionToolbar
        state="pending"
        pending={{ from: { x: 0.123, y: 0.456 }, to: { x: 0.5, y: 0.678 } }}
        onCancel={onCancel}
        onConfirm={onConfirm}
        onDismissPending={onDismissPending}
      />
    );

    // Coords formatted as percent with 1 decimal place.
    expect(screen.getByText(/12\.3%, 45\.6%/)).toBeInTheDocument();
    expect(screen.getByText(/50\.0%, 67\.8%/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onDismissPending).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('pending state with busy disables the cancel button and spins confirm', () => {
    render(
      <RepositionToolbar
        state="pending"
        pending={{ from: { x: 0.1, y: 0.1 }, to: { x: 0.2, y: 0.2 } }}
        busy
        onCancel={() => {}}
        onConfirm={() => {}}
        onDismissPending={() => {}}
      />
    );
    const cancel = screen.getByRole('button', { name: /^cancel$/i });
    expect(cancel).toBeDisabled();
    const confirm = screen.getByRole('button', { name: /confirm/i });
    expect(confirm).toHaveAttribute('aria-busy', 'true');
  });
});
