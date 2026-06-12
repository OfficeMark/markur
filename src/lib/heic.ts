/**
 * HEIC/HEIF → JPEG conversion at upload time.
 *
 * iPhones shoot HEIC by default; desktop browsers (Chrome/Firefox/Edge on
 * Windows) can't decode HEIC, so a stored HEIC would render as a broken image
 * for admins and for guests on the share view. We convert client-side to JPEG
 * before upload and NEVER store HEIC — every photo object is a JPEG that renders
 * everywhere.
 *
 * Conversion runs before the existing validate/upload step, so nothing
 * downstream changes (the result is just an `image/jpeg` File).
 */

const HEIC_EXT_RE = /\.(heic|heif)$/i;

/**
 * Detect HEIC/HEIF. Checks the MIME type AND the filename extension, because
 * Windows Chrome frequently reports an empty `file.type` for `.heic` files
 * picked from disk — so type alone misses them.
 */
export function isHeic(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/heic' || t === 'image/heif') return true;
  return HEIC_EXT_RE.test(file.name);
}

/**
 * Convert a HEIC/HEIF File to a JPEG File. heic2any (~1.5 MB, bundles a libheif
 * wasm decoder) is dynamic-imported so it only loads when a HEIC is actually
 * picked — it never bloats the initial bundle.
 *
 * Orientation: heic2any decodes through libheif, which applies the HEIC's
 * orientation transform, so portrait shots come out upright. (Verified against
 * real iPhone portrait HEICs — see the verify step.)
 */
export async function heicToJpeg(file: File, quality = 0.85): Promise<File> {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality });
  const blob = (Array.isArray(out) ? out[0] : out) as Blob;
  const name = file.name.replace(HEIC_EXT_RE, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
}

/**
 * If `file` is HEIC/HEIF, convert it to JPEG; otherwise return it unchanged.
 * `onConvertStart` fires only when a conversion actually begins — wire it to a
 * per-file "converting…" UI state. Throws if conversion fails (caller surfaces
 * a per-file error and skips that file).
 */
export async function ensureUploadableImage(
  file: File,
  onConvertStart?: () => void
): Promise<File> {
  if (!isHeic(file)) return file;
  onConvertStart?.();
  return heicToJpeg(file);
}

/** Shared `accept` value for photo file inputs (incl. HEIC/HEIF). */
export const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif';
