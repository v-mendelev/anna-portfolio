/**
 * Self-hosted web font declarations (generic, reusable).
 *
 * Rules enforced here:
 *  - WOFF2 only, `font-display: swap`;
 *  - only the subsets a Russian-language site needs: Cyrillic, plus basic
 *    Latin (digits, punctuation, « » — and the odd Latin word). Each subset
 *    is a separate file gated by unicode-range, so the browser downloads a
 *    file only if the page actually renders characters from it;
 *  - every family gets a local fallback with metric overrides, so text does
 *    not move when the web font swaps in (no layout shift).
 */

/** Unicode ranges as published by Fontsource (Google Fonts subsets). */
export const SUBSET_RANGES = {
  cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
} as const;

export type Subset = keyof typeof SUBSET_RANGES;

export interface WebFontFace {
  family: string;
  style: 'normal' | 'italic';
  /** Variable weight range, e.g. "300 700". */
  weight: string;
  /** Built asset URL of the WOFF2 file for each subset. */
  files: Partial<Record<Subset, string>>;
}

export interface FallbackFace {
  /** Family name of the web font this fallback stands in for. */
  for: string;
  /** Installed fonts to try, in order (metrics below were computed for the first). */
  local: readonly string[];
  /**
   * Weight range this fallback covers. Lets one family have separate fallback
   * faces for light and heavy weights, whose widths differ (e.g. "800 1000"
   * with local bold fonts).
   */
  weight?: string;
  /**
   * Set "italic" when `local` lists true italic faces: the browser then uses
   * them as-is instead of slanting a roman (which is wider than an italic).
   */
  style?: 'italic';
  sizeAdjust: string;
  ascentOverride: string;
  descentOverride: string;
  lineGapOverride: string;
}

/** Everything one page needs: faces, their fallbacks and files to preload. */
export interface FontSet {
  faces: readonly WebFontFace[];
  fallbacks: readonly FallbackFace[];
  preload: readonly string[];
}

export const SERIF_FALLBACKS = [
  'Times New Roman',
  'Liberation Serif',
  'Tinos',
  'Noto Serif',
] as const;
export const SANS_FALLBACKS = ['Arial', 'Liberation Sans', 'Arimo', 'Helvetica', 'Roboto'] as const;

export function fallbackFamily(family: string): string {
  return `${family} Fallback`;
}

/** CSS font-family value: web font, its metric-matched fallback, generic family. */
export function fontStack(family: string, generic: 'serif' | 'sans-serif'): string {
  return `'${family}', '${fallbackFamily(family)}', ${generic}`;
}

export function fontFaceCss(
  faces: readonly WebFontFace[],
  fallbacks: readonly FallbackFace[] = [],
): string {
  const rules: string[] = [];
  for (const face of faces) {
    for (const subset of Object.keys(SUBSET_RANGES) as Subset[]) {
      const url = face.files[subset];
      if (!url) continue;
      rules.push(
        `@font-face{font-family:'${face.family}';font-style:${face.style};font-weight:${face.weight};` +
          `font-display:swap;src:url(${JSON.stringify(url)}) format('woff2');` +
          `unicode-range:${SUBSET_RANGES[subset]}}`,
      );
    }
  }
  for (const fb of fallbacks) {
    const src = fb.local.map((name) => `local(${JSON.stringify(name)})`).join(',');
    rules.push(
      `@font-face{font-family:'${fallbackFamily(fb.for)}';src:${src};` +
        (fb.weight ? `font-weight:${fb.weight};` : '') +
        (fb.style ? `font-style:${fb.style};` : '') +
        `size-adjust:${fb.sizeAdjust};ascent-override:${fb.ascentOverride};` +
        `descent-override:${fb.descentOverride};line-gap-override:${fb.lineGapOverride}}`,
    );
  }
  return rules.join('\n');
}
