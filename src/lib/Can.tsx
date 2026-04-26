import type { ReactNode } from 'react';
import { useCan } from './permissions-context';
import type { Capability, Resource } from './permissions-types';

export type CanProps = {
  action: Capability;
  resource: Resource;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Conditional render based on the signed-in user's grants. Renders `children`
 * iff the user has `action` on `resource`. Renders `fallback` (or null)
 * otherwise.
 *
 * This gates the UI; the server still enforces via RLS. Inverse is also true:
 * never assume `<Can>` saw the latest data — let the server reject and surface
 * the error when it matters.
 */
export function Can({ action, resource, children, fallback = null }: CanProps) {
  const allowed = useCan(action, resource);
  return <>{allowed ? children : fallback}</>;
}
