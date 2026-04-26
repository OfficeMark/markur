import { createContext, useContext } from 'react';
import { checkCapability, type Capability, type Grant, type Resource } from './permissions-types';

export type PermissionsState = {
  /** Currently-known grants for the signed-in user. */
  grants: readonly Grant[];
  /** Initial fetch in flight. UI should be conservative while true. */
  loading: boolean;
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
