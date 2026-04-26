import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from '@/types/database';

export type AuthState = {
  /** Initial session resolution still pending. UI should show a skeleton. */
  loading: boolean;
  /** The Supabase session, if signed in. */
  session: Session | null;
  /** The auth.users record, if signed in. */
  user: User | null;
  /** The public.profiles row for this user (display_name, avatar). */
  profile: Profile | null;
  /** Sign out and clear local state. */
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/**
 * Convenience wrapper. Returns {user, profile} when signed in or both null
 * during loading / signed-out state.
 */
export function useCurrentUser(): { user: User | null; profile: Profile | null; loading: boolean } {
  const { user, profile, loading } = useAuth();
  return { user, profile, loading };
}
