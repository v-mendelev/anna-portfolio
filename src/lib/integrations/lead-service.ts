import { createHttpLeadChannel } from './http-channel';
import { isLikelySpam, validateLead } from './lead';
import type { LeadChannel, LeadInput, SubmitResult } from './types';

export interface LeadServiceConfig {
  /** PUBLIC_API_BASE_URL; when empty the form is disabled (no backend yet). */
  apiBaseUrl?: string | undefined;
  /** Inject a custom channel (tests, alternative transports). */
  channel?: LeadChannel;
}

export interface LeadService {
  readonly enabled: boolean;
  submit(input: LeadInput): Promise<SubmitResult>;
}

export function createLeadService(config: LeadServiceConfig): LeadService {
  const channel =
    config.channel ??
    (config.apiBaseUrl ? createHttpLeadChannel({ baseUrl: config.apiBaseUrl }) : undefined);

  return {
    enabled: channel !== undefined,
    async submit(input) {
      if (!channel) return { ok: false, code: 'disabled' };
      // Pretend success for bots so they do not retry; nothing is sent.
      if (isLikelySpam(input)) return { ok: true };
      const result = validateLead(input);
      if (!result.ok) return { ok: false, code: 'validation', fieldErrors: result.errors };
      return channel.send(result.data);
    },
  };
}
