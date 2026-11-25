/**
 * Old URLs that were shared with the client while three design concepts
 * existed. Each now redirects to the home page (a static meta refresh, since
 * GitHub Pages has no server redirects). Paths are relative to the site base.
 */
export const LEGACY_CONCEPTS = ['cinematic', 'editorial', 'creative'] as const;

export const LEGACY_PATHS: readonly string[] = [
  'design/',
  ...LEGACY_CONCEPTS.map((slug) => `design/${slug}/`),
];

/** Where every legacy path goes. */
export const LEGACY_TARGET = '/';
