import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title + description', () => {
    render(<EmptyState title="No buildings yet" description="Ask your admin." />);
    expect(screen.getByRole('heading', { name: /no buildings yet/i })).toBeInTheDocument();
    expect(screen.getByText(/ask your admin/i)).toBeInTheDocument();
  });

  it('renders primary action when provided', () => {
    render(
      <EmptyState
        title="Empty"
        description="Add one"
        primaryAction={{ label: 'Add building', onClick: () => {} }}
      />
    );
    expect(screen.getByRole('button', { name: /add building/i })).toBeInTheDocument();
  });
});
