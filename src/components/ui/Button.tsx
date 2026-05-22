import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-waymarks-ink text-white hover:bg-waymarks-ink/90 disabled:bg-waymarks-ink/40',
  // Sits on bg-surface, which is now dark in dark mode -- so the label uses
  // the semantic text token (dark in light, light in dark) rather than the
  // always-dark waymarks-ink, which would render invisible on a dark surface.
  secondary:
    'border border-black/15 bg-surface text-text hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5',
  ghost:
    'text-text hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5',
  danger:
    'border border-danger text-danger hover:bg-danger/5 disabled:opacity-50',
  // Gold has dark text, so a translucent disabled background (gold/40) turns
  // muddy on a dark surface and the label stops contrasting. Fade the whole
  // button with opacity instead (as secondary/ghost/danger do) -- readable in
  // both modes and still clearly a gold action.
  gold:
    'bg-waymarks-gold text-waymarks-ink hover:bg-waymarks-gold-deep disabled:opacity-50',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-2 focus-visible:ring-offset-waymarks-cream',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={ICON_SIZE[size]} className="animate-spin" aria-hidden />
      ) : (
        iconLeft
      )}
      <span>{children}</span>
      {!loading && iconRight}
    </button>
  );
});
