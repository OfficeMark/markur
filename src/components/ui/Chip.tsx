import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ChipVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold';

export type ChipProps = {
  variant?: ChipVariant;
  selected?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const VARIANTS: Record<ChipVariant, string> = {
  default: 'border-black/15 bg-surface text-text dark:border-white/15',
  success: 'border-success/30 bg-success-bg text-success',
  warning: 'border-warning/30 bg-warning-bg text-warning',
  danger:  'border-danger/30 bg-danger-bg text-danger',
  info:    'border-info/30 bg-info-bg text-info',
  gold:    'border-waymarks-gold bg-waymarks-gold-soft text-waymarks-ink dark:bg-white/5 dark:text-white',
};

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { variant = 'default', selected, className, children, type = 'button', ...rest },
  ref
) {
  const interactive = !!rest.onClick;
  return (
    <button
      ref={ref}
      type={type}
      disabled={!interactive}
      aria-pressed={interactive ? !!selected : undefined}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium transition-colors',
        VARIANTS[variant],
        selected && 'ring-2 ring-waymarks-gold',
        interactive
          ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5'
          : 'cursor-default',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
