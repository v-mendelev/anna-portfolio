/**
 * Base-path-safe URL helpers.
 *
 * Never hardcode "/some/page/" in markup: on GitHub Pages the site lives under
 * "/<repo>/". Always build internal URLs with `withBase()`.
 */

/** Joins a base path and an internal path, keeping trailing-slash style. */
export function joinBase(base: string, path = '/'): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//') || path.startsWith('#')) {
    // Absolute URL, protocol-relative URL or in-page anchor: leave untouched.
    return path;
  }
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}

/** Internal URL for the current build (uses Astro's configured `base`). */
export function withBase(path = '/'): string {
  return joinBase(import.meta.env.BASE_URL, path);
}

/** Strips the base prefix from a pathname, returning a "/"-rooted route. */
export function stripBase(base: string, pathname: string): string {
  const cleanBase = base.replace(/\/+$/, '');
  if (cleanBase && pathname.startsWith(cleanBase)) {
    const rest = pathname.slice(cleanBase.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}
