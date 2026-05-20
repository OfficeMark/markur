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
