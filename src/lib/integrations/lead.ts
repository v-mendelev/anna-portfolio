import type { LeadField, LeadInput, LeadValidation } from './types';

const LIMITS = { name: 100, contact: 200, message: 2000, source: 100 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{7,20}$/;
const HANDLE = /^@[\w.]{3,64}$/;

export function isValidContact(value: string): boolean {
  const v = value.trim();
  return EMAIL.test(v) || HANDLE.test(v) || (PHONE.test(v) && v.replace(/\D/g, '').length >= 7);
}

/**
 * Pure validation. Never logs the input: it contains personal data.
 * Error messages are user-facing (ru) and contain no input values.
 */
export function validateLead(input: LeadInput): LeadValidation {
  const errors: Partial<Record<LeadField, string>> = {};
  const name = input.name.trim();
  const contact = input.contact.trim();
  const message = input.message?.trim() ?? '';
  const source = input.source.trim();

  if (!name) errors.name = 'Укажите имя';
  else if (name.length > LIMITS.name) errors.name = 'Слишком длинное имя';

  if (!contact) errors.contact = 'Укажите телефон, e-mail или ник в мессенджере';
  else if (contact.length > LIMITS.contact || !isValidContact(contact))
    errors.contact = 'Проверьте контакт';

  if (message.length > LIMITS.message) errors.message = 'Сообщение слишком длинное';

  if (!source || source.length > LIMITS.source) errors.source = 'Некорректный источник';

  if (input.consent !== true) errors.consent = 'Нужно согласие на обработку данных';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: { name, contact, source, consent: true, ...(message ? { message } : {}) },
  };
}

export function isLikelySpam(input: Pick<LeadInput, 'website'>): boolean {
  return Boolean(input.website && input.website.trim() !== '');
}
