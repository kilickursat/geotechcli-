import { describe, expect, it } from 'vitest';

import {
  DocumentEvidencePacketSchema,
  buildDocumentEvidencePacket,
  compileDocumentEvidenceSynthesisPrompt,
  documentEvidencePacketHasEngineeringSignal,
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
        evidenceCache: {
          status: 'stored',
          entryId: 'entry-page-2',
          cacheKey: 'cache-page-2',
          fileHash: 'file-hash',
          pageHash: 'page-hash-2',
          pageNumber: 2,
          modelVersion: 'llm-glm',
          preprocessingVersion: 'preprocess-v2',
          schemaVersion: 1,
          preprocessing: {
            schemaVersion: 1,
            pipelineVersion: 'vision-image-preprocess-v2',
            policy: 'ocr-optimized',
            transformed: true,
            input: {
              mimeType: 'image/jpeg',
              byteLength: 4096,
              width: 2400,
              height: 3200,
            },
            output: {
              mimeType: 'image/png',
              byteLength: 2048,
              width: 1350,
              height: 1800,
            },
            operations: ['auto-orient', 'trim-white-margins-threshold-10', 'resize-inside-1800-no-enlarge'],
            quality: {
              score: 0.82,
              contentCoverageRatio: 0.72,
              darkPixelRatio: 0.08,
              regionCoverageRatio: 0.14,
              regionCount: 1,
              cropAssetCount: 1,
              deskew: {
                method: 'projection-profile',
                angleDeg: 0,
                confidence: 0,
                applied: false,
              },
              warnings: [],
            },
            regions: [{
              id: 'normalized-full-page',
              source: 'preprocessing',
              label: 'normalized full page',
              bbox2d: [0, 0, 1, 1],
              coverageRatio: 1,
              quality: {
                score: 0.78,
                darkPixelRatio: 0.08,
                lineDensity: 0.02,
                coverageRatio: 1,
                warnings: ['region-covers-full-page'],
              },
            }, {
              id: 'table-log-panel-candidate',
              source: 'preprocessing',
              label: 'detected table/log panel candidate',
              bbox2d: [0.1, 0.2, 0.8, 0.4],
              coverageRatio: 0.14,
              quality: {
                score: 0.9,
                darkPixelRatio: 0.2,
                lineDensity: 0.04,
                coverageRatio: 0.14,
                warnings: [],
              },
              asset: {
                mimeType: 'image/png',
                byteLength: 1234,
                sha256: 'a'.repeat(64),
                width: 700,
                height: 240,
                normalized: true,
                cacheRelativePath: 'assets/cache-page-2/table-log-panel-candidate-aaaaaaaaaaaaaaaa.png',
              },
            }],
            warnings: [],
          },
        },
        layoutPages: [{
          pageNumber: 2,
          width: 1000,
          height: 1400,
          elements: [
            { index: 1, label: 'table', bbox2d: [0.1, 0.2, 0.8, 0.4], content: 'BH1 strata table', height: null, width: null },
          ],
          text: 'BH1 strata table',
          tables: ['BH1 strata table'],
          formulas: [],
          images: [],
        }],
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
    confidenceBreakdown: {
      schemaVersion: 1,
      overall: 82,
      extractionConfidence: 83,
      engineeringCompleteness: 48,
      traceabilityScore: 50,
      corroborationScore: 73,
      readinessScore: 58,
      pageEvidenceConfidence: 82,
      methodCoverage: {
        nativeTextPages: 1,
        layoutOcrPages: 1,
        visualReasoningPages: 1,
        directVisualPages: 1,
      },
      missingCriticalData: ['SPT N-values', 'RQD', 'cohesion', 'friction angle'],
      reviewGates: ['partial-pages-remain', 'direct-visual-verification-required'],
      notes: ['Confidence is provider-neutral workflow trust, not a model self-score.'],
    },
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
    expect(packet.schemaVersion).toBe(2);
    expect(packet.providerContract).toMatchObject({
      providerNeutral: true,
      purpose: 'document-evidence-contract',
    });
    expect(packet.engineeringSignals).toMatchObject({
      risks: ['Weathered rock should be verified before foundation design.'],
      recommendations: ['Verify groundwater before construction.'],
    });
    expect(packet.pages.map((page) => page.method)).toEqual([
      'native-pdf-text',
      'layout-ocr',
      'visual-reasoning',
    ]);
    expect(packet.pages[1]).toMatchObject({
      preprocessing: {
        sourceCategory: 'layout-ocr',
        cacheStatus: 'stored',
        cacheKey: 'cache-page-2',
        preprocessingVersion: 'preprocess-v2',
        pipelineVersion: 'vision-image-preprocess-v2',
        policy: 'ocr-optimized',
        transformed: true,
        operations: ['auto-orient', 'trim-white-margins-threshold-10', 'resize-inside-1800-no-enlarge'],
        quality: {
          score: 0.82,
          contentCoverageRatio: 0.72,
          darkPixelRatio: 0.08,
          regionCoverageRatio: 0.14,
          regionCount: 1,
          cropAssetCount: 1,
          deskew: {
            method: 'projection-profile',
            angleDeg: 0,
            confidence: 0,
            applied: false,
          },
          warnings: [],
        },
        input: {
          mimeType: 'image/jpeg',
          width: 2400,
          height: 3200,
        },
        output: {
          mimeType: 'image/png',
          width: 1350,
          height: 1800,
        },
        regionCount: 2,
      },
      regions: [
        {
          id: 'p2-preprocess-normalized-full-page',
          source: 'preprocessing',
          label: 'normalized full page',
          bbox2d: [0, 0, 1, 1],
          coverageRatio: 1,
          quality: {
            score: 0.78,
            darkPixelRatio: 0.08,
            lineDensity: 0.02,
            coverageRatio: 1,
            warnings: ['region-covers-full-page'],
          },
          textLength: 0,
          hasText: false,
        },
        {
          id: 'p2-preprocess-table-log-panel-candidate',
          source: 'preprocessing',
          label: 'detected table/log panel candidate',
          bbox2d: [0.1, 0.2, 0.8, 0.4],
          coverageRatio: 0.14,
          quality: {
            score: 0.9,
            darkPixelRatio: 0.2,
            lineDensity: 0.04,
            coverageRatio: 0.14,
            warnings: [],
          },
          textLength: 0,
          hasText: false,
          asset: {
            mimeType: 'image/png',
            byteLength: 1234,
            sha256: 'a'.repeat(64),
            width: 700,
            height: 240,
            normalized: true,
            cacheRelativePath: 'assets/cache-page-2/table-log-panel-candidate-aaaaaaaaaaaaaaaa.png',
          },
        },
        {
          id: 'p2-layout-2-1',
          source: 'layout-ocr',
          label: 'table',
          bbox2d: [0.1, 0.2, 0.8, 0.4],
          textLength: 16,
          hasText: true,
        },
      ],
    });
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
    expect(packet.document.confidenceBreakdown).toEqual(expect.objectContaining({
      schemaVersion: 1,
      overall: 82,
      readinessScore: expect.any(Number),
    }));
  });

  it('summarizes evidence packets for agent context without raw page dump', () => {
    const packet = buildDocumentEvidencePacket(makeResult());
    const summary = summarizeDocumentEvidencePacketForAgent(packet, { maxContentChars: 1800 });

    expect(summary).toContain('DocumentEvidencePacket v2 provider-neutral agent context');
    expect(summary).toContain('source pages 2');
    expect(summary).toContain('layout/OCR pages 2');
    expect(summary).toContain('direct visual pages 3');
    expect(summary).toContain('Trust breakdown:');
    expect(summary).toContain('Review gates:');
    expect(summary).toContain('direct-visual-verification-required');
    expect(summary).toContain('Missing parameters: Groundwater level');
    expect(summary).toContain('Boreholes: BH1; max depth 10 m');
    expect(summary).toContain('Risks: Weathered rock should be verified');
    expect(summary).toContain('Recommendations: Verify groundwater');
    expect(summary).not.toContain('"pageAudits"');
  });

  it('compiles a packet-first synthesis prompt for provider-neutral BYOK reasoning', () => {
    const packet = buildDocumentEvidencePacket(makeResult());
    const compiled = compileDocumentEvidenceSynthesisPrompt(packet, { maxEvidenceChars: 4000 });

    expect(documentEvidencePacketHasEngineeringSignal(packet)).toBe(true);
    expect(compiled.hasEngineeringSignal).toBe(true);
    expect(compiled.schemaVersion).toBe(2);
    expect(compiled.sourcePages).toEqual([2]);
    expect(compiled.reviewGates).toContain('direct-visual-verification-required');
    expect(compiled.prompt).toContain('Provider-neutral DocumentEvidencePacket synthesis evidence contract');
    expect(compiled.prompt).toContain('Ordered whole-report outline by source page');
    expect(compiled.prompt).toContain('Borehole continuity evidence');
    expect(compiled.prompt).toContain('BH1');
    expect(compiled.prompt).toContain('Groundwater level');
    expect(compiled.prompt).toContain('review=missing');
    expect(compiled.prompt).toContain('Do not invent values');
    expect(compiled.prompt).not.toContain('"pageAudits"');
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

    expect(result.evidencePacket?.schemaVersion).toBe(2);
    expect(result.evidencePacket?.observations.parameters[0]?.sourcePages).toEqual([1]);
    expect(result.evidencePacket?.providerContract.providerNeutral).toBe(true);
  });
});
