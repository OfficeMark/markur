/**
 * Per-building external action link, stored in `buildings.settings` jsonb under
 * the `external_link` key. It drives the "Order signs" action button in the pin
 * drawer (the building-level fallback — a pin's own vendor/contact target still
 * wins). Three modes:
 *
 *   - `default` — the Officemark order URL. Existing behaviour, unchanged; this
 *     is what a building with no setting gets.
 *   - `custom`  — a label + URL the building admin sets (e.g. their own supplier
 *     portal).
 *   - `hidden`  — no fallback button at all.
 *
 * Mirrors lib/pin-appearance.ts: a pure reader over the shared settings blob, so
 * admins, auditors, and (where shown) every viewer resolve the same value.
 * Guests never see the button — it's gated out in the drawer — so this only
 * matters for signed-in building users.
 */

/** The default Officemark order destination (was hardcoded in AssetDrawer). */
export const DEFAULT_ORDER_URL = 'https://account.officemark.ca/authentication/login';
export const DEFAULT_ORDER_LABEL = 'Order Signs';

export type ExternalLinkMode = 'default' | 'custom' | 'hidden';

export type BuildingExternalLink = {
  mode: ExternalLinkMode;
  /** Custom button label (mode === 'custom'). */
  label: string;
  /** Custom destination URL (mode === 'custom'). */
  url: string;
};

const MODES: ExternalLinkMode[] = ['default', 'custom', 'hidden'];

export function buildingExternalLinkFromSettings(settings: unknown): BuildingExternalLink {
  const s =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const raw =
    s.external_link && typeof s.external_link === 'object' && !Array.isArray(s.external_link)
      ? (s.external_link as Record<string, unknown>)
      : {};
  const mode = MODES.includes(raw.mode as ExternalLinkMode)
    ? (raw.mode as ExternalLinkMode)
    : 'default';
  const label = typeof raw.label === 'string' ? raw.label : '';
  const url = typeof raw.url === 'string' ? raw.url : '';
  // A custom mode with no usable URL is meaningless — fall back to default so a
  // half-saved config never leaves the pin with a dead button.
  if (mode === 'custom' && !url.trim()) return { mode: 'default', label: '', url: '' };
  return { mode, label, url };
}

/** True when the building has opted to show no fallback order button. */
export function externalLinkHidden(link: BuildingExternalLink): boolean {
  return link.mode === 'hidden';
}
