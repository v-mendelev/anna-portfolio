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

/** Horizontal offset (px) of an element's current transform. */
const translateX = (el: Element) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
/** Horizontal scale of an element's current transform. */
const scaleX = (el: Element) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a;

test.describe('@smoke scroll-driven motion actually runs', () => {
  // Regression: a minifier once folded `animation` + `animation-timeline` into an
  // invalid shorthand, so scroll animations silently never ran. These tests read
  // the transform the animation produces at different scroll positions.
  test('skleyka: a cut headline lands (offset → 0) as it scrolls into view', async ({ page }) => {
    await page.goto('design/editorial/');
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
    test.skip(!supported, 'Scroll-driven animations are not supported in this browser');
    await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    const half = page.locator('#services .sk-cut-b');

    // Heading just entering from the bottom: the lower half is still offset.
    await page.evaluate(() => {
      const h = document.querySelector('#services h2');
      if (h) window.scrollTo(0, h.getBoundingClientRect().top + scrollY - innerHeight + 40);
    });
    await expect.poll(() => half.evaluate(translateX)).not.toBeCloseTo(0, 0);

    // Heading well inside the view: the cut has landed.
    await page.evaluate(() => {
      const h = document.querySelector('#services h2');
      if (h) window.scrollTo(0, h.getBoundingClientRect().top + scrollY - innerHeight * 0.3);
    });
    await expect.poll(() => half.evaluate(translateX)).toBeCloseTo(0, 0);
  });

  test('skleyka: with reduced motion every cut is already aligned', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('design/editorial/');
    const offsets = await page
      .locator('.sk-cut-b')
      .evaluateAll((els) =>
        els.map((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41),
      );
    expect(offsets.length).toBeGreaterThan(5);
    for (const x of offsets) expect(Math.abs(x)).toBeLessThan(0.5);
  });

  test('rapid: the timeline fill follows page progress', async ({ page }) => {
    await page.goto('design/creative/');
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()'));
    test.skip(!supported, 'Scroll-driven animations are not supported in this browser');
    await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    const fill = page.locator('.rp-progress');
    const at = async (f: number) => {
      await page.evaluate(
        (p) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p),
        f,
      );
      await page.waitForTimeout(150);
      return fill.evaluate(scaleX);
    };
    expect(await at(0)).toBeLessThan(0.05);
    const mid = await at(0.5);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
    expect(await at(1)).toBeGreaterThan(0.95);
  });

  test('rapid: the name ramps on the visual layer while its font size stays put', async ({
    page,
  }) => {
    await page.goto('design/creative/');
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()'));
    test.skip(!supported, 'Scroll-driven animations are not supported in this browser');
    const wide = page.locator('.rp-name-wide');
    const size = await wide.evaluate((el) => getComputedStyle(el).fontSize);
    expect(await wide.evaluate(scaleX)).toBeCloseTo(1, 2);
    await page.evaluate(() => window.scrollTo(0, innerHeight * 0.6));
    await expect.poll(() => wide.evaluate(scaleX)).toBeLessThan(0.8);
    // Transform only: no font-size or font-variation change on scroll.
    expect(await wide.evaluate((el) => getComputedStyle(el).fontSize)).toBe(size);
  });
});

test.describe('@smoke concept-specific interactions', () => {
  test('kadr: a contact-sheet frame opens in place, one at a time; Escape closes it', async ({
    page,
  }) => {
    await page.goto('design/cinematic/');
    const toggles = page.locator('[data-sheet-toggle]');
    const cells = page.locator('.kadr-cell');
    await expect(page.locator('.kadr-more').first()).toBeHidden();

    await toggles.nth(1).click();
    await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(cells.nth(1)).toHaveAttribute('data-open', '');
    await expect(cells.nth(1).locator('.kadr-more')).toBeVisible();
    await expect(cells.nth(1).locator('.kadr-more')).toContainText('Что я делаю в таком проекте');

    await toggles.nth(0).click();
    await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.kadr-cell[data-open]')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('.kadr-cell[data-open]')).toHaveCount(0);
    await expect(toggles.nth(0)).toBeFocused();
  });

  test('skleyka: cut headlines are announced once, with the real word', async ({ page }) => {
    await page.goto('design/editorial/');
    for (const name of ['Работы', 'Услуги', 'Отзывы']) {
      await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(1);
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Анна Шеленкова');
    // Every visible copy of a cut word is hidden from assistive technology.
    const copies = page.locator('.sk-cut-b');
    for (const copy of await copies.all())
      await expect(copy).toHaveAttribute('aria-hidden', 'true');
  });

  test('skleyka: each spread circles the services the project needs', async ({ page }) => {
    await page.goto('design/editorial/');
    const spreads = page.locator('#work [data-category]');
    await expect(spreads).toHaveCount(6);
    for (const spread of await spreads.all()) {
      expect(await spread.locator('.sk-mark').count()).toBeGreaterThan(0);
    }
  });

  test('rapid: the reel freezes the frame under the playhead; buttons step through it', async ({
    page,
  }) => {
    await page.goto('design/creative/');
    const items = page.locator('#work [data-reel-item]');
    await page.locator('#work').scrollIntoViewIfNeeded();
    await expect(items.nth(0)).toHaveAttribute('data-active', '');
    await expect(items.nth(0).locator('.rp-reel-more')).toBeVisible();

    await page.getByRole('button', { name: 'Следующий кадр' }).click();
    await expect(items.nth(1)).toHaveAttribute('data-active', '');
    await expect(items.nth(0)).not.toHaveAttribute('data-active', '');

    await page.getByRole('button', { name: 'Предыдущий кадр' }).click();
    await expect(items.nth(0)).toHaveAttribute('data-active', '');
  });

  test('rapid: the timeline marks the section in view and docks after the hero', async ({
    page,
  }) => {
    await page.goto('design/creative/');
    const header = page.locator('[data-site-header]');
    await expect(header).not.toHaveAttribute('data-scrolled', '');
    await page.locator('#services').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await expect(header).toHaveAttribute('data-scrolled', '');
    await expect(page.locator('[data-seg="services"]')).toHaveAttribute('data-active', '');
  });
});

test.describe('@smoke desktop navigation', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  // Regression: an unlayered helper class once overrode `lg:hidden`, so the phone
  // menu button showed next to the desktop section links.
  for (const slug of ['cinematic', 'editorial', 'creative'] as const) {
    test(`${slug}: section links are shown and the phone menu button is hidden`, async ({
      page,
    }) => {
      await page.goto(`design/${slug}/`);
      await expect(page.locator('[data-site-header] nav[aria-label="Разделы"]')).toBeVisible();
      await expect(page.locator('[data-menu-toggle]')).toBeHidden();
    });
  }
});
