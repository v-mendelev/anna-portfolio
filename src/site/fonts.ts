/**
 * Which fonts each page loads. Project-specific; generic logic is in lib/fonts.ts.
 *
 * Families (all OFL-1.1, self-hosted WOFF2, Cyrillic + basic Latin only;
 * ё, й, ъ verified in every Cyrillic file):
 *  - Onest (wght 100–900): KADR display and text, SKLEYKA text;
 *  - Alumni Sans (wght 100–900): SKLEYKA condensed display;
 *  - Noto Sans Display (wght 100–900, wdth 62.5–100): RAPID, the only family on
 *    that page; width is set with font-stretch (62.5%–100%).
 * One preload per page: the Cyrillic file of the face that sets the h1.
 * Fallback metrics: see the note above `fallbacks`.
 */
import alumniCyr from '@fontsource-variable/alumni-sans/files/alumni-sans-cyrillic-wght-normal.woff2?url';
import alumniLat from '@fontsource-variable/alumni-sans/files/alumni-sans-latin-wght-normal.woff2?url';
import onestCyr from '@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2?url';
import notoDisplayCyr from '@fontsource-variable/noto-sans-display/files/noto-sans-display-cyrillic-wdth-normal.woff2?url';
import notoDisplayLat from '@fontsource-variable/noto-sans-display/files/noto-sans-display-latin-wdth-normal.woff2?url';
import onestLat from '@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url';
import { SANS_FALLBACKS, type FallbackFace, type FontSet, type WebFontFace } from '../lib/fonts';

const faces = {
  onest: {
    family: 'Onest Variable',
    style: 'normal',
    weight: '100 900',
    files: { cyrillic: onestCyr, latin: onestLat },
  },
  alumni: {
    family: 'Alumni Sans Variable',
    style: 'normal',
    weight: '100 900',
    files: { cyrillic: alumniCyr, latin: alumniLat },
  },
  notoDisplay: {
    family: 'Noto Sans Display Variable',
    style: 'normal',
    weight: '100 900',
    stretch: '62.5% 100%',
    files: { cyrillic: notoDisplayCyr, latin: notoDisplayLat },
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
      for: 'Onest Variable',
      local: SANS_FALLBACKS,
      weight: '100 549',
      sizeAdjust: '104.54%',
      ascentOverride: '92.79%',
      descentOverride: '29.18%',
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
  alumni: [
    {
      for: 'Alumni Sans Variable',
      local: SANS_BOLD,
      sizeAdjust: '58.2%',
      ascentOverride: '154.64%',
      descentOverride: '51.55%',
      lineGapOverride: '0%',
    },
  ],
  notoDisplay: [
    {
      for: 'Noto Sans Display Variable',
      local: SANS_FALLBACKS,
      weight: '100 649',
      sizeAdjust: '102.45%',
      ascentOverride: '104.34%',
      descentOverride: '28.6%',
      lineGapOverride: '0%',
    },
    {
      for: 'Noto Sans Display Variable',
      local: SANS_BOLD,
      weight: '650 1000',
      sizeAdjust: '100.45%',
      ascentOverride: '106.42%',
      descentOverride: '29.17%',
      lineGapOverride: '0%',
    },
    {
      // Text set condensed (font-stretch 62.5–75%, font-family var(--font-rp-condensed)).
      for: 'Noto Sans Display Variable',
      variant: 'Condensed',
      local: SANS_BOLD,
      sizeAdjust: '79.5%',
      ascentOverride: '134.47%',
      descentOverride: '36.86%',
      lineGapOverride: '0%',
    },
  ],
} satisfies Record<string, FallbackFace[]>;

export const fontSets = {
  /** KADR — /design/cinematic/ */
  cinematic: {
    faces: [faces.onest],
    fallbacks: fallbacks.onest,
    preload: [onestCyr],
  },
  /** SKLEYKA — /design/editorial/ */
  editorial: {
    faces: [faces.alumni, faces.onest],
    fallbacks: [...fallbacks.alumni, ...fallbacks.onest],
    preload: [alumniCyr],
  },
  /** RAPID — /design/creative/ */
  creative: {
    faces: [faces.notoDisplay],
    fallbacks: fallbacks.notoDisplay,
    preload: [notoDisplayCyr],
  },
  /** Chooser previews each concept's display face on its Cyrillic name only. */
  chooser: {
    faces: [faces.onest, faces.alumni, faces.notoDisplay],
    fallbacks: [...fallbacks.onest, ...fallbacks.alumni, ...fallbacks.notoDisplay],
    preload: [],
  },
} satisfies Record<string, FontSet>;
