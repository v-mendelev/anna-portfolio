/**
 * Feature flags derived from public build-time env variables.
 * Only PUBLIC_* variables are exposed to the browser — never put secrets here.
 */
export const env = {
  apiBaseUrl: import.meta.env.PUBLIC_API_BASE_URL || undefined,
  indexable: import.meta.env.PUBLIC_SITE_INDEXABLE === 'true',
} as const;

export const features = {
  /** Lead/feedback form: enabled only when a backend URL is configured. */
  leadForm: Boolean(env.apiBaseUrl),
} as const;
