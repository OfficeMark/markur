import { describe, it, expect, vi, afterEach } from 'vitest';
import type { jsPDF } from 'jspdf';
import {
  pickCatalogueSaveTarget,
  writeCatalogue,
  abortCatalogueTarget,
} from '@/lib/floor-catalogue';

// jsdom has no File System Access API (showSaveFilePicker), so these exercise
// the Safari/iOS/Firefox fallback path: open-in-tab, with download as the
// popup-blocked backstop.

function fakeWin() {
  return {
    document: { write: vi.fn(), close: vi.fn() },
    location: { href: '' },
    close: vi.fn(),
  } as unknown as Window & { location: { href: string }; close: ReturnType<typeof vi.fn> };
}

afterEach(() => vi.restoreAllMocks());

describe('pickCatalogueSaveTarget — no OS picker', () => {
  it('opens a tab synchronously when there is no showSaveFilePicker', async () => {
    const win = fakeWin();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    const target = await pickCatalogueSaveTarget('x.pdf');
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(target).toEqual({ kind: 'tab', win });
  });

  it('falls back to download when the popup is blocked (window.open → null)', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const target = await pickCatalogueSaveTarget('x.pdf');
    expect(target).toEqual({ kind: 'download' });
  });
});

describe('writeCatalogue — tab target', () => {
  it('navigates the opened tab to the PDF blob URL (no doc.save fallback)', async () => {
    const win = fakeWin();
    const orig = URL.createObjectURL;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi
      .fn()
      .mockReturnValue('blob:abc');
    const doc = {
      output: vi.fn().mockReturnValue(new Blob()),
      save: vi.fn(),
    } as unknown as jsPDF;

    await writeCatalogue(doc, { kind: 'tab', win }, 'x.pdf');

    expect(win.location.href).toBe('blob:abc');
    expect((doc as unknown as { save: ReturnType<typeof vi.fn> }).save).not.toHaveBeenCalled();
    (URL as unknown as { createObjectURL: typeof orig }).createObjectURL = orig;
  });
});

describe('abortCatalogueTarget', () => {
  it('closes a tab target', () => {
    const win = fakeWin();
    abortCatalogueTarget({ kind: 'tab', win });
    expect(win.close).toHaveBeenCalled();
  });

  it('is a no-op for non-tab targets', () => {
    expect(() => abortCatalogueTarget({ kind: 'download' })).not.toThrow();
  });
});
