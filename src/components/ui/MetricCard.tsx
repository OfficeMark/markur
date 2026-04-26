import { cn } from '@/lib/utils';

export type MetricStatus = 'success' | 'warning' | 'danger' | 'neutral';

export type MetricCardProps = {
  label: string;
  value: string | number;
  status?: MetricStatus;
  className?: string;
};

const STATUS_CLS: Record<MetricStatus, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-text',
};

export function MetricCard({ label, value, status = 'neutral', className }: MetricCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-black/10 bg-surface p-3 dark:border-white/10',
        className
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-faint">
        {label}
      </p>
      <p className={cn('mt-1 text-xl font-medium tabular-nums', STATUS_CLS[status])}>{value}</p>
    </div>
  );
}
