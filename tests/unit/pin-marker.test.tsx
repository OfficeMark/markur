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

  it('renders the org logo for the logo shape when a logo URL is given', () => {
    const { container } = render(
      <PinMarker
        assetId="a-1"
        name="Lobby"
        type="directory"
        status="good"
        shape="logo"
        logoUrl="https://cdn.example.com/logo.png"
      />
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/logo.png');
  });

  it('falls back to a mark (no image) for the logo shape with no logo', () => {
    const { container } = render(
      <PinMarker assetId="a-1" name="Lobby" type="directory" status="good" shape="logo" />
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not show the logo when flagged (whole pin goes red)', () => {
    const { container } = render(
      <PinMarker
        assetId="a-1"
        name="Lobby"
        type="directory"
        status="flagged"
        shape="logo"
        logoUrl="https://cdn.example.com/logo.png"
      />
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
