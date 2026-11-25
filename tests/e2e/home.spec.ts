import { expect, test } from './fixtures';
import { SITE_FONTS, SITE_SECTIONS } from './routes';

/** The home page: structure, honest placeholders, filters, actions, motion, metadata. */
test.describe('@smoke home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('');
  });

  test('renders every section in order, and nothing from the old concepts', async ({ page }) => {
    const ids = await page
      .locator('main > section[id]')
      .evaluateAll((sections) => sections.map((s) => s.id));
    expect(ids).toEqual([...SITE_SECTIONS]);
    await expect(page.locator('.kadr')).toHaveCount(1);
    await expect(page.locator('[data-concept], [data-testid="back-to-design"]')).toHaveCount(0);
    await expect(page.locator('a[href*="design/"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/концепци|демоверси/i);
  });

  test('labels every placeholder and never presents it as real', async ({ page }) => {
    const tags = page.locator('[data-placeholder]');
    expect(await tags.count()).toBeGreaterThanOrEqual(10);
    for (const text of await tags.allTextContents()) expect(text).toContain('Заглушка');

    for (const id of ['top', 'showreel', 'about', 'contact']) {
      await expect(page.locator(`#${id} [data-placeholder]:visible`).first()).toBeVisible();
    }
    const projects = page.locator('#work [data-category]');
    await expect(projects).toHaveCount(6);
    for (const project of await projects.all()) {
      await expect(project.locator('[data-placeholder]')).toContainText('вымышленный проект');
    }
    // No invented contact: placeholders render no link and no contact button.
    await expect(page.locator('[data-contacts] a')).toHaveCount(0);
    await expect(page.locator('#contact a.kadr-btn')).toHaveCount(0);
    await expect(page.locator('[data-footer-note]')).toContainText('заглушки');
  });

  test('never renders a player or play control without a video file', async ({ page }) => {
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.locator('[data-showreel-media]')).toHaveAttribute(
      'data-showreel-media',
      'placeholder',
    );
    // Every button on the page does something: menu, menu close or a filter.
    const buttons = await page
      .locator('button')
      .evaluateAll((els) =>
        els.filter(
          (b) =>
            !b.hasAttribute('data-menu-toggle') &&
            !b.hasAttribute('data-menu-close') &&
            !b.hasAttribute('data-filter'),
        ),
      );
    expect(buttons).toHaveLength(0);
  });

  test('every in-page link and CTA points at a section that exists', async ({ page }) => {
    const hrefs = await page
      .locator('a[href^="#"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of new Set(hrefs)) {
      await expect(page.locator(href), `${href} has a target`).toHaveCount(1);
    }
  });

  test('primary actions are blue, in KADR style, and land on their sections', async ({ page }) => {
    await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    const discuss = page.locator('#top a', { hasText: 'Обсудить проект' });
    const reel = page.getByTestId('showreel-open');
    await expect(reel).toHaveText(/Смотреть шоурил/);
    // Solid electric blue, white text; the second action is outlined in blue.
    await expect(discuss).toHaveCSS('background-color', 'rgb(26, 43, 255)');
    await expect(discuss).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(reel).toHaveCSS('border-top-color', 'rgb(26, 43, 255)');
    await expect(reel).toHaveCSS('color', 'rgb(26, 43, 255)');

    await reel.click();
    await expect(page).toHaveURL(/#showreel$/);
    await expect(page.locator('#showreel h2')).toBeInViewport();
    await discuss.click();
    await expect(page).toHaveURL(/#contact$/);
    await expect(page.locator('#contact h2')).toBeInViewport();
  });

  test('headings are bright blue; running text and descriptions are black', async ({ page }) => {
    const blue = 'rgb(26, 43, 255)';
    const black = 'rgb(0, 0, 0)';
    await expect(page.locator('h1')).toHaveCSS('color', blue);
    for (const h of await page.locator('main h2').all()) await expect(h).toHaveCSS('color', blue);
    for (const h of await page.locator('main h3').all()) await expect(h).toHaveCSS('color', blue);
    await expect(page.locator('#top p').first()).toHaveCSS('color', black);
    await expect(page.locator('#showreel p').first()).toHaveCSS('color', black);
    await expect(page.locator('#services dd').first()).toHaveCSS('color', black);
    await expect(page.locator('#about p').first()).toHaveCSS('color', black);
    await expect(page.locator('#work [data-demo-note]')).toHaveCSS('color', black);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('portfolio cards keep blue viewfinder frames', async ({ page }) => {
    const cards = page.locator('#work [data-category]');
    for (const card of await cards.all()) {
      const vf = card.locator('.vf');
      await expect(vf).toHaveCount(1);
      await expect(vf).toHaveCSS('color', 'rgb(26, 43, 255)');
      expect(await vf.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
        'linear-gradient',
      );
    }
  });

  test('filters the portfolio by category', async ({ page }) => {
    const work = page.locator('#work');
    const visible = work.locator('[data-category]:visible');
    await expect(visible).toHaveCount(6);

    await work.locator('[data-filter="voice"]').click();
    await expect(visible).toHaveCount(1);
    await expect(work.locator('[data-filter="voice"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(work.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(work.locator('[data-filter-status]')).toHaveText('Показано работ: 1');
    // The active filter turns blue; inactive ones stay black.
    await expect(work.locator('[data-filter="voice"]')).toHaveCSS('color', 'rgb(26, 43, 255)');
    await expect(work.locator('[data-filter="brand"]')).toHaveCSS('color', 'rgb(0, 0, 0)');

    await work.locator('[data-filter="travel"]').click();
    await expect(visible).toHaveCount(2);
    await work.locator('[data-filter="all"]').click();
    await expect(visible).toHaveCount(6);
  });

  test('filters work from the keyboard', async ({ page }) => {
    const brand = page.locator('#work [data-filter="brand"]');
    await brand.focus();
    await page.keyboard.press('Enter');
    await expect(brand).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#work [data-category]:visible')).toHaveCount(2);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Space');
    await expect(page.locator('#work [data-category]:visible')).toHaveCount(6);
  });

  test("each project shows Anna's roles, each circled in blue", async ({ page }) => {
    const cards = page.locator('#work [data-category]');
    for (const card of await cards.all()) {
      const marks = card.locator('.kadr-mark');
      expect(await marks.count()).toBeGreaterThan(0);
      for (const mark of await marks.all()) {
        await expect(mark).toHaveCSS('color', 'rgb(0, 0, 0)');
        const loop = mark.locator('.kadr-mark-loop');
        await expect(loop).toHaveAttribute('aria-hidden', 'true');
        await expect(loop).toHaveCSS('background-color', 'rgb(26, 43, 255)');
      }
    }
    await expect(page.locator('#work [data-category]').first().locator('.kadr-mark')).toHaveText([
      'Видеопроизводство',
      'Монтаж',
    ]);
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

  test('renders with its self-hosted typeface', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() =>
      [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => face.family.replace(/["']/g, '')),
    );
    for (const family of SITE_FONTS) expect(loaded).toContain(family);
  });

  test('runs no animations when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, window.innerHeight));
    await page.locator('#work [data-filter="travel"]').click();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    ).toBe('auto');
  });
});

test.describe('@smoke metadata', () => {
  test('Russian title, description, Open Graph, favicon and structured data', async ({
    page,
    request,
  }) => {
    await page.goto('');
    await expect(page).toHaveTitle('Анна Шеленкова — видеограф: съёмка, монтаж и озвучка видео');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    const meta = (selector: string) => page.locator(selector).getAttribute('content');
    expect(await meta('meta[name="description"]')).toMatch(/^Видеограф Анна Шеленкова/);
    expect(await meta('meta[property="og:title"]')).toContain('Анна Шеленкова');
    expect(await meta('meta[property="og:description"]')).toMatch(/снимает, монтирует/);
    expect(await meta('meta[property="og:locale"]')).toBe('ru_RU');
    expect(await meta('meta[property="og:site_name"]')).toBe('Анна Шеленкова — видеограф');
    expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    await expect(page.locator('body')).not.toContainText(/Демо|Demo/);

    // Social preview: absolute URL, PNG, 1200×630.
    const og = (await meta('meta[property="og:image"]')) ?? '';
    expect(og).toMatch(/^https?:\/\/.+\/og\.png$/);
    const ogPath = new URL(og).pathname.split('/').pop() ?? '';
    const image = await request.get(ogPath);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/png');
    const png = await image.body();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);

    // Icons: SVG favicon, ICO fallback, Apple touch icon — all served.
    for (const selector of [
      'link[rel="icon"][type="image/svg+xml"]',
      'link[rel="icon"][sizes="32x32"]',
      'link[rel="apple-touch-icon"]',
    ]) {
      const href = await page.locator(selector).getAttribute('href');
      expect(href, selector).toBeTruthy();
      const res = await request.get(new URL(href ?? '', page.url()).href);
      expect(res.status(), selector).toBe(200);
    }

    // Structured data carries only facts from content.
    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    ) as { '@type': string; name: string; jobTitle: string; knowsAbout: string[] };
    expect(ld['@type']).toBe('Person');
    expect(ld.name).toBe('Анна Шеленкова');
    expect(ld.jobTitle).toBe('Видеограф');
    expect(ld.knowsAbout).toContain('Монтаж');
  });
});

test.describe('@smoke home page on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('menu opens, jumps to a section and closes (link and Escape)', async ({ page }) => {
    await page.goto('');
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

test.describe('@smoke desktop navigation', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // Regression: an unlayered helper class once overrode `lg:hidden`, so the phone
  // menu button showed next to the desktop section links.
  test('section links are shown and the phone menu button is hidden', async ({ page }) => {
    await page.goto('');
    const nav = page.locator('[data-site-header] nav[aria-label="Разделы"]');
    await expect(nav).toBeVisible();
    await expect(page.locator('[data-menu-toggle]')).toBeHidden();
    await expect(nav.getByRole('link')).toHaveText([
      'Шоурил',
      'Работы',
      'Услуги',
      'Обо мне',
      'Контакты',
    ]);
  });

  test('every header link lands its section heading below the header', async ({ page }) => {
    await page.goto('');
    await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    const links = page.locator('[data-site-header] nav a');
    for (const link of await links.all()) {
      const id = ((await link.getAttribute('href')) ?? '').slice(1);
      await link.click();
      await expect
        .poll(() =>
          page.evaluate((target) => {
            const header = document.querySelector('[data-site-header]');
            const heading = document.querySelector(`#${target} h2`);
            if (!header || !heading) return -999;
            const atEnd =
              Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 1;
            if (atEnd) return 0;
            return heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
          }, id),
        )
        .toBeGreaterThanOrEqual(0);
    }
  });

  test('keyboard: skip link, then visible focus on every stop', async ({ page, browserName }) => {
    // WebKit (Safari default) moves Tab focus to form controls only, not links.
    test.skip(browserName !== 'chromium', 'Tab-to-links is a Chromium default');
    await page.goto('');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Перейти к содержимому' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    const stops: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          name: (el.textContent ?? '').trim().slice(0, 30),
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
        };
      });
      if (!info) break;
      expect(info.outline, `focus ring on "${info.name}"`).toBe(true);
      stops.push(info.name);
    }
    expect(stops).toContain('Обсудить проект');
    expect(stops).toContain('Смотреть шоурил');
  });
});
