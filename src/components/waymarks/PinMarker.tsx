import { forwardRef } from 'react';
import { Circle, Triangle, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssetStatus } from '@/lib/asset-status';
import { statusLabel } from '@/lib/asset-status';
import { colorForType, labelForType } from '@/lib/pin-types';

/**
 * Single asset pin (M10b, sized down in M10e+).
 *
 * Default pin color comes from the asset's TYPE (Directory blue, Egress
 * green, etc. — see lib/pin-types). The status (good/attention/flagged) is
 * conveyed by the icon shape inside the dot AND a thin ring overlay when
 * the pin needs attention or is flagged. This way the floor reads as a
 * "what's where" map at a glance, while still surfacing audit issues.
 *
 *   icon: good -> Circle, attention -> Triangle, flagged -> Square
 *   ring: attention -> warning gold, flagged -> danger red, good -> none
 *
 * `unlocked` adds a dashed Markur-orange ring + grab cursor (M4 quick-nudge).
 * `repositioning` is the deliberate-reposition target visual (M5).
 *
 * Sizing (M10e+): visible dot is 28px on touch, 20px on desktop (was
 * 36/28). The ::before pseudo-element extends an invisible 6px tap-pad
 * around the dot so touch targets stay comfortable. Real fix for dense
 * floors is the clustering work in the next slice.
 */

export type PinMarkerProps = {
  assetId: string;
  name: string;
  type: string;
  status: AssetStatus;
  selected?: boolean;
  pendingSync?: boolean;
  unlocked?: boolean;
  repositioning?: boolean;
  faded?: boolean;
  /**
   * Force a specific fill color (used by AuditModeShell to switch to
   * status-based coloring during a walk: green = audited this session,
   * red = flagged this session). When omitted, falls back to the asset's
   * type color from lib/pin-types.
   */
  fillColor?: string;
  onPointerDownDrag?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
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
    fillColor,
    onPointerDownDrag,
    onClick,
  },
  ref
) {
  const Icon = ICON_BY_STATUS[status];
  const dragAccept = unlocked || repositioning;
  const lockSuffix = repositioning
    ? ', repositioning - drag to a new location'
    : unlocked
      ? ', unlocked - drag to move'
      : '';
  const resolvedFill = fillColor ?? colorForType(type);
  // Status ring (M10e+): tightened from ring-2 + ring-offset-1 down to
  // ring-1 with no offset. On the smaller default pin size, the old
  // 6px-wide ring read as more visual weight than the dot itself.
  const statusRingClass =
    status === 'flagged'
      ? 'ring-1 ring-danger'
      : status === 'attention'
        ? 'ring-1 ring-warning'
        : '';
  const typeName = labelForType(type);
  return (
    <button
      ref={ref}
      type="button"
      data-asset-id={assetId}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (dragAccept) onPointerDownDrag?.(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={`${name} (${typeName}, ${statusLabel(status)}${lockSuffix})`}
      style={{ backgroundColor: resolvedFill }}
      className={cn(
        // 28px touch / 20px desktop visible dot
        'group relative inline-flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full lg:h-5 lg:w-5',
        // Invisible 6px tap-padding ring (no extra visual bulk)
        'before:absolute before:-inset-1.5 before:rounded-full before:content-[""]',
        'border border-white shadow-sm transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-1',
        // Status overlay ring (only for attention/flagged - good gets nothing)
        !repositioning && !unlocked && !selected && statusRingClass,
        selected && 'scale-110',
        repositioning && 'scale-125 cursor-grab touch-none ring-4 ring-waymarks-gold ring-offset-2',
        repositioning &&
          'after:pointer-events-none after:absolute after:-inset-2 after:animate-pulse after:rounded-full after:border-[3px] after:border-dashed after:border-waymarks-gold',
        unlocked && !repositioning &&
          'cursor-grab touch-none ring-4 ring-waymarks-gold ring-offset-1',
        unlocked && !repositioning &&
          'after:pointer-events-none after:absolute after:-inset-1 after:animate-pulse after:rounded-full after:border-2 after:border-dashed after:border-waymarks-gold',
        !unlocked && !repositioning && selected && 'ring-4 ring-waymarks-gold',
        pendingSync && 'border-dashed',
        faded && 'opacity-40'
      )}
    >
      <Icon size={8} className="fill-white text-white" aria-hidden />
    </button>
  );
});
