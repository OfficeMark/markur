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

export type OnlineState = {
  online: boolean;
  /** ms timestamp of the last confirmed connectivity. */
  lastSeen: number;
};

/**
 * WO-2: event-driven, NOT a 30s poll. `navigator.onLine` + the `online`/
 * `offline` events are the primary signal; we run ONE lightweight verification
 * ping (captive-portal false-positive guard) on mount, on regaining `online`,
 * and on the tab becoming visible again — never on a constant timer, and always
 * with a 4s abort so a hung request can't wedge the UI.
 */
export function useOnline(): OnlineState {
  const [state, setState] = useState<OnlineState>(() => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    lastSeen: Date.now(),
  }));

  useEffect(() => {
    let cancelled = false;
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

    async function verify() {
      if (cancelled || document.hidden || !supabaseUrl) return;
      try {
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 4_000);
        await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'HEAD',
          mode: 'cors',
          credentials: 'omit',
          signal: ctrl.signal,
          // Public anon key (already shipped) so the root answers 200, not a
          // noisy 401. Liveness only needs a reply.
          headers: anonKey ? { apikey: anonKey } : undefined,
        });
        window.clearTimeout(t);
        if (!cancelled) setState({ online: true, lastSeen: Date.now() });
      } catch {
        // Offline or aborted — keep the previous lastSeen for "last synced …".
        if (!cancelled) setState((prev) => ({ online: false, lastSeen: prev.lastSeen }));
      }
    }

    function onOnline() {
      setState({ online: true, lastSeen: Date.now() });
      void verify(); // confirm it's real connectivity, not just a NIC flag
    }
    function onOffline() {
      setState((prev) => ({ online: false, lastSeen: prev.lastSeen }));
    }
    function onVisible() {
      if (!document.hidden) void verify();
    }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    // One verification at startup (captive-portal false positive on launch).
    void verify();

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return state;
}
