import type { LeadChannel, LeadInput, SubmitResult } from './types';

export interface HttpChannelOptions {
  /** Backend base URL, e.g. https://api.example.ru */
  baseUrl: string;
  /** Endpoint path relative to baseUrl. */
  path?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Sends leads to the project backend (Backend API integration point).
 * The backend is responsible for Telegram/CRM delivery and secrets.
 */
export function createHttpLeadChannel(options: HttpChannelOptions): LeadChannel {
  const { baseUrl, path = '/leads', timeoutMs = 10_000, fetchImpl = fetch } = options;
  const url = new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

  return {
    name: 'http',
    async send(lead: Omit<LeadInput, 'website'>): Promise<SubmitResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(lead),
          signal: controller.signal,
        });
        if (response.status === 422) return { ok: false, code: 'validation' };
        if (!response.ok) return { ok: false, code: 'server' };
        const body = (await response.json().catch(() => ({}))) as { id?: unknown };
        return typeof body.id === 'string' ? { ok: true, id: body.id } : { ok: true };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { ok: false, code: 'timeout' };
        }
        return { ok: false, code: 'network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
