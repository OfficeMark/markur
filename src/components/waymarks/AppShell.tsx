import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SyncChip } from './SyncChip';
import { UserMenu } from './UserMenu';
import { BuildingNav } from './BuildingNav';

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
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="font-serif text-2xl tracking-tight text-white outline-none transition-colors focus-visible:text-waymarks-gold"
          >
            Way<span className="text-waymarks-gold">marks</span>
          </Link>
          <div className="flex items-center gap-3">
            <SyncChip state="synced" />
            <UserMenu />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1600px] flex-1">
        {withSidebar && <BuildingNav />}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
