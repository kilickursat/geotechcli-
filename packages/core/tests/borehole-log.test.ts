import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  interpretBoreholeLogWithContext,
  mergeBoreholeLogPages,
  type BoreholeInterpretation,
} from '../src/vision/index.js';

describe('borehole log interpretation', () => {
  const originalFetch = global.fetch;

  function hostedBetaSuccessResponse(content: string): Response {
    return new Response(
      JSON.stringify({
        model: 'Qwen/Qwen3.5-9B',
        choices: [{ message: { role: 'assistant', content } }],
        usage: {
          prompt_tokens: 180,
          completion_tokens: 90,
          total_tokens: 270,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  function anthropicSuccessResponse(content: string): Response {
    return new Response(
      JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: content }],
        usage: {
          input_tokens: 180,
          output_tokens: 90,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('runs a metadata pass before the layer extraction pass and forwards continuation context', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse(
          JSON.stringify({
            boreholeId: 'BH-12',
            projectName: 'River Wall Upgrade',
            groundElevation: 14.2,
            coordinates: {
              easting: 532500,
              northing: 178300,
              coordinateSystem: 'BNG',
              rawText: 'E: 532500 N: 178300',
            },
            layoutNotes: 'Portrait log with depth scale on the left.',
            confidence: 87,
            warnings: [],
          }),
        ),
      )
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse(
          JSON.stringify({
            boreholeId: 'BH-12',
            totalDepth: 24,
            waterTableDepth: 3.5,
            continuationDepth: 24,
            layers: [
              {
                depthFrom: 12,
                depthTo: 18,
                description: 'Stiff CLAY',
                uscsSymbol: 'CL',
                sptN: 11,
                waterContent: null,
                notes: 'Grey and fissured',
              },
            ],
            summary: 'Continued stiff clay below 12 m.',
            confidence: 82,
            warnings: [],
          }),
        ),
      );

    global.fetch = fetchMock as typeof fetch;

    const result = await interpretBoreholeLogWithContext(
      'ZmFrZQ==',
      'image/png',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      {
        boreholeId: 'BH-12',
        pageNumber: 2,
        totalPages: 3,
        priorContinuationDepth: 12,
      },
    );

    expect(result.boreholeId).toBe('BH-12');
    expect(result.projectName).toBe('River Wall Upgrade');
    expect(result.location?.crs?.code).toBe('EPSG:27700');
    expect(result.location?.projected?.easting).toBe(532500);
    expect(String(result.location?.raw?.rawCoordinateText)).toContain('532500');
    expect(result.continuationDepth).toBe(24);
    expect(result.pageNumber).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const firstPrompt = firstRequest.messages?.[1]?.content?.[1]?.text ?? '';
    const secondPrompt = secondRequest.messages?.[1]?.content?.[1]?.text ?? '';

    expect(firstPrompt).toMatch(/Extract only the borehole log metadata/i);
    expect(secondPrompt).toMatch(/Previous pages continued to 12\.00 m depth/i);
    expect(secondPrompt).toMatch(/Coordinate text: E: 532500 N: 178300/i);
  });

  it('merges multi-page interpretations while carrying metadata and warning on conflicting borehole ids', () => {
    const pageOne: BoreholeInterpretation = {
      boreholeId: 'BH-01',
      totalDepth: 12,
      waterTableDepth: 4.2,
      layers: [
        {
          depthFrom: 0,
          depthTo: 6,
          description: 'Fill',
          uscsSymbol: 'SM',
          sptN: 5,
          waterContent: null,
          notes: null,
        },
      ],
      summary: 'Upper fill and silty sand.',
      location: {
        boreholeId: 'BH-01',
        source: 'vision',
        crs: { kind: 'projected', code: 'EPSG:27700', confidence: 0.84 },
        projected: { easting: 532500, northing: 178300, elevation: 15.2 },
        groundLevel: 15.2,
        raw: { rawCoordinateText: 'E: 532500 N: 178300' },
      },
      groundElevation: 15.2,
      dateDrilled: '2026-04-20',
      drillingMethod: 'Rotary',
      projectName: 'Tunnel Scheme',
      continuationDepth: 12,
      pageNumber: 1,
      totalPages: 2,
      rawLLMText: 'page-1',
      latencyMs: 1200,
      parseStatus: 'parsed',
      confidence: 82,
      warnings: [],
      canAutoProceed: true,
    };

    const pageTwo: BoreholeInterpretation = {
      boreholeId: 'BH-02',
      totalDepth: 24,
      waterTableDepth: 3.8,
      layers: [
        {
          depthFrom: 12,
          depthTo: 24,
          description: 'Dense sand',
          uscsSymbol: 'SP',
          sptN: 25,
          waterContent: null,
          notes: null,
        },
      ],
      summary: 'Dense sand below 12 m.',
      location: null,
      groundElevation: null,
      dateDrilled: null,
      drillingMethod: null,
      projectName: null,
      continuationDepth: 24,
      pageNumber: 2,
      totalPages: 2,
      rawLLMText: 'page-2',
      latencyMs: 900,
      parseStatus: 'parsed',
      confidence: 76,
      warnings: ['Low confidence on lower page borehole id.'],
      canAutoProceed: true,
    };

    const merged = mergeBoreholeLogPages([
      { pageNumber: 1, result: pageOne },
      { pageNumber: 2, result: pageTwo },
    ]);

    expect(merged.totalDepth).toBe(24);
    expect(merged.waterTableDepth).toBe(3.8);
    expect(merged.layers).toHaveLength(2);
    expect(merged.location?.crs?.code).toBe('EPSG:27700');
    expect(merged.projectName).toBe('Tunnel Scheme');
    expect(merged.continuationDepth).toBe(24);
    expect(merged.warnings.join(' ')).toMatch(/Multiple borehole IDs were detected/i);
  });

  it('falls back to text-driven borehole parsing for PDF pages when the provider does not advertise native PDF support', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        anthropicSuccessResponse(
          JSON.stringify({
            boreholeId: 'BH-44',
            projectName: 'Metro Extension',
            totalDepth: 18,
            coordinates: {
              easting: 532500,
              northing: 178300,
              coordinateSystem: 'BNG',
              rawText: 'E: 532500 N: 178300',
            },
            confidence: 81,
            warnings: [],
          }),
        ),
      )
      .mockResolvedValueOnce(
        anthropicSuccessResponse(
          JSON.stringify({
            boreholeId: 'BH-44',
            totalDepth: 18,
            continuationDepth: 18,
            layers: [
              {
                depthFrom: 0,
                depthTo: 4,
                description: 'Brown CLAY',
                uscsSymbol: 'CL',
                sptN: 7,
                waterContent: null,
                notes: 'Stiff',
              },
            ],
            summary: 'Upper stiff clay.',
            confidence: 79,
            warnings: [],
          }),
        ),
      );

    global.fetch = fetchMock as typeof fetch;

    const result = await interpretBoreholeLogWithContext(
      'ZmFrZQ==',
      'application/pdf',
      {
        provider: 'anthropic',
        apiKey: 'sk-ant-test',
        timeout: 1000,
      },
      {
        boreholeId: 'BH-44',
        pageNumber: 1,
        totalPages: 1,
        pageTextHint: 'BH-44 Total Depth 18 m E: 532500 N: 178300 0-4 m Brown CLAY SPT N 7',
      },
    );

    expect(result.boreholeId).toBe('BH-44');
    expect(result.layers).toHaveLength(1);
    expect(result.location?.crs?.code).toBe('EPSG:27700');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.stringify(firstRequest)).not.toContain('data:application/pdf;base64');
    expect(JSON.stringify(secondRequest)).not.toContain('data:application/pdf;base64');
    expect(typeof firstRequest.messages?.[0]?.content).toBe('string');
    expect(typeof secondRequest.messages?.[0]?.content).toBe('string');
  });
});
