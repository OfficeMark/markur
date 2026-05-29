import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Outbound link to the OfficeMark ordering portal. Plain external link — no SSO,
 * deep-linking, or auth handoff (Task 2 brief). Shown on the Buildings list cards
 * and the Building detail header. `className` carries placement-specific styling so
 * the link semantics (href / target / rel / label) stay consistent everywhere.
 */
export const ORDER_SIGNS_URL = 'https://account.officemark.ca/authentication/login';

export function OrderSignsButton({ className }: { className?: string }) {
  return (
    <a
      href={ORDER_SIGNS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1.5 font-medium', className)}
    >
      Order Signs
      <ExternalLink size={12} aria-hidden />
    </a>
  );
}
