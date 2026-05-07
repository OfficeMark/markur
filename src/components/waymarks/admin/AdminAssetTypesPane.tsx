import { AssetTypesCard } from '@/components/waymarks/AssetTypesCard';

/**
 * /admin/asset-types — wraps the existing AssetTypesCard so the same
 * tested component now lives inside the proper admin layout. The card
 * already provides its own header and styling; we just give it the
 * page section.
 */
export function AdminAssetTypesPane() {
  return (
    <div>
      <AssetTypesCard />
    </div>
  );
}
