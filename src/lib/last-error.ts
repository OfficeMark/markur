import { supabase } from './supabase';

/**
 * A crash captured by the top-level ErrorBoundary, persisted to localStorage so
 * it survives a PWA auto-reload / flash-away. LastErrorBanner re-surfaces it on
 * the next clean render so the real error can be copied off a phone even if the
 * "Something went wrong" screen vanished before it could be read.
 *
 * Primary path: every crash is also logged to the DB via log_client_error so
 * web Claude can read it directly — including the ones that self-recover before
 * they can be read on the phone.
 */
export const LAST_ERROR_KEY = 'markur:last-error';

export type CapturedError = {
  message: string;
  stack: string | null;
  componentStack: string | null;
  url: string;
  ua: string;
  at: number;
};

export function readLastError(): CapturedError | null {
  try {
    const raw = localStorage.getItem(LAST_ERROR_KEY);
    if (!raw) return null;
    const e = JSON.parse(raw) as CapturedError;
    return typeof e?.message === 'string' && typeof e?.at === 'number' ? e : null;
  } catch {
    return null;
  }
}

export function clearLastError(): void {
  try {
    localStorage.removeItem(LAST_ERROR_KEY);
  } catch {
    /* ignore */
  }
}

export function formatCapturedError(e: CapturedError): string {
  return [
    `Markur error @ ${e.url}`,
    `UA: ${e.ua}`,
    `When: ${new Date(e.at).toISOString()}`,
    ``,
    `Message: ${e.message || '(none)'}`,
    ``,
    `Stack:`,
    e.stack ?? '(none)',
    ``,
    `Component stack:`,
    e.componentStack ?? '(none)',
  ].join('\n');
}

/**
 * Best-effort DB log of a crash so web Claude can read it directly (no phone
 * screenshot, even for self-recovering crashes). Calls the log_client_error RPC
 * (web Claude creates it on demo). Never throws — if the RPC/table isn't there
 * yet, or the user is offline, we just fall back to the on-screen + localStorage
 * capture.
 */
export async function logClientError(e: CapturedError): Promise<void> {
  try {
    await supabase.rpc('log_client_error', {
      p_message: e.message,
      p_stack: e.stack ?? undefined,
      p_component_stack: e.componentStack ?? undefined,
      p_url: e.url ?? undefined,
      p_user_agent: e.ua ?? undefined,
    });
  } catch {
    /* best-effort */
  }
}
