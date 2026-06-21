import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  MoreHorizontal,
  RefreshCw,
  Map as MapIcon,
  Lock,
  LockOpen,
  Trash2,
  ChevronRight,
  Check,
  Download,
  Eye,
} from 'lucide-react';
import { PLAN_PROVENANCE_OPTIONS } from '@/lib/plan-provenance';
import { useSetFloorProvenance } from '@/hooks/useFloors';
import { useSetFloorPinsLocked } from '@/hooks/useAssets';

/**
 * Floor toolbar "⋯ More" overflow (reskin). A single Radix DropdownMenu holding
 * the rarely-used plan actions the tightened header tucks away: Replace plan,
 * Plan source (provenance, as a radio submenu), Lock/Unlock all pins, and —
 * temporarily — Delete floor (its real home is the building page's Danger zone,
 * ported in the next slice; kept here as a stopgap so the capability isn't lost).
 *
 * All data goes through the per-table floor/asset hooks — no bundles.
 */
export function FloorMoreMenu({
  floorId,
  buildingId,
  provenance,
  allPinsLocked,
  hasPins,
  canUploadPlan,
  canEditPins,
  canDeleteFloor,
  onReplacePlan,
  onDeleteFloor,
  offline,
  onVisualize,
}: {
  floorId: string;
  buildingId?: string;
  provenance: string;
  allPinsLocked: boolean;
  hasPins: boolean;
  canUploadPlan: boolean;
  canEditPins: boolean;
  canDeleteFloor: boolean;
  onReplacePlan: () => void;
  onDeleteFloor: () => void;
  /**
   * When provided, an Offline (take-offline) item is shown at the top — used by
   * the narrow (<lg) toolbar where Offline collapses into this menu.
   */
  offline?: { cached: boolean; busy: boolean; onToggle: () => void };
  /** When provided, a Visualize item is shown (collapses here below lg). */
  onVisualize?: () => void;
}) {
  const setProvenance = useSetFloorProvenance(floorId, buildingId);
  const setPinsLocked = useSetFloorPinsLocked(floorId);

  const itemCls =
    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text outline-none data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/5';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="More plan actions"
          title="More — replace plan, plan source, lock pins…"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/15 bg-surface text-text-muted hover:bg-black/5 hover:text-text dark:border-white/15 dark:hover:bg-white/5"
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[12rem] rounded-lg border border-black/10 bg-surface p-1 text-text shadow-sheet outline-none dark:border-white/10"
        >
          {offline && (
            <DropdownMenu.Item
              className={itemCls}
              onSelect={(e) => {
                e.preventDefault();
                offline.onToggle();
              }}
            >
              {offline.cached ? (
                <Check size={14} aria-hidden className="text-success" />
              ) : (
                <Download size={14} aria-hidden className="text-text-muted" />
              )}
              {offline.cached ? 'Saved offline' : offline.busy ? 'Saving…' : 'Take offline'}
            </DropdownMenu.Item>
          )}

          {onVisualize && (
            <DropdownMenu.Item className={itemCls} onSelect={onVisualize}>
              <Eye size={14} aria-hidden className="text-text-muted" />
              Visualize
            </DropdownMenu.Item>
          )}

          {(offline || onVisualize) && (canUploadPlan || canEditPins || canDeleteFloor) && (
            <DropdownMenu.Separator className="my-1 h-px bg-black/10 dark:bg-white/10" />
          )}

          {canUploadPlan && (
            <DropdownMenu.Item className={itemCls} onSelect={onReplacePlan}>
              <RefreshCw size={14} aria-hidden className="text-text-muted" />
              Replace plan
            </DropdownMenu.Item>
          )}

          {canUploadPlan && (
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={itemCls + ' justify-between'}>
                <span className="flex items-center gap-2">
                  <MapIcon size={14} aria-hidden className="text-text-muted" />
                  Plan source
                </span>
                <ChevronRight size={14} aria-hidden className="text-text-faint" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  sideOffset={2}
                  alignOffset={-4}
                  className="z-50 w-[min(90vw,18rem)] rounded-lg border border-black/10 bg-surface p-1 text-text shadow-sheet outline-none dark:border-white/10"
                >
                  <DropdownMenu.RadioGroup
                    value={provenance}
                    onValueChange={(v) => setProvenance.mutate(v)}
                  >
                    {PLAN_PROVENANCE_OPTIONS.map((o) => (
                      <DropdownMenu.RadioItem key={o.key} value={o.key} className={itemCls + ' pr-2'}>
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          <DropdownMenu.ItemIndicator>
                            <Check size={13} aria-hidden className="text-waymarks-gold-deep" />
                          </DropdownMenu.ItemIndicator>
                        </span>
                        <span className="flex-1">{o.label}</span>
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          )}

          {canEditPins && hasPins && (
            <DropdownMenu.Item
              className={itemCls}
              disabled={setPinsLocked.isPending}
              onSelect={(e) => {
                // Keep the menu open isn't needed; just fire the RPC. Label flips
                // after the assets cache invalidates + refetches.
                e.preventDefault();
                void setPinsLocked.mutateAsync(!allPinsLocked).catch(() => {});
              }}
            >
              {allPinsLocked ? (
                <LockOpen size={14} aria-hidden className="text-text-muted" />
              ) : (
                <Lock size={14} aria-hidden className="text-text-muted" />
              )}
              {allPinsLocked ? 'Unlock all pins' : 'Lock all pins'}
            </DropdownMenu.Item>
          )}

          {canDeleteFloor && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-black/10 dark:bg-white/10" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-danger outline-none data-[highlighted]:bg-danger-bg"
                onSelect={onDeleteFloor}
              >
                <Trash2 size={14} aria-hidden />
                Delete floor
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
