/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Backend API base URL for forms (Backend API / Telegram / CRM via backend). */
  readonly PUBLIC_API_BASE_URL?: string;
  /** "true" only for the real production site; demos and staging stay noindex. */
  readonly PUBLIC_SITE_INDEXABLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
