import { expect, test } from '@playwright/test';
import { ROUTES, viewportFor } from '../e2e/routes';

/**
 * Visual regression (opt-in, `pnpm test:visual`).
 * Baselines are stored next to this file in pages.spec.ts-snapshots/ and are
 * platform-specific (suffix -linux / -win32). Generate the canonical Linux
 * baselines via the "Visual regression" workflow (see TESTING.md).
 */
const WIDTHS = [375, 768, 1440] as const;

for (const width of WIDTHS) {
  test.describe(`visual ${width}px`, () => {
    test.use({ viewport: viewportFor(width) });

    for (const route of ROUTES) {
      test(`${route.path}`, async ({ page }) => {
        await page.goto(route.path);
        await page.evaluate(() => document.fonts.ready);
        const name = `${route.path.replace(/\/$/, '').replace(/\//g, '-') || 'root'}-${width}.png`;
        await expect(page).toHaveScreenshot(name, { fullPage: true });
      });
    }
  });
}
