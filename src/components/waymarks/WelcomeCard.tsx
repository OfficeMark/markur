import { Link } from 'react-router-dom';
import { ArrowRight, Check, Image as ImageIcon, MapPin, Sparkles, Upload } from 'lucide-react';
import { useBuildings } from '@/hooks/useBuildings';
import { useFloors } from '@/hooks/useFloors';
import { useBuildingHasAnyAsset } from '@/hooks/useAssets';
import { useCan } from '@/lib/permissions-context';

/**
 * "Welcome — let's set up your first building" card on Home (M10b).
 *
 * Surfaces only when a user with edit permission has at least one building
 * that isn't fully set up. Three soft-checkmark steps progress as the user
 * adds a photo, uploads a plan, and places a pin. Auto-hides once all three
 * are done — so it gracefully disappears as the building matures.
 */
export function WelcomeCard() {
  const { data: buildings } = useBuildings();
  // Choose the first building the user can edit; if none, render nothing.
  const firstBuilding = buildings && buildings[0];

  const canEdit = useCan('edit', {
    type: 'building',
    id: firstBuilding?.id ?? '',
  });

  const { data: floors = [] } = useFloors(firstBuilding?.id);
  const firstFloorWithPlan = floors.find((f) => !!f.plan_url);
  // Cross-floor pin check (single round trip via PostgREST inner join).
  // Was: assets from the FIRST plan-bearing floor only -- which gave a false
  // negative for buildings whose pins live on a later floor (Crescent School
  // had 6 pins on Level 300; the banner never hid).
  const { data: hasPin = false } = useBuildingHasAnyAsset(firstBuilding?.id);

  if (!firstBuilding) return null;
  if (!canEdit) return null;

  const hasPhoto = !!firstBuilding.photo_url;
  const hasPlan = !!firstFloorWithPlan;

  // Once every step is done, gracefully disappear.
  if (hasPhoto && hasPlan && hasPin) return null;

  return (
    <section
      aria-labelledby="welcome-heading"
      className="mb-8 overflow-hidden rounded-xl border border-waymarks-gold bg-waymarks-gold-soft p-5 sm:p-6"
    >
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-waymarks-gold text-white">
          <Sparkles size={16} aria-hidden />
        </span>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-waymarks-gold">
            Get started
          </p>
          <h2 id="welcome-heading" className="font-semibold text-xl text-text">
            Set up {firstBuilding.name}
          </h2>
        </div>
      </header>

      <ol className="space-y-2">
        <Step
          done={hasPhoto}
          icon={<ImageIcon size={14} aria-hidden />}
          label="Add a building photo"
          detail="Open the building and click 'Add photo' on the hero banner."
          to={`/buildings/${firstBuilding.id}`}
        />
        <Step
          done={hasPlan}
          icon={<Upload size={14} aria-hidden />}
          label="Upload a floor plan"
          detail="Pick any floor and use 'Upload floor plan'. PDF works best."
          to={`/buildings/${firstBuilding.id}`}
        />
        <Step
          done={hasPin}
          icon={<MapPin size={14} aria-hidden />}
          label="Place your first pin"
          detail="On the floor, click 'Add asset' and tap anywhere on the plan."
          to={firstFloorWithPlan ? `/floors/${firstFloorWithPlan.id}` : `/buildings/${firstBuilding.id}`}
        />
      </ol>

      <p className="mt-4 text-xs text-text-muted">
        Need a deeper walkthrough? See the{' '}
        <Link to="/help" className="font-medium text-waymarks-gold hover:underline">
          tutorial
        </Link>
        .
      </p>
    </section>
  );
}

function Step({
  done,
  icon,
  label,
  detail,
  to,
}: {
  done: boolean;
  icon: React.ReactNode;
  label: string;
  detail: string;
  to: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className={
          'group flex items-start gap-3 rounded-lg border p-3 transition-colors ' +
          (done
            ? 'border-success/30 bg-success-bg'
            : 'border-black/10 bg-surface hover:border-waymarks-gold')
        }
      >
        <span
          className={
            'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ' +
            (done ? 'bg-success text-white' : 'bg-waymarks-ink/10 text-text')
          }
          aria-hidden
        >
          {done ? <Check size={12} /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className={'text-sm font-medium ' + (done ? 'text-success' : 'text-text')}>
            {label}
          </p>
          <p className="text-xs text-text-muted">{detail}</p>
        </div>
        {!done && (
          <ArrowRight
            size={14}
            aria-hidden
            className="mt-1 shrink-0 text-text-faint opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </Link>
    </li>
  );
}
