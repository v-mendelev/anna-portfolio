/** Single source of truth for E2E route coverage. Paths are relative to the site base. */
export interface RouteSpec {
  path: string;
  name: string;
  h1: RegExp;
}

export const ROUTES: readonly RouteSpec[] = [
  { path: 'design/', name: 'design chooser', h1: /демоверсию/i },
  // Each concept is a full portfolio page: its h1 is the videographer's name.
  { path: 'design/cinematic/', name: 'cinematic demo', h1: /Шеленкова/ },
  { path: 'design/editorial/', name: 'editorial demo', h1: /Шеленкова/ },
  { path: 'design/creative/', name: 'creative demo', h1: /Шеленкова/ },
];

export const DEMO_SLUGS = ['cinematic', 'editorial', 'creative'] as const;
export type DemoSlugE2E = (typeof DEMO_SLUGS)[number];

/** Section anchors every concept must render, in this order. */
export const CONCEPT_SECTIONS = [
  'top',
  'showreel',
  'work',
  'services',
  'travel',
  'about',
  'reviews',
  'contact',
] as const;

/** Self-hosted typefaces each concept must actually load. */
export const CONCEPT_FONTS: Record<DemoSlugE2E, readonly string[]> = {
  cinematic: ['Onest Variable'], // KADR
  editorial: ['Alumni Sans Variable', 'Onest Variable'], // SKLEYKA
  creative: ['Noto Sans Display Variable'], // RAPID
};

/** Required responsive breakpoints (CSS px). */
export const VIEWPORT_WIDTHS = [320, 360, 375, 390, 393, 414, 430, 768, 1024, 1440, 1920] as const;

export function viewportFor(width: number): { width: number; height: number } {
  if (width < 768) return { width, height: 800 };
  if (width < 1440) return { width, height: 1024 };
  return { width, height: 1080 };
}
