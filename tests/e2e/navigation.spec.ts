import { LEGACY_PATHS } from '../../src/site/redirects';
import { expect, test } from './fixtures';

test.describe('@smoke navigation', () => {
  test('the root URL is the site itself, not a redirect', async ({ page, baseURL }) => {
    const response = await page.goto('');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(baseURL ?? '');
    await expect(page.locator('h1')).toHaveText(/Анна\s*Шеленкова/);
    await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0);
  });

  for (const path of LEGACY_PATHS) {
    test(`old link ${path} redirects to the home page`, async ({ page, baseURL }) => {
      await page.goto(path);
      await expect(page).toHaveURL(baseURL ?? '');
      await expect(page.locator('h1')).toHaveText(/Анна\s*Шеленкова/);
    });
  }

  test('an old link with a section anchor keeps the anchor', async ({ page, baseURL }) => {
    await page.goto('design/cinematic/#work');
    await expect(page).toHaveURL(`${baseURL}#work`);
    await expect(page.locator('#work h2')).toBeInViewport();
  });

  test('redirect pages work without JavaScript and are not indexed', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto('design/');
    await expect(page).toHaveURL(baseURL ?? '');
    await context.close();

    const raw = await (await fetch(new URL('design/editorial/', baseURL))).text();
    expect(raw).toMatch(/http-equiv="refresh"/);
    expect(raw).toMatch(/name="robots" content="noindex/);
    // Canonical points at the home page, so only the home page is indexed.
    expect(raw).toContain(`rel="canonical" href="${baseURL ?? ''}"`);
  });
});

test.describe('@smoke not found', () => {
  // The browser logs the 404 document response itself as a console error.
  test.use({ allowedIssue: /Failed to load resource: .*404/ });

  test('unknown route shows the 404 page with working styles and a way home', async ({
    page,
    baseURL,
  }) => {
    // `astro preview` serves 404.html for unknown paths (as GitHub Pages does).
    const response = await page.goto('this-page-does-not-exist/');
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText(/не найдена/i);
    await expect(page.locator('h1')).toHaveCSS('color', 'rgb(26, 43, 255)');
    await page.getByRole('link', { name: 'На главную' }).click();
    await expect(page).toHaveURL(baseURL ?? '');
    await expect(page.locator('h1')).toHaveText(/Шеленкова/);
  });
});
