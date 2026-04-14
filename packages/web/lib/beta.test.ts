import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkHostedBetaDailyLimit,
  inferHostedBetaCallType,
  incrementHostedBetaUsage,
  validateAnonymousHostedBetaMessages,
} from './beta.js';

afterEach(() => {
  delete (globalThis as typeof globalThis & {
    __geotechHostedBetaStore?: unknown;
  }).__geotechHostedBetaStore;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('hosted beta controls', () => {
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
    vi.stubEnv('ZHIPU_API_KEY', 'test-key');

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
  });
});
