/**
 * Integration contracts (frontend side).
 *
 * The site is static. Anything that needs secrets (Telegram bot token,
 * CRM API keys) MUST live in a backend, never in the browser bundle.
 * The frontend only talks to one HTTP endpoint (PUBLIC_API_BASE_URL);
 * the backend fans out to Telegram / CRM / e-mail. See ARCHITECTURE.md.
 */

/** Data collected by the feedback / lead form. */
export interface LeadInput {
  name: string;
  /** Phone, e-mail or messenger handle. */
  contact: string;
  message?: string;
  /** Which page/form produced the lead (for analytics, not PII). */
  source: string;
  /** Explicit consent to personal data processing (152-FZ / GDPR). */
  consent: boolean;
  /** Honeypot field: must stay empty; bots tend to fill it. */
  website?: string;
}

export type LeadField = 'name' | 'contact' | 'message' | 'source' | 'consent';

export type LeadValidation =
  | { ok: true; data: Omit<LeadInput, 'website'> }
  | { ok: false; errors: Partial<Record<LeadField, string>> };

export type SubmitErrorCode = 'disabled' | 'validation' | 'spam' | 'network' | 'timeout' | 'server';

export type SubmitResult =
  | { ok: true; id?: string }
  | { ok: false; code: SubmitErrorCode; fieldErrors?: Partial<Record<LeadField, string>> };

/** Anything that can accept a validated lead (HTTP API today, others later). */
export interface LeadChannel {
  readonly name: string;
  send(lead: Omit<LeadInput, 'website'>): Promise<SubmitResult>;
}
