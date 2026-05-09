import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { ArrowLeft, Image, Lock, Mail, Tag, Users } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { usePermissions } from '@/lib/permissions-context';

/**
 * /admin — proper admin section (M15).
 *
 * Replaces the old approach where every org-admin tool was stacked as
 * a card on /settings. Now /settings is personal-only (profile, theme,
 * account) and /admin is the dedicated team + security workspace.
 *
 * Layout: left rail with section list, big content area on the right.
 * Each section is its own URL so they can be linked, bookmarked, and
 * have proper browser back/forward behavior.
 *
 * Gating: super_admin or building_admin. Anyone else lands on /settings.
 */

type NavItem = {
  to: string;
  label: string;
  icon: typeof Tag;
};

const NAV: NavItem[] = [
  { to: '/admin/asset-types', label: 'Asset types', icon: Tag },
  { to: '/admin/members', label: 'Members', icon: Users },
  { to: '/admin/invitations', label: 'Invitations', icon: Mail },
  { to: '/admin/security', label: 'Security', icon: Lock },
  { to: '/admin/branding', label: 'Branding', icon: Image },
];

export function Admin() {
  const { grants, loading } = usePermissions();
  if (loading) return null;

  const now = Date.now();
  const isAdmin = grants.some(
    (g) =>
      (g.role === 'super_admin' || g.role === 'building_admin') &&
      (!g.expires_at || new Date(g.expires_at).getTime() > now)
  );
  if (!isAdmin) return <Navigate to="/settings" replace />;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:flex-row sm:px-6 sm:py-8">
        <aside className="shrink-0 sm:sticky sm:top-20 sm:w-56 sm:self-start">
          <NavLink
            to="/"
            className="mb-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-black/5 hover:text-text dark:hover:bg-white/5"
          >
            <ArrowLeft size={12} aria-hidden />
            <span>Back to Markur</span>
          </NavLink>
          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Admin
          </p>
          <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:gap-0.5 sm:overflow-visible">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  'inline-flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ' +
                  (isActive
                    ? 'bg-waymarks-gold-soft font-medium text-waymarks-gold dark:bg-white/10 dark:text-waymarks-gold'
                    : 'text-text-muted hover:bg-black/5 hover:text-text dark:hover:bg-white/5')
                }
              >
                <item.icon size={14} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </AppShell>
  );
}
