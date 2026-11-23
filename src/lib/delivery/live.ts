/**
 * Post-deploy live smoke test.
 *
 * 1. Waits until `<base>/build-info.json` reports the expected commit SHA (the
 *    deploy workflow writes it at build time), so we test the new deployment
 *    and not a CDN-cached old one.
 * 2. Every route answers 200 with HTML.
 * 3. Every same-origin stylesheet, script (including relative JS imports) and
 *    font referenced by those pages (and by the stylesheets) answers 200 —
 *    and at least one of each kind exists.
 */

export type FetchLike = (url: string) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface LiveCheckOptions {
  /** Deployed site root, e.g. https://user.github.io/repo/ */
  baseUrl: string;
  /** Route paths relative to the base, e.g. "design/". */
  routes: readonly string[];
  expectedSha: string;
  fetch: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Polls of build-info.json before giving up (default 30). */
  attempts?: number;
  /** Delay between polls in ms (default 10 s). */
  delayMs?: number;
}

export type AssetKind = 'css' | 'js' | 'font';

export interface LiveCheck {
  url: string;
  kind: 'build-info' | 'route' | AssetKind;
  status: number;
  ok: boolean;
  note?: string;
}

export interface LiveReport {
  ok: boolean;
  deployedSha: string | null;
  checks: LiveCheck[];
  errors: string[];
}

const FONT_RE = /\.(woff2?|ttf|otf)(\?|#|$)/i;

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function resolveSameOrigin(ref: string, from: string): string | null {
  if (ref.startsWith('data:')) return null;
  try {
    const url = new URL(ref, from);
    return url.origin === new URL(from).origin ? (url.href.split('#')[0] ?? url.href) : null;
  } catch {
    return null;
  }
}

/** Same-origin CSS, JS and font URLs referenced by an HTML page (links, scripts, inline @font-face). */
export function extractHtmlAssets(html: string, pageUrl: string): Map<string, AssetKind> {
  const assets = new Map<string, AssetKind>();
  const add = (ref: string | null, kind: AssetKind): void => {
    if (!ref) return;
    const url = resolveSameOrigin(ref, pageUrl);
    if (url) assets.set(url, kind);
  };
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const href = attr(tag, 'href');
    if (rel.includes('stylesheet')) add(href, 'css');
    else if (rel.includes('modulepreload')) add(href, 'js');
    else if (rel.includes('preload')) {
      const as = (attr(tag, 'as') ?? '').toLowerCase();
      if (as === 'font') add(href, 'font');
      else if (as === 'style') add(href, 'css');
      else if (as === 'script') add(href, 'js');
    }
  }
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) add(attr(tag, 'src'), 'js');
  for (const [, block = ''] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const url of extractCssUrls(block, pageUrl)) assets.set(url, 'font');
  }
  return assets;
}

/** Same-origin font URLs referenced from CSS via url(...). */
export function extractCssUrls(css: string, cssUrl: string): string[] {
  const urls: string[] = [];
  for (const [, , raw = ''] of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
    if (!FONT_RE.test(raw)) continue;
    const url = resolveSameOrigin(raw.trim(), cssUrl);
    if (url) urls.push(url);
  }
  return urls;
}

/** Relative ES module imports inside a JS chunk (Astro emits `from"./x.js"` / `import("./y.js")`). */
export function extractJsImports(js: string, jsUrl: string): string[] {
  const urls: string[] = [];
  for (const [, ref = ''] of js.matchAll(
    /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+\.m?js)["']/g,
  )) {
    const url = resolveSameOrigin(ref, jsUrl);
    if (url) urls.push(url);
  }
  return urls;
}

