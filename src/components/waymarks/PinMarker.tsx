import { forwardRef } from 'react';
import { Circle, Triangle, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssetStatus } from '@/lib/asset-status';
import { statusLabel } from '@/lib/asset-status';

/**
 * Single asset pin. Per spec 02 § Accessibility: status conveyed by *both*
 * color and icon shape so colorblind users can read a floor.
 *
 *   good      → green dot
 *   attention → gold triangle
 *   flagged   → red square
 *
 * `unlocked` adds a dashed gold ring + grab cursor — the placer (or anyone
 * with edit on the building) can drag the pin to nudge its position before
 * locking it via the AssetDrawer.
 */

export type PinMarkerProps = {
  assetId: string;
  name: string;
  type: string;
  status: AssetStatus;
  selected?: boolean;
  pendingSync?: boolean;
  /** When true the pin renders a draggable affordance and accepts drag. */
  unlocked?: boolean;
  /**
   * Deliberate-reposition target. Visually emphatic (larger, brighter dashed
   * ring) so the user knows this is the heavier, confirmation-gated action,
   * not the M4 quick-nudge.
   */
  repositioning?: boolean;
  /** Render at reduced opacity (used when another pin is being repositioned). */
  faded?: boolean;
  /**
   * Pointer-down handler used by PinOverlay to start a drag. The button's
   * own click handler is preserved for opening the drawer when no drag occurs.
   */
  onPointerDownDrag?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
};

const FILL_COLOR: Record<AssetStatus, string> = {
  good: 'bg-pin-good',
  attention: 'bg-pin-due',
  flagged: 'bg-pin-flagged',
};

const ICON_BY_STATUS = {
  good: Circle,
  attention: Triangle,
  flagged: Square,
} as const;

export const PinMarker = forwardRef<HTMLButtonElement, PinMarkerProps>(function PinMarker(
  {
    assetId,
    name,
    type,
    status,
    selected,
    pendingSync,
    unlocked,
    repositioning,
    faded,
    onPointerDownDrag,
    onClick,
  },
  ref
) {
  const Icon = ICON_BY_STATUS[status];
  const dragAccept = unlocked || repositioning;
  const lockSuffix = repositioning
    ? ', repositioning — drag to a new location'
    : unlocked
      ? ', unlocked — drag to move'
      : '';
  return (
    <button
      ref={ref}
      type="button"
      data-asset-id={assetId}
      onPointerDown={(e) => {
        // Prevent the canvas's pan-drag from capturing the pointer.
        e.stopPropagation();
        if (dragAccept) onPointerDownDrag?.(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={`${name} (${type}, ${statusLabel(status)}${lockSuffix})`}
      className={cn(
        'group relative inline-flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full lg:h-7 lg:w-7',
        'border-2 border-white shadow-sm transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-1',
        FILL_COLOR[status],
        selected && 'scale-110',
        repositioning && 'scale-125 cursor-grab touch-none ring-4 ring-waymarks-gold ring-offset-2',
        repositioning &&
          'after:pointer-events-none after:absolute after:-inset-2 after:animate-pulse after:rounded-full after:border-[3px] after:border-dashed after:border-waymarks-gold',
        unlocked && !repositioning &&
          'cursor-grab touch-none ring-4 ring-waymarks-gold/40 ring-offset-1',
        unlocked && !repositioning &&
          'after:pointer-events-none after:absolute after:-inset-1 after:animate-pulse after:rounded-full after:border-2 after:border-dashed after:border-waymarks-gold',
        !unlocked && !repositioning && selected && 'ring-4 ring-waymarks-gold/40',
        pendingSync && 'border-dashed',
        faded && 'opacity-40'
      )}
    >
      <Icon
        size={10}
        className="fill-white text-white"
        aria-hidden
      />
    </button>
  );
});
