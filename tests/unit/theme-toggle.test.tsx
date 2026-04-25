import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/waymarks/ThemeProvider';
import { ThemeToggle } from '@/components/waymarks/ThemeToggle';

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
}

describe('ThemeToggle', () => {
  it('renders with an accessible name', () => {
    renderToggle();
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
  });

  it('switches the html element into dark mode on click', async () => {
    const user = userEvent.setup();
    renderToggle();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    await user.click(screen.getByRole('button', { name: /switch to dark mode/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
