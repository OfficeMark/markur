/**
 * Audit walkthrough ordering. The cycle proceeds in pin-number order; starting
 * the audit at a chosen pin (M-rescue: "Start audit here") just changes where
 * the cycle begins — it still wraps around to cover every pin on the floor.
 */

/** Stable pin-number order, with un-numbered pins last (then input order). */
export function orderByPinNumber<T extends { pin_number: number | null }>(assets: T[]): T[] {
  return [...assets].sort((a, b) => {
    if (a.pin_number == null && b.pin_number == null) return 0;
    if (a.pin_number == null) return 1;
    if (b.pin_number == null) return -1;
    return a.pin_number - b.pin_number;
  });
}

/**
 * The next pin to audit: the first not-yet-visited pin AFTER `currentId` in the
 * ordered list, wrapping past the end back to the start. Returns null when every
 * pin has been visited. With `currentId === null` it returns the first unvisited
 * pin from the top — the default-start behaviour.
 */
export function nextPinInCycle<T extends { id: string }>(
  ordered: T[],
  currentId: string | null,
  visited: (id: string) => boolean
): string | null {
  if (ordered.length === 0) return null;
  const startIdx = currentId ? ordered.findIndex((a) => a.id === currentId) : -1;
  for (let step = 1; step <= ordered.length; step++) {
    const candidate = ordered[(startIdx + step) % ordered.length];
    if (candidate && !visited(candidate.id)) return candidate.id;
  }
  return null;
}
