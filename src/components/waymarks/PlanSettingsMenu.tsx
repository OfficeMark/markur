import * as Popover from '@radix-ui/react-popover';
import { SlidersHorizontal } from 'lucide-react';
import { PLAN_PROVENANCE_OPTIONS } from '@/lib/plan-provenance';
import { useSetFloorProvenance } from '@/hooks/useFloors';

/**
 * Floor "Plan settings" menu (gated to building_admin/editor). For now it holds
 * the plan-provenance setter; Plan Prep re-run will join it later. A small
 * toolbar button opening a popover, matching the floor toolbar's other actions.
 */
export function PlanSettingsMenu({
  floorId,
  buildingId,
  provenance,
}: {
  floorId: string;
  buildingId?: string;
  provenance: string;
}) {
  const setProvenance = useSetFloorProvenance(floorId, buildingId);

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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
