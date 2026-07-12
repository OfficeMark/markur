import { describe, expect, it } from 'vitest';
import {
  assetsNotOnPath,
  nextPinInCycle,
  routeFromPath,
} from '@/lib/audit-cycle';

type A = { id: string; pin_number: number | null };

const assets: A[] = [
  { id: 'a', pin_number: 1 },
  { id: 'b', pin_number: 2 },
  { id: 'c', pin_number: 3 },
];

describe('audit path — route ordering (Feature 1)', () => {
  it('routeFromPath returns present assets in the saved path order', () => {
    const route = routeFromPath(assets, ['c', 'a', 'b']);
    expect(route.map((a) => a.id)).toEqual(['c', 'a', 'b']);
  });

  it('routeFromPath silently drops ids for assets deleted since the path was saved', () => {
    const route = routeFromPath(assets, ['a', 'gone', 'c']);
    expect(route.map((a) => a.id)).toEqual(['a', 'c']);
  });

  it('routeFromPath de-duplicates repeated ids in the stored path', () => {
    const route = routeFromPath(assets, ['a', 'a', 'b']);
    expect(route.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('assetsNotOnPath returns pins added after the path was saved', () => {
    expect(assetsNotOnPath(assets, ['a', 'b']).map((a) => a.id)).toEqual(['c']);
    expect(assetsNotOnPath(assets, ['a', 'b', 'c'])).toEqual([]);
  });

  it('nextPinInCycle walks the route order, skipping visited stops and wrapping', () => {
    const route = routeFromPath(assets, ['c', 'a', 'b']);
    // From 'c', next unvisited is 'a'.
    expect(nextPinInCycle(route, 'c', () => false)).toBe('a');
    // With 'a' visited, from 'c' we skip to 'b'.
    const visited = new Set(['a']);
    expect(nextPinInCycle(route, 'c', (id) => visited.has(id))).toBe('b');
    // All visited → null (route complete).
    expect(nextPinInCycle(route, 'c', () => true)).toBeNull();
  });
});
