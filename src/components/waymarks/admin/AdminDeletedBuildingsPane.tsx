import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Building2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDeletedBuildings, useRestoreBuilding } from '@/hooks/useBuildings';
import { useIsSuperAdmin } from '@/lib/permissions-context';

/**
 * /admin/deleted-buildings — super-admin Trash for whole buildings.
 * Restoring brings back the building and the floors (+ their pins/photos/flags)
 * that were cascade-deleted with it; floors deleted independently stay deleted.
 */
export function AdminDeletedBuildingsPane() {
  const isSuper = useIsSuperAdmin();
  const { data: buildings = [], isLoading } = useDeletedBuildings();
  const restore = useRestoreBuilding();
  const [error, setError] = useState<string | null>(null);

  if (!isSuper) return <Navigate to="/admin/asset-types" replace />;

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-semibold text-2xl">Deleted buildings</h2>
        <p className="mt-1 text-sm text-text-muted">
          Soft-deleted buildings, recoverable. Restoring brings back the building and the floors,
          pins, photos, and flags deleted with it. Floors deleted on their own stay deleted.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-text-faint">Loading…</p>
      ) : buildings.length === 0 ? (
        <EmptyState
          icon={<Building2 size={32} aria-hidden />}
          title="No deleted buildings"
          description="Buildings you delete show up here, recoverable."
        />
      ) : (
        <ul className="space-y-2">
          {buildings.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-surface p-4 dark:border-white/10"
            >
              <div className="min-w-0">
                <p className="font-medium text-text">{b.name}</p>
                <p className="text-xs text-text-faint">
                  {b.address}, {b.city}
                  {b.region ? `, ${b.region}` : ''}
                  {b.deleted_at ? ` · deleted ${format(new Date(b.deleted_at), 'PP')}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                iconLeft={<RotateCcw size={12} aria-hidden />}
                loading={restore.isPending && restore.variables?.id === b.id}
                onClick={() => {
                  if (!b.deleted_at) return;
                  setError(null);
                  restore.mutate(
                    { id: b.id, deletedAt: b.deleted_at },
                    { onError: (e) => setError(e instanceof Error ? e.message : 'Restore failed.') }
                  );
                }}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
