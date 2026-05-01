import { forwardRef } from 'react';
import { Circle, Triangle, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssetStatus } from '@/lib/asset-status';
import { statusLabel } from '@/lib/asset-status';
import { colorForType, labelForType } from '@/lib/pin-types';

/**
 * Single asset pin (M10b, sized in M10e+, resized in M12).
 *
 * Default pin color comes from the asset's TYPE (Directory blue, Egress
 * green, etc. - see lib/pin-types). Status (good/attention/flagged) is
 * conveyed by the icon shape inside the dot AND a thin ring overlay when
 * the pin needs attention or is flagged.
 *
 * Sizing comes from the --pin-size-mobile / --pin-size-desktop CSS
 * variables in globals.css (currently 22px touch / 21px desktop). The
 * visual dot is intentionally smaller than the touch target - a
 * before: pseudo-element extends the tap area so small pins stay
 * easy to hit on phones. Real fix for dense floors is the clustering
 * work still scheduled for a later slice.
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
        'group relative inline-flex h-[var(--pin-size-mobile)] w-[var(--pin-size-mobile)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full lg:h-[var(--pin-size-desktop)] lg:w-[var(--pin-size-desktop)]',
        // Hit-area extender (M12): visible dot is small (22px touch) but the tap target
        // is enlarged by ~12px via a before-pseudo so phones stay easy to hit.
        'before:absolute before:-inset-1.5 before:rounded-full before:content-[""]',
        'border border-white shadow-sm transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-1',
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
      <Icon size={9} className="fill-white text-white" aria-hidden />
    </button>
  );
});
