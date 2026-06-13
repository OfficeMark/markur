import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { FloorCatalogueView } from '@/components/waymarks/FloorCatalogueView';
import { useFloor } from '@/hooks/useFloors';
import { useBuilding } from '@/hooks/useBuildings';
import { useAssets } from '@/hooks/useAssets';

/**
 * /floors/:id/catalogue — the on-screen sign catalogue for a floor (admin).
 * A deliberately chrome-free page (no AppShell) so Print produces a clean
 * sheet; the same FloorCatalogueView renders inline for guests.
 */
export function FloorCatalogue() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: floor, isLoading, error } = useFloor(id);
  const { data: building } = useBuilding(floor?.building_id);
  const { data: assets = [] } = useAssets(id);

  if (isLoading || (!floor && !error)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
      </div>
    );
  }

  if (error || !floor || !building) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="font-semibold text-2xl">Catalogue unavailable</h1>
        <Link
          to={id ? `/floors/${id}` : '/'}
          className="mt-4 inline-flex items-center gap-1 text-sm text-waymarks-gold hover:underline"
        >
          <ArrowLeft size={14} aria-hidden /> Back to floor
        </Link>
      </div>
    );
  }

  return (
    <FloorCatalogueView
      building={building}
      floor={floor}
      assets={assets}
      onBack={() => navigate(`/floors/${id}`)}
    />
  );
}
