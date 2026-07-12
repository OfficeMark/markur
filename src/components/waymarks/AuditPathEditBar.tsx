import { Footprints, RotateCcw, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Asset } from '@/types/database';

/**
 * Audit-path edit bar (Feature 1). Floats over the floor plan while the user
 * sets a walking order by tapping pins. Shows the ordered stops as chips (tap a
 * chip to remove that stop), plus Save / Clear / Done. Mobile-first: big touch
 * targets, no drag-and-drop.
 *
 * Stops for assets deleted after the path was saved render struck-through so the
 * order stays honest; Save drops them (re-saving cleans the path).
 */
export function AuditPathEditBar({
  pathOrder,
  assets,
  saving,
  clearing,
  hasSavedPath,
  onRemoveStop,
  onSave,
  onClear,
  onDone,
}: {
  pathOrder: string[];
  assets: Asset[];
  saving: boolean;
  clearing: boolean;
  hasSavedPath: boolean;
  onRemoveStop: (assetId: string) => void;
  onSave: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  let seq = 0;
  const stops = pathOrder.map((id) => {
    const asset = byId.get(id);
    const present = !!asset;
    if (present) seq += 1;
    return { id, present, seq: present ? seq : null, name: asset?.name ?? 'Removed stop' };
  });
  const presentCount = seq;

  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 rounded-lg border border-waymarks-gold/50 bg-surface/95 p-3 shadow-sheet backdrop-blur dark:border-white/15">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-waymarks-gold px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
          <Footprints size={12} aria-hidden /> Audit path
        </span>
        <p className="min-w-0 flex-1 truncate text-xs text-text-muted">
          {presentCount === 0
            ? 'Tap pins in the order you walk the floor.'
            : `${presentCount} stop${presentCount === 1 ? '' : 's'} · tap a pin (or chip) to remove it`}
        </p>
        <Button
          size="sm"
          variant="ghost"
          iconLeft={<X size={12} aria-hidden />}
          onClick={onDone}
        >
          Done
        </Button>
      </div>

      {stops.length > 0 && (
        <ul className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {stops.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onRemoveStop(s.id)}
                aria-label={
                  s.present
                    ? `Remove stop ${s.seq}, ${s.name}, from the path`
                    : `Remove deleted stop from the path`
                }
                className={
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ' +
                  (s.present
                    ? 'border-waymarks-gold/40 bg-waymarks-gold-soft text-waymarks-ink hover:border-danger/50 hover:bg-danger-bg hover:text-danger dark:bg-white/10 dark:text-white'
                    : 'border-black/10 text-text-faint line-through dark:border-white/15')
                }
              >
                {s.present && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-waymarks-gold px-1 text-[10px] font-bold text-white">
                    {s.seq}
                  </span>
                )}
                <span className="max-w-[10rem] truncate">{s.name}</span>
                <X size={11} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          iconLeft={<RotateCcw size={12} aria-hidden />}
          onClick={onClear}
          loading={clearing}
          disabled={!hasSavedPath && pathOrder.length === 0}
        >
          Clear path
        </Button>
        <Button
          size="sm"
          variant="gold"
          iconLeft={<Save size={12} aria-hidden />}
          onClick={onSave}
          loading={saving}
          disabled={presentCount === 0}
        >
          Save path
        </Button>
      </div>
    </div>
  );
}
