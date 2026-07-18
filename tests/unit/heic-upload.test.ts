import { describe, expect, it } from 'vitest';
import {
  isHeicFile,
  PHOTO_ACCEPT,
  validateAssetPhotoFile,
} from '@/lib/queries/asset-photos';

function fakeFile(name: string, type: string, size = 1000): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

describe('S8 — HEIC upload validation', () => {
  it('detects HEIC by MIME type', () => {
    expect(isHeicFile(fakeFile('a.heic', 'image/heic'))).toBe(true);
    expect(isHeicFile(fakeFile('b.heif', 'image/heif'))).toBe(true);
  });

  it('detects HEIC by extension when file.type is EMPTY (Windows Chrome gotcha)', () => {
    expect(isHeicFile(fakeFile('IMG_202501_a.heic', ''))).toBe(true);
    expect(isHeicFile(fakeFile('shot.HEIF', ''))).toBe(true);
  });

  it('does not flag ordinary images as HEIC', () => {
    expect(isHeicFile(fakeFile('a.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeicFile(fakeFile('heic-notes.txt', 'text/plain'))).toBe(false);
  });

  it('accepts HEIC files through validation even with empty MIME', () => {
    expect(validateAssetPhotoFile(fakeFile('a.heic', ''))).toBeNull();
    expect(validateAssetPhotoFile(fakeFile('a.heic', 'image/heic'))).toBeNull();
  });

  it('still rejects genuinely unsupported types and oversized files', () => {
    expect(validateAssetPhotoFile(fakeFile('a.gif', 'image/gif'))).toContain('unsupported');
    expect(
      validateAssetPhotoFile(fakeFile('big.jpg', 'image/jpeg', 9 * 1024 * 1024))
    ).toContain('too large');
  });

  it('the picker accept string includes HEIC by MIME and extension', () => {
    expect(PHOTO_ACCEPT).toContain('image/heic');
    expect(PHOTO_ACCEPT).toContain('.heic');
  });
});
