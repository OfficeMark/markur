import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from './auth-context';

/**
 * M32 Step 2B — per-user "Show button hints" toggle.
 *
 * Backed by `profiles.show_action_hints` (migration 0029). The <Tooltip>
 * primitive reads this context and short-circuits to render children-only
 * when false. Defaults to true if profile hasn't loaded yet so first-load
 * users see the tooltips and can turn them off from /settings.
 */

const ActionHintsContext = createContext<boolean>(true);

export function ActionHintsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const enabled = profile?.show_action_hints ?? true;
  return (
    <ActionHintsContext.Provider value={enabled}>{children}</ActionHintsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useActionHints(): boolean {
  return useContext(ActionHintsContext);
}
