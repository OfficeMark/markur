/**
 * Fetch an image (via a signed/public URL) and re-encode it to a compact JPEG
 * data URL for embedding in a jsPDF document. Re-encoding through a canvas
 * keeps the PDF small and guarantees a jsPDF-friendly format.
 *
 * Returns null on any failure so the caller can fall back to a placeholder
 * box instead of aborting the whole export.
 *
 * Originally lived inside src/routes/Floor.tsx alongside the catalogue export;
 * lifted here so the Audit/Survey report can re-use it without duplicating the
 * canvas-encode logic.
 */
export async function photoToJpegDataUrl(
  signedUrl: string,
  maxPx = 700
): Promise<string | null> {
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (!w || !h) {
          resolve(null);
          return;
        }
        if (w > maxPx || h > maxPx) {
          if (w >= h) {
            h = Math.round((h * maxPx) / w);
            w = maxPx;
          } else {
            w = Math.round((w * maxPx) / h);
            h = maxPx;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(null);
      };
      img.src = objUrl;
    });
  } catch {
    return null;
  }
}
