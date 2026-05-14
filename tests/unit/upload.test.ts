import { describe, it, expect } from 'vitest';
import {
  validatePlanFile,
  objectNameForFloor,
  planKindForPath,
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

describe('formatBytes', () => {
  it('formats compactly', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(2_500_000)).toBe('2.4 MB');
  });
});
