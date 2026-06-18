import { isHeicFile } from '@/lib/queries/asset-photos';

/**
 * Convert HEIC (or any natively-decodable image) to a capped JPEG File using the
 * browser's NATIVE decoder + canvas — no WASM, no worker.
 *
 * Why this works without the heic2any freeze: iOS (Safari/Chrome — all WebKit)
 * decodes HEIC natively, and native decode + canvas encode are fast + async, so
 * they don't block the main thread the way the libheif WASM decode did (20-30s).
 * The surveyor — the one shooting HEIC — is always on iOS, so this covers them.
 *
 * Returns null when the browser can't decode the file (e.g. desktop Chrome with a
 * HEIC) — the caller then uploads the raw file, which is served via the Storage
 * transform as a legacy fallback.
 */
export async function heicToJpegNative(
  file: File,
  maxDim = 1600,
  quality = 0.82
): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = objUrl;
    });
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxDim || h > maxDim) {
      if (w >= h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!blob) return null;
    const name = file.name.replace(/\.(heic|heif)$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

/**
 * Prepare a picked photo for upload: HEIC is converted to a stored JPEG up front
 * (so views are plain fast signed URLs, no per-view transform). Non-HEIC files —
 * and HEICs the browser can't decode — pass through unchanged.
 */
export async function prepareForUpload(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  const jpeg = await heicToJpegNative(file);
  return jpeg ?? file;
}
