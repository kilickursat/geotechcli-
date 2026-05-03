import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseDocumentLayoutWithGlmOcr } from '../src/vision/layout-ocr.js';

describe('GLM-OCR layout parsing', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('forwards hosted-beta layout parsing through the hosted proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'GLM-OCR',
          md_results: '## Page 1\nSPT N = 12',
          layout_details: [[
            {
              index: 1,
              label: 'table',
              bbox_2d: [0.1, 0.2, 0.8, 0.4],
              content: '| Depth | SPT |\n| 2m | 12 |',
              width: 612,
              height: 792,
            },
          ]],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            total_tokens: 120,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const result = await parseDocumentLayoutWithGlmOcr(
      Buffer.from('fake-pdf').toString('base64'),
      'application/pdf',
      {
        provider: 'hosted-beta',
        apiKey: 'gtdev_live_key',
        baseUrl: 'https://beta.geotechcli.com/api/proxy',
        timeout: 1000,
      },
      { startPageId: 1, endPageId: 1 },
    );

    expect(result.text).toContain('SPT');
    expect(result.pages[0]?.tables[0]).toContain('Depth');
    expect(result.usage.totalTokens).toBe(120);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      file?: string;
      startPageId?: number;
      endPageId?: number;
    };
    expect(url).toBe('https://beta.geotechcli.com/api/proxy/layout');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer gtdev_live_key',
      'X-Geotech-Call-Type': 'layout',
    });
    expect(body.file).toMatch(/^data:application\/pdf;base64,/);
    expect(body.startPageId).toBe(1);
    expect(body.endPageId).toBe(1);
  });

  it('uses direct Z.ai layout_parsing for the zhipu provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'GLM-OCR',
          md_results: 'Groundwater observed at 3.0 m',
          layout_details: [[]],
          usage: { total_tokens: 25 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const result = await parseDocumentLayoutWithGlmOcr(
      Buffer.from('fake-image').toString('base64'),
      'image/png',
      {
        provider: 'zhipu',
        apiKey: 'zai-key',
        baseUrl: 'https://api.z.ai/api/paas/v4',
      },
    );

    expect(result.markdown).toContain('Groundwater');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { model?: string; file?: string };
    expect(url).toBe('https://api.z.ai/api/paas/v4/layout_parsing');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer zai-key' });
    expect(body.model).toBe('glm-ocr');
    expect(body.file).toMatch(/^data:image\/png;base64,/);
  });
});
