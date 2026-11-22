/** Single source of truth for E2E route coverage. Paths are relative to the site base. */
export interface RouteSpec {
  path: string;
  name: string;
  h1: RegExp;
}

export const ROUTES: readonly RouteSpec[] = [
  { path: 'design/', name: 'design chooser', h1: /демоверсию/i },
  { path: 'design/cinematic/', name: 'cinematic demo', h1: /cinematic/i },
  { path: 'design/editorial/', name: 'editorial demo', h1: /editorial/i },
  { path: 'design/creative/', name: 'creative demo', h1: /creative/i },
];

export const DEMO_SLUGS = ['cinematic', 'editorial', 'creative'] as const;

/** Required responsive breakpoints (CSS px). */
export const VIEWPORT_WIDTHS = [320, 360, 375, 390, 393, 414, 430, 768, 1024, 1440, 1920] as const;

export function viewportFor(width: number): { width: number; height: number } {
  if (width < 768) return { width, height: 800 };
  if (width < 1440) return { width, height: 1024 };
  return { width, height: 1080 };
}
