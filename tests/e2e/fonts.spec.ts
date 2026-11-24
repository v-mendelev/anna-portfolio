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

// Budgets: actual payload (Cyrillic + Latin files) plus ~20% headroom.
const PAGES: Record<string, FontPage> = {
  // KADR: Onest only (~49 KB).
  cinematic: {
    path: 'design/cinematic/',
    families: /^onest-/,
    budgetKb: 60,
    preloads: 1,
  },
  // SKLEYKA: Alumni Sans + Onest (~82 KB).
  editorial: {
    path: 'design/editorial/',
    families: /^(alumni-sans|onest)-/,
    budgetKb: 100,
    preloads: 1,
  },
  // RAPID: Noto Sans Display, weight + width axes (~105 KB).
  creative: {
    path: 'design/creative/',
    families: /^noto-sans-display-cyrillic-wdth|^noto-sans-display-latin-wdth/,
    budgetKb: 125,
    preloads: 1,
  },
  // Chooser previews each concept's face on its Cyrillic name only. Chromium
  // fetches just the Cyrillic files (~64 KB); WebKit also fetches the Latin file
  // of each family, because it takes line metrics from the face that covers the
  // space (U+0020) even when the text has none (~187 KB in total).
  chooser: {
    path: 'design/',
    families: /^(onest|alumni-sans|noto-sans-display)-(cyrillic|latin)-/,
    budgetKb: 200,
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

// TEMPORARY DIAGNOSTIC (to be removed before deploy): reports Linux CI font
// geometry through a deliberately failing test (the github reporter turns the
// error into a public check annotation). It changes no other test.
test.describe('@diag fonts: platform geometry', () => {
  test.use({ allowedIssue: /request failed: .*\.woff2|Failed to load resource: net::ERR_FAILED/ });

  test('fallback vs web font widths', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'diagnostic');
    const out: string[] = [];
    await page.goto('design/');
    const sample =
      'Здесь будет короткий рассказ Анны о себе: с чего началась съёмка, как она работает и что любит снимать. Текст появится после согласования. Видеограф, монтаж, клипы, свадьбы, реклама.';
    const cases: [string, string, number, string][] = [
      ['Onest Variable', 'Onest Variable Fallback', 400, '100%'],
      ['Onest Variable', 'Onest Variable Fallback', 500, '100%'],
      ['Onest Variable', 'Onest Variable Fallback', 700, '100%'],
      ['Onest Variable', 'Onest Variable Fallback', 900, '100%'],
      ['Alumni Sans Variable', 'Alumni Sans Variable Fallback', 800, '100%'],
      ['Noto Sans Display Variable', 'Noto Sans Display Variable Fallback', 400, '100%'],
      ['Noto Sans Display Variable', 'Noto Sans Display Variable Fallback', 800, '100%'],
      ['Noto Sans Display Variable', 'Noto Sans Display Variable Condensed Fallback', 800, '70%'],
    ];
    const res = await page.evaluate(
      async ({ sample, cases }) => {
        const w = (family: string, weight: number, stretch: string, size = 20) => {
          const s = document.createElement('span');
          s.style.cssText = `position:absolute;white-space:nowrap;font-family:${family};font-weight:${weight};font-stretch:${stretch};font-size:${size}px`;
          s.textContent = sample;
          document.body.append(s);
          const width = s.getBoundingClientRect().width;
          s.remove();
          return width;
        };
        const lines: string[] = [];
        for (const [web, fb, weight, stretch] of cases) {
          await document.fonts.load(`${weight} 20px "${web}"`, sample);
          const a = w(`"${web}"`, weight, stretch);
          const b = w(`"${fb}"`, weight, stretch);
          lines.push(
            `${web.split(' ')[0]}/${fb.includes('Condensed') ? 'C' : ''}${weight}: fb/web=${(b / a).toFixed(4)}`,
          );
        }
        const mono = w('monospace', 400, '100%');
        for (const f of ['Arial', 'Liberation Sans', 'Arimo', 'Helvetica', 'Roboto'])
          lines.push(`${f}:${w(`"${f}", monospace`, 400, '100%') === mono ? 'absent' : 'present'}`);
        return lines;
      },
      { sample, cases },
    );
    out.push(...res);

    for (const path of ['design/editorial/', 'design/cinematic/']) {
      await page.setViewportSize({ width: 390, height: 900 });
      const bio = () =>
        page.evaluate(() => {
          const p = document.querySelector<HTMLElement>('#about p');
          if (!p) return 'none';
          const r = document.createRange();
          r.selectNodeContents(p);
          return [...r.getClientRects()].map((x) => x.width.toFixed(1)).join(',');
        });
      await page.route('**/*.woff2', (r) => r.abort());
      await page.goto(path);
      const fb = await bio();
      await page.unroute('**/*.woff2');
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      out.push(`${path} bio@390 fb[${fb}] web[${await bio()}]`);
    }
    throw new Error(`DIAG ${out.join(' | ')}`);
  });
});
