import { describe, it, expect } from 'vitest';
import { isHeic, ensureUploadableImage, PHOTO_ACCEPT } from '@/lib/heic';

function file(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('isHeic', () => {
  it('detects by MIME type', () => {
    expect(isHeic(file('x.heic', 'image/heic'))).toBe(true);
    expect(isHeic(file('x', 'image/heif'))).toBe(true);
  });

  it('detects by extension when the browser reports no type (Windows Chrome)', () => {
    expect(isHeic(file('IMG_1234.HEIC', ''))).toBe(true);
    expect(isHeic(file('photo.heif', ''))).toBe(true);
    expect(isHeic(file('photo.Heic', ''))).toBe(true);
  });

  it('is false for normal web images', () => {
    expect(isHeic(file('a.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeic(file('a.png', 'image/png'))).toBe(false);
    expect(isHeic(file('a.webp', 'image/webp'))).toBe(false);
  });
});

describe('ensureUploadableImage', () => {
  it('passes a non-HEIC file through unchanged (no conversion, no onConvertStart)', async () => {
    const jpg = file('a.jpg', 'image/jpeg');
    let started = false;
    const out = await ensureUploadableImage(jpg, () => {
      started = true;
    });
    expect(out).toBe(jpg);
    expect(started).toBe(false);
  });
});

describe('PHOTO_ACCEPT', () => {
  it('includes HEIC/HEIF alongside the web formats', () => {
    for (const token of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', '.heic', '.heif']) {
      expect(PHOTO_ACCEPT).toContain(token);
    }
  });
});
