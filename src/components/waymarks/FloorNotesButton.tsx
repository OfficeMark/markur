import { useEffect, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { NotebookPen } from 'lucide-react';
import { useSetFloorNotes } from '@/hooks/useFloors';

/**
 * Floor-wide notes — a single free-text area scoped to one floor (install
 * details, access notes, anything the team should know). Lives in the floor
 * toolbar as a small button opening a popover, matching the other toolbar
 * actions.
 *
 * Team-only by design: editing requires building-edit (the floors RLS enforces
 * it server-side regardless of this gate); authenticated viewers see it
 * read-only. It is NOT rendered on guest share links — the guest floor view
 * never mounts this component.
 */
export function FloorNotesButton({
  floorId,
  buildingId,
  notes,
  canEdit,
}: {
  floorId: string;
  buildingId?: string;
  notes: string | null;
  canEdit: boolean;
}) {
  const save = useSetFloorNotes(floorId, buildingId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? '');

  // Re-sync the editable draft whenever the popover opens or the stored note
  // changes underneath us (e.g. a realtime/refetch update).
  useEffect(() => {
    if (open) setDraft(notes ?? '');
  }, [open, notes]);

  const hasNotes = !!notes?.trim();
  // A viewer with nothing to read gets no button at all.
  if (!canEdit && !hasNotes) return null;

  const dirty = draft.trim() !== (notes ?? '').trim();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2.5 text-[11px] font-medium text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <NotebookPen size={11} aria-hidden />
          Notes
          {hasNotes && (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-waymarks-gold"
            />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[min(92vw,24rem)] rounded-lg border border-black/10 bg-surface p-3 text-sm text-text shadow-sheet outline-none dark:border-white/10"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            Floor notes
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Team-only — not shown to clients on a share link.
          </p>

          {canEdit ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                placeholder="Install details, access notes, anything the team should know about this floor."
                className="mt-2 w-full rounded-md border border-black/10 bg-surface p-2.5 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 items-center rounded-md border border-black/15 bg-surface px-3 text-xs font-medium text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={save.isPending || !dirty}
                  onClick={async () => {
                    try {
                      await save.mutateAsync(draft);
                      setOpen(false);
                    } catch {
                      // Error surfaced inline below.
                    }
                  }}
                  className="inline-flex h-8 items-center rounded-md border border-waymarks-gold bg-waymarks-gold px-3 text-xs font-medium text-waymarks-ink hover:bg-waymarks-gold-deep disabled:opacity-50"
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
              {save.isError && (
                <p className="mt-2 text-xs text-danger">Couldn't save — try again.</p>
              )}
            </>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm text-text">{notes}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
