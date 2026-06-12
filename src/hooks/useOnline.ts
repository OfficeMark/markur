import { useEffect, useState } from 'react';

/**
 * Tracks online/offline status (M9). Returns the boolean plus the timestamp
 * we last *confirmed* connectivity (either via a successful event or a ping).
 *
 * `navigator.onLine` is famously misleading — it can return true on a network
 * with no Internet (captive portals, dropped routes). We use it as the
 * primary signal but back it up with a slow lightweight ping every 30s when
 * the page is visible. The ping target is the Supabase project's REST root,
 * which answers quickly and cheaply if the network is alive — we only care
 * that *something* responds, not what it says.
 *
 * We send the (public, already-bundled) anon apikey so the root answers 200
 * instead of 401. The 401 worked just as well for liveness — fetch resolves on
 * any HTTP status — but a recurring 401 every 30s is console/network noise that
 * reads like an auth bug to anyone watching devtools or error monitoring.
 */

const PING_INTERVAL_MS = 30_000;

export type OnlineState = {
  online: boolean;
  /** ms timestamp of the last confirmed connectivity. */
  lastSeen: number;
};

export function useOnline(): OnlineState {
  const [state, setState] = useState<OnlineState>(() => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    lastSeen: Date.now(),
  }));

  useEffect(() => {
    function setOnline() {
      setState({ online: true, lastSeen: Date.now() });
    }
    function setOffline() {
      setState((prev) => ({ online: false, lastSeen: prev.lastSeen }));
    }
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);

    // Slow ping fallback. Avoids the captive-portal false positive.
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
    async function ping() {
      if (document.hidden) return; // don't ping in background tabs
      if (!supabaseUrl) return;
      try {
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 4_000);
        await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'HEAD',
          mode: 'cors',
          credentials: 'omit',
          signal: ctrl.signal,
          // Public anon key (already shipped in the bundle) so the root answers
          // 200 rather than a noisy recurring 401. Liveness only needs a reply.
          headers: anonKey ? { apikey: anonKey } : undefined,
        });
        window.clearTimeout(t);
        setState({ online: true, lastSeen: Date.now() });
      } catch {
        // Either offline or the fetch was aborted. We keep the previous
        // lastSeen so consumers can show "last synced 5 min ago" later.
        setState((prev) => ({ online: false, lastSeen: prev.lastSeen }));
      }
    }
    const timer = window.setInterval(ping, PING_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
      window.clearInterval(timer);
    };
  }, []);

  return state;
}
