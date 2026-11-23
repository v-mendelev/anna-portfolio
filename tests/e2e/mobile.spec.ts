import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { CONCEPT_SECTIONS, DEMO_SLUGS } from './routes';

/**
 * Phone-sized regressions found in the mobile design review (Galaxy S25 class,
 * 360×780 CSS px, plus the narrowest and widest phones we support).
 */
const PHONE = { width: 360, height: 780 };

async function openConcept(page: Page, slug: string) {
  await page.goto(`design/${slug}/`);
  // Jumps must land instantly so geometry is measured where the user ends up.
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  await page.evaluate(() => document.fonts.ready);
}

/** Resolves any CSS colour (rgb, oklab, color-mix results…) to sRGB + alpha. */
const COLOR_HELPERS = `
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  window.__rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
`;

for (const slug of DEMO_SLUGS) {
  test.describe(`@smoke ${slug} on phones`, () => {
    test.use({ viewport: PHONE, hasTouch: true });

    test('the header is opaque wherever content scrolls beneath it', async ({ page }) => {
      await openConcept(page, slug);
      await page.addScriptTag({ content: COLOR_HELPERS });
      for (const fraction of [0.25, 0.5, 0.75, 1]) {
        await page.evaluate(
          (f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f),
          fraction,
        );
        await expect
          .poll(
            () =>
              page.evaluate(() => {
                const header = document.querySelector('[data-site-header]');
                if (!header) return 0;
                const rgba = (window as unknown as { __rgba: (c: string) => { a: number } }).__rgba;
                return rgba(getComputedStyle(header).backgroundColor).a;
              }),
            { message: `header backdrop at ${fraction * 100}% of the page` },
          )
          .toBeGreaterThanOrEqual(0.9);
      }
    });

    test('the header rests see-through and turns solid exactly once on the way down', async ({
      page,
    }) => {
      test.skip(slug === 'editorial', 'Editorial uses an always-opaque sticky header by design');
      await openConcept(page, slug);
      await page.addStyleTag({ content: '*{transition:none!important}' });
      const result = await page.evaluate(async () => {
        const header = document.querySelector<HTMLElement>('[data-site-header]');
        if (!header) return { atTop: true, changes: -1 };
        const frame = () =>
          new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        window.scrollTo(0, 0);
        await frame();
        const atTop = header.hasAttribute('data-scrolled');
        // Scroll 1px at a time through the band where the header changes.
        const anchor = header.dataset.solidAfter
          ? document.querySelector<HTMLElement>(header.dataset.solidAfter)
          : null;
        const end = anchor ? anchor.offsetTop + anchor.offsetHeight : 0;
        const from = Math.max(0, end - 110);
        let prev: boolean | null = null;
        let changes = 0;
        for (let y = from; y <= from + 70; y++) {
          window.scrollTo(0, y);
          await frame();
          const now = header.hasAttribute('data-scrolled');
          if (prev !== null && now !== prev) changes++;
          prev = now;
        }
        return { atTop, changes };
      });
      expect(result.atTop, 'not solid at the top of the page').toBe(false);
      expect(result.changes, 'state flips while scrolling one way').toBe(1);
    });

    test('menu links land each section heading below the header', async ({ page }) => {
      for (const width of [320, 360, 430]) {
        await page.setViewportSize({ width, height: PHONE.height });
        await openConcept(page, slug);
        const toggle = page.locator('[data-menu-toggle]');
        const panel = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
        for (const id of CONCEPT_SECTIONS.filter((s) => s !== 'top')) {
          await toggle.click();
          await panel.locator(`a[href="#${id}"]`).click();
          await expect(panel).toBeHidden();
          await expect
            .poll(
              () =>
                page.evaluate((target) => {
                  const header = document.querySelector('[data-site-header]');
                  const heading = document.querySelector(`#${target} h2`);
                  if (!header || !heading) return -999;
                  const atEnd =
                    Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 1;
                  if (atEnd) return 0;
                  return (
                    heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom
                  );
                }, id),
              { message: `#${id} heading vs header at ${width}px` },
            )
            .toBeGreaterThanOrEqual(0);
        }
      }
    });

    test('every demo project is visibly marked as invented', async ({ page }) => {
      await openConcept(page, slug);
      const note = page.locator('#work [data-demo-note]');
      await expect(note).toBeVisible();
      await expect(note).toContainText('вымышлены');
      await expect(note).toContainText('не работы Анны');
      const projects = page.locator('#work [data-category]');
      const count = await projects.count();
      expect(count).toBe(6);
      for (let i = 0; i < count; i++) {
        const label = projects.nth(i).locator('[data-placeholder]:visible');
        await expect(label.first()).toBeVisible();
        await expect(label.first()).toContainText('вымышленный проект');
      }
    });

    test('touch targets are at least 44×44 px, including menu and showreel', async ({ page }) => {
      await openConcept(page, slug);
      const tooSmall = () =>
        page.evaluate(() => {
          const out: string[] = [];
          const targets = document.querySelectorAll<HTMLElement>(
            'a[href], button, summary, [role="button"]',
          );
          for (const el of targets) {
            if (!el.checkVisibility()) continue;
            const box = el.getBoundingClientRect();
            // Visually hidden until focused (skip link): not a touch target.
            if (el.classList.contains('sr-only') || box.width <= 1 || box.height <= 1) continue;
            if (box.width < 43.5 || box.height < 43.5) {
              const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
              out.push(
                `${el.tagName.toLowerCase()} "${name.slice(0, 30)}" ${Math.round(box.width)}×${Math.round(box.height)}`,
              );
            }
          }
          return out;
        });
      expect(await tooSmall()).toEqual([]);
      await page.locator('[data-menu-toggle]').click();
      await expect(page.locator('[data-menu-toggle]')).toHaveAttribute('aria-expanded', 'true');
      expect(await tooSmall()).toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByTestId('showreel-open').click();
      await expect(page.locator('dialog[open]')).toBeVisible();
      expect(await tooSmall()).toEqual([]);
    });

    test('text meets WCAG AA contrast against its background', async ({ page }) => {
      await openConcept(page, slug);
      await page.addScriptTag({ content: COLOR_HELPERS });
      const failures = await page.evaluate(() => {
        interface RGBA {
          r: number;
          g: number;
          b: number;
          a: number;
        }
        const rgba = (window as unknown as { __rgba: (c: string) => RGBA }).__rgba;
        const lum = ({ r, g, b }: RGBA) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const over = (top: RGBA, bottom: RGBA): RGBA => ({
          r: top.r * top.a + bottom.r * (1 - top.a),
          g: top.g * top.a + bottom.g * (1 - top.a),
          b: top.b * top.a + bottom.b * (1 - top.a),
          a: 1,
        });
        /** Solid backdrop behind an element, or null over images/gradients. */
        const backdrop = (el: Element): RGBA | null => {
          const layers: RGBA[] = [];
          for (let node: Element | null = el; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.backgroundImage !== 'none') return null;
            const c = rgba(style.backgroundColor);
            if (c.a > 0) layers.push(c);
            if (c.a >= 1) break;
          }
          let base: RGBA = { r: 255, g: 255, b: 255, a: 1 };
          for (const layer of layers.reverse()) base = over(layer, base);
          return base;
        };
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const hasText = [...el.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
          );
          if (!hasText || !el.checkVisibility({ opacityProperty: true })) continue;
          if (el.closest('[data-footage]') && !el.closest('[data-placeholder]')) continue;
          // Text laid over a footage frame (a sibling, e.g. subtitles or the hero
          // title) sits on painted media: not measurable here, so skip it rather
          // than measuring it against the section colour.
          const box = el.getBoundingClientRect();
          const overMedia = [...document.querySelectorAll('[data-footage]')].some((f) => {
            if (f.contains(el)) return false;
            const r = f.getBoundingClientRect();
            return (
              box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top
            );
          });
          if (overMedia) continue;
          const bg = backdrop(el);
          if (!bg) continue;
          const style = getComputedStyle(el);
          const fg = over(rgba(style.color), bg);
          const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a) as [number, number];
          const ratio = (hi + 0.05) / (lo + 0.05);
          const size = parseFloat(style.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
          const min = large ? 3 : 4.5;
          if (ratio < min) {
            out.push(`"${el.textContent?.trim().slice(0, 40)}" ${ratio.toFixed(2)} < ${min}`);
          }
        }
        return out;
      });
      expect(failures).toEqual([]);
    });
  });
}

