/**
 * Floor plan zoom bounds.
 *
 * The maximum was raised from 6 (600%) to 10 (1000%) so admins can zoom in far
 * enough to inspect fine signage detail on large floor plans. The minimum stays
 * at 0.3 (30%) so a big plan can be zoomed out to fit smaller viewports.
 */
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 10;

/** Clamp a zoom factor to the allowed floor-plan zoom range. */
export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}
