import { describe, expect, it } from 'vitest';
import { isLikelySpam, isValidContact, validateLead } from './lead';
import type { LeadInput } from './types';

const valid: LeadInput = {
  name: '  Test User ',
  contact: 'user@example.com',
  message: '  Hello  ',
  source: 'contact-form',
  consent: true,
};

describe('isValidContact', () => {
  it.each(['user@example.com', '+7 (900) 123-45-67', '89001234567', '@telegram_user'])(
    'accepts %s',
    (v) => expect(isValidContact(v)).toBe(true),
  );

  it.each(['', 'abc', 'user@', '12-34', '@ab'])('rejects %j', (v) =>
    expect(isValidContact(v)).toBe(false),
  );
});

describe('validateLead', () => {
  it('trims and returns clean data for valid input', () => {
    expect(validateLead(valid)).toEqual({
      ok: true,
      data: {
        name: 'Test User',
        contact: 'user@example.com',
        message: 'Hello',
        source: 'contact-form',
        consent: true,
      },
    });
  });

  it('omits empty optional message', () => {
    const result = validateLead({ ...valid, message: '   ' });
    expect(result.ok && 'message' in result.data).toBe(false);
  });

  it('reports every invalid field', () => {
    const result = validateLead({ name: ' ', contact: 'x', source: '', consent: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['consent', 'contact', 'name', 'source']);
    }
  });

  it('enforces length limits', () => {
    const result = validateLead({ ...valid, name: 'a'.repeat(101), message: 'b'.repeat(2001) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['message', 'name']);
  });

  it('never echoes personal data in error messages', () => {
    const secret = 'leaky-value@example';
    const result = validateLead({ ...valid, contact: secret, consent: false });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe('isLikelySpam', () => {
  it('flags filled honeypot', () => {
    expect(isLikelySpam({ website: 'http://spam' })).toBe(true);
    expect(isLikelySpam({ website: '' })).toBe(false);
    expect(isLikelySpam({})).toBe(false);
  });
});
