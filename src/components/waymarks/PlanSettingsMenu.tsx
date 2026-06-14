import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { SlidersHorizontal, Lock, LockOpen } from 'lucide-react';
import { PLAN_PROVENANCE_OPTIONS } from '@/lib/plan-provenance';
import { useSetFloorProvenance } from '@/hooks/useFloors';
import { useSetFloorPinsLocked } from '@/hooks/useAssets';
import { useCan } from '@/lib/permissions-context';

/**
 * Floor "Plan settings" menu (gated to building_admin/editor). Holds the
 * plan-provenance setter and a floor-wide "Lock all / Unlock all" pins control;
 * Plan Prep re-run will join it later. A small toolbar button opening a popover,
 * matching the floor toolbar's other actions.
 */
export function PlanSettingsMenu({
  floorId,
  buildingId,
  provenance,
  allPinsLocked,
  hasPins,
}: {
  floorId: string;
  buildingId?: string;
  provenance: string;
  /** True when every live pin on the floor is currently locked. */
  allPinsLocked: boolean;
  /** True when the floor has at least one live pin. */
  hasPins: boolean;
}) {
  const setProvenance = useSetFloorProvenance(floorId, buildingId);
  const setPinsLocked = useSetFloorPinsLocked(floorId);
  // UX gate only — the RPC enforces the same edit rule server-side regardless.
  const canEdit = useCan('edit', { type: 'building', id: buildingId ?? '' });
  const [lockResult, setLockResult] = useState<string | null>(null);

  async function applyLock(locked: boolean) {
    setLockResult(null);
    try {
      const n = await setPinsLocked.mutateAsync(locked);
      setLockResult(
        n === 0
          ? `No pins to ${locked ? 'lock' : 'unlock'}.`
          : `${locked ? 'Locked' : 'Unlocked'} ${n} pin${n === 1 ? '' : 's'}.`
      );
    } catch {
      setLockResult('Couldn’t update pins — try again.');
    }
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2.5 text-[11px] font-medium text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <SlidersHorizontal size={11} aria-hidden />
          Plan settings
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[min(92vw,22rem)] rounded-lg border border-black/10 bg-surface p-3 text-sm text-text shadow-sheet outline-none dark:border-white/10"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Plan provenance
          </p>
          <p className="mt-1 text-xs text-text-muted">
            How this floor's plan was sourced. Shows as a small caption near the plan — for everyone,
            including clients on a share link. "Not specified" hides it.
          </p>
          <select
            value={provenance}
            disabled={setProvenance.isPending}
            onChange={(e) => setProvenance.mutate(e.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-black/10 bg-surface px-2 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
          >
            {PLAN_PROVENANCE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {setProvenance.isError && (
            <p className="mt-2 text-xs text-danger">Couldn't save — try again.</p>
          )}

          {canEdit && hasPins && (
            <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                Pin lock
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {allPinsLocked
                  ? 'Every pin on this floor is locked. Unlock them all to nudge pins.'
                  : 'Lock every pin on this floor at once so none can be dragged.'}
              </p>
              {/* One whole-floor toggle — the label flips with the floor's
                  current state so it never reads like a per-pin control. */}
              <button
                type="button"
                disabled={setPinsLocked.isPending}
                onClick={() => void applyLock(!allPinsLocked)}
                className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-waymarks-gold bg-waymarks-gold px-3 text-xs font-medium text-waymarks-ink transition-colors hover:bg-waymarks-gold-deep disabled:opacity-50"
              >
                {allPinsLocked ? <LockOpen size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
                {allPinsLocked ? 'Unlock all pins' : 'Lock all pins'}
              </button>
              {lockResult && (
                <p className="mt-2 text-xs text-text-muted" role="status" aria-live="polite">
                  {lockResult}
                </p>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
