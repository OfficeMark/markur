import { AssetTypesCard } from '@/components/waymarks/AssetTypesCard';
import { PinAppearanceCard } from '@/components/waymarks/PinAppearanceCard';

/**
 * /admin/asset-types — wraps the existing AssetTypesCard so the same
 * tested component now lives inside the proper admin layout. The card
 * already provides its own header and styling; we just give it the
 * page section.
 *
 * Pin appearance (shape/size) lives here too — it governs how asset pins
 * render on floor plans, so it belongs with the asset-type catalog rather
 * than under Branding.
 */
export function AdminAssetTypesPane() {
  return (
    <div>
      <AssetTypesCard />
      <PinAppearanceCard />
    </div>
  );
}
