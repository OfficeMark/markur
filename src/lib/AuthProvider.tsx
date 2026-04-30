import { useCallback, useEffect, useMemo, useState } from 'react';
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

  // Resolve the initial session, then keep it in sync with auth events.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const next = data.session;
      setSession(next);
      setUser(next?.user ?? null);
      if (next?.user) {
        const p = await fetchProfile(next.user.id);
        if (!cancelled) setProfile(p);
      }
      if (!cancelled) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (next?.user) {
        void fetchProfile(next.user.id).then((p) => setProfile(p));
      } else {
        setProfile(null);
      }
    });

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
