import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Cookie consent banner (M10e). Quebec Law 25 + PIPEDA require a clear
 * notice before non-essential tracking. Markur currently only uses
 * essential cookies (auth session + the consent choice itself), so the
 * banner is a single "Got it" — no opt-in/opt-out toggle for non-existent
 * categories. If we ever add analytics, this is where the dimmer switch
 * goes.
 *
 * The choice is stored in localStorage under `markur:cookie-consent`. We
 * intentionally do NOT show the banner on the /legal/* pages so visitors
 * reading the policy aren't shown the very thing they're reading about.
 */

const STORAGE_KEY = 'markur:cookie-consent';

type Choice = 'accepted' | null;

function readChoice(): Choice {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'accepted' ? 'accepted' : null;
  } catch {
    return null;
  }
}

function writeChoice(value: Choice): void {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode etc. — fail open; the banner will reappear next visit.
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Hide on the legal pages themselves so the policy reads cleanly.
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/legal/')) {
      return;
    }
    if (!readChoice()) setVisible(true);
  }, []);

  if (!visible) return null;

  function accept() {
    writeChoice('accepted');
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="pointer-events-auto fixed inset-x-3 bottom-3 z-[60] flex justify-center sm:inset-x-auto sm:right-4"
    >
      <div className="flex w-full max-w-xl flex-col gap-3 rounded-lg border border-black/10 bg-surface p-4 text-sm text-text shadow-sheet sm:flex-row sm:items-center">
        <div className="flex flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-waymarks-gold-soft text-waymarks-gold-deep">
            <Cookie size={16} aria-hidden />
          </div>
          <p className="leading-relaxed">
            Markur uses essential cookies to keep you signed in and remember your
            preferences. We don't use advertising or analytics cookies. See our{' '}
            <Link
              to="/legal/privacy"
              className="font-medium text-waymarks-gold-deep underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={accept}
            className="rounded-md p-1 text-text-muted hover:bg-black/5 sm:hidden"
          >
            <X size={14} aria-hidden />
          </button>
          <Button size="sm" variant="gold" onClick={accept}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
