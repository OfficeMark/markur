import { useCallback, useEffect, useMemo, useState } from 'react';
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

  const fetchGrants = useCallback(async (userId: string): Promise<readonly Grant[]> => {
    const { data, error } = await supabase
      .from('access_grants')
      .select('id, role, scope_type, scope_id, expires_at')
      .eq('user_id', userId);
    if (error) {
      console.warn('[permissions] fetch failed', error);
      return [];
    }
    return (data ?? []) as Grant[];
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      return;
    }

    if (!user) {
      setGrants([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      const next = await fetchGrants(user.id);
      if (cancelled) return;
      setGrants(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, fetchGrants]);

  const refreshGrants = useCallback(async () => {
    if (!user) return;
    const next = await fetchGrants(user.id);
    setGrants(next);
  }, [user, fetchGrants]);

  const value = useMemo<PermissionsState>(
    () => ({ grants, loading: loading || authLoading, refreshGrants }),
    [grants, loading, authLoading, refreshGrants]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
