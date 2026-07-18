import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FloorNotesButton } from '@/components/waymarks/FloorNotesButton';

// The button calls useSetFloorNotes on mount; stub it (this test exercises the
// show/hide gating, not the save path).
vi.mock('@/hooks/useFloors', () => ({
  useSetFloorNotes: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

describe('FloorNotesButton — team-only gating', () => {
  it('renders nothing for a viewer with no notes', () => {
    const { container } = render(
      <FloorNotesButton floorId="f1" buildingId="b1" notes={null} canEdit={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the Notes button for an editor even with no notes', () => {
    render(<FloorNotesButton floorId="f1" buildingId="b1" notes={null} canEdit />);
    expect(screen.getByRole('button', { name: /notes/i })).toBeInTheDocument();
  });

  it('shows the Notes button (read-only) for a viewer when a note exists', () => {
    render(
      <FloorNotesButton floorId="f1" buildingId="b1" notes="Door code 1234" canEdit={false} />
    );
    expect(screen.getByRole('button', { name: /notes/i })).toBeInTheDocument();
  });
});
