#!/usr/bin/env node
/**
 * Renders the site's brand images into public/ from the real web font and
 * the KADR tokens (no design tool needed, reproducible):
 *   - og.png               1200×630 social preview (Open Graph / Twitter)
 *   - apple-touch-icon.png 180×180, from public/favicon.svg
 *   - favicon.ico          32×32 PNG inside an ICO container, from favicon.svg
 *
 * Usage: pnpm brand:images  (needs Playwright Chromium: pnpm test:e2e:install)
 * Texts come from the arguments below; keep them in line with src/site/.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const font = (subset) =>
  readFileSync(
    require.resolve(`@fontsource-variable/onest/files/onest-${subset}-wght-normal.woff2`),
  ).toString('base64');
const svg = readFileSync('public/favicon.svg', 'utf8');

const NAME = ['Анна', 'Шеленкова'];
const ROLE = 'Видеограф: съёмка, монтаж и озвучка видео';
const BLUE = '#1a2bff';

const corner = (len, w) =>
  ['left top', 'right top', 'left bottom', 'right bottom']
    .flatMap((pos) => [
      `linear-gradient(${BLUE},${BLUE}) ${pos} / ${len}px ${w}px no-repeat`,
      `linear-gradient(${BLUE},${BLUE}) ${pos} / ${w}px ${len}px no-repeat`,
    ])
    .join(',');

const ogHtml = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Onest;src:url(data:font/woff2;base64,${font('cyrillic')}) format('woff2');font-weight:100 900;unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Onest;src:url(data:font/woff2;base64,${font('latin')}) format('woff2');font-weight:100 900;unicode-range:U+0000-00FF,U+2013-2014}
html,body{margin:0;width:1200px;height:630px;background:#fff;font-family:Onest}
.frame{position:absolute;inset:48px;background:${corner(72, 8)}}
.name{position:absolute;left:96px;top:96px;margin:0;color:${BLUE};font-weight:900;font-size:150px;line-height:.86;letter-spacing:-.045em;text-transform:uppercase}
.role{position:absolute;left:100px;bottom:104px;margin:0;color:#000;font-weight:600;font-size:40px;letter-spacing:-.01em}
</style><div class="frame"></div><h1 class="name">${NAME[0]}<br>${NAME[1]}</h1><p class="role">${ROLE}</p>`;

/** PNG → single-image ICO (Vista+ PNG-in-ICO). */
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size % 256, 0);
  entry.writeUInt8(size % 256, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([header, entry, png]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(ogHtml);
await page.evaluate(() => document.fonts.ready);
writeFileSync('public/og.png', await page.screenshot({ type: 'png' }));

for (const [file, size] of [
  ['public/apple-touch-icon.png', 180],
  ['favicon-32', 32],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:#fff}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  const png = await page.screenshot({ type: 'png' });
  if (file === 'favicon-32') writeFileSync('public/favicon.ico', pngToIco(png, size));
  else writeFileSync(file, png);
}
await browser.close();
process.stdout.write('public/og.png, public/apple-touch-icon.png, public/favicon.ico\n');
