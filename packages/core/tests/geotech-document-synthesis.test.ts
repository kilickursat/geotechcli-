import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();

vi.mock('../src/llm/router.js', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

import { ingestGeotechDocument } from '../src/ingest/geotech-document.js';
import type { GeotechDocumentIngestResult } from '../src/ingest/geotech-document.js';

function makePageResult(overrides?: Partial<GeotechDocumentIngestResult>): GeotechDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'geotech-document',
    generatedAt: '2026-05-03T00:00:00.000Z',
    source: {
      filePath: 'report.pdf',
      fileName: 'report.pdf',
      inputKind: 'pdf',
      totalPages: 1,
      successfulPages: 1,
      failedPages: 0,
    },
    inspection: null,
    inspectionSummary: null,
    documentClass: 'geotechnical-document',
    title: 'Report page',
    summary: 'Weathered shale and silty sand were extracted.',
    materials: [
      { kind: 'soil', description: 'medium dense silty sand', uscsSymbol: 'SM', lithology: null },
      { kind: 'rock', description: 'weathered fractured rock', uscsSymbol: null, lithology: 'rock' },
    ],
    classifications: [
      { system: 'USCS', value: 'SM', context: 'Page 1 stratum II' },
    ],
    parameters: [
      { name: 'depth', valueText: '10 m', numericValue: 10, unit: 'm', material: null, context: 'Page 1 borehole depth' },
    ],
    risks: ['Weathered fractured rock varies by depth.'],
    recommendations: [],
    contentChunks: [
      {
        chunkId: 'chunk-1',
        pageRange: [1, 1],
        headingAncestry: ['Borehole log'],
        scope: 'page',
        sectionType: 'ground-model',
        significance: 80,
        text: 'Page 1 shows silty sand over weathered fractured rock to 10 m.',
        sourcePages: [1],
      },
    ],
    pageAudits: [],
    pageFailures: [],
    warnings: [],
    reviewFindings: [],
    reviewReasons: [],
    parseStatus: 'parsed',
    confidence: 82,
    reviewRequired: false,
    canAutoProceed: true,
    ...overrides,
  };
}

describe('geotech document synthesis', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    generateTextMock.mockReset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('retries GLM-5.1 synthesis without thinking when thinking mode returns no content', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Hosted beta upstream returned no content. The upstream completion response did not contain assistant text.'))
      .mockResolvedValueOnce({
        text: JSON.stringify({
          takeaways: ['Silty sand over weathered fractured rock governs the preliminary ground model.'],
          groundModel: ['Medium dense silty sand overlies weathered fractured rock.'],
          keyParameters: ['Borehole depth 10 m, page 1.'],
          interpretation: ['Use the extracted page evidence as review input only.'],
          limitations: ['One-page smoke evidence only.'],
          sourcePages: [1],
        }),
        latencyMs: 25,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        model: 'glm-5.1',
        provider: 'hosted-beta',
      });

    const result = await ingestGeotechDocument({
      config: { provider: 'hosted-beta' } as any,
      source: {
        filePath: 'report.pdf',
        fileName: 'report.pdf',
        inputKind: 'pdf',
      },
      pages: [
        {
          base64: 'page-1',
          mimeType: 'application/pdf',
          pageNumber: 1,
          totalPages: 1,
        },
      ],
      interpretPage: async () => makePageResult(),
    });

    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(generateTextMock.mock.calls[0]?.[2]).toMatchObject({ thinkingMode: 'enabled' });
    expect(generateTextMock.mock.calls[1]?.[2]).toMatchObject({ thinkingMode: 'disabled' });
    expect(generateTextMock.mock.calls[0]?.[0]).toContain('Provider-neutral DocumentEvidencePacket synthesis evidence contract');
    expect(generateTextMock.mock.calls[0]?.[0]).toContain('Ordered whole-report outline by source page');
    expect(generateTextMock.mock.calls[0]?.[0]).toContain('Borehole continuity evidence');
    expect(generateTextMock.mock.calls[0]?.[0]).toContain('Risks extracted from page evidence');
    expect(generateTextMock.mock.calls[0]?.[0]).toContain('Weathered fractured rock varies by depth');
    expect(generateTextMock.mock.calls[0]?.[2]).toMatchObject({
      systemPrompt: expect.stringContaining('provider-neutral document evidence'),
    });
    expect(result.synthesis?.takeaways[0]).toMatch(/Silty sand/i);
    expect(result.summary).toMatch(/Silty sand/i);
    expect(result.warnings.join(' ')).not.toMatch(/synthesis failed/i);
  });
});