/** GET that never throws: network errors become status 0. */
async function get(
  fetchImpl: FetchLike,
  url: string,
  readBody: boolean,
): Promise<{ status: number; body: string }> {
  try {
    const res = await fetchImpl(url);
    const body = res.status === 200 && readBody ? await res.text() : '';
    return { status: res.status, body };
  } catch {
    return { status: 0, body: '' };
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function runLiveCheck(options: LiveCheckOptions): Promise<LiveReport> {
  const base = withSlash(options.baseUrl);
  const sleep = options.sleep ?? defaultSleep;
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 10_000;
  const expected = options.expectedSha.toLowerCase();
  const bust = `v=${expected.slice(0, 12)}`;
  const checks: LiveCheck[] = [];
  const errors: string[] = [];

  // 1. Deployed commit.
  let deployedSha: string | null = null;
  let infoStatus = 0;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await options.fetch(`${base}build-info.json?${bust}-${i}`);
      infoStatus = res.status;
      if (res.status === 200) {
        const info: unknown = JSON.parse(await res.text());
        const sha = typeof info === 'object' && info !== null && 'sha' in info ? info.sha : null;
        deployedSha = typeof sha === 'string' ? sha.toLowerCase() : null;
        if (deployedSha === expected) break;
      }
    } catch {
      infoStatus = 0;
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  const shaOk = deployedSha === expected;
  checks.push({
    url: `${base}build-info.json`,
    kind: 'build-info',
    status: infoStatus,
    ok: shaOk,
    note: deployedSha ?? 'missing',
  });
  if (!shaOk) {
    errors.push(`Deployed commit is ${deployedSha ?? 'unknown'}, expected ${expected}.`);
    return { ok: false, deployedSha, checks, errors };
  }

  // 2. Routes.
  const assets = new Map<string, AssetKind>();
  for (const route of options.routes) {
    const url = new URL(route.replace(/^\//, ''), base).href;
    const { status, body: html } = await get(options.fetch, `${url}?${bust}`, true);
    const ok = status === 200 && /<html[\s>]/i.test(html);
    checks.push({ url, kind: 'route', status, ok });
    if (!ok)
      errors.push(
        `${url} answered ${status || 'no response'}${status === 200 ? ' without HTML' : ''}.`,
      );
    for (const [asset, kind] of extractHtmlAssets(html, url)) assets.set(asset, kind);
  }

  // 3. Assets (stylesheets and scripts may reference more fonts / chunks).
  const queue = [...assets.entries()];
  const seen = new Set(assets.keys());
  for (let item = queue.shift(); item; item = queue.shift()) {
    const [url, kind] = item;
    const { status, body } = await get(options.fetch, url, kind !== 'font');
    const ok = status === 200;
    checks.push({ url, kind, status, ok });
    if (!ok) errors.push(`${kind.toUpperCase()} ${url} answered ${status || 'no response'}.`);
    const nested: [string, AssetKind][] =
      kind === 'css'
        ? extractCssUrls(body, url).map((u) => [u, 'font'])
        : kind === 'js'
          ? extractJsImports(body, url).map((u) => [u, 'js'])
          : [];
    for (const entry of nested) {
      if (!seen.has(entry[0])) {
        seen.add(entry[0]);
        queue.push(entry);
      }
    }
  }

  for (const kind of ['css', 'js', 'font'] as const) {
    if (!checks.some((c) => c.kind === kind))
      errors.push(`No ${kind.toUpperCase()} assets found on the live pages.`);
  }
  return { ok: errors.length === 0, deployedSha, checks, errors };
}

export function formatLiveReport(report: LiveReport, siteUrl: string): string {
  const count = (kind: LiveCheck['kind']): string => {
    const all = report.checks.filter((c) => c.kind === kind);
    return `${all.filter((c) => c.ok).length}/${all.length}`;
  };
  const lines = [
    `## Live smoke: ${report.ok ? '✅ passed' : '❌ FAILED'}`,
    '',
    `- Site: ${siteUrl}`,
    `- Deployed commit: \`${report.deployedSha ?? 'unknown'}\``,
    `- Routes 200: ${count('route')} · CSS: ${count('css')} · JS: ${count('js')} · fonts: ${count('font')}`,
  ];
  if (report.errors.length > 0) lines.push('', '### Errors', ...report.errors.map((e) => `- ${e}`));
  return lines.join('\n');
}
