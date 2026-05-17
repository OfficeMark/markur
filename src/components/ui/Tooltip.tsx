import * as RT from '@radix-ui/react-tooltip';
import { type ReactNode } from 'react';
import { useActionHints } from '@/lib/action-hints-context';

export type TooltipProps = {
  /** The text the tooltip displays. Keep it 2-5 words, descriptive of the action. */
  text: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Defaults to 6px. Increase if the trigger has a visible border that swallows the gap. */
  sideOffset?: number;
};

/**
 * M32 Step 2A — thin wrapper around @radix-ui/react-tooltip.
 *
 * - Reads ActionHintsContext; renders children with no wrapper at all when
 *   the signed-in user has hidden hints (toggle in /settings).
 * - Inherits the global `delayDuration` set on Tooltip.Provider in App.tsx
 *   (400ms per the M32 prompt). Style mirrors the rest of the design system
 *   (waymarks-ink background, white text, sheet shadow).
 * - On touch, Radix may flash the tooltip briefly during tap-and-hold;
 *   that's acceptable. PinOverlay's long-press reposition gesture (M12)
 *   still wins because it captures pointer events before the tooltip
 *   resolves and operates on a different element entirely.
 */
export function Tooltip({ text, children, side = 'top', sideOffset = 6 }: TooltipProps) {
  const enabled = useActionHints();
  if (!enabled) return <>{children}</>;
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={sideOffset}
          className="z-50 select-none rounded-md bg-waymarks-ink/95 px-2 py-1 text-[11px] font-medium text-white shadow-sheet data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0"
        >
          {text}
          <RT.Arrow className="fill-waymarks-ink/95" width={10} height={5} />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
