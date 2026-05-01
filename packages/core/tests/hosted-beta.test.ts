import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostedBetaAdapter } from '../src/llm/providers/hosted-beta.js';
import { DEFAULT_LLM_MODEL } from '../src/meta/index.js';

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
          model: DEFAULT_LLM_MODEL,
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
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: DEFAULT_LLM_MODEL,
    });
  });

  it('forwards hosted-beta developer auth when a trusted auth key is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: DEFAULT_LLM_MODEL,
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
    await adapter.complete(
      {
        messages: [{ role: 'user', content: 'Reply with OK' }],
      },
      {
        provider: 'hosted-beta',
        apiKey: 'gtdev_live_key',
        timeout: 1000,
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer gtdev_live_key',
    });
  });

  it('rejects native document_url payloads because hosted-beta is raster-image only today', async () => {
    const adapter = new HostedBetaAdapter('https://beta.geotechcli.com/api/proxy');
    await expect(
      adapter.complete(
        {
          messages: [{
            role: 'user',
            content: [{
              type: 'document_url',
              document_url: {
                url: 'data:application/pdf;base64,ZmFrZS1wZGY=',
                mimeType: 'application/pdf',
              },
            }],
          }],
        },
        {
          provider: 'hosted-beta',
          apiKey: '',
          timeout: 1000,
        },
      ),
    ).rejects.toThrow(/raster image inputs/i);
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

  it('uses a longer minimum timeout budget for agent requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: DEFAULT_LLM_MODEL,
          choices: [{ message: { content: 'OK' } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14,
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
    await adapter.complete(
      {
        messages: [
          { role: 'system', content: 'Use tools.' },
          { role: 'user', content: 'Check this tunnel.' },
          { role: 'assistant', content: 'Working...' },
        ],
      },
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1_000,
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { signal?: AbortSignal }];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('translates adapter timeout aborts into a clear message', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('The operation was aborted due to timeout')) as typeof fetch;

    const adapter = new HostedBetaAdapter('https://beta.geotechcli.com/api/proxy');

    await expect(
      adapter.complete(
        {
          messages: [{ role: 'user', content: 'Hello' }],
        },
        {
          provider: 'hosted-beta',
          apiKey: '',
          timeout: 1_000,
        },
      ),
    ).rejects.toThrow('Hosted beta request timed out after 120s');
  });
});
