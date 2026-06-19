import { planProvenanceLabel } from '@/lib/plan-provenance';
import { cn } from '@/lib/utils';

/**
 * Quiet caption stating how a floor's plan was sourced (provenance). Renders
 * nothing for 'not_specified'. Shown wherever a plan renders. Deliberately
 * understated: a small italic line, not a banner.
 */
export function PlanProvenanceCaption({
  provenance,
  className,
}: {
  provenance: string | null | undefined;
  className?: string;
}) {
  const label = planProvenanceLabel(provenance);
  if (!label) return null;
  return <p className={cn('text-[11px] italic text-text-faint', className)}>{label}</p>;
}
