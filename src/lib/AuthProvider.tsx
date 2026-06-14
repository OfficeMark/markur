import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { AuthContext, type AuthState } from './auth-context';
import type { Profile } from '@/types/database';

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    // Profile row created by Postgres trigger on signup; if we hit a race
    // (rare), retry once after a beat.
    console.warn('[auth] profile fetch failed, will retry once', error);
    await new Promise((r) => setTimeout(r, 400));
    const retry = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    return retry.data ?? null;
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // The user id we've already loaded for. Supabase fires several auth events on
  // boot (INITIAL_SESSION, SIGNED_IN, token refreshes) and hands us a *fresh*
  // session/user object each time. Swapping `user` on every one of those churns
  // its identity, which re-runs every downstream effect/query that depends on
  // it — that's the boot re-fetch storm (profiles 3×, grants/buildings 2–3×).
  // We gate the expensive work (user swap + profile fetch) on the id actually
  // changing, and keep `session` stable unless the access token changes.
  const userIdRef = useRef<string | null>(null);

  // Resolve the initial session, then keep it in sync with auth events.
  useEffect(() => {
    let cancelled = false;

    function apply(next: Session | null) {
      if (cancelled) return;
      // Keep the same session object when the token hasn't changed, so the
      // memoized context value doesn't churn on duplicate events.
      setSession((prev) => (prev?.access_token === next?.access_token ? prev : next));

      const nextId = next?.user?.id ?? null;
      if (nextId !== userIdRef.current) {
        userIdRef.current = nextId;
        setUser(next?.user ?? null);
        if (next?.user) {
          // Deferred (not awaited inside the auth callback) so we never block
          // Supabase's auth lock on another Supabase call.
          void fetchProfile(next.user.id).then((p) => {
            if (!cancelled) setProfile(p);
          });
        } else {
          setProfile(null);
        }
      }
      setLoading(false);
    }

    // Prime from the current session (covers INITIAL_SESSION already having
    // fired before we subscribed); onAuthStateChange keeps it in sync after.
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => apply(next));

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  // Re-fetch the cached profile (called by Settings after editing display_name
  // or avatar_url so the AppShell / UserMenu reflect the change immediately).
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await fetchProfile(user.id);
    setProfile(p);
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({ loading, session, user, profile, signOut, refreshProfile }),
    [loading, session, user, profile, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
