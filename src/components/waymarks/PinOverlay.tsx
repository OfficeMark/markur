import type { Asset } from '@/types/database';
import { PinMarker } from './PinMarker';
import { computeStatus } from '@/lib/asset-status';

export type PinOverlayProps = {
  assets: Asset[];
  selectedAssetId?: string | null;
  onSelectAsset: (asset: Asset) => void;
};

/**
 * Pins layer rendered inside the FloorPlanCanvas's transformed wrapper.
 * Coordinates are stored normalized 0–1 in `assets.x` / `assets.y`, so
 * percent-based positioning makes them pan + zoom with the plan automatically.
 */
export function PinOverlay({ assets, selectedAssetId, onSelectAsset }: PinOverlayProps) {
  return (
    <>
      {assets.map((asset) => {
        const status = computeStatus({
          asset,
          // Audit data wires in at M6+. For now use the asset.status column
          // (defaults to 'good' on create; flag handling lands later).
          lastAuditAt: null,
          openFlagCount: asset.status === 'flagged' ? 1 : 0,
        });
        return (
          <div
            key={asset.id}
            className="pointer-events-auto absolute"
            style={{ left: `${asset.x * 100}%`, top: `${asset.y * 100}%` }}
          >
            <PinMarker
              assetId={asset.id}
              name={asset.name}
              type={asset.type}
              status={status}
              selected={asset.id === selectedAssetId}
              onClick={() => onSelectAsset(asset)}
            />
          </div>
        );
      })}
    </>
  );
}
