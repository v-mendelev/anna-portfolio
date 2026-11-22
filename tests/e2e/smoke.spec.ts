import { expect, test } from './fixtures';
import { ROUTES } from './routes';

for (const route of ROUTES) {
  test.describe(`@smoke ${route.name} (${route.path})`, () => {
    test('responds 200 and renders the page shell', async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);

      await expect(page).toHaveTitle(/\S/);
      await expect(page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}/);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(route.h1);
      await expect(page.locator('main#main')).toBeVisible();
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
        'content',
        /width=device-width/,
      );
    });

    test('loads CSS and applies design tokens', async ({ page }) => {
      await page.goto(route.path);
      const stylesheetCount = await page.evaluate(() => document.styleSheets.length);
      expect(stylesheetCount).toBeGreaterThan(0);

      // Tailwind utility from the shared Container must be applied.
      const maxWidth = await page
        .getByTestId('page-container')
        .evaluate((el) => getComputedStyle(el).maxWidth);
      expect(maxWidth).not.toBe('none');

      // Token-based body background (--color-surface) must be applied.
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    });

    test('all same-origin links and assets resolve under the base path', async ({
      page,
      request,
      baseURL,
    }) => {
      await page.goto(route.path);
      if (!baseURL) throw new Error('baseURL is not configured');
      const basePath = new URL(baseURL).pathname;
      const urls = await page.evaluate(() => {
        const attrs = [
          ...Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).href),
          ...Array.from(
            document.querySelectorAll('link[href]'),
            (l) => (l as HTMLLinkElement).href,
          ),
          ...Array.from(
            document.querySelectorAll('script[src]'),
            (s) => (s as HTMLScriptElement).src,
          ),
          ...Array.from(document.querySelectorAll('img[src]'), (i) => (i as HTMLImageElement).src),
        ];
        return [...new Set(attrs)];
      });
      const origin = new URL(baseURL).origin;
      const internal = urls.filter((u) => u.startsWith(origin) && !u.includes('#'));
      expect(internal.length).toBeGreaterThan(0);

      for (const url of internal) {
        expect(new URL(url).pathname, `${url} escapes the base path`).toMatch(
          new RegExp(`^${basePath}`),
        );
        const res = await request.get(url);
        expect(res.status(), url).toBe(200);
      }
    });
  });
}
