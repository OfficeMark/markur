import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ImageOff, Video } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useAssetPhotos, useSignedAssetPhotoUrl } from '@/hooks/useAssetPhotos';
import { TYPE_COLORS, labelForType, formatPinNumber } from '@/lib/pin-types';
import { computeStatus, statusLabel, type AssetStatus } from '@/lib/asset-status';
import type { VendorContact } from '@/lib/queries/assets';
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
  /** Set of asset ids known to have at least one audit video — drives the M27 Gold badge. */
  assetsWithVideos?: ReadonlySet<string> | null;
};

type SortKey = 'name' | 'type' | 'status' | 'last_audit';

type SortState = { key: SortKey; dir: 'asc' | 'desc' };

export function AssetGridView({
  assets,
  selectedAssetId,
  onSelectAsset,
  lastAuditByAsset,
  assetsWithVideos,
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
                hasVideo={!!assetsWithVideos?.has(asset.id)}
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
  hasVideo,
  onClick,
}: {
  asset: Asset;
  lastAudit: string | null;
  status: AssetStatus;
  selected: boolean;
  hasVideo: boolean;
  onClick: () => void;
}) {
  const typeColor = TYPE_COLORS[asset.type]?.fill ?? '#475569';
  const typeName = labelForType(asset.type);
  const displayName = asset.name?.trim() || 'Untitled';
  const isUntitled = displayName === 'Untitled';
  const pinLabel = formatPinNumber(asset.pin_number);

  const vendor = (asset.vendor_contact ?? null) as VendorContact | null;
  const vendorLabel = vendor
    ? (vendor.company?.trim() || vendor.name?.trim() || '').trim() || null
    : null;

  const metaParts: string[] = [];
  if (asset.room_number?.trim()) metaParts.push(`Rm ${asset.room_number.trim()}`);
  if (vendorLabel) metaParts.push(vendorLabel);
  if (asset.location_notes?.trim()) metaParts.push(asset.location_notes.trim());

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
        // waymarks-gold-soft is a light cream with no dark-mode token override,
        // so the hover/selected row stayed pale against dark siblings. Lighten
        // the dark-mode surface with a translucent white instead.
        'cursor-pointer border-t border-black/5 transition-colors hover:bg-waymarks-gold-soft focus-visible:bg-waymarks-gold-soft focus-visible:outline-none dark:border-white/5 dark:hover:bg-white/5 dark:focus-visible:bg-white/5',
        selected && 'bg-waymarks-gold-soft dark:bg-white/5'
      )}
    >
      <td className="py-2 pl-3 pr-1">
        <PhotoThumb assetId={asset.id} />
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1.5">
          {pinLabel && (
            <span
              className="shrink-0 rounded bg-waymarks-ink/85 px-1 font-mono text-[10px] font-semibold leading-5 text-white"
              title="Pin ID"
            >
              #{pinLabel}
            </span>
          )}
          <p className={cn('font-medium', isUntitled ? 'italic text-text-muted' : 'text-text')}>
            {displayName}
          </p>
          {hasVideo && (
            <span
              aria-label="Has audit video"
              title="Has audit video"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-waymarks-gold text-white"
            >
              <Video size={11} aria-hidden />
            </span>
          )}
        </div>
        {metaParts.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-text-faint">
            {metaParts.join(' · ')}
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
  // Both reads come warm from get_floor_view's seed (photo rows + the batch-
  // signed thumbnail URL), so a grid of N pins no longer fires N photo fetches
  // + N signs. Outside that seed they fall back to fetching/signing per item.
  const { data: photos } = useAssetPhotos(assetId);
  const path = photos?.[0]?.path;
  const url = useSignedAssetPhotoUrl(path);

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