/** Positioning and per-concept refinements from the final review. */
for (const slug of DEMO_SLUGS) {
  test.describe(`@smoke ${slug} positioning and first screen`, () => {
    test.use({ viewport: PHONE, hasTouch: true });

    test('hero presents a videographer; travel is a new direction in its own section', async ({
      page,
    }) => {
      await openConcept(page, slug);
      const hero = page.locator('#top');
      await expect(hero).toContainText('Снимаю, монтирую и озвучиваю');
      await expect(hero).not.toContainText(/туристическ/i);
      await expect(page.locator('#travel h2')).toContainText('новое направление');
      await expect(page.locator('#travel')).toContainText(
        'Готовых туристических проектов пока нет',
      );
    });

    test('no heading repeats the one right before it', async ({ page }) => {
      await openConcept(page, slug);
      const repeats = await page.evaluate(() => {
        const norm = (s: string | null) =>
          (s ?? '').replace(/­/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const heads = [...document.querySelectorAll('main h1, main h2, main h3, main dt')]
          .filter((h) => h.checkVisibility())
          .map((h) => norm(h.textContent));
        return heads.filter((h, i) => i > 0 && h === heads[i - 1]);
      });
      expect(repeats).toEqual([]);
    });

    for (const viewport of [PHONE, { width: 320, height: 568 }]) {
      test(`the contact CTA is on the first screen at ${viewport.width}×${viewport.height}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await openConcept(page, slug);
        const cta = page.locator('#top a[href="#contact"]').first();
        await expect(cta).toBeVisible();
        const box = await cta.boundingBox();
        expect(box, 'CTA has a box').not.toBeNull();
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
      });
    }
  });
}

test.describe('@smoke concept-specific phone layout', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test('cinematic: portfolio rows carry only title, category and the demo label', async ({
    page,
  }) => {
    await openConcept(page, 'cinematic');
    const rows = page.locator('#work .cine-row');
    expect(await rows.count()).toBe(5);
    const blocks = await rows.evaluateAll((items) =>
      items.map(
        (row) =>
          [...row.querySelectorAll('article > div > *')].filter((el) => el.checkVisibility())
            .length,
      ),
    );
    for (const n of blocks) expect(n).toBeLessThanOrEqual(2);
  });

  test('creative: montage frames are staggered, not full-bleed slabs', async ({ page }) => {
    await openConcept(page, 'creative');
    const widths = await page
      .locator('#work [data-card]')
      .evaluateAll((cards) => cards.map((c) => c.getBoundingClientRect().width / innerWidth));
    for (const w of widths) expect(w).toBeLessThanOrEqual(0.9);
    // The stagger must alternate among the cards that are visible, also when
    // a filter hides some of them (hidden items still count for :nth-child).
    for (const filter of ['all', 'travel', 'brand']) {
      await page.locator(`#work [data-filter="${filter}"]`).click();
      const lefts = await page
        .locator('#work li[data-category]:visible')
        .evaluateAll((items) => items.map((li) => Math.round(li.getBoundingClientRect().left)));
      expect(lefts.length, `visible cards for ${filter}`).toBeGreaterThan(1);
      for (let i = 1; i < lefts.length; i++) {
        expect(lefts[i], `card ${i} alternates sides (${filter})`).not.toBe(lefts[i - 1]);
      }
    }
  });
});
