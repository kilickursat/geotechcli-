import { describe, expect, it } from 'vitest';

import {
  DocumentEvidencePacketSchema,
  buildDocumentEvidencePacket,
  ingestGeotechDocument,
  summarizeDocumentEvidencePacketForAgent,
  type GeotechDocumentIngestResult,
} from '../src/index.js';

function makeResult(
  overrides: Partial<GeotechDocumentIngestResult> = {},
): GeotechDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'geotech-document',
    generatedAt: '2026-05-05T00:00:00.000Z',
    source: {
      filePath: 'C:/reports/site-investigation.pdf',
      fileName: 'site-investigation.pdf',
      inputKind: 'pdf',
      totalPages: 3,
      successfulPages: 3,
      failedPages: 0,
    },
    inspection: null,
    inspectionSummary: null,
    documentClass: 'site-investigation-report',
    title: 'Ground investigation report',
    summary: 'BH1 was terminated at 10.00 m after weathered rock was encountered.',
    materials: [
      {
        kind: 'soil',
        description: 'stiff clayey silt from BH1 above weathered rock',
        uscsSymbol: 'CL',
        lithology: null,
        sourcePages: [2],
      },
    ],
    classifications: [
      {
        system: 'USCS',
        value: 'CL',
        context: 'BH1 clayey silt on page 2',
        sourcePages: [2],
      },
    ],
    parameters: [
      {
        name: 'Borehole depth',
        valueText: '10.00 m',
        numericValue: 10,
        unit: 'm',
        material: 'BH1',
        context: 'BH1 termination on page 2',
        sourcePages: [2],
      },
      {
        name: 'Groundwater level',
        valueText: 'not reported',
        numericValue: null,
        unit: 'm bgl',
        material: 'BH1',
        context: null,
      },
    ],
    risks: ['Weathered rock should be verified before foundation design.'],
    recommendations: ['Verify groundwater before construction.'],
    synthesis: {
      takeaways: ['BH1 reached 10.00 m and encountered weathered rock.'],
      groundModel: ['Stiff clayey silt over weathered rock, page 2.'],
      keyParameters: ['BH1 termination 10.00 m, page 2.'],
      interpretation: ['Use as review evidence only.'],
      limitations: ['Groundwater was not reported.'],
      sourcePages: [2],
    },
    contentChunks: [
      {
        chunkId: 'chunk-2',
        pageRange: [2, 2],
        headingAncestry: ['Borehole logs'],
        scope: 'section',
        sectionType: 'ground-model',
        significance: 0.9,
        text: 'B.H. No. 1 terminated at 10.00 m. Stiff clayey silt over weathered rock.',
        sourcePages: [2],
      },
    ],
    pageAudits: [
      {
        pageNumber: 1,
        classification: 'digital-text',
        textHintSource: 'native-text',
        parseStatus: 'parsed',
        confidence: 94,
        materialCount: 0,
        classificationCount: 0,
        parameterCount: 0,
        warnings: [],
      },
      {
        pageNumber: 2,
        classification: 'image-only',
        textHintSource: 'glm-ocr',
        parseStatus: 'parsed',
        confidence: 88,
        materialCount: 1,
        classificationCount: 1,
        parameterCount: 1,
        warnings: [],
      },
      {
        pageNumber: 3,
        classification: 'image-only',
        textHintSource: 'vision-visual',
        parseStatus: 'partial',
        confidence: 63,
        materialCount: 0,
        classificationCount: 0,
        parameterCount: 1,
        warnings: ['Depth column partially obscured.'],
      },
    ],
    pageFailures: [],
    warnings: ['Manual review required for missing groundwater.'],
    reviewFindings: [
      {
        code: 'direct_visual_review_required',
        severity: 'review',
        scope: 'page',
        message: 'Page 3 used direct visual extraction.',
        pageNumber: 3,
      },
    ],
    reviewReasons: ['Page 3 used direct visual extraction.'],
    parseStatus: 'partial',
    confidence: 82,
    reviewRequired: true,
    canAutoProceed: false,
    ...overrides,
  };
}

describe('document evidence packet', () => {
  it('normalizes geotechnical ingest evidence into a provider-neutral schema', () => {
    const packet = buildDocumentEvidencePacket(makeResult());

    expect(DocumentEvidencePacketSchema.parse(packet)).toEqual(packet);
    expect(packet.kind).toBe('document-evidence-packet');
    expect(packet.providerContract).toMatchObject({
      providerNeutral: true,
      purpose: 'byok-document-understanding',
    });
    expect(packet.pages.map((page) => page.method)).toEqual([
      'native-pdf-text',
      'layout-ocr',
      'visual-reasoning',
    ]);
    expect(packet.observations.parameters[0]).toMatchObject({
      label: 'Borehole depth',
      sourcePages: [2],
      method: 'layout-ocr',
      reviewStatus: 'verified',
    });
    expect(packet.observations.parameters[1]).toMatchObject({
      label: 'Groundwater level',
      reviewStatus: 'missing',
      confidence: 0,
    });
    expect(packet.traceability).toMatchObject({
      sourcePages: [2],
      pagesWithEvidence: [2, 3],
      directVisualPages: [3],
      layoutOcrPages: [2],
      nativeTextPages: [1],
      boreholeIds: ['BH1'],
      maxDepthMeters: 10,
      parametersWithSourcePage: 1,
      parametersWithoutSourcePage: 1,
      parameterTraceabilityRate: 0.5,
    });
    expect(packet.providerContract.reviewGates).toContain('direct-visual-verification-required');
  });

  it('summarizes evidence packets for agent context without raw page dump', () => {
    const packet = buildDocumentEvidencePacket(makeResult());
    const summary = summarizeDocumentEvidencePacketForAgent(packet, { maxContentChars: 1800 });

    expect(summary).toContain('DocumentEvidencePacket v1 provider-neutral agent context');
    expect(summary).toContain('source pages 2');
    expect(summary).toContain('layout/OCR pages 2');
    expect(summary).toContain('direct visual pages 3');
    expect(summary).toContain('Review gates:');
    expect(summary).toContain('direct-visual-verification-required');
    expect(summary).toContain('Missing parameters: Groundwater level');
    expect(summary).toContain('Boreholes: BH1; max depth 10 m');
    expect(summary).not.toContain('"pageAudits"');
  });

  it('attaches the evidence packet to geotechnical document ingest results', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible' } as any,
      source: {
        filePath: 'report.pdf',
        fileName: 'report.pdf',
        inputKind: 'pdf',
      },
      pages: [{
        base64: 'page-1',
        mimeType: 'application/pdf',
        pageNumber: 1,
        totalPages: 1,
      }],
      interpretPage: async (_imageBase64, _mimeType, _config, context) => ({
        documentClass: 'site-investigation-report',
        title: 'Ground investigation report',
        summary: 'BH1 terminated at 10.00 m.',
        materials: [],
        classifications: [],
        parameters: [{
          name: 'Borehole depth',
          valueText: '10.00 m',
          numericValue: 10,
          unit: 'm',
          material: 'BH1',
          context: 'page 1',
        }],
        risks: [],
        recommendations: [],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        parseStatus: 'parsed',
        confidence: 84,
        warnings: [],
        rawLLMText: 'mock',
        latencyMs: 1,
      }),
    });

    expect(result.evidencePacket?.schemaVersion).toBe(1);
    expect(result.evidencePacket?.observations.parameters[0]?.sourcePages).toEqual([1]);
    expect(result.evidencePacket?.providerContract.providerNeutral).toBe(true);
  });
});
