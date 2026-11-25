#!/usr/bin/env node
/**
 * Review screenshots of every page in Chromium and WebKit,
 * desktop and mobile, first viewport and full page.
 *
 * Usage (needs a running server, e.g. `pnpm build && pnpm preview`):
 *   node scripts/screenshots.mjs [baseUrl] [outDir]
 *   defaults: http://127.0.0.1:4321/  screenshots/
 *
 * Output: <outDir>/<browser>/<route>-<device>[-full].png (gitignored).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices, webkit } from '@playwright/test';

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:4321/').replace(/\/?$/, '/');
const outDir = process.argv[3] ?? 'screenshots';

const routes = [{ name: 'home', path: '' }];

const targets = [
  {
    browser: 'chromium',
    engine: chromium,
    devices: {
      desktop: { viewport: { width: 1440, height: 900 } },
      mobile: { ...devices['Pixel 7'] },
    },
  },
  {
    browser: 'webkit',
    engine: webkit,
    devices: {
      desktop: { viewport: { width: 1440, height: 900 } },
      mobile: { ...devices['iPhone 13'] },
    },
  },
];

for (const target of targets) {
  const browser = await target.engine.launch();
  const dir = join(outDir, target.browser);
  mkdirSync(dir, { recursive: true });
  for (const [device, options] of Object.entries(target.devices)) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(baseUrl + route.path, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const base = join(dir, `${route.name}-${device}`);
      await page.screenshot({ path: `${base}.png` });
      await page.screenshot({ path: `${base}-full.png`, fullPage: true });
      process.stdout.write(`${base}.png\n`);
    }
    await context.close();
  }
  await browser.close();
}
