import type { DeployDefaults } from './deploy/resolve';

/**
 * Contract between the reusable starter and a concrete project.
 * Everything project-specific (texts, names, URLs) lives in `src/site/`
 * and must satisfy these types.
 */
export interface SiteConfig {
  /** Public site name, used in <title> and headers. */
  name: string;
  /** Default meta description. */
  description: string;
  /** BCP 47 language tag for <html lang>. */
  lang: string;
  /** Open Graph locale, e.g. ru_RU. */
  locale: string;
  /** Per-host public URLs used when env vars are not provided. */
  deploy: DeployDefaults;
}

export interface DemoVariant {
  /** URL slug under /design/, must match the page directory name. */
  slug: string;
  title: string;
  summary: string;
}

export function defineSiteConfig(config: SiteConfig): SiteConfig {
  return config;
}

export function defineDemos<const T extends readonly DemoVariant[]>(demos: T): T {
  return demos;
}
