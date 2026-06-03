import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAICompatibleAdapter } from '../src/llm/providers/openai-compatible.js';

describe('OpenAICompatibleAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('allows no-auth localhost endpoints and normalizes trailing base URL slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'local-openai-compatible-test',
          object: 'chat.completion',
          created: 1,
          model: 'local/geotech',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Local OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAICompatibleAdapter({ name: 'openai-compatible' });
    const response = await adapter.complete(
      {
        messages: [{ role: 'user', content: 'Reply with Local OK' }],
        jsonMode: true,
      },
      {
        provider: 'openai-compatible',
        apiKey: '',
        baseUrl: 'http://localhost:11434/v1/',
        modelId: 'local/geotech',
        timeout: 1000,
      },
    );

    expect(response.text).toBe('Local OK');
    expect(response.provider).toBe('openai-compatible');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'local/geotech',
      response_format: { type: 'json_object' },
    });
  });

  it('keeps remote OpenAI-compatible endpoints fail-closed without an API key', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAICompatibleAdapter({ name: 'openai-compatible' });
    await expect(
      adapter.complete(
        { messages: [{ role: 'user', content: 'Hello' }] },
        {
          provider: 'openai-compatible',
          apiKey: '',
          baseUrl: 'https://openrouter.ai/api/v1',
          modelId: 'openrouter/auto',
          timeout: 1000,
        },
      ),
    ).rejects.toThrow(/API key is required.*remote endpoints/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends bearer auth to remote endpoints and normalizes the request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'remote-openai-compatible-test',
          object: 'chat.completion',
          created: 1,
          model: 'openrouter/auto',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Remote OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 6, completion_tokens: 2, total_tokens: 8 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAICompatibleAdapter({ name: 'openai-compatible' });
    await adapter.complete(
      { messages: [{ role: 'user', content: 'Reply with Remote OK' }] },
      {
        provider: 'openai-compatible',
        apiKey: 'openrouter-test-key',
        baseUrl: 'https://openrouter.ai/api/v1/',
        modelId: 'openrouter/auto',
        timeout: 1000,
      },
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer openrouter-test-key',
    });
  });
});
