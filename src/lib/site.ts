import type { DeployDefaults } from './deploy/resolve';

/**
 * Contract between the reusable starter and a concrete project.
 * Everything project-specific (texts, names, URLs) lives in `src/site/`
 * and must satisfy these types.
 */
export interface SiteConfig {
  /** Public site name: <title> suffix of inner pages and og:site_name. */
  name: string;
  /** Full <title> of the home page. Defaults to `name`. */
  homeTitle?: string;
  /** Default meta description. */
  description: string;
  /** BCP 47 language tag for <html lang>. */
  lang: string;
  /** Open Graph locale, e.g. ru_RU. */
  locale: string;
  /** Social preview image in /public (Open Graph / Twitter card). */
  ogImage?: { path: string; width: number; height: number; alt: string };
  /** Browser UI colour (mobile address bar). */
  themeColor?: string;
  /** Per-host public URLs used when env vars are not provided. */
  deploy: DeployDefaults;
}

export function defineSiteConfig(config: SiteConfig): SiteConfig {
  return config;
}
