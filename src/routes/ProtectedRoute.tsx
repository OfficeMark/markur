import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useIsSuperAdmin } from '@/lib/permissions-context';
import { useOrgSubscription } from '@/hooks/useOrganization';
import { LockoutScreen } from '@/components/waymarks/LockoutScreen';

/**
 * Wraps any route that requires a signed-in session. While the initial auth
 * resolution is in flight we render a quiet skeleton instead of redirecting —
 * otherwise reload-while-signed-in flashes the login screen.
 *
 * Also enforces trial/subscription lockout: a locked org's users get the
 * lockout screen instead of the app (the DB already denies their data via
 * user_can). A global super_admin is never locked out.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isSuper = useIsSuperAdmin();
  const sub = useOrgSubscription();

  if (loading) {
    return (
      <div className="flex min-h-screen min-h-dvh items-center justify-center bg-waymarks-cream">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-waymarks-gold border-t-waymarks-gold" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Locked org → lockout screen (super_admin exempt; not-locked while loading).
  if (!isSuper && sub.locked) {
    return (
      <LockoutScreen
        expiredTrial={sub.org?.subscription_status !== 'expired'}
        orgName={sub.org?.name}
      />
    );
  }

  return <>{children}</>;
}
