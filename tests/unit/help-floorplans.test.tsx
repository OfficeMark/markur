import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Help } from '@/routes/Help';

// Help wraps its content in AppShell (auth/theme chrome). Stub it to a plain
// passthrough so we can render the tutorial content without those providers.
vi.mock('@/components/waymarks/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function renderHelp() {
  return render(
    <MemoryRouter>
      <Help />
    </MemoryRouter>
  );
}

describe('Help — "Preparing your floorplans" section', () => {
  it('renders the section heading and export guidance', () => {
    renderHelp();
    expect(
      screen.getByRole('heading', { name: /preparing your floorplans/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/300 DPI minimum/i)).toBeInTheDocument();
    expect(screen.getByText(/monochrome\.ctb/i)).toBeInTheDocument();
    expect(screen.getByText(/one floor per file/i)).toBeInTheDocument();
  });

  it('is reachable from the table of contents', () => {
    renderHelp();
    expect(
      screen.getByRole('link', { name: /preparing your floorplans/i })
    ).toHaveAttribute('href', '#floorplans');
  });
});
