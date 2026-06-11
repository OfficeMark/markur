import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Chrome-free shell for the guest viewer (building share link). Deliberately
 * omits everything in AppShell that a client should not see: the BuildingNav
 * sidebar, the account UserMenu, sync/encrypted chips, the help link, and org
 * co-branding. Just the Markur wordmark, an optional context label, and a
 * "Shared view" marker. Mobile-safe (max-w + flex-wrap), matching AppShell.
 */
export function GuestLayout({ title, children }: { title?: string | null; children: ReactNode }) {
  return (
    <div className="flex min-h-screen min-h-dvh flex-col bg-waymarks-cream text-text">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-waymarks-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white focus:shadow-sheet"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 bg-waymarks-ink text-white shadow-[0_2px_0_0_rgb(var(--waymarks-gold))]">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/icons/markur-wordmark-light.png"
              alt="Markur, by Officemark"
              className="h-9 w-auto shrink-0"
              width={1587}
              height={521}
            />
            {title && (
              <span className="hidden min-w-0 truncate border-l border-white/15 pl-3 text-sm text-white/70 sm:block">
                {title}
              </span>
            )}
          </div>
          <span className="shrink-0 rounded-full border border-white/20 px-2.5 py-0.5 text-[11px] font-medium text-white/70">
            Shared view
          </span>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 outline-none">
        {children}
      </main>
      <footer className="border-t border-black/5 bg-waymarks-cream py-3">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1 px-4 text-[11px] text-text-faint sm:px-6">
          <span>© {new Date().getFullYear()} Officemark</span>
          <span aria-hidden>·</span>
          <Link to="/legal/privacy" className="hover:underline">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
