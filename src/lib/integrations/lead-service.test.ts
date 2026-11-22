import { describe, expect, it, vi } from 'vitest';
import { createHttpLeadChannel } from './http-channel';
import { createLeadService } from './lead-service';
import type { LeadChannel, LeadInput } from './types';

const lead: LeadInput = {
  name: 'Test',
  contact: 'user@example.com',
  source: 'test',
  consent: true,
};

function fakeChannel(): LeadChannel & { send: ReturnType<typeof vi.fn> } {
  return { name: 'fake', send: vi.fn().mockResolvedValue({ ok: true, id: 'abc' }) };
}

describe('createLeadService', () => {
  it('is disabled without backend URL', async () => {
    const service = createLeadService({ apiBaseUrl: '' });
    expect(service.enabled).toBe(false);
    await expect(service.submit(lead)).resolves.toEqual({ ok: false, code: 'disabled' });
  });

  it('validates before sending', async () => {
    const channel = fakeChannel();
    const service = createLeadService({ channel });
    const result = await service.submit({ ...lead, consent: false });
    expect(result).toMatchObject({ ok: false, code: 'validation' });
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('silently drops honeypot submissions', async () => {
    const channel = fakeChannel();
    const result = await createLeadService({ channel }).submit({ ...lead, website: 'x' });
    expect(result).toEqual({ ok: true });
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('sends validated data without the honeypot field', async () => {
    const channel = fakeChannel();
    await expect(createLeadService({ channel }).submit({ ...lead, website: '' })).resolves.toEqual({
      ok: true,
      id: 'abc',
    });
    expect(channel.send).toHaveBeenCalledWith({
      name: 'Test',
      contact: 'user@example.com',
      source: 'test',
      consent: true,
    });
  });
});

describe('createHttpLeadChannel', () => {
  const data = { name: 'Test', contact: 'user@example.com', source: 'test', consent: true };

  it('POSTs JSON to <baseUrl>/leads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"id":"42"}', { status: 201 }));
    const channel = createHttpLeadChannel({ baseUrl: 'https://api.example.test/v1', fetchImpl });
    await expect(channel.send(data)).resolves.toEqual({ ok: true, id: '42' });
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://api.example.test/v1/leads');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(data);
  });

  it.each([
    [422, 'validation'],
    [500, 'server'],
    [404, 'server'],
  ] as const)('maps HTTP %i to %s', async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status }));
    const channel = createHttpLeadChannel({ baseUrl: 'https://api.example.test', fetchImpl });
    await expect(channel.send(data)).resolves.toEqual({ ok: false, code });
  });

  it('maps network failures', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const channel = createHttpLeadChannel({ baseUrl: 'https://api.example.test', fetchImpl });
    await expect(channel.send(data)).resolves.toEqual({ ok: false, code: 'network' });
  });

  it('times out slow backends', async () => {
    const fetchImpl = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const channel = createHttpLeadChannel({
      baseUrl: 'https://api.example.test',
      timeoutMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(channel.send(data)).resolves.toEqual({ ok: false, code: 'timeout' });
  });
});
