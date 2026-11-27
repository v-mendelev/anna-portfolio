/**
 * Where portfolio media (posters, video previews) are served from.
 *
 * Content refers to media by a storage key relative to the media root, e.g.
 * "work/fashion/preview.mp4" — the same key an object would have in an
 * S3 bucket. The root is:
 *  - `PUBLIC_MEDIA_BASE_URL` when set (future Timeweb S3 / CDN, e.g.
 *    "https://cdn.example.ru/portfolio/"), or
 *  - "<site base>/media/" — files committed in `public/media/` (demo).
 *
 * Switching hosting is one environment variable; content keys never change.
 */

/** Builds the URL of a media key. Absolute URLs pass through untouched. */
export function mediaUrl(key: string, root: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(key) || key.startsWith('//')) return key;
  const cleanRoot = root.replace(/\/+$/, '');
  const cleanKey = key.replace(/^\/+/, '');
  return `${cleanRoot}/${cleanKey}`;
}

/** Media root for this build (CDN when configured, otherwise `public/media/`). */
export function mediaRoot(cdnBase: string | undefined, siteBase: string): string {
  const cdn = cdnBase?.trim();
  if (cdn) return cdn;
  return `${siteBase.replace(/\/+$/, '')}/media`;
}

/** URL of a media key for the current build. */
export function media(key: string): string {
  return mediaUrl(key, mediaRoot(import.meta.env.PUBLIC_MEDIA_BASE_URL, import.meta.env.BASE_URL));
}
