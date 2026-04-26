import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { format } from 'date-fns';
import { X, MapPin, Calendar, Wrench, Pencil } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { MetricCard } from '@/components/ui/MetricCard';
import { useAsset, useUpdateAsset } from '@/hooks/useAssets';
import { useActivity } from '@/hooks/useActivity';
import { signedAssetPhotoUrl } from '@/lib/queries/assets';
import { computeStatus, statusLabel, type AssetStatus } from '@/lib/asset-status';
import { useCan } from '@/lib/permissions-context';
import type { Asset, AuditLogEntry } from '@/types/database';

export type AssetDrawerProps = {
  assetId: string | null;
  /** Floor the drawer is rendered from. Used for permission checks + cache keys. */
  floorId: string;
  buildingId: string;
  onOpenChange: (open: boolean) => void;
};

export function AssetDrawer({ assetId, floorId, buildingId, onOpenChange }: AssetDrawerProps) {
  const open = !!assetId;
  const { data: asset, isLoading } = useAsset(assetId ?? undefined);
  const { data: activity = [] } = useActivity('assets', assetId ?? undefined);
  const canEdit = useCan('edit', { type: 'building', id: buildingId });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed right-0 top-0 z-50 flex h-full w-[min(96vw,420px)] flex-col border-l border-black/10 bg-surface text-text shadow-sheet outline-none dark:border-white/10"
        >
          <header className="flex items-start justify-between gap-3 border-b border-black/10 p-4 dark:border-white/10">
            <Dialog.Title asChild>
              <div className="min-w-0">
                {asset ? (
                  <p className="truncate font-serif text-xl">{asset.name}</p>
                ) : (
                  <p className="truncate font-serif text-xl">Asset</p>
                )}
                {asset && (
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {prettyType(asset.type)} · {asset.category}
                  </p>
                )}
              </div>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {isLoading || !asset ? (
              <Skeleton />
            ) : (
              <>
                <PhotoSection asset={asset} canEdit={canEdit} floorId={floorId} />
                <DetailsSection asset={asset} />
                <StatusRow asset={asset} flagCount={asset.status === 'flagged' ? 1 : 0} />
                <AttributesSection asset={asset} />
                <ActivitySection items={activity} />
                <PermissionsFooter />
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-40 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
      <div className="h-4 w-2/3 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
      <div className="h-4 w-1/2 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
    </div>
  );
}

function PhotoSection({
  asset,
  canEdit,
  floorId,
}: {
  asset: Asset;
  canEdit: boolean;
  floorId: string;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErrored(false);
    if (!asset.photo_url) {
      setSignedUrl(null);
      return;
    }
    void signedAssetPhotoUrl(asset.photo_url)
      .then((u) => {
        if (!cancelled) setSignedUrl(u);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.photo_url]);

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-black/10 bg-waymarks-gold-soft dark:border-white/10 dark:bg-white/5">
        {signedUrl && !errored ? (
          <img src={signedUrl} alt={asset.name} className="w-full object-cover" />
        ) : (
          <div className="flex h-32 items-center justify-center text-xs text-text-faint">
            {asset.photo_url ? (errored ? 'Could not load photo' : 'Loading photo…') : 'No photo'}
          </div>
        )}
      </div>
      {canEdit && (
        <ReplacePhotoButton asset={asset} floorId={floorId} />
      )}
    </div>
  );
}

function ReplacePhotoButton({ asset, floorId }: { asset: Asset; floorId: string }) {
  const update = useUpdateAsset(floorId);
  const [busy, setBusy] = useState(false);

  return (
    <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
      <Pencil size={12} aria-hidden />
      <span>{busy ? 'Uploading…' : asset.photo_url ? 'Replace photo' : 'Add photo'}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            const { uploadAssetPhoto } = await import('@/lib/queries/assets');
            const path = await uploadAssetPhoto(asset.id, f);
            await update.mutateAsync({ id: asset.id, patch: { photo_url: path } });
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
    </label>
  );
}

function DetailsSection({ asset }: { asset: Asset }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Chip variant="gold">{prettyType(asset.type)}</Chip>
        <Chip variant="default">{asset.category}</Chip>
      </div>
      {asset.location_notes && (
        <p className="flex items-start gap-1.5 text-sm text-text-muted">
          <MapPin size={12} aria-hidden className="mt-1 shrink-0" />
          <span>{asset.location_notes}</span>
        </p>
      )}
    </div>
  );
}

function StatusRow({ asset, flagCount }: { asset: Asset; flagCount: number }) {
  const status: AssetStatus = computeStatus({
    asset,
    lastAuditAt: null,
    openFlagCount: flagCount,
  });

  return (
    <div className="grid grid-cols-3 gap-2">
      <MetricCard
        label="Last audit"
        value="—"
      />
      <MetricCard
        label="Status"
        value={statusLabel(status)}
        status={
          status === 'good' ? 'success' : status === 'attention' ? 'warning' : 'danger'
        }
      />
      <MetricCard
        label="Flags"
        value={flagCount}
        status={flagCount > 0 ? 'danger' : 'neutral'}
      />
    </div>
  );
}

function AttributesSection({ asset }: { asset: Asset }) {
  return (
    <dl className="grid grid-cols-3 gap-x-2 gap-y-2 text-sm">
      <Attr term="Manufacturer" value={asset.manufacturer ?? '—'} icon={<Wrench size={12} />} />
      <Attr
        term="Installed"
        value={asset.installed_at ? format(new Date(asset.installed_at), 'PP') : '—'}
        icon={<Calendar size={12} />}
      />
      <Attr term="Cycle" value={asset.audit_cycle_days ? `${asset.audit_cycle_days} d` : 'default'} />
    </dl>
  );
}

function Attr({ term, value, icon }: { term: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-black/10 bg-surface p-2 dark:border-white/10">
      <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.16em] text-text-faint">
        {icon}
        {term}
      </dt>
      <dd className="mt-0.5 truncate text-sm">{value}</dd>
    </div>
  );
}

function ActivitySection({ items }: { items: AuditLogEntry[] }) {
  if (items.length === 0) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
          Activity
        </h3>
        <p className="rounded-md border border-black/10 bg-surface p-3 text-xs text-text-muted dark:border-white/10">
          No activity yet. Edits, audits, and flags will show up here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
        Activity
      </h3>
      <ol className="space-y-2">
        {items.map((entry) => (
          <li
            key={entry.id}
            className="rounded-md border border-black/10 bg-surface p-2 text-xs dark:border-white/10"
          >
            <p className="font-medium capitalize">{prettyAction(entry.action)}</p>
            <p className="text-text-faint">
              {format(new Date(entry.created_at), 'PPp')}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PermissionsFooter() {
  return (
    <p className="border-t border-black/10 pt-3 text-[11px] text-text-faint dark:border-white/10">
      Reposition is admin-only. Tenant reps can flag.
    </p>
  );
}

function prettyType(type: string): string {
  // 'tenant_id' → 'Tenant ID', 'service_room' → 'Service room'
  return type
    .split('_')
    .map((part, i) => (i === 0 ? part[0]?.toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function prettyAction(action: string): string {
  // 'insert.assets' → 'Created'; 'update.assets' → 'Updated'; etc.
  if (action.startsWith('insert.')) return 'Created';
  if (action.startsWith('update.')) return 'Updated';
  if (action.startsWith('delete.')) return 'Deleted';
  return action;
}

