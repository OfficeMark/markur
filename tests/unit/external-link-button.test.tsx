import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExternalLinkButton } from '@/components/waymarks/ExternalLinkButton';

describe('ExternalLinkButton', () => {
  it('renders a safe new-tab link when both url and label are set', () => {
    render(<ExternalLinkButton url="https://example.com/order" label="Order signs" />);
    const link = screen.getByRole('link', { name: /order signs/i });
    expect(link).toHaveAttribute('href', 'https://example.com/order');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing unless BOTH url and label are present', () => {
    const { container: missingLabel } = render(
      <ExternalLinkButton url="https://example.com" label="" />
    );
    expect(missingLabel).toBeEmptyDOMElement();

    const { container: missingUrl } = render(
      <ExternalLinkButton url="   " label="Order signs" />
    );
    expect(missingUrl).toBeEmptyDOMElement();
  });
});
