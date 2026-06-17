import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './auth-context';
import { PermissionsContext, type PermissionsState } from './permissions-context';
import type { Grant } from './permissions-types';

async function fetchGrants(userId: string): Promise<readonly Grant[]> {
  const { data, error } = await supabase
    .from('access_grants')
    .select('id, role, scope_type, scope_id, expires_at')
    .eq('user_id', userId);
  if (error) {
    console.warn('[permissions] fetch failed', error);
    return [];
  }
  return (data ?? []) as Grant[];
}

/**
 * Loads the signed-in user's access_grants and exposes them via context.
 *
 * WO-4: fetched through React Query with a 5-min staleTime so it's cached and
 * deduped instead of refetching on every mount / auth-event churn. This stays
 * the AUTHORITY for grants — deliberately NOT folded into app_boot, because a
 * bundle shape mismatch / misparsed-empty list would silently deny all access.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ['access-grants', userId ?? 'none'],
    queryFn: () => fetchGrants(userId!),
    enabled: !!userId && !authLoading,
    staleTime: 5 * 60_000,
  });

  const grants: readonly Grant[] = userId ? query.data ?? [] : [];
  const loading = authLoading || (!!userId && query.isLoading);

  const refreshGrants = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['access-grants'] });
  }, [qc]);

  const value = useMemo<PermissionsState>(
    () => ({ grants, loading, refreshGrants }),
    [grants, loading, refreshGrants]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
