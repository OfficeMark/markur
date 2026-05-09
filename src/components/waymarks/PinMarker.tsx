import { forwardRef } from 'react';
import { Circle, Triangle, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssetStatus } from '@/lib/asset-status';
import { statusLabel } from '@/lib/asset-status';
import { colorForType, labelForType } from '@/lib/pin-types';
import {
  DEFAULT_PIN_SHAPE,
  DEFAULT_PIN_SIZE,
  type PinShape,
  type PinSize,
} from '@/lib/queries/branding';

/**
 * Single asset pin (M10b, sized in M10e+, resized in M12, configurable in M26).
 *
 * Default pin color comes from the asset's TYPE (Directory blue, Egress
 * green, etc. - see lib/pin-types). Status (good/attention/flagged) is
 * conveyed by the icon inside the dot AND a thin ring overlay when the
 * pin needs attention or is flagged.
 *
 * Shape + size come from org_branding (M26): admins pick circle/square/
 * diamond and small/medium/large from /admin/branding. Drop-pin/teardrop
 * is intentionally absent — its tip-anchor positioning would require
 * changing the drag math and overlay placement; deferred to a follow-up.
 */

export type PinMarkerProps = {
  assetId: string;
  name: string;
  type: string;
  status: AssetStatus;
  shape?: PinShape;
  size?: PinSize;
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

const PIN_SIZE_PX: Record<PinSize, number> = {
  small: 18,
  medium: 22,
  large: 30,
};

const PIN_ICON_PX: Record<PinSize, number> = {
  small: 7,
  medium: 9,
  large: 13,
};

export const PinMarker = forwardRef<HTMLButtonElement, PinMarkerProps>(function PinMarker(
  {
    assetId,
    name,
    type,
    status,
    shape = DEFAULT_PIN_SHAPE,
    size = DEFAULT_PIN_SIZE,
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

  const px = PIN_SIZE_PX[size];
  const iconPx = PIN_ICON_PX[size];
  // circle: full radius. square: gentle rounding so it isn't harsh at small sizes.
  // diamond: rotate the body 45deg and counter-rotate the inner icon so status stays upright.
  const shapeClass =
    shape === 'circle' ? 'rounded-full' : shape === 'square' ? 'rounded-md' : 'rounded-sm rotate-45';
  const iconCounterRotate = shape === 'diamond';

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
      style={{ backgroundColor: resolvedFill, width: px, height: px }}
      className={cn(
        'group relative inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center',
        shapeClass,
        // Hit-area extender (M12): visible body may be small (down to 18px) but the
        // tap target is enlarged by ~6px via a before-pseudo so phones stay easy to hit.
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
      <Icon
        size={iconPx}
        className={cn('fill-white text-white', iconCounterRotate && '-rotate-45')}
        aria-hidden
      />
    </button>
  );
});
