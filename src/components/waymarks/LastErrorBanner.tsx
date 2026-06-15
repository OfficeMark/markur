import { useState } from 'react';
import { AlertCircle, Copy, X } from 'lucide-react';
import { clearLastError, formatCapturedError, readLastError } from '@/lib/last-error';

/**
 * Re-surfaces the most recent crash that the ErrorBoundary captured, on the next
 * clean render. Needed because the crash now self-recovers (the boundary's tree
 * re-renders successfully on the retry) before the "Something went wrong" screen
 * can be read on a phone. The error is also logged to the DB, but this gives an
 * on-device copy path too. Shows only for recent crashes; dismiss clears it.
 */
export function LastErrorBanner() {
  const [err, setErr] = useState(() => {
    const e = readLastError();
    if (e && Date.now() - e.at < 5 * 60_000) return e;
    if (e) clearLastError();
    return null;
  });
  const [copied, setCopied] = useState(false);

  if (!err) return null;

  const dismiss = () => {
    clearLastError();
    setErr(null);
  };

  const copy = () => {
    void navigator.clipboard?.writeText(formatCapturedError(err)).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => {
        /* clipboard blocked — message is still visible below */
      }
    );
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 py-3"
    >
      <div className="flex w-full max-w-lg items-start gap-2 rounded-md border border-danger/40 bg-danger-bg px-3 py-2.5 text-xs text-danger shadow-md">
        <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">An error was captured.</p>
          <p className="mt-0.5 break-words text-[11px] text-danger/90">{err.message || '(no message)'}</p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-danger/40 px-2 py-1 font-medium hover:bg-danger/10"
        >
          <Copy size={12} aria-hidden />
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 hover:bg-danger/10"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}
