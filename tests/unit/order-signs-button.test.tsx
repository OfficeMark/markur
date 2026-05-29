import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderSignsButton, ORDER_SIGNS_URL } from '@/components/waymarks/OrderSignsButton';

describe('OrderSignsButton', () => {
  it('links to the OfficeMark ordering portal, opening safely in a new tab', () => {
    render(<OrderSignsButton />);
    const link = screen.getByRole('link', { name: /order signs/i });
    expect(link).toHaveAttribute('href', ORDER_SIGNS_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('applies placement-specific className', () => {
    render(<OrderSignsButton className="ml-auto custom-placement" />);
    expect(screen.getByRole('link', { name: /order signs/i })).toHaveClass('custom-placement');
  });
});
