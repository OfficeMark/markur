import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { AppShell } from '@/components/waymarks/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBuilding } from '@/hooks/useBuildings';
import { useDeletedAssets, useRestoreAsset } from '@/hooks/useAssets';
import { useIsSuperAdmin } from '@/lib/permissions-context';
import { usePermissions } from '@/lib/permissions-context';
import type { DeletedAsset } from '@/lib/queries/assets';

const RETENTION_DAYS = 30;
const RESTORE_BANNER_MS = 4000;

/**
 * Super-admin-only Trash view (M5). Lists soft-deleted assets in a building
 * within the retention window with a Restore action per row. Anything older
 * than the window is purged by cron in M10 (not implemented yet); for now we
 * just hide it from the list so the user doesn't expect to recover it.
 */
export function Trash() {
  const { id } = useParams<{ id: string }>();
  const { loading: permsLoading } = usePermissions();
  const isSuperAdmin = useIsSuperAdmin();
  const { data: building } = useBuilding(id);
  const { data: deleted = [], isLoading } = useDeletedAssets(id, RETENTION_DAYS);
  const restore = useRestoreAsset(id);

  // Inline confirmation banner — shown briefly after a successful restore so
  // the user doesn't wonder whether it landed (without it, the row just
  // disappears, which feels like the screen swallowed the action).
  const [restoredName, setRestoredName] = useState<string | null>(null);

  useEffect(() => {
    if (!restoredName) return;
    const t = window.setTimeout(() => setRestoredName(null), RESTORE_BANNER_MS);
    return () => window.clearTimeout(t);
  }, [restoredName]);

  function handleRestore(asset: DeletedAsset) {
    restore.mutate(asset.id, {
      onSuccess: () => setRestoredName(asset.name),
    });
  }

  // Wait for permissions before deciding on the redirect.
  if (permsLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <div className="h-8 w-40 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
        </div>
      </AppShell>
    );
  }

  if (!isSuperAdmin) {
    // Non-supers should never have landed here; bounce them back to the
    // building view rather than show a 403.
    return <Navigate to={id ? `/buildings/${id}` : '/'} replace />;
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to={id ? `/buildings/${id}` : '/'}
          className="mb-4 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden /> {building?.name ?? 'Building'}
        </Link>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">
              Trash · super admin
            </p>
            <h1 className="font-serif text-3xl text-text sm:text-4xl">Recently deleted assets</h1>
            <p className="mt-1 text-xs text-text-faint">
              Restorable for {RETENTION_DAYS} days. After that, deletion is permanent.
            </p>
          </div>
        </header>

        {restoredName && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-start gap-2 rounded-md border border-success/40 bg-success-bg p-3 text-sm text-success"
          >
            <Check size={14} aria-hidden className="mt-0.5" />
            <p>
              Restored <span className="font-medium">{restoredName}</span> — back on its floor with
              its photos and history.
            </p>
          </div>
        )}

        <div className="mb-4 flex items-start gap-2 rounded-md border border-black/10 bg-surface p-3 text-xs text-text-muted dark:border-white/10">
          <ShieldAlert size={14} aria-hidden className="mt-0.5 text-waymarks-gold" />
          <p>
            Restore brings the pin back exactly where it was, including its
            photos and history. The activity timeline records both the delete
            and the restore.
          </p>
        </div>

        {isLoading ? (
          <ListSkeleton />
        ) : deleted.length === 0 ? (
          <EmptyState
            icon={<Trash2 size={32} aria-hidden />}
            title="Trash is empty"
            description={`No assets in this building have been deleted in the last ${RETENTION_DAYS} days.`}
          />
        ) : (
          <ul className="space-y-2">
            {deleted.map((a) => (
              <DeletedRow
                key={a.id}
                asset={a}
                busy={restore.isPending && restore.variables === a.id}
                onRestore={() => handleRestore(a)}
              />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function DeletedRow({
  asset,
  busy,
  onRestore,
}: {
  asset: DeletedAsset;
  busy: boolean;
  onRestore: () => void;
}) {
  const deletedAt = asset.deleted_at ? new Date(asset.deleted_at) : null;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-black/10 bg-surface p-3 sm:flex-row sm:items-center dark:border-white/10">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{asset.name}</p>
        <p className="text-xs text-text-faint">
          {asset.floor_label ? `${asset.floor_label} · ` : ''}
          {prettyType(asset.type)}
          {deletedAt && (
            <>
              {' · deleted '}
              <time dateTime={deletedAt.toISOString()} title={format(deletedAt, 'PPpp')}>
                {formatDistanceToNow(deletedAt, { addSuffix: true })}
              </time>
            </>
          )}
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={onRestore}
        loading={busy}
        iconLeft={<RotateCcw size={12} aria-hidden />}
      >
        Restore
      </Button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-14 animate-pulse rounded-lg border border-black/10 bg-surface dark:border-white/10"
        />
      ))}
    </ul>
  );
}

function prettyType(type: string): string {
  return type
    .split('_')
    .map((part, i) => (i === 0 ? part[0]?.toUpperCase() + part.slice(1) : part))
    .join(' ');
}
