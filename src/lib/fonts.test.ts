import { describe, expect, it } from 'vitest';
import { SUBSET_RANGES, fallbackFamily, fontFaceCss, fontStack } from './fonts';

const face = {
  family: 'Test Variable',
  style: 'normal' as const,
  weight: '300 700',
  files: { cyrillic: '/_astro/test-cyrillic.woff2', latin: '/_astro/test-latin.woff2' },
};

describe('fontFaceCss', () => {
  const css = fontFaceCss(
    [face],
    [
      {
        for: 'Test Variable',
        local: ['Arial', 'Liberation Sans'],
        sizeAdjust: '105%',
        ascentOverride: '90%',
        descentOverride: '22%',
        lineGapOverride: '0%',
      },
    ],
  );

  it('emits one WOFF2 face per subset with swap and its unicode-range', () => {
    const faces = css.split('\n').filter((rule) => rule.includes("'Test Variable'"));
    expect(faces).toHaveLength(2);
    for (const rule of faces) {
      expect(rule).toContain('font-display:swap');
      expect(rule).toContain("format('woff2')");
      expect(rule).toContain('font-weight:300 700');
    }
    expect(faces[0]).toContain(`unicode-range:${SUBSET_RANGES.cyrillic}`);
    expect(faces[1]).toContain(`unicode-range:${SUBSET_RANGES.latin}`);
  });

  it('skips subsets that have no file', () => {
    const only = fontFaceCss([{ ...face, files: { cyrillic: '/c.woff2' } }]);
    expect(only.split('\n')).toHaveLength(1);
    expect(only).not.toContain(SUBSET_RANGES.latin);
  });

  it('declares a metric-matched local fallback', () => {
    expect(css).toContain(`font-family:'${fallbackFamily('Test Variable')}'`);
    expect(css).toContain('src:local("Arial"),local("Liberation Sans")');
    expect(css).toContain('size-adjust:105%');
    expect(css).toContain('ascent-override:90%');
    expect(css).toContain('descent-override:22%');
    expect(css).toContain('line-gap-override:0%');
  });

  it('supports separate fallbacks per weight range', () => {
    const fb = {
      for: 'Test Variable',
      sizeAdjust: '100%',
      ascentOverride: '90%',
      descentOverride: '20%',
      lineGapOverride: '0%',
    };
    const two = fontFaceCss(
      [],
      [
        { ...fb, local: ['Arial'], weight: '100 799' },
        { ...fb, local: ['Arial Bold'], weight: '800 1000', sizeAdjust: '117%' },
      ],
    ).split('\n');
    expect(two).toHaveLength(2);
    expect(two[0]).toContain('font-weight:100 799');
    expect(two[1]).toContain('font-weight:800 1000');
    expect(two[1]).toContain('src:local("Arial Bold")');
    expect(two[1]).toContain('size-adjust:117%');
  });

  it('marks italic fallbacks so the browser does not synthesise a slant', () => {
    const italic = fontFaceCss(
      [],
      [
        {
          for: 'Test Variable',
          local: ['Times New Roman Italic'],
          style: 'italic',
          sizeAdjust: '88%',
          ascentOverride: '100%',
          descentOverride: '30%',
          lineGapOverride: '0%',
        },
      ],
    );
    expect(italic).toContain('font-style:italic');
    expect(italic).toContain('local("Times New Roman Italic")');
  });

  it('never references extended or unrelated subsets', () => {
    expect(Object.keys(SUBSET_RANGES)).toEqual(['cyrillic', 'latin']);
  });
});

describe('fontStack', () => {
  it('puts the web font, then its fallback, then the generic family', () => {
    expect(fontStack('Test Variable', 'serif')).toBe(
      "'Test Variable', 'Test Variable Fallback', serif",
    );
  });
});
