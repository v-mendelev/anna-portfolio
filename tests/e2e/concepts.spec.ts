import { expect, test } from './fixtures';
import { CONCEPT_FONTS, CONCEPT_SECTIONS, DEMO_SLUGS } from './routes';

/**
 * Behaviour shared by all three design concepts. Each concept is a complete
 * portfolio page with the same content model, so the same contract applies.
 */
for (const slug of DEMO_SLUGS) {
  test.describe(`@smoke concept ${slug}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`design/${slug}/`);
    });

    test('renders every required section in order', async ({ page }) => {
      const ids = await page
        .locator('main > section[id]')
        .evaluateAll((sections) => sections.map((s) => s.id));
      expect(ids).toEqual([...CONCEPT_SECTIONS]);
    });

    test('labels every placeholder and never presents it as real', async ({ page }) => {
      const tags = page.locator('[data-placeholder]');
      expect(await tags.count()).toBeGreaterThanOrEqual(12);
      for (const text of await tags.allTextContents()) expect(text).toContain('Заглушка');

      // Sections that hold not-yet-provided material show a visible label.
      for (const id of ['showreel', 'about', 'reviews', 'contact']) {
        await expect(page.locator(`#${id} [data-placeholder]:visible`).first()).toBeVisible();
      }
      // Every project in the portfolio carries its own label.
      const projects = page.locator('#work [data-category]');
      const count = await projects.count();
      expect(count).toBe(6);
      for (let i = 0; i < count; i++) {
        await expect(projects.nth(i).locator('[data-placeholder]')).not.toHaveCount(0);
      }
      // No contact link is invented: placeholders render no href.
      await expect(page.locator('[data-contacts] a')).toHaveCount(0);
    });

    test('opens the showreel in a dialog; Escape closes it and restores focus', async ({
      page,
    }) => {
      const trigger = page.getByTestId('showreel-open');
      await trigger.click();
      const dialog = page.locator('dialog[open]');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('aria-label', 'Шоурил');
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test('closes the showreel with its close button', async ({ page }) => {
      await page.getByTestId('showreel-open').click();
      await page.locator('dialog[open]').getByRole('button', { name: 'Закрыть шоурил' }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    });

    test('filters the portfolio by category', async ({ page }) => {
      const work = page.locator('#work');
      const visible = work.locator('[data-category]:visible');
      await expect(visible).toHaveCount(6);

      await work.locator('[data-filter="voice"]').click();
      await expect(visible).toHaveCount(1);
      await expect(work.locator('[data-filter="voice"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(work.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'false');
      await expect(work.locator('[data-filter-status]')).toContainText('1');

      // Travel is a new direction: two of the six invented demo projects.
      await work.locator('[data-filter="travel"]').click();
      await expect(visible).toHaveCount(2);

      await work.locator('[data-filter="all"]').click();
      await expect(visible).toHaveCount(6);
    });

    test('loads only same-origin resources (no CDN or third-party media)', async ({
      page,
      baseURL,
    }) => {
      const origin = new URL(baseURL ?? 'http://invalid').origin;
      const external: string[] = [];
      page.on('request', (request) => {
        const url = request.url();
        if (!url.startsWith(origin) && !url.startsWith('data:')) external.push(url);
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      expect(external).toEqual([]);
    });

    test('renders with its own self-hosted typefaces', async ({ page }) => {
      await page.evaluate(() => document.fonts.ready);
      const loaded = await page.evaluate(() =>
        [...document.fonts]
          .filter((face) => face.status === 'loaded')
          .map((face) => face.family.replace(/["']/g, '')),
      );
      for (const family of CONCEPT_FONTS[slug]) expect(loaded).toContain(family);
    });

    test('runs no animations when reduced motion is requested', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      await page.evaluate(() => window.scrollTo(0, window.innerHeight));
      await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
      await page.getByTestId('showreel-open').click();
      await expect(page.locator('dialog[open]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    });
  });

  test.describe(`@smoke concept ${slug} on a phone`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('menu opens, jumps to a section and closes (link and Escape)', async ({ page }) => {
      await page.goto(`design/${slug}/`);
      const toggle = page.locator('[data-menu-toggle]');
      await expect(toggle).toBeVisible();
      const panel = page.locator(`#${await toggle.getAttribute('aria-controls')}`);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(panel).toBeVisible();
      await panel.getByRole('link', { name: 'Услуги', exact: true }).click();
      await expect(panel).toBeHidden();
      await expect(page.locator('#services')).toBeInViewport();

      await toggle.click();
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(toggle).toBeFocused();
    });
  });
}

test.describe('@smoke scroll-linked motion', () => {
  // Regression: a minifier once folded `animation` + `animation-timeline` into an
  // invalid shorthand, so the scroll animations silently never ran.
  for (const [slug, selector, scrollTo] of [
    ['cinematic', '.cine-screen', '#top'],
    ['creative', '.cr-slide', '#services'],
  ] as const) {
    test(`${slug}: ${selector} is animated by scroll where supported`, async ({ page }) => {
      await page.goto(`design/${slug}/`);
      const supported = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
      test.skip(!supported, 'Scroll-driven animations are not supported in this browser');

      await page.locator(scrollTo).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 200));
      const target = page.locator(selector).first();
      expect(await target.evaluate((el) => getComputedStyle(el).animationName)).not.toBe('none');
      expect(await target.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
    });
  }
});

test.describe('@smoke concept-specific interactions', () => {
  test('cinematic: services are set as a credits block', async ({ page }) => {
    await page.goto('design/cinematic/');
    await expect(page.locator('[data-credits] dt')).toHaveCount(4);
    await expect(page.locator('.cine-subtitle')).toHaveCount(6);
  });

  test('editorial: an index entry opens in place to show the project', async ({ page }) => {
    await page.goto('design/editorial/');
    const entry = page.locator('#work details').first();
    await expect(entry).not.toHaveAttribute('open', '');
    await entry.locator('summary').click();
    await expect(entry).toHaveAttribute('open', '');
    await expect(entry.locator('[data-footage]')).toBeVisible();
    await entry.locator('summary').click();
    await expect(entry).not.toHaveAttribute('open', '');
  });

  test('creative: a montage frame opens to show what was done, one at a time', async ({ page }) => {
    await page.goto('design/creative/');
    const toggles = page.locator('[data-card-toggle]');
    const details = page.locator('.cr-card-more');
    await expect(details.first()).toBeHidden();

    await toggles.nth(0).click();
    await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(details.nth(0)).toBeVisible();
    await expect(details.nth(0)).toContainText('Что я делаю в таком проекте');
    // The pulled-forward frame straightens (Tailwind tilts use the 'rotate' property).
    await expect
      .poll(() =>
        page.locator('[data-card][data-front]').evaluate((el) => getComputedStyle(el).rotate),
      )
      .toMatch(/^(0deg|none)$/);
    await expect(page.locator('[data-card][data-front]')).toHaveCount(1);

    await toggles.nth(1).click();
    await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(details.nth(0)).toBeHidden();
    await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'true');

    await toggles.nth(1).click();
    await expect(page.locator('[data-card][data-front]')).toHaveCount(0);
  });
});
