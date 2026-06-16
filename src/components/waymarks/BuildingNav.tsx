import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Building2, Layers, ChevronRight, Menu, Plus, X } from 'lucide-react';
import { useAppBoot } from '@/hooks/useBundles';
import type { AppBootBuilding } from '@/lib/queries/bundles';
import { cn } from '@/lib/utils';
import type { Floor } from '@/types/database';
import { NewBuildingDialog } from '@/components/waymarks/NewBuildingDialog';

/**
 * Left sidebar listing buildings + their floors. Per spec 05 / 08 / M10b:
 *   * desktop (lg+): fixed 240px column on the left, slate-ink background.
 *   * tablet/phone: hidden; the AppShell shows a hamburger that opens
 *     `<BuildingNavSheet>` - a left-slide Radix Dialog containing the same
 *     dark-themed content. Tapping any link auto-dismisses the sheet.
 */
export function BuildingNav() {
  return (
    <aside
      aria-label="Buildings and floors"
      className="hidden w-60 shrink-0 border-r border-black/30 bg-waymarks-ink text-white/90 lg:block"
    >
      <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] max-h-[calc(100dvh-3.5rem)] overflow-y-auto p-3">
        <NavList />
      </div>
    </aside>
  );
}

export function BuildingNavSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold lg:hidden"
        >
          <Menu size={18} aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 w-[min(86vw,300px)] overflow-y-auto bg-waymarks-ink p-3 text-white/90 shadow-sheet outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-left"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-white">Markur</Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close navigation"
                className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X size={14} aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <NavList onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  // Read buildings + their floors straight from the get_app_boot bundle (one
  // call) instead of fetching the buildings list AND every building's floors
  // separately — the sidebar's floors-per-building N+1.
  const { data: boot, isLoading } = useAppBoot();
  const buildings = boot?.buildings;
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className="mb-2 flex items-center justify-between px-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
          Buildings
        </span>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label="New building"
          title="New building"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold"
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>

      {isLoading ? (
        <NavSkeleton />
      ) : !buildings || buildings.length === 0 ? (
        <div className="space-y-2 px-2">
          <p className="text-xs text-white/50">No buildings yet.</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/85 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold"
          >
            <Plus size={12} aria-hidden />
            Add the first one
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {buildings.map((b) => (
            <BuildingItem key={b.id} building={b} onNavigate={onNavigate} />
          ))}
        </ul>
      )}

      <NewBuildingDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function BuildingItem({
  building,
  onNavigate,
}: {
  building: AppBootBuilding;
  onNavigate?: () => void;
}) {
  // Floors come nested in the app_boot bundle — no per-building fetch.
  const floors = building.floors;
  const location = useLocation();
  const buildingActive = location.pathname === `/buildings/${building.id}`;

  // Item 8: the top level shows only building names. Floors are revealed on
  // drill-in via the chevron toggle. We auto-expand when the current route
  // belongs to this building (its building page, or one of its floors) so
  // deep links and refreshes still show the active floor in context.
  const floorActive = floors.some((f) => location.pathname === `/floors/${f.id}`);
  const autoExpand = buildingActive || floorActive;
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? autoExpand;
  const hasFloors = floors.length > 0;

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md pr-1 text-sm transition-colors',
          buildingActive
            ? 'bg-white/[0.06] text-white shadow-[inset_3px_0_0_0_var(--tw-shadow-color)] shadow-waymarks-gold'
            : 'text-white/85 hover:bg-white/5 hover:text-white'
        )}
      >
        <Link
          to={`/buildings/${building.id}`}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5"
        >
          <Building2 size={14} aria-hidden className="text-white/50 group-hover:text-white/80" />
          <span className="flex-1 truncate font-medium">{building.name}</span>
        </Link>
        {hasFloors && (
          <button
            type="button"
            onClick={() => setManualExpanded(!expanded)}
            aria-label={expanded ? `Hide floors in ${building.name}` : `Show floors in ${building.name}`}
            aria-expanded={expanded}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold"
          >
            <ChevronRight
              size={12}
              aria-hidden
              className={cn('transition-transform', expanded && 'rotate-90')}
            />
          </button>
        )}
      </div>
      {hasFloors && expanded && (
        <ul className="ml-4 mt-1 space-y-0.5">
          {floors.map((f) => (
            <FloorItem key={f.id} floor={f} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

function FloorItem({ floor, onNavigate }: { floor: Floor; onNavigate?: () => void }) {
  const location = useLocation();
  const active = location.pathname === `/floors/${floor.id}`;
  return (
    <li>
      <Link
        to={`/floors/${floor.id}`}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors',
          active
            ? 'bg-waymarks-gold text-white'
            : 'text-white/65 hover:bg-white/5 hover:text-white'
        )}
      >
        <Layers size={12} aria-hidden className="opacity-70" />
        <span className="truncate">{floor.label}</span>
      </Link>
    </li>
  );
}

function NavSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-7 animate-pulse rounded-md bg-white/5" />
      ))}
    </ul>
  );
}
