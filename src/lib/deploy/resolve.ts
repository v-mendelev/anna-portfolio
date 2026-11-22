/**
 * Deploy target resolution.
 *
 * The same source tree is built for several hosts. Each host needs its own
 * `site` (absolute origin) and `base` (path prefix). Resolution order:
 *   1. explicit environment variables (SITE_URL, BASE_PATH)
 *   2. per-target defaults supplied by the project (see src/site/site.config.ts)
 *   3. safe local defaults
 *
 * This module is pure (no process/env access) so it can be unit-tested and
 * imported from astro.config.ts.
 */

export const DEPLOY_TARGETS = ['local', 'github-pages', 'timeweb'] as const;
export type DeployTarget = (typeof DEPLOY_TARGETS)[number];

export interface DeployDefaults {
  /** Full public URL of the GitHub Pages site, e.g. https://user.github.io/repo/ */
  githubPagesUrl?: string;
  /** Full public URL of the Timeweb Cloud site, e.g. https://example.ru/ */
  timewebUrl?: string;
}

export interface DeployEnv {
  DEPLOY_TARGET?: string | undefined;
  SITE_URL?: string | undefined;
  BASE_PATH?: string | undefined;
}

export interface DeployConfig {
  target: DeployTarget;
  /** Absolute origin without trailing slash, e.g. https://user.github.io */
  site: string;
  /** Path prefix: "/" or "/repo" (leading slash, no trailing slash). */
  base: string;
}

const LOCAL_SITE = 'http://localhost:4321';

export function isDeployTarget(value: string): value is DeployTarget {
  return (DEPLOY_TARGETS as readonly string[]).includes(value);
}

/** Normalises a base path to "/" or "/segment[/segment]" form. */
export function normalizeBase(input: string | undefined): string {
  if (!input) return '/';
  const trimmed = input.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}`;
}

/** Splits a full URL into origin and normalised base path. */
export function splitPublicUrl(url: string): { site: string; base: string } {
  const parsed = new URL(url);
  return { site: parsed.origin, base: normalizeBase(parsed.pathname) };
}

export function resolveDeployConfig(env: DeployEnv, defaults: DeployDefaults = {}): DeployConfig {
  const rawTarget = (env.DEPLOY_TARGET ?? 'local').trim() || 'local';
  if (!isDeployTarget(rawTarget)) {
    throw new Error(
      `Unknown DEPLOY_TARGET "${rawTarget}". Expected one of: ${DEPLOY_TARGETS.join(', ')}`,
    );
  }
  const target: DeployTarget = rawTarget;

  const targetDefaultUrl =
    target === 'github-pages'
      ? defaults.githubPagesUrl
      : target === 'timeweb'
        ? defaults.timewebUrl
        : undefined;

  const fromDefaults = targetDefaultUrl
    ? splitPublicUrl(targetDefaultUrl)
    : { site: LOCAL_SITE, base: '/' };

  const site = env.SITE_URL?.trim() ? new URL(env.SITE_URL.trim()).origin : fromDefaults.site;
  const base = env.BASE_PATH !== undefined ? normalizeBase(env.BASE_PATH) : fromDefaults.base;

  return { target, site, base };
}
