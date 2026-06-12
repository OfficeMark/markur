import {
  DEFAULT_PIN_SHAPE,
  DEFAULT_PIN_SIZE,
  isPinShape,
  isPinSize,
  type PinShape,
  type PinSize,
} from '@/lib/queries/branding';

/**
 * Per-building pin appearance (shape + size), stored in `buildings.settings`
 * jsonb under the keys `pin_shape` / `pin_size`. This is a per-building choice
 * everyone sees identically — admins, auditors, and guests through the share
 * view — so it lives in shared building storage, never localStorage/Dexie.
 *
 * The default size is the SMALL end of the scale: dense walls (multiple assets
 * on one wall is the norm) crowd at the old medium default.
 */

export type PinAppearance = { pinShape: PinShape; pinSize: PinSize };

export function pinAppearanceFromSettings(settings: unknown): PinAppearance {
  const s =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  return {
    pinShape: isPinShape(s.pin_shape) ? s.pin_shape : DEFAULT_PIN_SHAPE,
    pinSize: isPinSize(s.pin_size) ? s.pin_size : DEFAULT_PIN_SIZE,
  };
}
