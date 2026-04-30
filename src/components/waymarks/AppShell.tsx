import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
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
      <header className="sticky top-0 z-40 border-b border-black/10 bg-waymarks-ink text-white">
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
            <UserMenu />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1600px] flex-1">
        {withSidebar && <BuildingNav />}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
