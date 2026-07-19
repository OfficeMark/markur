import { test, expect } from '@playwright/test';

/**
 * Mobile horizontal-overflow regression guard. "Every page requires pinch-zoom"
 * is caused by an element wider than the viewport — so we assert, at the two
 * tightest phone widths, that the document never scrolls horizontally. Covers
 * the public auth shells. The authenticated app needs a session, so it isn't
 * hermetic enough for the default check run and is verified live on demo.
 *
 * Routes here are hermetic: static legal pages and the auth shells.
 * (The guest view-only share route was retired 2026-07-19 — demo-links are the
 * one share model — so it's no longer exercised here.)
 */
const ROUTES = [
  '/login',
  '/reset-password',
  '/legal/privacy',
  '/legal/terms',
];

const WIDTHS = [390, 360];

// The wordmark <img> carries width=1587 attributes; if its height constraint is
// ever briefly unapplied (zero-cache first paint / broken load on iOS Safari) it
// would size to that intrinsic width and blow the flex header past the viewport.
// The max-w cap must hold it regardless. Simulate the failure by stripping the
// height class and assert the page still doesn't scroll horizontally.
for (const width of WIDTHS) {
  test(`wordmark stays capped when unconstrained @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/login', { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => {
      for (const im of Array.from(document.querySelectorAll('img[alt="Markur, by Officemark"]'))) {
        im.classList.remove('h-12', 'h-9');
        (im as HTMLElement).style.height = 'auto';
      }
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth;
    });
    expect(overflow, 'unconstrained wordmark must not overflow the viewport').toBeLessThanOrEqual(0);
  });
}

// iOS Safari zooms the whole page when you focus a form control with font-size
// < 16px, and the zoom persists across SPA navigation. Assert every text-entry
// control is >=16px at phone widths (login = the guaranteed first tap). This
// one doesn't get to come back.
for (const width of WIDTHS) {
  test(`form controls are >=16px (no iOS focus-zoom) @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/login', { waitUntil: 'networkidle' });
    const tooSmall = await page.evaluate(() => {
      const out: Array<{ tag: string; type: string; px: number }> = [];
      for (const el of Array.from(document.querySelectorAll('input, textarea, select'))) {
        const type = (el as HTMLInputElement).type || '';
        if (['checkbox', 'radio', 'range', 'file', 'hidden', 'submit', 'button'].includes(type)) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 16) out.push({ tag: el.tagName.toLowerCase(), type, px });
      }
      return out;
    });
    expect(tooSmall, `controls under 16px trigger iOS focus-zoom: ${JSON.stringify(tooSmall)}`).toEqual([]);
  });
}

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
