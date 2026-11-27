/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Backend API base URL for forms (Backend API / Telegram / CRM via backend). */
  readonly PUBLIC_API_BASE_URL?: string;
  /** "true" only for the real production site; demos and staging stay noindex. */
  readonly PUBLIC_SITE_INDEXABLE?: string;
  /**
   * Root URL of portfolio media on a CDN / S3 bucket (future Timeweb hosting).
   * Empty = files from public/media/ (src/lib/media.ts).
   */
  readonly PUBLIC_MEDIA_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
