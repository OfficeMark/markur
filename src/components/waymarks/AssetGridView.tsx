import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ImageOff, MapPin } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useAssetPhotos } from '@/hooks/useAssetPhotos';
import { signedAssetPhotoUrl } from '@/lib/queries/asset-photos';
import { TYPE_COLORS, labelForType } from '@/lib/pin-types';
import { computeStatus, statusLabel, type AssetStatus } from '@/lib/asset-status';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types/database';

/**
 * Sortable list of assets on a floor (M10c). Mirrors the old prototype's
 * "Grid view" toggle — when the building admin is at a desk planning, a
 * sortable table is more useful than a floor plan. Each row has a thumbnail
 * (the asset's first photo), a type-colored dot, name, location notes, last
 * audit, and status. Clicking a row opens the existing AssetDrawer.
 */

export type AssetGridViewProps = {
  assets: Asset[];
  selectedAssetId?: string | null;
  onSelectAsset: (asset: Asset) => void;
  /** Map<assetId, ISO timestamp> of latest CONFIRMED audit (drives status). */
  lastAuditByAsset?: ReadonlyMap<string, string> | null;
};

type SortKey = 'name' | 'type' | 'status' | 'last_audit';

type SortState = { key: SortKey; dir: 'asc' | 'desc' };

export function AssetGridView({
  assets,
  selectedAssetId,
  onSelectAsset,
  lastAuditByAsset,
}: AssetGridViewProps) {
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });

  const rows = useMemo(() => {
    const enriched = assets.map((a) => {
      const lastAudit = lastAuditByAsset?.get(a.id) ?? null;
      const status = computeStatus({
        asset: a,
        lastAuditAt: lastAudit,
        openFlagCount: a.status === 'flagged' ? 1 : 0,
      });
      return { asset: a, lastAudit, status };
    });
    enriched.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      switch (sort.key) {
        case 'name':
          return a.asset.name.localeCompare(b.asset.name) * dir;
        case 'type':
          return a.asset.type.localeCompare(b.asset.type) * dir;
        case 'status': {
          const order: Record<AssetStatus, number> = { good: 0, attention: 1, flagged: 2 };
          return (order[a.status] - order[b.status]) * dir;
        }
        case 'last_audit': {
          const av = a.lastAudit ? Date.parse(a.lastAudit) : 0;
          const bv = b.lastAudit ? Date.parse(b.lastAudit) : 0;
          return (av - bv) * dir;
        }
      }
    });
    return enriched;
  }, [assets, lastAuditByAsset, sort]);

  function flip(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-black/10 bg-surface p-6 text-center text-sm text-text-muted dark:border-white/10">
        No assets on this floor yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-black/10 bg-surface dark:border-white/10">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-surface-soft text-text-muted dark:border-white/10">
            <tr>
              <th scope="col" className="w-16 py-2.5 pl-3 pr-1 text-[11px] font-medium uppercase tracking-[0.18em]">
                Photo
              </th>
              <SortableHeader label="Name" k="name" sort={sort} onFlip={flip} />
              <SortableHeader label="Type" k="type" sort={sort} onFlip={flip} />
              <SortableHeader label="Status" k="status" sort={sort} onFlip={flip} />
              <SortableHeader label="Last audit" k="last_audit" sort={sort} onFlip={flip} />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ asset, lastAudit, status }) => (
              <Row
                key={asset.id}
                asset={asset}
                lastAudit={lastAudit}
                status={status}
                selected={asset.id === selectedAssetId}
                onClick={() => onSelectAsset(asset)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  k,
  sort,
  onFlip,
}: {
  label: string;
  k: SortKey;
  sort: SortState;
  onFlip: (k: SortKey) => void;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className="py-2.5 pr-3 text-[11px] font-medium uppercase tracking-[0.18em]">
      <button
        type="button"
        onClick={() => onFlip(k)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-text',
          active ? 'text-text' : ''
        )}
      >
        <span>{label}</span>
        <Icon size={11} aria-hidden className={active ? '' : 'opacity-40'} />
      </button>
    </th>
  );
}

function Row({
  asset,
  lastAudit,
  status,
  selected,
  onClick,
}: {
  asset: Asset;
  lastAudit: string | null;
  status: AssetStatus;
  selected: boolean;
  onClick: () => void;
}) {
  const typeColor = TYPE_COLORS[asset.type]?.fill ?? '#475569';
  const typeName = labelForType(asset.type);
  return (
    <tr
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'cursor-pointer border-t border-black/5 transition-colors hover:bg-waymarks-gold-soft focus-visible:bg-waymarks-gold-soft focus-visible:outline-none dark:border-white/5',
        selected && 'bg-waymarks-gold-soft'
      )}
    >
      <td className="py-2 pl-3 pr-1">
        <PhotoThumb assetId={asset.id} />
      </td>
      <td className="py-2 pr-3">
        <p className="font-medium text-text">{asset.name}</p>
        {asset.location_notes && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-faint">
            <MapPin size={10} aria-hidden />
            <span className="truncate">{asset.location_notes}</span>
          </p>
        )}
      </td>
      <td className="py-2 pr-3">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
            style={{ backgroundColor: typeColor }}
          />
          <span className="text-text">{typeName}</span>
        </span>
      </td>
      <td className="py-2 pr-3">
        <StatusBadge status={status} />
      </td>
      <td className="py-2 pr-3 text-xs text-text-muted">
        {lastAudit ? (
          <time dateTime={lastAudit} title={format(new Date(lastAudit), 'PPp')}>
            {formatDistanceToNow(new Date(lastAudit), { addSuffix: true })}
          </time>
        ) : (
          <span className="text-text-faint">Never</span>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: AssetStatus }) {
  const cls =
    status === 'good'
      ? 'border-success/30 bg-success-bg text-success'
      : status === 'attention'
        ? 'border-warning/30 bg-warning-bg text-warning'
        : 'border-danger/30 bg-danger-bg text-danger';
  return (
    <span
      className={
        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium ' +
        cls
      }
    >
      {statusLabel(status)}
    </span>
  );
}

function PhotoThumb({ assetId }: { assetId: string }) {
  const { data: photos } = useAssetPhotos(assetId);
  const path = photos?.[0]?.path;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedAssetPhotoUrl(path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="h-10 w-10 overflow-hidden rounded-md border border-black/10 bg-surface-soft dark:border-white/10">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-text-faint">
          <ImageOff size={14} aria-hidden />
        </div>
      )}
    </div>
  );
}
