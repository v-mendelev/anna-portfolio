import { describe, expect, it } from 'vitest';
import {
  extractCssUrls,
  extractHtmlAssets,
  extractJsImports,
  formatLiveReport,
  runLiveCheck,
  type FetchLike,
} from './live.ts';

const BASE = 'https://user.github.io/site/';
const SHA = 'a'.repeat(40);
const OLD = 'b'.repeat(40);

const PAGE = `<!doctype html><html lang="ru"><head>
<link rel="preload" href="/site/_astro/font-a.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site/_astro/app.css">
<link rel="icon" href="/site/favicon.svg">
<link rel="stylesheet" href="https://cdn.example.com/x.css">
<style>@font-face{font-family:A;src:url(/site/_astro/font-b.woff2) format("woff2")}</style>
</head><body><script type="module" src="/site/_astro/page.js"></script></body></html>`;

type Site = Record<string, { status: number; body?: string; type?: string }>;

function site(
  overrides: Site = {},
  deployed: string[] = [SHA],
): { fetch: FetchLike; requested: string[] } {
  const requested: string[] = [];
  let infoCalls = 0;
  const files: Site = {
    'design/': { status: 200, body: PAGE },
    'design/a/': { status: 200, body: PAGE },
    '_astro/app.css': {
      status: 200,
      body: '@font-face{src:url("./font-c.woff2")}body{background:url(bg.png)}',
    },
    '_astro/page.js': { status: 200, body: 'import{a as b}from"./menu.js";' },
    '_astro/menu.js': { status: 200, body: 'export const a=1;' },
    '_astro/font-a.woff2': { status: 200 },
    '_astro/font-b.woff2': { status: 200 },
    '_astro/font-c.woff2': { status: 200 },
    ...overrides,
  };
  return {
    requested,
    fetch: async (url) => {
      requested.push(url);
      const path = url.replace(BASE, '').split('?')[0] ?? '';
      if (path === 'build-info.json') {
        const sha = deployed[Math.min(infoCalls, deployed.length - 1)];
        infoCalls += 1;
        return {
          status: 200,
          headers: { get: () => 'application/json' },
          text: async () => JSON.stringify({ sha }),
        };
      }
      const file = files[path] ?? { status: 404 };
      return {
        status: file.status,
        headers: { get: () => file.type ?? null },
        text: async () => file.body ?? '',
      };
    },
  };
}

const run = (fetchImpl: FetchLike, attempts = 3) =>
  runLiveCheck({
    baseUrl: BASE,
    routes: ['design/', 'design/a/'],
    expectedSha: SHA,
    fetch: fetchImpl,
    attempts,
    sleep: () => Promise.resolve(),
  });

describe('asset extraction', () => {
  it('finds same-origin CSS, JS and fonts in HTML, ignoring other origins and icons', () => {
    const assets = extractHtmlAssets(PAGE, `${BASE}design/`);
    expect(Object.fromEntries(assets)).toEqual({
      'https://user.github.io/site/_astro/font-a.woff2': 'font',
      'https://user.github.io/site/_astro/app.css': 'css',
      'https://user.github.io/site/_astro/page.js': 'js',
      'https://user.github.io/site/_astro/font-b.woff2': 'font',
    });
  });
  it('resolves font urls relative to the stylesheet and skips data: and images', () => {
    expect(
      extractCssUrls(
        'src:url(./f.woff2),url(data:font/woff2;base64,AA==);background:url(i.png)',
        `${BASE}_astro/a.css`,
      ),
    ).toEqual([`${BASE}_astro/f.woff2`]);
  });
  it('follows relative JS imports', () => {
    expect(
      extractJsImports(
        'import"./a.js";import{x}from"../b.js";import("./c.js")',
        `${BASE}_astro/p.js`,
      ),
    ).toEqual([`${BASE}_astro/a.js`, `${BASE}b.js`, `${BASE}_astro/c.js`]);
  });
});

describe('runLiveCheck', () => {
  it('passes when the expected commit is live and every route and asset answers 200', async () => {
    const s = site();
    const report = await run(s.fetch);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.deployedSha).toBe(SHA);
    const kinds = report.checks.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'route')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'font')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'js')).toHaveLength(2); // page.js + imported menu.js
    expect(formatLiveReport(report, BASE)).toContain('✅ passed');
  });

  it('waits for the CDN to serve the new commit', async () => {
    const report = await run(site({}, [OLD, OLD, SHA]).fetch, 5);
    expect(report.ok).toBe(true);
  });

  it('fails when the live site never reaches the expected commit (and checks nothing else)', async () => {
    const s = site({}, [OLD]);
    const report = await run(s.fetch, 3);
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toMatch(/expected a{40}/);
    expect(s.requested.every((u) => u.includes('build-info.json'))).toBe(true);
  });

  it.each([
    ['a route 404s', { 'design/a/': { status: 404 } }, /design\/a\/ answered 404/],
    ['a stylesheet 404s', { '_astro/app.css': { status: 404 } }, /CSS .*app\.css answered 404/],
    [
      'a font referenced only from CSS 404s',
      { '_astro/font-c.woff2': { status: 404 } },
      /FONT .*font-c/,
    ],
    [
      'an imported JS chunk 404s',
      { '_astro/menu.js': { status: 500 } },
      /JS .*menu\.js answered 500/,
    ],
    ['a route returns non-HTML', { 'design/': { status: 200, body: 'not html' } }, /without HTML/],
  ])('fails when %s', async (_label, overrides, message) => {
    const report = await run(site(overrides).fetch);
    expect(report.ok).toBe(false);
    expect(report.errors.join('\n')).toMatch(message);
  });

  it('fails when pages reference no fonts or scripts at all', async () => {
    const bare = '<html><head><link rel="stylesheet" href="/site/_astro/app.css"></head></html>';
    const report = await run(
      site({
        'design/': { status: 200, body: bare },
        'design/a/': { status: 200, body: bare },
        '_astro/app.css': { status: 200, body: '' },
      }).fetch,
    );
    expect(report.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/No JS/), expect.stringMatching(/No FONT/)]),
    );
  });
});
