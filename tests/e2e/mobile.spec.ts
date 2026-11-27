import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { SITE_SECTIONS } from './routes';

/**
 * Phone-sized regressions found in the mobile design review (Galaxy S25 class,
 * 360×780 CSS px, plus the narrowest and widest phones we support).
 */
const PHONE = { width: 360, height: 780 };

async function openHome(page: Page) {
  await page.goto('');
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

test.describe('@smoke home on phones', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test('the header is opaque wherever content scrolls beneath it', async ({ page }) => {
    await openHome(page);
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

  test('menu links land each section heading below the header', async ({ page }) => {
    // 3 widths × 4 sections of real navigation over a long page with ten players:
    // in WebKit this runs close to the default 30 s, so give it the slow budget.
    test.slow();
    for (const width of [320, 360, 430]) {
      await page.setViewportSize({ width, height: PHONE.height });
      await openHome(page);
      const toggle = page.locator('[data-menu-toggle]');
      const panel = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
      for (const id of SITE_SECTIONS.filter((s) => s !== 'top')) {
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
                return heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
              }, id),
            { message: `#${id} heading vs header at ${width}px` },
          )
          .toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('real work is flagged as not yet confirmed, and frames fit the screen', async ({ page }) => {
    await openHome(page);
    const note = page.locator('#work [data-work-note]');
    await expect(note).toBeVisible();
    await expect(note).toContainText('работы Анны');
    await expect(note).toContainText('уточнит');
    const width = page.viewportSize()?.width ?? 0;
    for (const frame of await page.locator('#work [data-footage]').all()) {
      const box = await frame.boundingBox();
      // Sized by width at its own ratio: never wider than the phone.
      expect(box?.width ?? 0).toBeLessThanOrEqual(width);
    }
  });

  test('touch targets are at least 44×44 px, including the open menu', async ({ page }) => {
    await openHome(page);
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
  });

  test('text meets WCAG AA contrast against its background', async ({ page }) => {
    await openHome(page);
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
        // Decorative copies hidden from assistive tech (motion trails, the
        // shifted half of a cut word) are not text content for WCAG 1.4.3.
        if (el.closest('[aria-hidden="true"]')) continue;
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

/** Positioning and the first screen. */
test.describe('@smoke positioning and first screen', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test('hero presents a videographer; travel is a new direction among the services', async ({
    page,
  }) => {
    await openHome(page);
    const hero = page.locator('#top');
    await expect(hero).toContainText('Снимаю, монтирую и озвучиваю');
    await expect(hero).toContainText('Новое направление — видео о путешествиях');
    await expect(hero).not.toContainText(/туристическ/i);
    await expect(page.locator('#services')).toContainText('Новое направление: выездная съёмка');
  });

  test('no heading repeats the one right before it', async ({ page }) => {
    await openHome(page);
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
      await openHome(page);
      const cta = page.locator('#top a[href="#contact"]').first();
      await expect(cta).toBeVisible();
      const box = await cta.boundingBox();
      expect(box, 'CTA has a box').not.toBeNull();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    });
  }
});

test.describe('@smoke phone layout', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test('on phones vertical work sits two to a row at 9:16, horizontal work full width', async ({
    page,
  }) => {
    await openHome(page);
    const sheet = page.locator('#work [data-project-list]');
    const sheetWidth = (await sheet.boundingBox())?.width ?? 0;
    for (const card of await sheet.locator('[data-category]').all()) {
      const width = (await card.boundingBox())?.width ?? 0;
      const frame = await card.locator('[data-footage]').boundingBox();
      const ratio = (frame?.width ?? 0) / (frame?.height ?? 1);
      if ((await card.getAttribute('data-orientation')) === 'vertical') {
        expect(width).toBeLessThan(sheetWidth / 2);
        expect(width).toBeGreaterThan(sheetWidth / 2 - 16);
        expect(Math.abs(ratio - 9 / 16)).toBeLessThan(0.02);
      } else {
        expect(Math.abs(width - sheetWidth)).toBeLessThan(1);
        expect(ratio).toBeGreaterThanOrEqual(1.59);
      }
    }
  });

  // The pen loops overshoot their labels on purpose; the list reserves room for
  // that. Measure the drawn loops at the narrowest phones and on desktop.
  for (const viewport of [
    { width: 320, height: 640 },
    PHONE,
    { width: 430, height: 900 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    test(`circled roles never overlap or get clipped at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openHome(page);
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        const overlap = (a: DOMRect, b: DOMRect) =>
          a.left < b.right - 0.5 &&
          a.right > b.left + 0.5 &&
          a.top < b.bottom - 0.5 &&
          a.bottom > b.top + 0.5;
        const cards = [...document.querySelectorAll<HTMLElement>('#work [data-category]')];
        const vw = document.documentElement.clientWidth;
        for (const card of cards) {
          const marks = [...card.querySelectorAll<HTMLElement>('.kadr-mark')];
          const loops = marks.map((m) => {
            const loop = m.querySelector('.kadr-mark-loop');
            return loop ? loop.getBoundingClientRect() : new DOMRect();
          });
          const title = card.querySelector('h3')?.getBoundingClientRect();
          marks.forEach((mark, i) => {
            const name = mark.textContent?.trim() ?? '';
            const loop = loops[i] ?? new DOMRect();
            const text = mark.getBoundingClientRect();
            // The loop encloses its own label.
            if (
              loop.left > text.left ||
              loop.right < text.right ||
              loop.top > text.top ||
              loop.bottom < text.bottom
            )
              out.push(`loop does not enclose "${name}"`);
            // Text never wraps inside a loop (one line per label).
            if (text.height > parseFloat(getComputedStyle(mark).lineHeight) * 1.5)
              out.push(`"${name}" wraps`);
            if (loop.left < 0 || loop.right > vw) out.push(`loop of "${name}" leaves the screen`);
            if (title && overlap(loop, title)) out.push(`loop of "${name}" hits the title`);
            loops.forEach((other, j) => {
              if (j > i && overlap(loop, other))
                out.push(`loops of "${name}" and "${marks[j]?.textContent?.trim()}" overlap`);
            });
            // No ancestor clips it.
            for (let el = mark.parentElement; el && el !== document.body; el = el.parentElement) {
              const st = getComputedStyle(el);
              if (st.overflow !== 'visible' || st.overflowX !== 'visible') {
                const r = el.getBoundingClientRect();
                if (
                  loop.left < r.left ||
                  loop.right > r.right ||
                  loop.top < r.top ||
                  loop.bottom > r.bottom
                )
                  out.push(`loop of "${name}" clipped by <${el.tagName.toLowerCase()}>`);
              }
            }
          });
          // Loops stay clear of the neighbouring cards.
          for (const other of cards) {
            if (other === card || other.hidden) continue;
            const r = other.getBoundingClientRect();
            for (const loop of loops)
              if (overlap(loop, r)) out.push('loop reaches a neighbouring card');
          }
        }
        return out;
      });
      expect(problems).toEqual([]);
    });
  }
});
