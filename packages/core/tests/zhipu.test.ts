import { afterEach, describe, expect, it, vi } from 'vitest';

import { ZhipuAdapter } from '../src/llm/providers/zhipu.js';

describe('ZhipuAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends OpenAI-compatible GLM chat requests with bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'glm-test',
          object: 'chat.completion',
          created: 1,
          model: 'glm-5.1',
          choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const adapter = new ZhipuAdapter();
    const response = await adapter.complete(
      {
        messages: [{ role: 'user', content: 'Reply with OK' }],
        model: 'glm-5.1',
        jsonMode: true,
        maxTokens: 64,
      },
      {
        provider: 'zhipu',
        apiKey: 'zhipu-test-key',
        baseUrl: 'https://api.z.ai/api/paas/v4',
        timeout: 1000,
      },
    );

    expect(response.text).toBe('OK');
    expect(response.model).toBe('glm-5.1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer zhipu-test-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'glm-5.1',
      response_format: { type: 'json_object' },
      max_tokens: 64,
    });
  });

  it('forwards GLM vision image parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'glm-vision-test',
          object: 'chat.completion',
          created: 1,
          model: 'glm-5v-turbo',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Vision OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const adapter = new ZhipuAdapter();
    await adapter.complete(
      {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Read this borehole log.' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
          ],
        }],
        model: 'glm-5v-turbo',
      },
      {
        provider: 'zhipu',
        apiKey: 'zhipu-test-key',
        timeout: 1000,
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      model?: string;
      messages?: Array<{ content?: unknown }>;
    };
    expect(body.model).toBe('glm-5v-turbo');
    expect(body.messages?.[0]?.content).toEqual([
      { type: 'text', text: 'Read this borehole log.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
    ]);
  });

  it('requires a Z.ai API key', async () => {
    const adapter = new ZhipuAdapter();

    await expect(
      adapter.complete(
        { messages: [{ role: 'user', content: 'Hello' }] },
        { provider: 'zhipu', apiKey: '', timeout: 1000 },
      ),
    ).rejects.toThrow(/Z\.ai API key is required/i);
  });

  it('wraps malformed provider JSON without exposing a raw SyntaxError', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        '{"choices":[{"message":{"content":"partial',
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as typeof fetch;

    const adapter = new ZhipuAdapter();
    await expect(
      adapter.complete(
        {
          messages: [{ role: 'user', content: 'Reply with JSON' }],
          model: 'glm-5.1',
        },
        {
          provider: 'zhipu',
          apiKey: 'zhipu-test-key',
          timeout: 1000,
        },
      ),
    ).rejects.toThrow(/Zhipu API returned malformed JSON response/i);
  });
});
