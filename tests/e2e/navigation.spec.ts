import { expect, test } from './fixtures';
import { DEMO_SLUGS } from './routes';

test.describe('@smoke navigation', () => {
  test('root redirects to the demo chooser', async ({ page, baseURL }) => {
    await page.goto('./');
    await expect(page).toHaveURL(`${baseURL}design/`);
    await expect(page.locator('h1')).toHaveText(/демоверсию/i);
  });

  test('chooser lists exactly the three demos', async ({ page }) => {
    await page.goto('design/');
    await expect(page.getByTestId('demo-list').getByRole('link')).toHaveCount(DEMO_SLUGS.length);
  });

  for (const slug of DEMO_SLUGS) {
    test(`opens ${slug} demo and returns to the chooser`, async ({ page, baseURL }) => {
      await page.goto('design/');
      await page.getByTestId(`demo-link-${slug}`).click();
      await expect(page).toHaveURL(`${baseURL}design/${slug}/`);
      await expect(page.locator(`[data-concept="${slug}"]`)).toBeVisible();
      await expect(page.locator('h1')).toHaveText(/Шеленкова/);

      await page.getByTestId('back-to-design').click();
      await expect(page).toHaveURL(`${baseURL}design/`);
    });
  }
});

test.describe('@smoke not found', () => {
  // The browser logs the 404 document response itself as a console error.
  test.use({ allowedIssue: /Failed to load resource: .*404/ });

  test('unknown route shows the 404 page with working styles and links', async ({ page }) => {
    // `astro preview` serves 404.html for unknown paths (as GitHub Pages does).
    const response = await page.goto('this-page-does-not-exist/');
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText(/не найдена/i);
    await page.getByRole('link', { name: /к демоверсиям/i }).click();
    await expect(page.locator('h1')).toHaveText(/демоверсию/i);
  });
});
