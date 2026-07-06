import { isHeicFile } from '@/lib/queries/asset-photos';

/**
 * S8 — convert HEIC (or any natively-decodable image) to a capped JPEG File
 * using the browser's NATIVE decoder + canvas. No WASM, no worker needed.
 *
 * Why this doesn't repeat the heic2any freeze: iOS (all WebKit) decodes HEIC
 * natively, and native decode + canvas encode are fast and async, unlike the
 * 20-30s main-thread libheif WASM decode. The auditor shooting HEIC is on an
 * iPhone, so the conversion happens exactly where the format is supported.
 *
 * Returns null when the browser can't decode the file (e.g. desktop Chrome
 * with a HEIC). On the rebuild there is no server-side transform fallback, so
 * `prepareForUpload` treats that as a hard, friendly error rather than
 * storing a photo no browser could display.
 *
 * ⚠️ Verify-first (Randy, 2026-06-21): confirm raw-HEIC behavior in a real
 * logged-in session before treating this as settled.
 */
export async function heicToJpegNative(
  file: File,
  maxDim = 3000,
  quality = 0.85
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
 * Prepare a picked photo for upload: HEIC is converted to JPEG up front so
 * the stored object is a plain, universally-displayable JPEG. Non-HEIC files
 * pass through unchanged. Throws a friendly error when a HEIC can't be
 * decoded by this browser (no transform fallback exists on the rebuild).
 */
export async function prepareForUpload(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  const jpeg = await heicToJpegNative(file);
  if (!jpeg) {
    throw new Error(
      `${file.name}: this browser can't convert HEIC photos. Upload from your iPhone, or convert to JPG first.`
    );
  }
  return jpeg;
}
