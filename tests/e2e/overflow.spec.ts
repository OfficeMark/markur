import { test, expect } from '@playwright/test';

/**
 * Mobile horizontal-overflow regression guard (Part 0 of the guest-viewer work).
 * "Every page requires pinch-zoom" is caused by an element wider than the
 * viewport — so we assert, at the two tightest phone widths, that the document
 * never scrolls horizontally. Covers the public + guest-claim shells (which
 * exercise GuestLayout). The authenticated app + the claimed guest building/
 * floor were verified clean on demo via the live admin→claim flow (they need a
 * session, so they aren't hermetic enough for the default check run).
 *
 * Routes here are hermetic: static pages, the auth shells, and the guest claim
 * screen with a deliberately-invalid token (renders GuestLayout + the
 * "unavailable" card via a harmless peek — no data created).
 */
const ROUTES = [
  '/login',
  '/reset-password',
  '/legal/privacy',
  '/legal/terms',
  '/share/this-token-does-not-exist',
];

const WIDTHS = [390, 360];

for (const path of ROUTES) {
  for (const width of WIDTHS) {
    test(`no horizontal overflow: ${path} @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path, { waitUntil: 'networkidle' });
      // Let lazy chunks + any peek call settle.
      await page.waitForTimeout(500);

      const { scrollWidth, clientWidth, offender } = await page.evaluate(() => {
        const de = document.documentElement;
        let worst: { tag: string; cls: string; right: number } | null = null;
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const r = el.getBoundingClientRect();
          if (r.right > window.innerWidth + 1 && r.width > 0) {
            if (!worst || r.right > worst.right) {
              worst = {
                tag: el.tagName.toLowerCase(),
                cls: (el.getAttribute('class') || '').slice(0, 100),
                right: Math.round(r.right),
              };
            }
          }
        }
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offender: worst };
      });

      expect(
        scrollWidth,
        offender
          ? `overflow at ${path} @ ${width}px — widest offender <${offender.tag}> right=${offender.right} class="${offender.cls}"`
          : `overflow at ${path} @ ${width}px`
      ).toBeLessThanOrEqual(clientWidth);
    });
  }
}
