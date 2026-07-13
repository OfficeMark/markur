import { describe, it, expect } from 'vitest';
import {
  validatePlanFile,
  objectNameForFloor,
  planKindForPath,
  planRefreshStamp,
  formatBytes,
  PLAN_MAX_BYTES,
} from '@/lib/upload';

function fakeFile(name: string, size: number, type: string): File {
  // node's File polyfill via happy-dom is fine
  return new File([new Uint8Array(size)], name, { type });
}

describe('validatePlanFile', () => {
  it('accepts a small PDF', () => {
    expect(validatePlanFile(fakeFile('p.pdf', 100_000, 'application/pdf'))).toBeNull();
  });
  it('accepts a PNG and a JPEG', () => {
    expect(validatePlanFile(fakeFile('p.png', 100_000, 'image/png'))).toBeNull();
    expect(validatePlanFile(fakeFile('p.jpg', 100_000, 'image/jpeg'))).toBeNull();
  });
  it('accepts an SVG', () => {
    expect(validatePlanFile(fakeFile('p.svg', 100_000, 'image/svg+xml'))).toBeNull();
  });
  it('rejects oversize files', () => {
    const f = fakeFile('big.pdf', PLAN_MAX_BYTES + 1, 'application/pdf');
    expect(validatePlanFile(f)?.code).toBe('too_large');
  });
  it('rejects wrong mime', () => {
    const f = fakeFile('weird.gif', 100, 'image/gif');
    expect(validatePlanFile(f)?.code).toBe('wrong_type');
  });
});

describe('objectNameForFloor', () => {
  it('uses pdf for application/pdf', () => {
    expect(objectNameForFloor('floor-1', 'application/pdf')).toBe('floor-1.pdf');
  });
  it('uses png for image/png', () => {
    expect(objectNameForFloor('floor-1', 'image/png')).toBe('floor-1.png');
  });
  it('uses jpg for image/jpeg', () => {
    expect(objectNameForFloor('floor-1', 'image/jpeg')).toBe('floor-1.jpg');
  });
  it('uses svg for image/svg+xml', () => {
    expect(objectNameForFloor('floor-1', 'image/svg+xml')).toBe('floor-1.svg');
  });
});

describe('planKindForPath', () => {
  it('returns pdf for .pdf', () => expect(planKindForPath('a.pdf')).toBe('pdf'));
  it('returns image for .png/.jpg/.jpeg/.svg', () => {
    expect(planKindForPath('a.png')).toBe('image');
    expect(planKindForPath('a.jpg')).toBe('image');
    expect(planKindForPath('a.jpeg')).toBe('image');
    expect(planKindForPath('a.svg')).toBe('image');
  });
  it('returns null for unknown', () => {
    expect(planKindForPath('a.gif')).toBeNull();
    expect(planKindForPath(null)).toBeNull();
    expect(planKindForPath(undefined)).toBeNull();
  });
});

describe('planRefreshStamp', () => {
  // The stamp is the replace-detection key: the plate path is canonical
  // (`<floorId>.plate.png`), so plan_url is unchanged across replaces and the
  // stamp is the only part of the floor row guaranteed to change. These pin
  // the contract the Floor route's signed-URL effect depends on.
  it('returns processedAt for a v2 planPrep stamp', () => {
    const meta = {
      planPrep: {
        version: 1,
        processed: true,
        source: 'vector',
        enhanced: false,
        processedAt: '2026-07-13T12:00:00.000Z',
      },
    };
    expect(planRefreshStamp(meta)).toBe('2026-07-13T12:00:00.000Z');
  });
  it('changes across two uploads of the same floor (same path, new stamp)', () => {
    const at = (t: string) => ({ planPrep: { processedAt: t } });
    const first = planRefreshStamp(at('2026-07-13T12:00:00.000Z'));
    const second = planRefreshStamp(at('2026-07-13T12:05:00.000Z'));
    expect(first).not.toBe(second);
  });
  it('also stamps the processing-fallback path (processed:false)', () => {
    const meta = {
      planPrep: {
        version: 1,
        processed: false,
        source: 'image',
        enhanced: false,
        processedAt: '2026-07-13T12:00:00.000Z',
      },
    };
    expect(planRefreshStamp(meta)).toBe('2026-07-13T12:00:00.000Z');
  });
  it('returns null for pre-v2 / absent / malformed metadata', () => {
    expect(planRefreshStamp(null)).toBeNull();
    expect(planRefreshStamp(undefined)).toBeNull();
    expect(planRefreshStamp({})).toBeNull();
    expect(planRefreshStamp({ planPrep: {} })).toBeNull();
    expect(planRefreshStamp({ planPrep: { processedAt: 42 } })).toBeNull();
    expect(planRefreshStamp('not-an-object')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formats compactly', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(2_500_000)).toBe('2.4 MB');
  });
});
