import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Renders a building's configurable outbound link as a new-tab button. Generic:
 * the href and text come entirely from the admin-set values — no assumptions
 * about where it points. Self-gating: renders nothing unless BOTH url and label
 * are non-empty, so callers can pass the building's link directly and let an
 * unconfigured building simply show no button.
 */
export function ExternalLinkButton({
  url,
  label,
  className,
  iconSize = 12,
}: {
  url?: string | null;
  label?: string | null;
  className?: string;
  iconSize?: number;
}) {
  const href = url?.trim();
  const text = label?.trim();
  if (!href || !text) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1.5 font-medium', className)}
    >
      {text}
      <ExternalLink size={iconSize} aria-hidden />
    </a>
  );
}
