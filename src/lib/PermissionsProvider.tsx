import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth-context';
import { PermissionsContext, type PermissionsState } from './permissions-context';
import type { Grant } from './permissions-types';

/**
 * Loads the signed-in user's access_grants and exposes them via context. The
 * empty-state acceptance criterion in M1 turns on this exact data: a fresh
 * sign-up has zero rows here, which renders "no buildings yet."
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [grants, setGrants] = useState<readonly Grant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      // Wait for auth to settle.
      return;
    }

    if (!user) {
      setGrants([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('access_grants')
        .select('id, role, scope_type, scope_id, expires_at')
        .eq('user_id', user.id);
      if (cancelled) return;
      if (error) {
        console.warn('[permissions] fetch failed', error);
        setGrants([]);
      } else {
        setGrants((data ?? []) as Grant[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const value = useMemo<PermissionsState>(
    () => ({ grants, loading: loading || authLoading }),
    [grants, loading, authLoading]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
