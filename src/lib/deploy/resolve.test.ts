import { describe, expect, it } from 'vitest';
import { normalizeBase, resolveDeployConfig, splitPublicUrl } from './resolve';

describe('normalizeBase', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['///', '/'],
    ['repo', '/repo'],
    ['/repo/', '/repo'],
    ['  /a/b/  ', '/a/b'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeBase(input)).toBe(expected);
  });
});

describe('splitPublicUrl', () => {
  it('splits a GitHub Pages project URL', () => {
    expect(splitPublicUrl('https://user.github.io/my-repo/')).toEqual({
      site: 'https://user.github.io',
      base: '/my-repo',
    });
  });

  it('handles a root domain', () => {
    expect(splitPublicUrl('https://example.ru')).toEqual({ site: 'https://example.ru', base: '/' });
  });
});

describe('resolveDeployConfig', () => {
  const defaults = {
    githubPagesUrl: 'https://user.github.io/my-repo/',
    timewebUrl: 'https://example.ru/',
  };

  it('defaults to local target with root base', () => {
    expect(resolveDeployConfig({}, defaults)).toEqual({
      target: 'local',
      site: 'http://localhost:4321',
      base: '/',
    });
  });

  it('uses project defaults for github-pages', () => {
    expect(resolveDeployConfig({ DEPLOY_TARGET: 'github-pages' }, defaults)).toEqual({
      target: 'github-pages',
      site: 'https://user.github.io',
      base: '/my-repo',
    });
  });

  it('uses project defaults for timeweb', () => {
    expect(resolveDeployConfig({ DEPLOY_TARGET: 'timeweb' }, defaults)).toEqual({
      target: 'timeweb',
      site: 'https://example.ru',
      base: '/',
    });
  });

  it('lets env override site and base (CI values from configure-pages)', () => {
    expect(
      resolveDeployConfig(
        { DEPLOY_TARGET: 'github-pages', SITE_URL: 'https://other.github.io', BASE_PATH: '/fork' },
        defaults,
      ),
    ).toEqual({ target: 'github-pages', site: 'https://other.github.io', base: '/fork' });
  });

  it('treats empty BASE_PATH as root (user/org pages or custom domain)', () => {
    expect(
      resolveDeployConfig({ DEPLOY_TARGET: 'github-pages', BASE_PATH: '' }, defaults).base,
    ).toBe('/');
  });

  it('allows a non-root base for local builds (used by E2E base-path checks)', () => {
    expect(resolveDeployConfig({ BASE_PATH: '/base-path-check' }).base).toBe('/base-path-check');
  });

  it('rejects unknown targets', () => {
    expect(() => resolveDeployConfig({ DEPLOY_TARGET: 'heroku' })).toThrow(/Unknown DEPLOY_TARGET/);
  });

  it('rejects malformed SITE_URL', () => {
    expect(() => resolveDeployConfig({ SITE_URL: 'not a url' })).toThrow();
  });
});
