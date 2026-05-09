import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Auth-failure recovery for the ITP / session-wipe case.
 *
 * Background: on Safari (desktop and iOS), Intelligent Tracking Prevention can
 * purge localStorage after 7 days of no first-party interaction. When that
 * happens mid-session, the access token AND the PKCE refresh material are both
 * gone — there's nothing for autoRefreshToken to refresh. The next mutation
 * fails with a 401 / "JWT expired" / "missing JWT" / RLS-blocks-anon error,
 * and without recovery the user sees a confusing inline error.
 *
 * What this does: classify any error coming back from a Supabase call. If it
 * smells like missing/expired auth, dispatch a global 'markur:session-lost'
 * event. App.tsx listens, shows a toast, and redirects to /login?next=<path>.
 */

const SESSION_LOST_EVENT = 'markur:session-lost';

export interface SessionLostDetail {
  reason: string;
}

export function isAuthExpiredError(err: unknown): boolean {
  if (!err) return false;

  const e = err as Partial<PostgrestError> & {
    status?: number;
    statusCode?: number;
    code?: string;
    name?: string;
    message?: string;
  };

  // HTTP 401 from PostgREST or Auth endpoints.
  if (e.status === 401 || e.statusCode === 401) return true;

  // PostgREST returns these codes when the JWT is missing or invalid.
  if (e.code === 'PGRST301' || e.code === 'PGRST302') return true;

  // Supabase Auth client throws AuthSessionMissingError by name.
  if (e.name === 'AuthSessionMissingError') return true;

  const msg = (e.message ?? '').toLowerCase();
  if (!msg) return false;

  return (
    msg.includes('jwt expired') ||
    msg.includes('invalid jwt') ||
    msg.includes('jwt is missing') ||
    msg.includes('missing jwt') ||
    msg.includes('auth session missing')
  );
}

export function notifySessionLost(reason: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SessionLostDetail>(SESSION_LOST_EVENT, { detail: { reason } })
  );
}

export function onSessionLost(handler: (detail: SessionLostDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const wrapped = (e: Event) => {
    const ce = e as CustomEvent<SessionLostDetail>;
    handler(ce.detail);
  };
  window.addEventListener(SESSION_LOST_EVENT, wrapped);
  return () => window.removeEventListener(SESSION_LOST_EVENT, wrapped);
}

/**
 * Plug into TanStack Query's QueryCache / MutationCache onError.
 * Returns true if the error was an auth-expired case (caller can decide
 * whether to also surface a normal toast on top — usually no).
 */
export function handleQueryError(err: unknown): boolean {
  if (isAuthExpiredError(err)) {
    notifySessionLost('auth-expired');
    return true;
  }
  return false;
}
