/**
 * Which fonts the site loads. Project-specific; generic logic is in lib/fonts.ts.
 *
 * One family: Onest (OFL-1.1, wght 100–900), self-hosted WOFF2, Cyrillic +
 * basic Latin only (ё, й, ъ verified in the Cyrillic file). It sets both the
 * display type and the text of the KADR design.
 * One preload: the Cyrillic file, which sets the h1.
 * Fallback metrics: see the note above `fallbacks`.
 */
import onestCyr from '@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2?url';
import onestLat from '@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url';
import { SANS_FALLBACKS, type FallbackFace, type FontSet, type WebFontFace } from '../lib/fonts';

const faces = {
  onest: {
    family: 'Onest Variable',
    style: 'normal',
    weight: '100 900',
    files: { cyrillic: onestCyr, latin: onestLat },
  },
} satisfies Record<string, WebFontFace>;

const SANS_BOLD = [
  'Arial Bold',
  'Arial-BoldMT',
  'Liberation Sans Bold',
  'Arimo Bold',
  'Roboto Bold',
];

/*
 * size-adjust is calibrated in the browser at the weights (and widths) each
 * family is actually set in: width of Russian sample text, web font vs.
 * fallback. ascent/descent are the web font's hhea metrics divided by
 * size-adjust. Families set in very different weights or widths get one
 * fallback per range; a fallback cannot condense, so condensed ranges use a
 * smaller size-adjust (line boxes keep their height thanks to explicit
 * line-heights, and lines keep their breaks).
 */
const fallbacks = {
  onest: [
    {
      // Regular text (400). Windows (fractional advances, Arial) and
      // Linux CI (whole-pixel advances, Liberation Sans) differ by ~3.7% here;
      // size-adjust sits midway: fallback/web width 0.982 (Win) / 1.018 (Linux).
      for: 'Onest Variable',
      local: SANS_FALLBACKS,
      weight: '100 449',
      sizeAdjust: '101.29%',
      ascentOverride: '95.77%',
      descentOverride: '30.12%',
      lineGapOverride: '0%',
    },
    {
      // Medium text (body, 500): midway again, 0.986 (Win) / 1.015 (Linux).
      for: 'Onest Variable',
      local: SANS_FALLBACKS,
      weight: '450 549',
      sizeAdjust: '102.95%',
      ascentOverride: '94.22%',
      descentOverride: '29.63%',
      lineGapOverride: '0%',
    },
    {
      // Semibold/bold text: Arial Bold is closer to Onest 600–700 than Arial.
      for: 'Onest Variable',
      local: SANS_BOLD,
      weight: '550 749',
      sizeAdjust: '97.5%',
      ascentOverride: '99.49%',
      descentOverride: '31.28%',
      lineGapOverride: '0%',
    },
    {
      for: 'Onest Variable',
      local: SANS_BOLD,
      weight: '750 1000',
      sizeAdjust: '101.06%',
      ascentOverride: '95.98%',
      descentOverride: '30.18%',
      lineGapOverride: '0%',
    },
  ],
} satisfies Record<string, FallbackFace[]>;

export const fontSets = {
  /** Every page of the site (home, 404, legacy redirects). */
  site: {
    faces: [faces.onest],
    fallbacks: fallbacks.onest,
    preload: [onestCyr],
  },
} satisfies Record<string, FontSet>;
