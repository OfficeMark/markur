import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { LiveSyncChip } from './LiveSyncChip';
import { UserMenu } from './UserMenu';
import { BuildingNav, BuildingNavSheet } from './BuildingNav';

type AppShellProps = {
  children: ReactNode;
  /**
   * Hide the BuildingNav sidebar. Useful for the empty-state home (no grants
   * yet → nothing to navigate to) and for the audit walkaround (full-screen).
   */
  withSidebar?: boolean;
};

export function AppShell({ children, withSidebar = true }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-waymarks-cream text-text">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-waymarks-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white focus:shadow-sheet"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 bg-waymarks-ink text-white shadow-[0_2px_0_0_rgb(var(--waymarks-gold))]">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex items-center gap-1">
            {withSidebar && <BuildingNavSheet />}
            <Link
              to="/"
              aria-label="Markur home"
              className="inline-flex items-center outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-2 focus-visible:ring-offset-waymarks-ink rounded"
            >
              <img
                src="/icons/markur-wordmark-light.png"
                alt="Markur, by Officemark"
                className="h-9 w-auto"
                width={1587}
                height={521}
              />
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <LiveSyncChip />
            <Link
              to="/help"
              aria-label="Help and tutorial"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold"
            >
              <HelpCircle size={18} aria-hidden />
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1600px] flex-1">
        {withSidebar && <BuildingNav />}
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 outline-none">
          {children}
        </main>
      </div>
      <footer className="border-t border-black/5 bg-waymarks-cream py-3">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 text-[11px] text-text-faint sm:px-6">
          <span>© {new Date().getFullYear()} Officemark</span>
          <span aria-hidden>·</span>
          <Link to="/legal/privacy" className="hover:underline">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <Link to="/legal/terms" className="hover:underline">
            Terms
          </Link>
          <a
            href="mailto:support@officemark.ca"
            className="ml-auto hover:underline"
          >
            support@officemark.ca
          </a>
        </div>
      </footer>
    </div>
  );
}
