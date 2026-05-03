import { cn } from '@/lib/utils';

export type Role = 'super_admin' | 'building_admin' | 'auditor' | 'tenant_rep';

export type RoleBadgeProps = {
  role: Role;
  scopeLabel?: string;
  className?: string;
};

const ROLE_VISUALS: Record<Role, { label: string; className: string }> = {
  super_admin: {
    label: 'Super admin',
    className: 'border-waymarks-gold bg-waymarks-gold-soft text-waymarks-ink dark:text-white',
  },
  building_admin: {
    label: 'Manager',
    className: 'border-info/30 bg-info-bg text-info',
  },
  auditor: {
    label: 'Auditor',
    className: 'border-success/30 bg-success-bg text-success',
  },
  tenant_rep: {
    label: 'Facilities',
    className: 'border-black/15 bg-waymarks-gold-soft text-text dark:border-white/15 dark:bg-white/5 dark:text-white',
  },
};

export function RoleBadge({ role, scopeLabel, className }: RoleBadgeProps) {
  const v = ROLE_VISUALS[role];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        v.className,
        className
      )}
    >
      <span>{v.label}</span>
      {scopeLabel && <span className="text-text-faint">· {scopeLabel}</span>}
    </span>
  );
}
