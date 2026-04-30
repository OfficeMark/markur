import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Building2, Layers, ChevronRight, Menu, X } from 'lucide-react';
import { useBuildings } from '@/hooks/useBuildings';
import { useFloors } from '@/hooks/useFloors';
import { cn } from '@/lib/utils';
import type { Building, Floor } from '@/types/database';

/**
 * Left sidebar listing buildings + their floors. Per spec 05 / 08 / M10b:
 *   * desktop (lg+): fixed 240px column on the left, slate-ink background
 *     (matches the AppShell header — frames the cream content area).
 *   * tablet/phone: hidden; the AppShell shows a hamburger that opens
 *     `<BuildingNavSheet>` — a left-slide Radix Dialog containing the same
 *     dark-themed content. Tapping any link auto-dismisses the sheet.
 */
export function BuildingNav() {
  return (
    <aside
      aria-label="Buildings and floors"
      className="hidden w-60 shrink-0 border-r border-black/30 bg-waymarks-ink text-white/90 lg:block"
    >
      <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
        <NavList />
      </div>
    </aside>
  );
}

/**
 * Hamburger button + sheet for phone/tablet. Renders nothing on desktop.
 */
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
          className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col bg-waymarks-ink text-white/90 shadow-sheet outline-none"
        >
          <header className="flex items-center justify-between border-b border-white/10 p-3">
            <Dialog.Title className="font-semibold text-lg text-white">Buildings</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close navigation"
                className="rounded-md p-1 text-white/70 hover:bg-white/10"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto p-3">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { data: buildings, isLoading } = useBuildings();

  if (isLoading) return <NavSkeleton />;
  if (!buildings || buildings.length === 0) {
    return <p className="px-2 py-1.5 text-xs text-white/50">No buildings yet.</p>;
  }
  return (
    <>
      <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
        Buildings
      </div>
      <ul className="space-y-3">
        {buildings.map((b) => (
          <BuildingItem key={b.id} building={b} onNavigate={onNavigate} />
        ))}
      </ul>
    </>
  );
}

function BuildingItem({
  building,
  onNavigate,
}: {
  building: Building;
  onNavigate?: () => void;
}) {
  const { data: floors } = useFloors(building.id);
  const location = useLocation();
  const buildingActive = location.pathname === `/buildings/${building.id}`;

  return (
    <li>
      <Link
        to={`/buildings/${building.id}`}
        onClick={onNavigate}
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
          buildingActive
            ? 'bg-white/[0.06] text-white shadow-[inset_3px_0_0_0_var(--tw-shadow-color)] shadow-waymarks-gold'
            : 'text-white/85 hover:bg-white/5 hover:text-white'
        )}
      >
        <Building2 size={14} aria-hidden className="text-white/50 group-hover:text-white/80" />
        <span className="flex-1 truncate font-medium">{building.name}</span>
        <ChevronRight size={12} aria-hidden className="text-white/40" />
      </Link>
      {floors && floors.length > 0 && (
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
        <li key={i} className="h-7 animate-pulse rounded-md bg-white/10" />
      ))}
    </ul>
  );
}
