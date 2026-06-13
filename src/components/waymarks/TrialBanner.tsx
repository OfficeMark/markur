import { AlertCircle } from 'lucide-react';
import { useOrgSubscription } from '@/hooks/useOrganization';
import { upgradeMailto } from '@/lib/trial';

/**
 * 7-day pre-expiry trial banner. Shown to ORG ADMINS in the final week of an
 * active trial (not once locked — the lockout screen takes over then). A quiet
 * persistent strip below the header; no dismiss (it's a countdown that matters).
 */
export function TrialBanner() {
  const sub = useOrgSubscription();
  if (sub.isLoading || sub.locked || !sub.isOrgAdmin || !sub.inFinalWeek || sub.daysLeft == null) {
    return null;
  }
  const days = sub.daysLeft;
  return (
    <div className="border-b border-warning/30 bg-warning-bg text-warning">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-2 text-xs sm:px-6">
        <AlertCircle size={13} aria-hidden className="shrink-0" />
        <span>
          Your free trial ends in <span className="font-semibold">{days}</span>{' '}
          {days === 1 ? 'day' : 'days'}.
        </span>
        <a href={upgradeMailto(sub.org?.name)} className="font-semibold underline hover:no-underline">
          Upgrade to keep access
        </a>
      </div>
    </div>
  );
}
