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
 */

export type PinMarkerProps = {
  assetId: string;
  name: string;
  type: string;
  status: AssetStatus;
  selected?: boolean;
  pendingSync?: boolean;
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
  { assetId, name, type, status, selected, pendingSync, onClick },
  ref
) {
  const Icon = ICON_BY_STATUS[status];
  return (
    <button
      ref={ref}
      type="button"
      data-asset-id={assetId}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={`${name} (${type}, ${statusLabel(status)})`}
      className={cn(
        'group relative inline-flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
        'border-2 border-white shadow-sm transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-1',
        FILL_COLOR[status],
        selected && 'scale-110 ring-4 ring-waymarks-gold/40',
        pendingSync && 'border-dashed'
      )}
    >
      <Icon
        size={10}
        className={cn(status === 'good' ? 'fill-white text-white' : 'fill-white text-white')}
        aria-hidden
      />
    </button>
  );
});
