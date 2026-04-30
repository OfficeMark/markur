import { createContext, useContext } from 'react';
import { checkCapability, type Capability, type Grant, type Resource } from './permissions-types';

export type PermissionsState = {
  /** Currently-known grants for the signed-in user. */
  grants: readonly Grant[];
  /** Initial fetch in flight. UI should be conservative while true. */
  loading: boolean;
  /**
   * Re-fetch the signed-in user's access_grants. Call after operations that
   * mint a new grant (e.g. creating a building, accepting an invitation) so
   * the UI immediately reflects the new permissions without a page reload.
   */
  refreshGrants: () => Promise<void>;
};

export const PermissionsContext = createContext<PermissionsState | null>(null);

export function usePermissions(): PermissionsState {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within <PermissionsProvider>');
  return ctx;
}

/**
 * UI-side capability check. Returns false during initial load so we don't flash
 * privileged UI before the grants have been fetched.
 */
export function useCan(capability: Capability, resource: Resource): boolean {
  const { grants, loading } = usePermissions();
  if (loading) return false;
  return checkCapability(grants, capability, resource);
}

/**
 * Returns true iff the signed-in user has an active super_admin grant. Used
 * for super-only UI surfaces like the Trash view (M5). Returns false during
 * initial load.
 */
export function useIsSuperAdmin(): boolean {
  const { grants, loading } = usePermissions();
  if (loading) return false;
  const now = Date.now();
  return grants.some(
    (g) =>
      g.role === 'super_admin' && (!g.expires_at || new Date(g.expires_at).getTime() > now)
  );
}
