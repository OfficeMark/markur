import { describe, it, expect } from 'vitest';
import { assetPhotoDownloadName } from '@/lib/queries/asset-photos';

describe('assetPhotoDownloadName', () => {
  it('builds a slugified, 1-indexed filename with the original extension', () => {
    expect(assetPhotoDownloadName('Suite 1203 Suite plate', 0, 'a1b2/c3d4.jpg')).toBe(
      'suite-1203-suite-plate-1.jpg'
    );
    expect(assetPhotoDownloadName('Lobby Directory', 2, 'x/y.png')).toBe('lobby-directory-3.png');
  });

  it('preserves webp and lowercases the extension', () => {
    expect(assetPhotoDownloadName('Sign', 0, 'x/y.WEBP')).toBe('sign-1.webp');
  });

  it('falls back to a default base when the name has no usable characters', () => {
    expect(assetPhotoDownloadName('   ', 0, 'x/y.jpg')).toBe('asset-photo-1.jpg');
    expect(assetPhotoDownloadName('!!!', 1, 'x/y.jpg')).toBe('asset-photo-2.jpg');
  });

  it('defaults the extension to jpg when the path has none', () => {
    expect(assetPhotoDownloadName('Sign', 0, 'noext')).toBe('sign-1.jpg');
  });
});
