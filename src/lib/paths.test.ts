import { describe, expect, it } from 'vitest';
import { joinBase, stripBase } from './paths';

describe('joinBase', () => {
  it.each([
    ['/', '/', '/'],
    ['/', '/design/', '/design/'],
    ['/', 'design/', '/design/'],
    ['/repo', '/design/', '/repo/design/'],
    ['/repo/', '/design/', '/repo/design/'],
    ['/repo/', 'favicon.svg', '/repo/favicon.svg'],
    ['/repo', '/', '/repo/'],
  ])('joinBase(%j, %j) -> %j', (base, path, expected) => {
    expect(joinBase(base, path)).toBe(expected);
  });

  it.each([
    'https://example.com/x',
    'mailto:hi@example.com',
    'tel:+70000000000',
    '//cdn.example/x',
    '#top',
  ])('leaves %j untouched', (url) => {
    expect(joinBase('/repo/', url)).toBe(url);
  });
});

describe('stripBase', () => {
  it('removes the base prefix', () => {
    expect(stripBase('/repo/', '/repo/design/')).toBe('/design/');
    expect(stripBase('/repo', '/repo')).toBe('/');
  });

  it('is a no-op for root base', () => {
    expect(stripBase('/', '/design/')).toBe('/design/');
  });
});
