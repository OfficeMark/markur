import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Camera, FileImage, Flag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FLAG_PHOTO_MAX, validateFlagPhotoFile } from '@/lib/queries/flags';
import { PHOTO_ACCEPT } from '@/lib/queries/asset-photos';
import { useContacts } from '@/hooks/useContacts';
import { useFloor } from '@/hooks/useFloors';
import type { Asset } from '@/types/database';

/**
 * Audit Mode flag capture (M33). Opens when the auditor taps "Flag issue" on
 * a pin in the bottom sheet. A description is required; photo evidence is
 * optional (up to FLAG_PHOTO_MAX). Save raises a row in public.flags via the
 * caller's onSubmit; Cancel discards without touching the pin.
 */

export type AuditFlagDialogProps = {
  open: boolean;
  /** The pin being flagged — drives the title; null while closed. */
  asset: Asset | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (description: string, photos: File[], contactId: string | null) => void;
};

export function AuditFlagDialog({
  open,
  asset,
  busy,
  error,
  onCancel,
  onSubmit,
}: AuditFlagDialogProps) {
  const contacts = useContacts();
  // M34b: scope the contact list to this asset's building plus org-wide shared.
  const { data: floor } = useFloor(asset?.floor_id);
  const buildingId = floor?.building_id ?? null;
  const contactsInScope = contacts.list.filter(
    (c) => c.building_id === null || c.building_id === buildingId
  );
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [contactId, setContactId] = useState('');

  // Reset whenever the dialog (re)opens — possibly on a different pin.
  useEffect(() => {
    if (open) {
      setDescription('');
      setPhotos([]);
      setPhotoError(null);
      setContactId('');
    }
  }, [open, asset?.id]);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const accepted: File[] = [];
    let err: string | null = null;
    for (const raw of Array.from(list)) {
      // Stash the original file — NO device-side conversion. HEIC is converted
      // server-side after upload; iOS renders the local preview natively.
      const v = validateFlagPhotoFile(raw);
      if (v) err = v;
      else accepted.push(raw);
    }
    setPhotos((prev) => {
      const room = Math.max(0, FLAG_PHOTO_MAX - prev.length);
      if (accepted.length > room) err = `Up to ${FLAG_PHOTO_MAX} photos per flag.`;
      return [...prev, ...accepted.slice(0, room)];
    });
    setPhotoError(err);
  }

  const canSave = description.trim().length > 0 && !busy;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[60] max-h-[92dvh] w-[min(94vw,480px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-1.5 font-semibold text-lg text-danger">
                <Flag size={16} aria-hidden /> Flag an issue
              </Dialog.Title>
              <p className="mt-0.5 truncate text-sm text-text-muted">{asset?.name ?? 'Asset'}</p>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Cancel"
                disabled={busy}
                className="rounded-md p-1 text-text-muted hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
                Description <span className="text-danger">*</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: the dialog opens specifically to capture this text
                autoFocus
                placeholder="Describe the problem…"
                className="mt-1 w-full rounded-md border border-black/10 bg-surface p-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
            </label>

            <PhotoStrip
              photos={photos}
              onAdd={addFiles}
              onRemove={(i) => setPhotos((p) => p.filter((_, idx) => idx !== i))}
              error={photoError}
            />

            {/* M34 item 1: notify / route to a directory contact. */}
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
                Contact (optional)
              </span>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              >
                <option value="">— None —</option>
                {contactsInScope.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {c.email ? ` · ${c.email}` : ''}
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger"
              >
                <AlertCircle size={13} aria-hidden className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={busy}
                disabled={!canSave}
                iconLeft={<Flag size={12} aria-hidden />}
                onClick={() => onSubmit(description.trim(), photos, contactId || null)}
              >
                Save flag
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PhotoStrip({
  photos,
  onAdd,
  onRemove,
  error,
}: {
  photos: File[];
  onAdd: (list: FileList | null) => void;
  onRemove: (index: number) => void;
  error: string | null;
}) {
  const full = photos.length >= FLAG_PHOTO_MAX;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
        Photos (optional)
      </p>
      {photos.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {photos.map((f, i) => (
            <PhotoTile key={i} file={f} onRemove={() => onRemove(i)} />
          ))}
        </ul>
      )}
      {!full && (
        <div className="flex gap-1.5">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <Camera size={12} aria-hidden />
            <span>Take photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                onAdd(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <FileImage size={12} aria-hidden />
            <span>Choose files</span>
            <input
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              className="sr-only"
              onChange={(e) => {
                onAdd(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function PhotoTile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = URL.createObjectURL(file);
  return (
    <li className="group relative aspect-square overflow-hidden rounded-md border border-black/10 dark:border-white/10">
      <img
        src={url}
        alt={file.name}
        className="h-full w-full object-cover"
        onLoad={() => URL.revokeObjectURL(url)}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-waymarks-ink/80 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Trash2 size={11} aria-hidden />
      </button>
    </li>
  );
}
