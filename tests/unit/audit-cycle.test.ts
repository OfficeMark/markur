import { describe, it, expect } from 'vitest';
import { orderByPinNumber, nextPinInCycle } from '@/lib/audit-cycle';

const pins = [
  { id: 'c', pin_number: 3 },
  { id: 'a', pin_number: 1 },
  { id: 'd', pin_number: null },
  { id: 'b', pin_number: 2 },
];

describe('orderByPinNumber', () => {
  it('sorts by pin number with un-numbered pins last', () => {
    expect(orderByPinNumber(pins).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('nextPinInCycle', () => {
  const ordered = orderByPinNumber(pins); // a(1) b(2) c(3) d(—)
  const none = () => false;

  it('starts from the top when there is no current pin', () => {
    expect(nextPinInCycle(ordered, null, none)).toBe('a');
  });

  it('advances to the next pin in order', () => {
    expect(nextPinInCycle(ordered, 'a', none)).toBe('b');
    expect(nextPinInCycle(ordered, 'b', none)).toBe('c');
  });

  it('wraps past the end back to the start', () => {
    // current d (visited), c visited, a & b still open → wrap forward to a.
    expect(nextPinInCycle(ordered, 'd', (id) => ['c', 'd'].includes(id))).toBe('a');
    // current b, only a visited → c is next (no wrap needed yet).
    expect(nextPinInCycle(ordered, 'b', (id) => id === 'a')).toBe('c');
  });

  it('covers the whole floor when starting mid-list (wraps around)', () => {
    // Start the audit at c(3): c is current/visited, next is d, then wrap to a, b.
    const visited = new Set<string>(['c']);
    const order: string[] = [];
    let cur: string | null = 'c';
    for (let i = 0; i < 4; i++) {
      const next: string | null = nextPinInCycle(ordered, cur, (id) => visited.has(id));
      if (!next) break;
      order.push(next);
      visited.add(next);
      cur = next;
    }
    expect(order).toEqual(['d', 'a', 'b']);
  });

  it('returns null when every pin is visited', () => {
    expect(nextPinInCycle(ordered, 'a', () => true)).toBeNull();
  });

  it('returns null for an empty floor', () => {
    expect(nextPinInCycle([], null, none)).toBeNull();
  });
});
