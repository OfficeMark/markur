import { Link, useLocation } from 'react-router-dom';
import { Building2, Layers, ChevronRight } from 'lucide-react';
import { useBuildings } from '@/hooks/useBuildings';
import { useFloors } from '@/hooks/useFloors';
import { cn } from '@/lib/utils';
import type { Building, Floor } from '@/types/database';

/**
 * Left sidebar listing buildings + their floors. Per spec 05:
 *   - desktop: fixed 240px column on the left
 *   - tablet/mobile: collapses to a header drop-down (M8 work — for now we
 *     simply hide the sidebar below `lg:` and you navigate by URL)
 *
 * The component fetches its own data — keeps the route components thin.
 */
export function BuildingNav() {
  const { data: buildings, isLoading } = useBuildings();

  return (
    <aside
      aria-label="Buildings and floors"
      className="hidden w-60 shrink-0 border-r border-black/10 bg-surface dark:border-white/10 lg:block"
    >
      <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
        <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
          Buildings
        </div>
        {isLoading ? (
          <NavSkeleton />
        ) : !buildings || buildings.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-text-muted">No buildings yet.</p>
        ) : (
          <ul className="space-y-3">
            {buildings.map((b) => (
              <BuildingItem key={b.id} building={b} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function BuildingItem({ building }: { building: Building }) {
  const { data: floors } = useFloors(building.id);
  const location = useLocation();
  const buildingActive = location.pathname === `/buildings/${building.id}`;

  return (
    <li>
      <Link
        to={`/buildings/${building.id}`}
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
          buildingActive
            ? 'bg-waymarks-gold-soft text-text dark:bg-white/5'
            : 'text-text hover:bg-black/5 dark:hover:bg-white/5'
        )}
      >
        <Building2 size={14} aria-hidden className="text-text-faint" />
        <span className="flex-1 truncate font-medium">{building.name}</span>
        <ChevronRight size={12} aria-hidden className="text-text-faint" />
      </Link>
      {floors && floors.length > 0 && (
        <ul className="ml-4 mt-1 space-y-0.5">
          {floors.map((f) => (
            <FloorItem key={f.id} floor={f} />
          ))}
        </ul>
      )}
    </li>
  );
}

function FloorItem({ floor }: { floor: Floor }) {
  const location = useLocation();
  const active = location.pathname === `/floors/${floor.id}`;
  return (
    <li>
      <Link
        to={`/floors/${floor.id}`}
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors',
          active
            ? 'bg-waymarks-ink text-white'
            : 'text-text-muted hover:bg-black/5 hover:text-text dark:hover:bg-white/5'
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
        <li key={i} className="h-7 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
      ))}
    </ul>
  );
}
