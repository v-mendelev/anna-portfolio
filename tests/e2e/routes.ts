/** Single source of truth for E2E route coverage. Paths are relative to the site base. */
export interface RouteSpec {
  path: string;
  name: string;
  h1: RegExp;
}

/**
 * Pages of the site. Also read by the live smoke check after a GitHub Pages
 * deploy (scripts/delivery/run.ts): every route must answer 200 with HTML.
 */
export const ROUTES: readonly RouteSpec[] = [{ path: '', name: 'home', h1: /Шеленкова/ }];

/** Home page sections, in order (anchors used by the header and the menu). */
export const SITE_SECTIONS = ['top', 'showreel', 'work', 'services', 'about', 'contact'] as const;

/** Self-hosted typefaces the site must actually load. */
export const SITE_FONTS = ['Onest Variable'] as const;

/** Required responsive breakpoints (CSS px). */
export const VIEWPORT_WIDTHS = [320, 360, 375, 390, 393, 414, 430, 768, 1024, 1440, 1920] as const;

export function viewportFor(width: number): { width: number; height: number } {
  if (width < 768) return { width, height: 800 };
  if (width < 1440) return { width, height: 1024 };
  return { width, height: 1080 };
}
