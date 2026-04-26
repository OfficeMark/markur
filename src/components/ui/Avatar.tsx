import { useState } from 'react';
import { cn, initials } from '@/lib/utils';

export type AvatarSize = 'sm' | 'md' | 'lg';

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
};

const SIZES: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImg = !!src && !errored;

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center overflow-hidden rounded-full',
        'border border-black/10 bg-waymarks-gold-soft font-medium text-waymarks-ink',
        'dark:border-white/10 dark:bg-white/5 dark:text-white',
        SIZES[size],
        className
      )}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
