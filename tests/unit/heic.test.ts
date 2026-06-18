import { describe, it, expect } from 'vitest';
import {
  isHeicFile,
  photoExtAndType,
  validateAssetPhotoFile,
  PHOTO_ACCEPT,
} from '@/lib/queries/asset-photos';

function file(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

// WO-3: HEIC is uploaded RAW (no client conversion) and served via the Storage
// image transform. These guard the detection + ext/contentType + validation.

describe('isHeicFile', () => {
  it('detects by MIME type', () => {
    expect(isHeicFile(file('x.heic', 'image/heic'))).toBe(true);
    expect(isHeicFile(file('x', 'image/heif'))).toBe(true);
  });

  it('detects by extension when the browser reports no type (Windows Chrome)', () => {
    expect(isHeicFile(file('IMG_1234.HEIC', ''))).toBe(true);
    expect(isHeicFile(file('photo.heif', ''))).toBe(true);
    expect(isHeicFile(file('photo.Heic', ''))).toBe(true);
  });

  it('is false for normal web images', () => {
    expect(isHeicFile(file('a.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeicFile(file('a.png', 'image/png'))).toBe(false);
    expect(isHeicFile(file('a.webp', 'image/webp'))).toBe(false);
  });
});

describe('photoExtAndType', () => {
  it('stores HEIC as image/heic even when the browser type is empty', () => {
    expect(photoExtAndType(file('IMG.HEIC', ''))).toEqual({ ext: 'heic', contentType: 'image/heic' });
    expect(photoExtAndType(file('IMG.heif', ''))).toEqual({ ext: 'heif', contentType: 'image/heif' });
  });
  it('maps the web formats', () => {
    expect(photoExtAndType(file('a.png', 'image/png'))).toEqual({ ext: 'png', contentType: 'image/png' });
    expect(photoExtAndType(file('a.webp', 'image/webp'))).toEqual({ ext: 'webp', contentType: 'image/webp' });
    expect(photoExtAndType(file('a.jpg', 'image/jpeg'))).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
  });
});

describe('validateAssetPhotoFile', () => {
  it('accepts HEIC (raw upload), including empty-type from Windows', () => {
    expect(validateAssetPhotoFile(file('IMG.HEIC', ''))).toBeNull();
    expect(validateAssetPhotoFile(file('a.jpg', 'image/jpeg'))).toBeNull();
  });
  it('rejects a non-image type', () => {
    expect(validateAssetPhotoFile(file('a.txt', 'text/plain'))).not.toBeNull();
  });
});

describe('PHOTO_ACCEPT', () => {
  it('includes HEIC/HEIF alongside the web formats', () => {
    for (const token of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', '.heic', '.heif']) {
      expect(PHOTO_ACCEPT).toContain(token);
    }
  });
});
