import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEGACY_CONCEPTS, LEGACY_PATHS, LEGACY_TARGET } from './redirects';

const pages = fileURLToPath(new URL('../pages/', import.meta.url));

describe('legacy redirects', () => {
  it('covers the chooser and the three concept URLs that were shared', () => {
    expect(LEGACY_PATHS).toEqual([
      'design/',
      'design/cinematic/',
      'design/editorial/',
      'design/creative/',
    ]);
  });

  it('sends every legacy URL to the home page', () => {
    expect(LEGACY_TARGET).toBe('/');
  });

  it('has a page that builds each legacy URL', () => {
    expect(existsSync(`${pages}design/index.astro`)).toBe(true);
    expect(existsSync(`${pages}design/[concept]/index.astro`)).toBe(true);
    expect(LEGACY_CONCEPTS).toHaveLength(3);
  });
});
