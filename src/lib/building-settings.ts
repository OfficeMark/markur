import type { Building } from '@/types/database';

/**
 * A building's configurable outbound link (Task 2, revised). Stored in the
 * `buildings.settings` jsonb under `external_link` so no migration is needed and
 * the settings blob can grow (e.g. multiple links later). Generic by design — it
 * can point anywhere the admin wants (ordering portal, tenant handbook, service
 * desk, intranet); nothing here assumes OfficeMark.
 */
export type BuildingExternalLink = { url: string; label: string };

function readSettingsObject(settings: Building['settings']): Record<string, unknown> {
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? { ...(settings as Record<string, unknown>) }
    : {};
}

/**
 * The configured link, but only when BOTH url and label are non-empty. Either
 * missing → null, which hides the button everywhere it's rendered.
 */
export function getBuildingExternalLink(
  building: Pick<Building, 'settings'> | null | undefined
): BuildingExternalLink | null {
  if (!building) return null;
  const raw = readSettingsObject(building.settings).external_link as
    | { url?: unknown; label?: unknown }
    | undefined;
  const url = typeof raw?.url === 'string' ? raw.url.trim() : '';
  const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
  if (!url || !label) return null;
  return { url, label };
}

/**
 * Merge a link into the settings blob, or clear it when `link` is null/incomplete.
 * Preserves any other settings keys.
 */
export function withExternalLink(
  settings: Building['settings'],
  link: BuildingExternalLink | null
): Building['settings'] {
  const next = readSettingsObject(settings);
  if (link && link.url.trim() && link.label.trim()) {
    next.external_link = { url: link.url.trim(), label: link.label.trim() };
  } else {
    delete next.external_link;
  }
  // Plain JSON-serializable object; safe to store in the jsonb column.
  return next as unknown as Building['settings'];
}
