import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostedBetaAdapter } from '../src/llm/providers/hosted-beta.js';

describe('HostedBetaAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('forwards requests to the hosted proxy without requiring a user API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'glm-4.7-flash',
          choices: [{ message: { content: 'OK' } }],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 1,
            total_tokens: 4,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const adapter = new HostedBetaAdapter('https://beta.geotechcli.com/api/proxy');
    const response = await adapter.complete(
      {
        messages: [{ role: 'user', content: 'Reply with OK' }],
        temperature: 0,
      },
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
    );

    expect(response.provider).toBe('hosted-beta');
    expect(response.text).toBe('OK');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://beta.geotechcli.com/api/proxy');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Geotech-Client': 'geotechcli',
      'X-Geotech-Call-Type': 'text',
    });
  });

  it('surfaces hosted-beta rate limit errors clearly', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Hosted beta daily limit reached.',
            remaining: 0,
            retry_after_seconds: 42,
          },
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const adapter = new HostedBetaAdapter('https://beta.geotechcli.com/api/proxy');

    await expect(
      adapter.complete(
        {
          messages: [{ role: 'user', content: 'Hello' }],
        },
        {
          provider: 'hosted-beta',
          apiKey: '',
          timeout: 1000,
        },
      ),
    ).rejects.toThrow('Retry in about 42s');
  });
});
