/**
 * Which fonts each page loads. Project-specific; generic logic is in lib/fonts.ts.
 *
 * Payload decisions:
 *  - only the styles a page uses (Cinematic: Cormorant italic only; Editorial:
 *    Literata roman with the weight axis, not the 2x heavier optical-size axis);
 *  - only Cyrillic + basic Latin subsets;
 *  - one preload per page: the Cyrillic file of the face that sets the h1.
 * Fallback metrics: see the note above `fallbacks`.
 */
import commissionerCyr from '@fontsource-variable/commissioner/files/commissioner-cyrillic-wght-normal.woff2?url';
import commissionerLat from '@fontsource-variable/commissioner/files/commissioner-latin-wght-normal.woff2?url';
import cormorantItCyr from '@fontsource-variable/cormorant/files/cormorant-cyrillic-wght-italic.woff2?url';
import cormorantItLat from '@fontsource-variable/cormorant/files/cormorant-latin-wght-italic.woff2?url';
import golosCyr from '@fontsource-variable/golos-text/files/golos-text-cyrillic-wght-normal.woff2?url';
import golosLat from '@fontsource-variable/golos-text/files/golos-text-latin-wght-normal.woff2?url';
import literataCyr from '@fontsource-variable/literata/files/literata-cyrillic-wght-normal.woff2?url';
import literataLat from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url';
import unboundedCyr from '@fontsource-variable/unbounded/files/unbounded-cyrillic-wght-normal.woff2?url';
import unboundedLat from '@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2?url';
import {
  SANS_FALLBACKS,
  SERIF_FALLBACKS,
  type FallbackFace,
  type FontSet,
  type WebFontFace,
} from '../lib/fonts';

const faces = {
  cormorantItalic: {
    family: 'Cormorant Variable',
    style: 'italic',
    weight: '300 700',
    files: { cyrillic: cormorantItCyr, latin: cormorantItLat },
  },
  commissioner: {
    family: 'Commissioner Variable',
    style: 'normal',
    weight: '100 900',
    files: { cyrillic: commissionerCyr, latin: commissionerLat },
  },
  literata: {
    family: 'Literata Variable',
    style: 'normal',
    weight: '200 900',
    files: { cyrillic: literataCyr, latin: literataLat },
  },
  golos: {
    family: 'Golos Text Variable',
    style: 'normal',
    weight: '400 900',
    files: { cyrillic: golosCyr, latin: golosLat },
  },
  unbounded: {
    family: 'Unbounded Variable',
    style: 'normal',
    weight: '200 900',
    files: { cyrillic: unboundedCyr, latin: unboundedLat },
  },
} satisfies Record<string, WebFontFace>;

/*
 * size-adjust was calibrated in the browser at the weights each family is
 * actually set in (width of Russian sample text, web font vs. fallback);
 * ascent/descent come from the web font's hhea metrics divided by size-adjust
 * (see scripts/font-fallback-metrics.mjs for the static first pass).
 * Families set in very different weights get one fallback per weight range.
 */
const fallbacks = {
  cormorant: [
    {
      // Only Cormorant italic is loaded, so its fallback is a true italic.
      for: 'Cormorant Variable',
      local: [
        'Times New Roman Italic',
        'TimesNewRomanPS-ItalicMT',
        'Liberation Serif Italic',
        'Tinos Italic',
        'Noto Serif Italic',
      ],
      style: 'italic',
      sizeAdjust: '87.9%',
      ascentOverride: '105.12%',
      descentOverride: '32.66%',
      lineGapOverride: '0%',
    },
  ],
  commissioner: [
    {
      for: 'Commissioner Variable',
      local: SANS_FALLBACKS,
      sizeAdjust: '100.16%',
      ascentOverride: '101.54%',
      descentOverride: '20.56%',
      lineGapOverride: '0%',
    },
  ],
  literata: [
    {
      for: 'Literata Variable',
      local: SERIF_FALLBACKS,
      weight: '100 349',
      sizeAdjust: '114.69%',
      ascentOverride: '102.62%',
      descentOverride: '26.86%',
      lineGapOverride: '0%',
    },
    {
      for: 'Literata Variable',
      local: SERIF_FALLBACKS,
      weight: '350 1000',
      sizeAdjust: '118.41%',
      ascentOverride: '99.4%',
      descentOverride: '26.01%',
      lineGapOverride: '0%',
    },
  ],
  golos: [
    {
      for: 'Golos Text Variable',
      local: SANS_FALLBACKS,
      sizeAdjust: '106.5%',
      ascentOverride: '92.02%',
      descentOverride: '20.66%',
      lineGapOverride: '0%',
    },
  ],
  unbounded: [
    {
      for: 'Unbounded Variable',
      local: SANS_FALLBACKS,
      weight: '100 799',
      sizeAdjust: '128.03%',
      ascentOverride: '77.72%',
      descentOverride: '19.14%',
      lineGapOverride: '0%',
    },
    {
      for: 'Unbounded Variable',
      local: ['Arial Bold', 'Arial-BoldMT', 'Liberation Sans Bold', 'Arimo Bold', 'Roboto Bold'],
      weight: '800 1000',
      sizeAdjust: '116.71%',
      ascentOverride: '85.26%',
      descentOverride: '21%',
      lineGapOverride: '0%',
    },
  ],
} satisfies Record<string, FallbackFace[]>;
export const fontSets = {
  cinematic: {
    faces: [faces.cormorantItalic, faces.commissioner],
    fallbacks: [...fallbacks.cormorant, ...fallbacks.commissioner],
    preload: [cormorantItCyr],
  },
  editorial: {
    faces: [faces.literata, faces.golos],
    fallbacks: [...fallbacks.literata, ...fallbacks.golos],
    preload: [literataCyr],
  },
  creative: {
    faces: [faces.unbounded, faces.golos],
    fallbacks: [...fallbacks.unbounded, ...fallbacks.golos],
    preload: [unboundedCyr],
  },
  /** Chooser previews each concept's display face on a Latin word only. */
  chooser: {
    faces: [faces.cormorantItalic, faces.literata, faces.unbounded],
    fallbacks: [...fallbacks.cormorant, ...fallbacks.literata, ...fallbacks.unbounded],
    preload: [],
  },
} satisfies Record<string, FontSet>;
