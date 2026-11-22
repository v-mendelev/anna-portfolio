import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { demos } from './demos';

const designPagesDir = fileURLToPath(new URL('../pages/design/', import.meta.url));

describe('demo registry', () => {
  it('has unique, URL-safe slugs', () => {
    const slugs = demos.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('has non-empty titles and summaries', () => {
    for (const demo of demos) {
      expect(demo.title.trim()).not.toBe('');
      expect(demo.summary.trim()).not.toBe('');
    }
  });

  it('has a page for every registered demo', () => {
    for (const { slug } of demos) {
      expect(existsSync(`${designPagesDir}${slug}/index.astro`), `missing page for ${slug}`).toBe(
        true,
      );
    }
  });

  it('has no unregistered demo page directories', () => {
    const dirs = readdirSync(designPagesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(dirs).toEqual(demos.map((d) => d.slug).sort());
  });
});
