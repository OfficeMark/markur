import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { EncryptedChip } from './EncryptedChip';
import { LiveSyncChip } from './LiveSyncChip';
import { UserMenu } from './UserMenu';
import { BuildingNav, BuildingNavSheet } from './BuildingNav';
import { useOrgBranding } from '@/hooks/useBranding';
import { cn } from '@/lib/utils';

type AppShellProps = {
  children: ReactNode;
  /**
   * Hide the BuildingNav sidebar. Useful for the empty-state home (no grants
   * yet → nothing to navigate to) and for the audit walkaround (full-screen).
   */
  withSidebar?: boolean;
  /**
   * Make the main content region a viewport-bounded flex column instead of a
   * scrolling page. The shell becomes a *definite-height* chain
   * (root → main-row → main), so a child can fill the space left below the
   * header with `h-full`/`flex-1` — and a percentage-height descendant (e.g.
   * the floor-plan canvas's `h-full`) actually resolves. Opt-in (Floor map
   * view) so other routes keep their normal page-scroll behaviour.
   */
  fillViewport?: boolean;
  /**
   * Focus / presentation mode: hide ALL chrome (top bar, sidebar, footer) so the
   * page content gets the whole screen. Implies the definite-height fill chain.
   * The route is responsible for rendering its own "exit focus" affordance.
   */
  hideChrome?: boolean;
};

export function AppShell({
  children,
  withSidebar = true,
  fillViewport = false,
  hideChrome = false,
}: AppShellProps) {
  const navigate = useNavigate();
  const fill = fillViewport || hideChrome;
  return (
    <div
      className={cn(
        'flex flex-col bg-waymarks-cream text-text',
        // Definite viewport height in fill/focus mode so the flex chain below can
        // hand a real height down to a `h-full` map; min-h (indefinite) otherwise
        // so tall pages scroll normally.
        fill ? 'h-dvh overflow-hidden' : 'min-h-screen min-h-dvh'
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-waymarks-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white focus:shadow-sheet"
      >
        Skip to main content
      </a>
      {!hideChrome && (
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
            <OrgCoBrand />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <EncryptedChip onClick={() => navigate('/admin/security')} />
            <LiveSyncChip />
            <Link
              to="/help"
              aria-label="How to use Markur"
              title="How to"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-waymarks-gold hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold"
            >
              <HelpCircle size={18} aria-hidden />
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>
      )}
      <div className={cn('mx-auto flex w-full max-w-[1600px] flex-1', fill && 'min-h-0')}>
        {withSidebar && !hideChrome && <BuildingNav />}
        <main
          id="main-content"
          tabIndex={-1}
          className={cn('flex-1 min-w-0 outline-none', fill && 'min-h-0')}
        >
          {children}
        </main>
      </div>
      {!hideChrome && (
      <footer className="border-t border-black/5 bg-waymarks-cream py-3">
        {/* flex-wrap + gap-y-1 so support@officemark.ca can drop to a second
            line on a 375-414px iPhone instead of overflowing the viewport. */}
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1 px-4 text-[11px] text-text-faint sm:px-6">
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
      )}
    </div>
  );
}

/**
 * "for [Org Name]" co-brand sliver shown next to the Markur wordmark
 * in the top nav (M16). Renders nothing when the user has no
 * org_branding row yet — keeps the nav clean for new accounts.
 */
function OrgCoBrand() {
  const { branding, logoUrl } = useOrgBranding();
  if (!branding) return null;
  const name = branding.display_name_override?.trim();
  if (!name && !logoUrl) return null;
  return (
    <div className="hidden items-center gap-2 border-l border-white/15 pl-3 sm:flex">
      <span className="text-[10px] uppercase tracking-[0.18em] text-white/55">for</span>
      {logoUrl && (
        <img
          src={logoUrl}
          alt={name ? `${name} logo` : 'Organization logo'}
          className="h-5 w-auto max-w-[100px] object-contain"
        />
      )}
      {name && <span className="text-sm font-medium text-white">{name}</span>}
    </div>
  );
}
