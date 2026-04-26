import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

/**
 * Wraps any route that requires a signed-in session. While the initial auth
 * resolution is in flight we render a quiet skeleton instead of redirecting —
 * otherwise reload-while-signed-in flashes the login screen.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-waymarks-cream">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-waymarks-gold/40 border-t-waymarks-gold" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
