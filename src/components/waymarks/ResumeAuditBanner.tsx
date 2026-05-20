import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { useActiveAuditSessionsForUser } from '@/hooks/useAudit';
import { useAuth } from '@/lib/auth-context';

/**
 * Surfaces an open audit session at the top of Home / Building.tsx (M8).
 * The Floor view has its own resume affordance; this is the broader-context
 * version so the auditor doesn't have to remember which floor they were on.
 */

export type ResumeAuditBannerProps = {
  /** Optional — limits the banner to sessions inside one building. */
  buildingId?: string;
};

export function ResumeAuditBanner({ buildingId }: ResumeAuditBannerProps) {
  const { user } = useAuth();
  const { data, isLoading } = useActiveAuditSessionsForUser(user?.id, buildingId);
  if (isLoading) return null;
  const session = data && data[0];
  if (!session) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-waymarks-gold bg-waymarks-gold-soft p-3 text-sm dark:bg-white/5"
    >
      <ClipboardList size={16} aria-hidden className="text-waymarks-gold" />
      <p className="flex-1 text-waymarks-ink dark:text-white">
        Audit in progress on{' '}
        <span className="font-medium">{session.building_name}</span>{' '}
        <span className="text-text-faint">/ {session.floor_label}</span>
      </p>
      <Link
        to={`/floors/${session.floor_id}`}
        className="inline-flex h-9 items-center gap-1 rounded-md bg-waymarks-gold px-3 text-xs font-medium text-waymarks-ink hover:bg-waymarks-gold-deep"
      >
        Resume <ChevronRight size={12} aria-hidden />
      </Link>
    </div>
  );
}
