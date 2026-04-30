import { forwardRef } from 'react';
import { Circle, Triangle, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssetStatus } from '@/lib/asset-status';
import { statusLabel } from '@/lib/asset-status';
import { colorForType, labelForType } from '@/lib/pin-types';

/**
 * Single asset pin (M10b).
 *
 * Default pin color comes from the asset's TYPE (Directory blue, Egress
 * green, etc. — see lib/pin-types). The status (good/attention/flagged) is
 * conveyed by the icon shape inside the dot AND a thin ring overlay when
 * the pin needs attention or is flagged. This way the floor reads as a
 * "what's where" map at a glance, while still surfacing audit issues.
 *
 *   icon: good → Circle, attention → Triangle, flagged → Square
 *   ring: attention → warning gold, flagged → danger red, good → none
 *
 * `unlocked` adds a dashed Markur-orange ring + grab cursor (M4 quick-nudge).
 * `repositioning` is the deliberate-reposition target visual (M5).
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
    ? ', repositioning — drag to a new location'
    : unlocked
      ? ', unlocked — drag to move'
      : '';
  const resolvedFill = fillColor ?? colorForType(type);
  const statusRingClass =
    status === 'flagged'
      ? 'ring-2 ring-danger ring-offset-1 ring-offset-white'
      : status === 'attention'
        ? 'ring-2 ring-warning ring-offset-1 ring-offset-white'
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
        'group relative inline-flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full lg:h-7 lg:w-7',
        'border-2 border-white shadow-sm transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-1',
        // Status overlay ring (only for attention/flagged — good gets nothing)
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
      <Icon size={10} className="fill-white text-white" aria-hidden />
    </button>
  );
});
