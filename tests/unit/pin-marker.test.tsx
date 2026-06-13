import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinMarker } from '@/components/waymarks/PinMarker';

describe('PinMarker', () => {
  it('exposes name + type + status to assistive tech', () => {
    render(
      <PinMarker
        assetId="a-1"
        name="Lobby directory"
        type="directory"
        status="attention"
      />
    );
    expect(
      screen.getByRole('button', { name: /lobby directory.*directory.*audit due/i })
    ).toBeInTheDocument();
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <PinMarker
        assetId="a-1"
        name="Egress arrow"
        type="egress"
        status="good"
        onClick={onClick}
      />
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders an SVG teardrop for the teardrop shape', () => {
    const { container } = render(
      <PinMarker assetId="a-1" name="Lobby" type="directory" status="good" shape="teardrop" />
    );
    expect(container.querySelector('svg path')).not.toBeNull();
  });

  it('renders a box (no svg path) for the default circle shape', () => {
    const { container } = render(
      <PinMarker assetId="a-1" name="Lobby" type="directory" status="good" shape="circle" />
    );
    expect(container.querySelector('svg path')).toBeNull();
  });

  it('keeps the teardrop when flagged (the silhouette just turns red)', () => {
    const { container } = render(
      <PinMarker assetId="a-1" name="Lobby" type="directory" status="flagged" shape="teardrop" />
    );
    const path = container.querySelector('svg path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('fill')).toBe('rgb(var(--color-danger))');
  });
});
