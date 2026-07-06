import { useState } from 'react';
import { Camera, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useBuildingPhotoUrl,
  useRemoveBuildingPhoto,
  useUploadBuildingPhoto,
} from '@/hooks/useBuildings';
import { validateBuildingPhotoFile } from '@/lib/queries/buildings';
import { prepareForUpload } from '@/lib/image-convert';
import { PHOTO_ACCEPT } from '@/lib/queries/asset-photos';

/**
 * Hero-photo manager for a building (M10b). Admins see a "Choose photo"
 * button + a "Remove" button. Non-admins just see the photo (or a
 * placeholder gradient if there isn't one yet). Used inside
 * `<BuildingHero />` and indirectly by the BuildingCard thumbnail.
 */

export type BuildingPhotoUploadProps = {
  buildingId: string;
  photoPath: string | null;
  canEdit: boolean;
  /**
   * Render style:
   *   - 'hero' (default): full-width 16:6 banner used at the top of /buildings/:id
   *   - 'compact': 80x80 square for inline placement inside cards
   */
  variant?: 'hero' | 'compact';
};

export function BuildingPhotoUpload({
  buildingId,
  photoPath,
  canEdit,
  variant = 'hero',
}: BuildingPhotoUploadProps) {
  const upload = useUploadBuildingPhoto(buildingId);
  const remove = useRemoveBuildingPhoto(buildingId);
  const url = useBuildingPhotoUrl(photoPath);
  const [error, setError] = useState<string | null>(null);

  async function onPick(list: FileList | null) {
    setError(null);
    const file = list?.[0];
    if (!file) return;
    const v = validateBuildingPhotoFile(file);
    if (v) {
      setError(
        v === 'invalid-type'
          ? 'Use a PNG, JPG, or WebP image.'
          : v === 'too-large'
            ? 'Image must be under 10 MB.'
            : 'Could not read that file.'
      );
      return;
    }
    try {
      // S8: HEIC converts to JPEG on-device before upload.
      await upload.mutateAsync(await prepareForUpload(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    }
  }

  if (variant === 'hero') {
    return (
      <div className="relative overflow-hidden rounded-xl border border-black/10 bg-waymarks-ink dark:border-white/10">
        {url ? (
          <img
            src={url}
            alt=""
            className="block h-48 w-full object-cover sm:h-64"
            loading="lazy"
          />
        ) : (
          <div className="flex h-48 w-full items-center justify-center bg-waymarks-ink sm:h-64">
            {canEdit ? (
              <p className="text-sm text-white/70">Add a hero photo</p>
            ) : (
              <p className="text-sm text-white/50">Photo not added yet</p>
            )}
          </div>
        )}
        {canEdit && (
          <div className="absolute right-3 top-3 flex gap-1.5">
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-waymarks-ink/80 px-3 text-xs font-medium text-white shadow-sm backdrop-blur hover:bg-waymarks-ink">
              {url ? (
                <>
                  <Pencil size={12} aria-hidden /> Replace
                </>
              ) : (
                <>
                  <Camera size={12} aria-hidden /> Add photo
                </>
              )}
              <input
                type="file"
                accept={PHOTO_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  void onPick(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {url && (
              <Button
                size="sm"
                variant="secondary"
                iconLeft={<Trash2 size={12} aria-hidden />}
                loading={remove.isPending}
                onClick={() => remove.mutate()}
                className="!bg-white/90 !text-waymarks-ink hover:!bg-white"
              >
                Remove
              </Button>
            )}
          </div>
        )}
        {error && (
          <div className="absolute inset-x-3 bottom-3 rounded-md border border-danger/40 bg-danger/95 px-3 py-1.5 text-xs text-white shadow-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Compact thumbnail (used inside a Home BuildingCard, etc.)
  return (
    <div className="h-20 w-28 shrink-0 overflow-hidden rounded-md border border-black/10 bg-waymarks-ink dark:border-white/10">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-waymarks-ink">
          <Camera size={18} className="text-white/50" aria-hidden />
        </div>
      )}
    </div>
  );
}
