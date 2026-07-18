/**
 * Combines class name fragments. Stripped down — keeps the API tidy without
 * pulling clsx/tailwind-merge in until we hit a real conflict-resolution case.
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ');
}

/** Initials from a full name, max two characters. "Randy Hough" → "RH". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

/** Absolute URL for an invitation-accept link, given its token. */
export function inviteUrlFor(token: string): string {
  if (typeof window === 'undefined') return `/accept/${token}`;
  return `${window.location.origin}/accept/${token}`;
}

/**
 * PERF-6: map over items with at most `limit` promises in flight. Used by the
 * report/catalogue exporters so a 300-asset building doesn't fire hundreds of
 * concurrent photo fetches + main-thread decodes at once.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, worker)
  );
  return results;
}
