import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Web font contract: self-hosted WOFF2, only Cyrillic + basic Latin subsets,
 * only the families a page needs, font-display: swap, a preload for the h1
 * face, a payload budget, and no layout shift when fonts arrive late.
 */
interface FontPage {
  path: string;
  families: RegExp;
  budgetKb: number;
  preloads: number;
}

const PAGES: Record<string, FontPage> = {
  cinematic: {
    path: 'design/cinematic/',
    families: /^(cormorant|commissioner)-/,
    budgetKb: 130,
    preloads: 1,
  },
  editorial: {
    path: 'design/editorial/',
    families: /^(literata|golos-text)-/,
    budgetKb: 150,
    preloads: 1,
  },
  creative: {
    path: 'design/creative/',
    families: /^(unbounded|golos-text)-/,
    budgetKb: 150,
    preloads: 1,
  },
  chooser: {
    path: 'design/',
    families: /^(cormorant|literata|unbounded)-latin-/,
    budgetKb: 150,
    preloads: 0,
  },
};

const fileName = (url: string) => new URL(url).pathname.split('/').pop() ?? '';

for (const [name, spec] of Object.entries(PAGES)) {
  test.describe(`@smoke fonts: ${name}`, () => {
    test('loads only the WOFF2 subsets and families this page needs, within budget', async ({
      page,
      browserName,
    }) => {
      const fonts: { url: string; bytes: number }[] = [];
      page.on('response', async (response) => {
        if (response.request().resourceType() !== 'font') return;
        fonts.push({ url: response.url(), bytes: (await response.body()).length });
      });
      await page.goto(spec.path);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle');

      expect(fonts.length).toBeGreaterThan(0);
      for (const { url } of fonts) {
        const file = fileName(url);
        expect(file).toMatch(/\.woff2$/);
        expect(file).toMatch(spec.families);
        expect(file).toMatch(/-(cyrillic|latin)-/);
        expect(file).not.toMatch(/cyrillic-ext|latin-ext|vietnamese|greek/);
      }
      // Each file is fetched once: the preload is reused, not duplicated.
      // (WebKit also reports memory-cache hits as responses, so only Chromium
      // can tell a real second download apart.)
      const urls = fonts.map((f) => f.url);
      if (browserName === 'chromium') expect(new Set(urls).size).toBe(urls.length);

      const unique = new Map(fonts.map((f) => [f.url, f.bytes]));
      const totalKb = [...unique.values()].reduce((sum, bytes) => sum + bytes, 0) / 1024;
      test.info().annotations.push({ type: 'font-payload-kb', description: totalKb.toFixed(1) });
      expect(totalKb, `font payload ${totalKb.toFixed(1)} KB`).toBeLessThan(spec.budgetKb);
    });

    test('declares every face with font-display: swap and preloads the h1 face', async ({
      page,
    }) => {
      await page.goto(spec.path);
      // Web font faces only: local() metric fallbacks never download anything.
      const displays = await page.evaluate(() =>
        [...document.fonts].filter((f) => !f.family.endsWith('Fallback')).map((f) => f.display),
      );
      expect(displays.length).toBeGreaterThan(0);
      for (const display of displays) expect(display).toBe('swap');

      const preloads = page.locator('link[rel="preload"][as="font"]');
      await expect(preloads).toHaveCount(spec.preloads);
      for (const link of await preloads.all()) {
        await expect(link).toHaveAttribute('type', 'font/woff2');
        await expect(link).toHaveAttribute('crossorigin', '');
        expect(await link.getAttribute('href')).toMatch(/-cyrillic-.*\.woff2$/);
      }
    });
  });
}

/** Height of the page and of every top-level section, in page order. */
async function sectionHeights(page: Page): Promise<{ id: string; h: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main, main > section')].map((el) => ({
      id: el.id || el.tagName.toLowerCase(),
      h: el.getBoundingClientRect().height,
    })),
  );
}

test.describe('@smoke fonts: fallback metrics', () => {
  // Fonts are blocked on purpose in the first pass.
  test.use({ allowedIssue: /request failed: .*\.woff2|Failed to load resource: net::ERR_FAILED/ });

  for (const [name, spec] of Object.entries(PAGES)) {
    for (const width of [390, 1280]) {
      test(`${name} @${width}px: fallback text takes the same space as the web font`, async ({
        page,
        browserName,
      }) => {
        test.skip(browserName !== 'chromium', 'Geometry baseline is measured in Chromium');
        await page.setViewportSize({ width, height: 900 });

        // 1) Fallback only: web fonts are blocked.
        await page.route('**/*.woff2', (route) => route.abort());
        await page.goto(spec.path);
        const fallback = await sectionHeights(page);

        // 2) Web fonts loaded.
        await page.unroute('**/*.woff2');
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
        const loaded = await sectionHeights(page);

        expect(loaded.length).toBe(fallback.length);
        const deltas = loaded.map((s, i) => ({
          id: s.id,
          delta: Math.abs(s.h - (fallback[i]?.h ?? 0)) / Math.max(s.h, 1),
        }));
        const worstSection = deltas.reduce((a, b) => (b.delta > a.delta ? b : a));
        const worst = worstSection.delta;
        const pageDelta = deltas.find((d) => d.id === 'main')?.delta ?? 0;
        test.info().annotations.push({
          type: 'max-section-delta',
          description: `${worst.toFixed(4)} (${worstSection.id}); page ${pageDelta.toFixed(4)}`,
        });
        // Calibrated on Windows/Chromium: with fallbacks the page height changes
        // <= 0.33% and any section <= 2.1%; without them 0.66-2.4% / 3.9-7.7%.
        // Linux CI renders slightly differently, hence the section headroom.
        expect(pageDelta, `page height change ${(pageDelta * 100).toFixed(2)}%`).toBeLessThan(
          0.008,
        );
        expect(worst, `largest section height change ${(worst * 100).toFixed(1)}%`).toBeLessThan(
          0.05,
        );
      });
    }
  }
});

test.describe('@smoke fonts: no layout shift', () => {
  for (const [name, spec] of Object.entries(PAGES)) {
    test(`${name}: late fonts do not move the layout`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Layout Instability API is Chromium-only');
      // Hold every font back so the page first renders with the fallbacks.
      await page.route('**/*.woff2', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.continue();
      });
      await page.addInitScript(() => {
        const store = window as unknown as { __cls: number };
        store.__cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
          }[]) {
            if (!entry.hadRecentInput) store.__cls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(spec.path);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      test.info().annotations.push({ type: 'cls', description: cls.toFixed(4) });
      expect(cls, `CLS after font swap: ${cls.toFixed(4)}`).toBeLessThan(0.05);
    });
  }
});
