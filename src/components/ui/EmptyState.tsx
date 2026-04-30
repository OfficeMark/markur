import type { ReactNode } from 'react';
import { Button } from './Button';

export type EmptyStateAction = {
  label: string;
  onClick: () => void;
};

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
};

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-black/10 bg-surface p-8 text-center dark:border-white/10">
      {icon && (
        <div className="text-waymarks-gold" aria-hidden>
          {icon}
        </div>
      )}
      <div className="space-y-2">
        <h2 className="font-semibold text-2xl text-text">{title}</h2>
        <p className="text-sm text-text-muted">{description}</p>
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {primaryAction && (
            <Button variant="gold" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
