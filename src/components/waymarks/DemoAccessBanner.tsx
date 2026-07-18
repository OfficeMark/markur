import { useMemo } from 'react';
import { KeyRound } from 'lucide-react';
import { usePermissions } from '@/lib/permissions-context';
import { demoDaysLeft } from '@/lib/queries/demo-links';

/**
 * S9 — conversion path. Shown on a building when the signed-in user's access
 * to it comes from an expiring building-scoped grant (a claimed demo link).
 * "Sign up to keep your building" is available the whole time, not just at
 * the end; urgency styling kicks in during the final week.
 */

const KEEP_MAILTO =
  'mailto:randy@rancherdesign.ca?subject=' +
  encodeURIComponent('Keep my building on Markur') +
  '&body=' +
  encodeURIComponent(
    "Hi — we've been trying Markur on our building and want to keep it going. What's the next step?"
  );

export function DemoAccessBanner({ buildingId }: { buildingId: string }) {
  const { grants, loading } = usePermissions();

  const demoGrant = useMemo(() => {
    if (loading) return null;
    // The demo grant: building-scoped with an expiry. If the user ALSO holds
    // any non-expiring access covering this building (real member), stay quiet.
    const hasPermanent = grants.some(
      (g) =>
        g.expires_at === null &&
        (g.scope_type === 'global' ||
          g.scope_type === 'organization' ||
          (g.scope_type === 'building' && g.scope_id === buildingId))
    );
    if (hasPermanent) return null;
    return (
      grants.find(
        (g) =>
          g.scope_type === 'building' &&
          g.scope_id === buildingId &&
          g.expires_at !== null &&
          new Date(g.expires_at).getTime() > Date.now()
      ) ?? null
    );
  }, [grants, loading, buildingId]);

  if (!demoGrant || !demoGrant.expires_at) return null;

  const left = demoDaysLeft(demoGrant.expires_at);
  const urgent = left <= 7;

  return (
    <div
      className={
        urgent
          ? 'mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-bg p-4'
          : 'mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-surface p-4 dark:border-white/10'
      }
    >
      <p className={urgent ? 'flex items-center gap-2 text-sm text-warning' : 'flex items-center gap-2 text-sm text-text-muted'}>
        <KeyRound size={15} aria-hidden />
        <span>
          <span className="font-medium">Full access · {left} {left === 1 ? 'day' : 'days'} left.</span>{' '}
          Your building and everything you’ve added stays — sign up to keep it.
        </span>
      </p>
      <a
        href={KEEP_MAILTO}
        className="inline-flex h-9 items-center rounded-md bg-waymarks-gold px-4 text-sm font-semibold text-waymarks-ink hover:bg-waymarks-gold-deep"
      >
        Keep your building
      </a>
    </div>
  );
}
