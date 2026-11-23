import { expect, test } from './fixtures';
import { ROUTES, VIEWPORT_WIDTHS, viewportFor } from './routes';

for (const width of VIEWPORT_WIDTHS) {
  test.describe(`viewport ${width}px`, () => {
    test.use({ viewport: viewportFor(width) });

    for (const route of ROUTES) {
      test(`${route.path} has no horizontal overflow and content fits`, async ({ page }) => {
        await page.goto(route.path);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth, 'page scrolls horizontally').toBeLessThanOrEqual(
          overflow.clientWidth,
        );

        const h1 = page.locator('h1');
        await expect(h1).toBeVisible();
        const box = await h1.boundingBox();
        if (!box) throw new Error('h1 has no bounding box');
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);

        // Every visible link must sit inside the viewport horizontally and be tappable.
        const links = await page.locator('main a:visible').all();
        for (const link of links) {
          const lb = await link.boundingBox();
          if (!lb) continue;
          expect(lb.x).toBeGreaterThanOrEqual(0);
          expect(lb.x + lb.width).toBeLessThanOrEqual(width + 0.5);
          expect(lb.height, 'tap target too small').toBeGreaterThanOrEqual(16);
        }

        // No heading or paragraph may overflow its own box (catches long Russian
        // words in display sizes even when a parent clips the overflow).
        // Transforms (decorative rotation, scroll-linked slides) are neutralised
        // for this measurement: the question is whether the text itself fits.
        const overflowing = await page.evaluate(() => {
          for (const animation of document.getAnimations()) animation.cancel();
          const neutral = document.createElement('style');
          neutral.textContent =
            '*{transform:none!important;rotate:none!important;translate:none!important;scale:none!important}';
          document.head.append(neutral);
          const result = [
            ...document.querySelectorAll<HTMLElement>('main h1, main h2, main h3, main p, main dt'),
          ]
            .filter((el) => el.offsetParent !== null && el.clientWidth > 1)
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => `${el.tagName}: ${el.textContent?.trim().slice(0, 40)}`);
          neutral.remove();
          return result;
        });
        expect(overflowing, 'text overflows its box').toEqual([]);

        // Body text must stay readable (>= 12px) at every width.
        const fontSize = await page.evaluate(() =>
          parseFloat(getComputedStyle(document.body).fontSize),
        );
        expect(fontSize).toBeGreaterThanOrEqual(12);
      });
    }
  });
}
