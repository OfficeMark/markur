import { describe, it, expect } from 'vitest';
import { formatPinNumber, pinNumberMatchesQuery } from '@/lib/pin-types';

describe('formatPinNumber', () => {
  it('zero-pads to three digits', () => {
    expect(formatPinNumber(1)).toBe('001');
    expect(formatPinNumber(7)).toBe('007');
    expect(formatPinNumber(42)).toBe('042');
    expect(formatPinNumber(100)).toBe('100');
  });

  it('does not truncate numbers beyond three digits', () => {
    expect(formatPinNumber(1234)).toBe('1234');
  });

  it('returns null for missing or invalid numbers', () => {
    expect(formatPinNumber(null)).toBeNull();
    expect(formatPinNumber(undefined)).toBeNull();
    expect(formatPinNumber(Number.NaN)).toBeNull();
  });

  it('truncates fractional values defensively', () => {
    expect(formatPinNumber(3.9)).toBe('003');
  });
});

describe('pinNumberMatchesQuery', () => {
  it('matches the exact number, the padded form, and a # prefix', () => {
    expect(pinNumberMatchesQuery(3, '3')).toBe(true);
    expect(pinNumberMatchesQuery(3, '003')).toBe(true);
    expect(pinNumberMatchesQuery(3, '#3')).toBe(true);
    expect(pinNumberMatchesQuery(3, '#003')).toBe(true);
    expect(pinNumberMatchesQuery(3, '03')).toBe(true);
  });

  it('matches partial digit runs (typing "12" finds pin 120)', () => {
    expect(pinNumberMatchesQuery(120, '12')).toBe(true);
    expect(pinNumberMatchesQuery(120, '20')).toBe(true);
  });

  it('does not match unrelated numbers', () => {
    expect(pinNumberMatchesQuery(3, '30')).toBe(false);
    expect(pinNumberMatchesQuery(3, '4')).toBe(false);
    expect(pinNumberMatchesQuery(12, '99')).toBe(false);
  });

  it('returns false for blank queries and missing numbers', () => {
    expect(pinNumberMatchesQuery(3, '')).toBe(false);
    expect(pinNumberMatchesQuery(3, '#')).toBe(false);
    expect(pinNumberMatchesQuery(null, '3')).toBe(false);
    expect(pinNumberMatchesQuery(undefined, '3')).toBe(false);
  });
});
