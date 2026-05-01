import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_VISION_MODEL,
  GEOTECHCLI_VERSION,
} from '@geotechcli/core/meta';

import {
  checkHostedBetaDailyLimit,
  getHostedBetaDeveloperAuthStatus,
  getDailyLimitForClient,
  getHostedBetaRequestLimit,
  inferHostedBetaCallType,
  incrementHostedBetaUsage,
  resolveHostedBetaClientMode,
  validateAnonymousHostedBetaMessages,
  validateMessages,
} from './beta.js';

afterEach(() => {
  delete (globalThis as typeof globalThis & {
    __geotechHostedBetaStore?: unknown;
  }).__geotechHostedBetaStore;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('hosted beta controls', () => {
  it('exposes a no-store deployed version endpoint for beta smoke checks', async () => {
    const route = await import('../app/api/version/route.js');

    const response = await route.GET();
    const body = (await response.json()) as {
      status?: string;
      version?: string;
      provider?: string;
      defaults?: { text?: string };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toMatch(/no-store/i);
    expect(body.status).toBe('ok');
    expect(body.version).toBe(GEOTECHCLI_VERSION);
    expect(body.provider).toBe(DEFAULT_LLM_PROVIDER);
    expect(body.defaults?.text).toBe(DEFAULT_LLM_MODEL);
  });

  it('gives geotechcli clients more room than anonymous callers', async () => {
    expect(getHostedBetaRequestLimit('geotechcli')).toBeGreaterThan(getHostedBetaRequestLimit('anonymous'));
    expect(getHostedBetaRequestLimit('geotechcli', 'vision')).toBeGreaterThan(
      getHostedBetaRequestLimit('anonymous', 'vision'),
    );
    expect(getHostedBetaRequestLimit('geotechcli', 'agent')).toBeGreaterThan(
      getHostedBetaRequestLimit('anonymous', 'agent'),
    );
    expect(getHostedBetaRequestLimit('geotechcli', 'vision')).toBeLessThan(
      getHostedBetaRequestLimit('geotechcli'),
    );
    expect(getHostedBetaRequestLimit('geotechcli', 'agent')).toBeLessThan(
      getHostedBetaRequestLimit('geotechcli'),
    );
    expect(getDailyLimitForClient('text', 'geotechcli')).toBeGreaterThan(
      getDailyLimitForClient('text', 'anonymous'),
    );
    expect(getDailyLimitForClient('agent', 'geotechcli')).toBeGreaterThan(
      getDailyLimitForClient('agent', 'anonymous'),
    );
  });

  it('recognizes a valid developer key before falling back to public client modes', () => {
    vi.stubEnv('GEOTECHCLI_DEVELOPER_API_KEY', 'gtdev_live_key');
    const headers = new Headers({
      authorization: 'Bearer gtdev_live_key',
      'x-geotech-client': 'geotechcli',
    });

    expect(getHostedBetaDeveloperAuthStatus(headers)).toEqual({
      provided: true,
      authorized: true,
    });
    expect(resolveHostedBetaClientMode(headers)).toBe('developer');
  });

  it('keys daily limits by ip and call type', async () => {
    const ip = '203.0.113.9';

    const textCheck = await checkHostedBetaDailyLimit({ ip, callType: 'text' });
    expect(textCheck.allowed).toBe(true);
    expect(textCheck.fingerprint).toMatch(/^[0-9a-f]{32}$/);

    await incrementHostedBetaUsage(textCheck.fingerprint, 'text');

    const nextTextCheck = await checkHostedBetaDailyLimit({ ip, callType: 'text' });
    expect(nextTextCheck.used).toBe(1);
    expect(nextTextCheck.remaining).toBe(textCheck.limit - 1);

    const visionCheck = await checkHostedBetaDailyLimit({ ip, callType: 'vision' });
    expect(visionCheck.used).toBe(0);
    expect(visionCheck.fingerprint).not.toBe(textCheck.fingerprint);
  });

  it('separates daily usage buckets by client mode', async () => {
    const ip = '198.51.100.4';
    const anonymousCheck = await checkHostedBetaDailyLimit({
      ip,
      callType: 'text',
      clientMode: 'anonymous',
    });
    await incrementHostedBetaUsage(anonymousCheck.fingerprint, 'text');

    const cliCheck = await checkHostedBetaDailyLimit({
      ip,
      callType: 'text',
      clientMode: 'geotechcli',
    });

    expect(cliCheck.used).toBe(0);
    expect(cliCheck.limit).toBeGreaterThan(anonymousCheck.limit);
  });

  it('accepts CLI-style system prompts but rejects anonymous assistant turns', () => {
    expect(() =>
      validateAnonymousHostedBetaMessages([
        { role: 'system', content: 'You are a geotechnical engineer.' },
        { role: 'user', content: 'Analyze a slope.' },
      ]),
    ).not.toThrow();

    expect(() =>
      validateAnonymousHostedBetaMessages([
        { role: 'user', content: 'Analyze a slope.' },
        { role: 'assistant', content: 'Sure.' },
      ]),
    ).toThrow(/Anonymous hosted beta requests/);
  });

  it('rejects PDF data URIs masquerading as image_url payloads', () => {
    expect(() =>
      validateMessages([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: 'data:application/pdf;base64,ZmFrZS1wZGY=',
              },
            },
          ],
        },
      ]),
    ).toThrow(/invalid text or image payload/i);
  });

  it('prefers actual message shape over a misleading call-type hint', () => {
    expect(
      inferHostedBetaCallType(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,abc' },
              },
            ],
          },
        ],
        'text',
      ),
    ).toBe('vision');

    expect(
      inferHostedBetaCallType(
        [
          { role: 'user', content: 'Analyze this excavation.' },
          { role: 'assistant', content: 'Interim reply.' },
        ],
        'text',
      ),
    ).toBe('agent');
  });

  it('returns request ids on GET and anonymous POST rejections', async () => {
    vi.stubEnv('ZHIPU_API_KEY', 'test-zhipu-key');

    const route = await import('../app/api/proxy/route.js');

    const getResponse = await route.GET();
    const getBody = (await getResponse.json()) as { request_id?: string };
    const getRequestId = getResponse.headers.get('x-request-id');

    expect(getRequestId).toMatch(/^gtbeta-/);
    expect(getBody.request_id).toBe(getRequestId);

    const request = new NextRequest('https://example.com/api/proxy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'Use concise engineering language.' },
          { role: 'assistant', content: 'Nope.' },
          { role: 'user', content: 'Check this slope.' },
        ],
      }),
    });

    const postResponse = await route.POST(request);
    const postBody = (await postResponse.json()) as {
      request_id?: string;
      error?: { code?: string };
    };
    const postRequestId = postResponse.headers.get('x-request-id');

    expect(postResponse.status).toBe(400);
    expect(postRequestId).toMatch(/^gtbeta-/);
    expect(postBody.request_id).toBe(postRequestId);
    expect(postBody.error?.code).toBe('anonymous_request_rejected');
  }, 15_000);

  it('retries transient upstream 429 responses for geotechcli clients', async () => {
    vi.stubEnv('ZHIPU_API_KEY', 'test-zhipu-key');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit reached for requests',
            },
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
        JSON.stringify({
            model: DEFAULT_LLM_MODEL,
            choices: [
              {
                message: {
                  content: 'USCS: CH',
                },
              },
            ],
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

    const route = await import('../app/api/proxy/route.js');
    const request = new NextRequest('https://example.com/api/proxy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-geotech-client': 'geotechcli',
        'x-geotech-client-version': '0.4.2',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Classify soft clay with high plasticity.' }],
        model: DEFAULT_LLM_MODEL,
      }),
    });

    const response = await route.POST(request);
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.choices?.[0]?.message?.content).toBe('USCS: CH');
  });

  it('clamps hosted-beta output tokens before forwarding upstream', async () => {
    vi.stubEnv('ZHIPU_API_KEY', 'test-zhipu-key');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: DEFAULT_LLM_MODEL,
          choices: [{ message: { content: 'OK' } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 1,
            total_tokens: 11,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const route = await import('../app/api/proxy/route.js');
    const request = new NextRequest('https://example.com/api/proxy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-geotech-client': 'geotechcli',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Summarize this geotechnical report page.' }],
        model: DEFAULT_LLM_MODEL,
        maxTokens: 3000,
      }),
    });

    const response = await route.POST(request);
    expect(response.status).toBe(200);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const upstreamBody = JSON.parse(String(init.body)) as {
      max_tokens?: number;
      thinking?: { type?: string };
    };
    expect(url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-zhipu-key',
    });
    expect(upstreamBody.max_tokens).toBe(800);
    expect(upstreamBody.thinking).toEqual({ type: 'disabled' });
  });

  it('uses the GLM vision default for image requests without a model override', async () => {
    vi.stubEnv('ZHIPU_API_KEY', 'test-zhipu-key');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: DEFAULT_LLM_VISION_MODEL,
          choices: [{ message: { content: 'Vision OK' } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 2,
            total_tokens: 12,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const route = await import('../app/api/proxy/route.js');
    const request = new NextRequest('https://example.com/api/proxy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-geotech-client': 'geotechcli',
      },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Read this borehole log image.' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
          ],
        }],
      }),
    });

    const response = await route.POST(request);
    expect(response.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const upstreamBody = JSON.parse(String(init.body)) as { model?: string };
    expect(upstreamBody.model).toBe(DEFAULT_LLM_VISION_MODEL);
  });

  it('rejects invalid developer auth instead of silently treating it as a public client', async () => {
    vi.stubEnv('ZHIPU_API_KEY', 'test-zhipu-key');
    vi.stubEnv('GEOTECHCLI_DEVELOPER_API_KEY', 'gtdev_live_key');

    const route = await import('../app/api/proxy/route.js');
    const request = new NextRequest('https://example.com/api/proxy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer wrong-key',
        'x-geotech-client': 'geotechcli',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Reply with OK' }],
        model: DEFAULT_LLM_MODEL,
      }),
    });

    const response = await route.POST(request);
    const body = (await response.json()) as {
      error?: { code?: string };
      client?: { mode?: string };
    };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe('developer_auth_invalid');
    expect(body.client?.mode).toBe('geotechcli');
  });

  it('bypasses public hosted-beta limits for a valid developer key', async () => {
    vi.stubEnv('ZHIPU_API_KEY', 'test-zhipu-key');
    vi.stubEnv('GEOTECHCLI_DEVELOPER_API_KEY', 'gtdev_live_key');

    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          model: DEFAULT_LLM_MODEL,
          choices: [
            {
              message: {
                content: 'OK',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 1,
            total_tokens: 11,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    );
    global.fetch = fetchMock as typeof fetch;

    const route = await import('../app/api/proxy/route.js');
    const headers = {
      'content-type': 'application/json',
      authorization: 'Bearer gtdev_live_key',
      'x-geotech-client': 'geotechcli',
      'x-geotech-client-version': GEOTECHCLI_VERSION,
    };

    for (let index = 0; index < 70; index += 1) {
      const request = new NextRequest('https://example.com/api/proxy', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Reply with OK ${index}` }],
          model: DEFAULT_LLM_MODEL,
        }),
      });

      const response = await route.POST(request);
      const body = (await response.json()) as {
        client?: { mode?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };

      expect(response.status).toBe(200);
      expect(body.client?.mode).toBe('developer');
      expect(body.choices?.[0]?.message?.content).toBe('OK');
    }

    expect(fetchMock).toHaveBeenCalledTimes(70);
  });

  it('does not retry upstream agent requests after a transient failure', async () => {
    vi.stubEnv('ZHIPU_API_KEY', 'test-zhipu-key');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Rate limit reached for requests',
          },
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const route = await import('../app/api/proxy/route.js');
    const request = new NextRequest('https://example.com/api/proxy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-geotech-client': 'geotechcli',
        'x-geotech-client-version': GEOTECHCLI_VERSION,
        'x-geotech-call-type': 'agent',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Assess this tunnel alignment.' },
          { role: 'assistant', content: 'Interim planning step.' },
          { role: 'user', content: 'Continue with the next geotechnical step.' },
        ],
        model: DEFAULT_LLM_MODEL,
      }),
    });

    const response = await route.POST(request);
    const body = (await response.json()) as {
      error?: { message?: string; detail?: string };
    };

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.error?.message).toMatch(/provider is busy/i);
  });

  it('does not retry upstream vision requests after a transient failure', async () => {
    vi.stubEnv('ZHIPU_API_KEY', 'test-zhipu-key');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Rate limit reached for requests',
          },
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const route = await import('../app/api/proxy/route.js');
    const request = new NextRequest('https://example.com/api/proxy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-geotech-client': 'geotechcli',
        'x-geotech-client-version': GEOTECHCLI_VERSION,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Read this borehole log image.' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
              },
            ],
          },
        ],
        model: DEFAULT_LLM_VISION_MODEL,
      }),
    });

    const response = await route.POST(request);
    const body = (await response.json()) as {
      error?: { message?: string; detail?: string };
    };

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.error?.message).toMatch(/provider is busy/i);
  });

  it('applies a lower per-minute limiter to hosted vision requests', async () => {
    vi.stubEnv('ZHIPU_API_KEY', 'test-zhipu-key');

    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(
        JSON.stringify({
          model: DEFAULT_LLM_VISION_MODEL,
          choices: [{ message: { content: 'Vision OK' } }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 2,
            total_tokens: 14,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ));
    global.fetch = fetchMock as typeof fetch;

    const route = await import('../app/api/proxy/route.js');
    const visionLimit = getHostedBetaRequestLimit('geotechcli', 'vision');
    let lastResponse: Response | null = null;

    for (let index = 0; index <= visionLimit; index += 1) {
      const request = new NextRequest('https://example.com/api/proxy', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.77',
          'x-geotech-client': 'geotechcli',
          'x-geotech-client-version': GEOTECHCLI_VERSION,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: `Read borehole log image ${index}.` },
                {
                  type: 'image_url',
                  image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
                },
              ],
            },
          ],
          model: DEFAULT_LLM_VISION_MODEL,
        }),
      });

      lastResponse = await route.POST(request);
      if (index < visionLimit) {
        expect(lastResponse.status).toBe(200);
      }
    }

    const lastBody = (await lastResponse?.json()) as {
      error?: { code?: string };
    };

    expect(lastResponse?.status).toBe(429);
    expect(lastBody.error?.code).toBe('vision_rate_limited');
    expect(fetchMock).toHaveBeenCalledTimes(visionLimit);
  });
});
