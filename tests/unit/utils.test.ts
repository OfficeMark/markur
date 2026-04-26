import { describe, it, expect } from 'vitest';
import { cn, initials } from '@/lib/utils';

describe('cn', () => {
  it('joins truthy strings with spaces', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });
  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
});

describe('initials', () => {
  it('returns first+last initial for multi-word names', () => {
    expect(initials('Randy Hough')).toBe('RH');
    expect(initials('Jane Doe Smith')).toBe('JS');
  });
  it('returns first two letters for single-word names', () => {
    expect(initials('Cher')).toBe('CH');
    expect(initials('a')).toBe('A');
  });
  it('handles empty/whitespace input', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});
