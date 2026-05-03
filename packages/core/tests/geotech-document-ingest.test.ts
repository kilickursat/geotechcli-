import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ingestGeotechDocument, type GeotechDocumentIngestResult } from '../src/index.js';

function makeResult(
  overrides?: Partial<GeotechDocumentIngestResult>,
): GeotechDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'geotech-document',
    generatedAt: '2026-04-21T00:00:00.000Z',
    source: {
      filePath: 'sample.pdf',
      fileName: 'sample.pdf',
      inputKind: 'pdf',
      totalPages: 2,
      successfulPages: 2,
      failedPages: 0,
    },
    inspection: null,
    inspectionSummary: null,
    documentClass: 'geotechnical-document',
    title: 'Sample geotechnical report',
    summary: 'Ground profile and engineering parameters extracted.',
    materials: [],
    classifications: [],
    parameters: [],
    risks: [],
    recommendations: [],
    pageAudits: [],
    pageFailures: [],
    warnings: [],
    reviewFindings: [],
    reviewReasons: [],
    parseStatus: 'parsed',
    confidence: 80,
    reviewRequired: false,
    canAutoProceed: true,
    ...overrides,
  };
}

describe('ingestGeotechDocument', () => {
  it('merges geology, lithology, and engineering parameters across document pages', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible' } as any,
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
          totalPages: 2,
        },
        {
          base64: 'page-2',
          mimeType: 'application/pdf',
          pageNumber: 2,
          totalPages: 2,
        },
      ],
      interpretPage: async (_imageBase64, _mimeType, _config, context) => makeResult({
        documentClass: context.pageNumber === 1 ? 'geology-log' : 'lab-report',
        title: context.pageNumber === 1 ? 'Desk study and laboratory summary' : null,
        summary: context.pageNumber === 1
          ? 'Shallow clay and weathered shale were described.'
          : 'Laboratory testing reported plasticity and strength parameters.',
        materials: context.pageNumber === 1
          ? [
              { kind: 'soil', description: 'stiff clay', uscsSymbol: 'CL', lithology: null },
              { kind: 'rock', description: 'weathered shale', uscsSymbol: null, lithology: 'shale' },
            ]
          : [
              { kind: 'soil', description: 'stiff clay', uscsSymbol: 'CL', lithology: null },
            ],
        classifications: context.pageNumber === 1
          ? [{ system: 'USCS', value: 'CL', context: 'stiff clay' }]
          : [{ system: 'RMR', value: '58', context: 'weathered shale' }],
        parameters: context.pageNumber === 1
          ? [
              { name: 'frictionAngle', valueText: '24', numericValue: 24, unit: 'deg', material: 'stiff clay', context: 'summary table' },
            ]
          : [
              { name: 'cohesion', valueText: '25', numericValue: 25, unit: 'kPa', material: 'stiff clay', context: 'triaxial test' },
              { name: 'ucs', valueText: '42', numericValue: 42, unit: 'MPa', material: 'weathered shale', context: 'rock test' },
            ],
        risks: context.pageNumber === 1 ? ['Weathered shale should be checked for durability.'] : [],
        recommendations: context.pageNumber === 2 ? ['Verify representative sampling before design use.'] : [],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        rawLLMText: 'mock',
        latencyMs: 10,
      }) as any,
    });

    expect(result.documentType).toBe('geotech-document');
    expect(result.documentClass).toBe('geology-log');
    expect(result.materials).toHaveLength(2);
    expect(result.classifications).toHaveLength(2);
    expect(result.parameters).toHaveLength(3);
    expect(result.risks).toContain('Weathered shale should be checked for durability.');
    expect(result.recommendations).toContain('Verify representative sampling before design use.');
    expect(result.reviewRequired).toBe(false);
    expect(result.canAutoProceed).toBe(true);
    expect(result.pageAudits[0]?.materialCount).toBe(2);
    expect(result.pageAudits[1]?.parameterCount).toBe(2);
  });

  it('adds report synthesis without inflating extraction confidence', async () => {
    const synthesizeDocument = vi.fn(async () => ({
      takeaways: ['Stiff CL clay and weathered shale govern the preliminary ground model.'],
      groundModel: ['Upper stiff clay over weathered shale.'],
      keyParameters: ['Friction angle 24 deg for stiff clay, page 1.'],
      interpretation: ['Use extracted parameters as review inputs only until source pages are checked.'],
      limitations: ['Synthesis did not change workflow confidence.'],
      sourcePages: [1],
      latencyMs: 50,
    }));

    const result = await ingestGeotechDocument({
      config: { provider: 'hosted-beta' } as any,
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
      interpretPage: async (_imageBase64, _mimeType, _config, context) => makeResult({
        summary: 'Stiff clay and weathered shale encountered.',
        materials: [
          { kind: 'soil', description: 'stiff clay', uscsSymbol: 'CL', lithology: null },
        ],
        classifications: [{ system: 'USCS', value: 'CL', context: 'page 1' }],
        parameters: [
          { name: 'frictionAngle', valueText: '24', numericValue: 24, unit: 'deg', material: 'stiff clay', context: 'page 1' },
        ],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        rawLLMText: 'mock',
        latencyMs: 10,
        confidence: 74,
      }) as any,
      synthesizeDocument,
    });

    expect(synthesizeDocument).toHaveBeenCalledTimes(1);
    expect(result.synthesis?.takeaways[0]).toMatch(/Stiff CL clay/i);
    expect(result.summary).toMatch(/Stiff CL clay/i);
    expect(result.confidence).toBe(74);
    expect(result.warnings.join(' ')).toMatch(/GLM-5\.1 synthesis/i);
  });

  it('uses OCR-style recovery for raster pages and flags manual review when parameters are missing', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible' } as any,
      source: {
        filePath: 'scan.pdf',
        fileName: 'scan.pdf',
        inputKind: 'pdf',
      },
      inspection: {
        totalPages: 1,
        warnings: [],
        metadata: {
          pdfVersion: '1.7',
          objectCount: 10,
        },
        pages: [
          {
            pageNumber: 1,
            classification: 'image-only',
            degradation: { level: 'moderate', reasons: ['image_only'] },
            capabilities: {
              nativeTextExtraction: 'unavailable',
              rasterImageExtraction: 'available',
            },
            normalizedText: '',
            rawText: '',
            metadata: {
              width: 1000,
              height: 1400,
              rotation: 0,
              characterCount: 0,
              wordCount: 0,
              lineCount: 0,
              hasTextOperators: false,
              hasRasterImages: true,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: [],
              objectRef: '1 0 R',
            },
          },
        ],
      } as any,
      pages: [
        {
          base64: 'page-1',
          mimeType: 'image/png',
          pageNumber: 1,
          totalPages: 1,
          sourceKind: 'raster-image',
        },
      ],
      transcribePageImageText: async () => ({
        text: 'Stiff clay over weathered shale. RMR 45.',
        latencyMs: 15,
        usedFallback: false,
        warnings: [],
      }),
      extractTextFacts: async (_pageText, _config, context) => makeResult({
        documentClass: 'rock-mass-document',
        summary: 'Only qualitative ground descriptions were recovered from the scanned page.',
        materials: [
          { kind: 'soil', description: 'stiff clay', uscsSymbol: 'CL', lithology: null },
          { kind: 'rock', description: 'weathered shale', uscsSymbol: null, lithology: 'shale' },
        ],
        classifications: [{ system: 'RMR', value: '45', context: 'weathered shale' }],
        parameters: [],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        rawLLMText: 'mock',
        latencyMs: 12,
        parseStatus: 'partial',
        confidence: 56,
        reviewRequired: true,
        canAutoProceed: false,
      }) as any,
    });

    expect(result.inspectionSummary?.ocrRecoveredPageCount).toBe(1);
    expect(result.pageAudits[0]?.textHintSource).toBe('vision-ocr');
    expect(result.reviewRequired).toBe(true);
    expect(result.canAutoProceed).toBe(false);
    expect(result.reviewFindings.some((finding) => finding.code === 'parameters_not_detected')).toBe(true);
  });

  it('reuses durable page evidence on rerun without repeating OCR or page extraction', async () => {
    const previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    const configDir = mkdtempSync(join(tmpdir(), 'geotechcli-geotech-cache-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;

    try {
      const transcribePageImageText = vi.fn(async () => ({
        text: 'Recovered OCR text: BH-1 silty sand SPT N 18 at page 1.',
        latencyMs: 15,
        usedFallback: false,
        warnings: [],
      }));
      const extractTextFacts = vi.fn(async (_pageText: string, _config: any, context: any) => makeResult({
        documentClass: 'borehole-log',
        summary: 'Cached borehole evidence was extracted.',
        materials: [
          { kind: 'soil', description: 'silty sand', uscsSymbol: 'SM', lithology: null },
        ],
        parameters: [
          { name: 'sptN', valueText: '18', numericValue: 18, unit: null, material: 'silty sand', context: 'page 1' },
        ],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        rawLLMText: 'mock',
        latencyMs: 12,
        parseStatus: 'parsed',
        confidence: 88,
      }) as any);

      const input = {
        config: { provider: 'openai-compatible', timeout: 60000, visionModelId: 'glm-5v-turbo' } as any,
        source: {
          filePath: 'cached-report.pdf',
          fileName: 'cached-report.pdf',
          inputKind: 'pdf' as const,
        },
        pages: [
          {
            base64: Buffer.from('fake-raster-page').toString('base64'),
            mimeType: 'image/png',
            pageNumber: 1,
            totalPages: 1,
            sourceKind: 'raster-image' as const,
          },
        ],
        transcribePageImageText,
        extractTextFacts,
        interpretPage: vi.fn(),
        usePageEvidenceCache: true,
      };

      const first = await ingestGeotechDocument(input);
      expect(first.pageAudits[0]?.evidenceCache?.status).toBe('stored');
      expect(transcribePageImageText).toHaveBeenCalledTimes(1);
      expect(extractTextFacts).toHaveBeenCalledTimes(1);

      transcribePageImageText.mockClear();
      extractTextFacts.mockClear();

      const second = await ingestGeotechDocument(input);
      expect(second.pageAudits[0]?.evidenceCache?.status).toBe('hit');
      expect(second.pageAudits[0]?.textHintSource).toBe('vision-ocr');
      expect(second.parameters[0]?.name).toBe('sptN');
      expect(transcribePageImageText).not.toHaveBeenCalled();
      expect(extractTextFacts).not.toHaveBeenCalled();
    } finally {
      if (previousConfigDir === undefined) {
        delete process.env.GEOTECHCLI_CONFIG_DIR;
      } else {
        process.env.GEOTECHCLI_CONFIG_DIR = previousConfigDir;
      }
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  it('reuses durable PDF page evidence when generated page payload bytes change', async () => {
    const previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    const configDir = mkdtempSync(join(tmpdir(), 'geotechcli-geotech-pdf-cache-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;

    try {
      const extractTextFacts = vi.fn(async (_pageText: string, _config: any, context: any) => makeResult({
        documentClass: 'site-investigation-report',
        summary: 'Stable native PDF page evidence was extracted.',
        materials: [
          { kind: 'soil', description: 'firm clay', uscsSymbol: 'CL', lithology: null },
        ],
        parameters: [
          { name: 'cohesion', valueText: '22', numericValue: 22, unit: 'kPa', material: 'firm clay', context: 'page 1' },
        ],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        rawLLMText: 'mock',
        latencyMs: 12,
        parseStatus: 'parsed',
        confidence: 86,
      }) as any);
      const interpretPage = vi.fn(async () => {
        throw new Error('Visual interpretation should be skipped for native PDF text pages.');
      });
      const baseInput = {
        config: { provider: 'openai-compatible', timeout: 60000 } as any,
        source: {
          filePath: 'unstable-generated-page-payload.pdf',
          fileName: 'unstable-generated-page-payload.pdf',
          inputKind: 'pdf' as const,
        },
        inspection: {
          totalPages: 1,
          warnings: [],
          metadata: { pdfVersion: '1.7', objectCount: 1 },
          pages: [{
            pageNumber: 1,
            classification: 'digital-text',
            degradation: { level: 'none', reasons: [] },
            capabilities: { nativeTextExtraction: 'available', rasterImageExtraction: 'available' },
            normalizedText: 'Firm clay with cohesion 22 kPa.',
            rawText: 'Firm clay with cohesion 22 kPa.',
            normalizedArtifact: {
              pageNumber: 1,
              classification: 'digital-text',
              rotation: 0,
              nativeText: 'Firm clay with cohesion 22 kPa.',
              textQuality: {
                accepted: true,
                score: 0.95,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0,
                suspiciousTokenRatio: 0,
                dictionaryCoverageRatio: 0.8,
                averageTokenShapeScore: 0.9,
                reasons: [],
              },
              textSource: 'native-text',
              renderedImageAvailable: true,
              headingHints: [],
              tablesDetected: false,
              figuresDetected: false,
              warnings: [],
              confidence: 95,
            },
            metadata: {
              width: 600,
              height: 800,
              rotation: 0,
              characterCount: 31,
              wordCount: 6,
              lineCount: 1,
              hasTextOperators: true,
              hasRasterImages: false,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '1 0 R',
            },
          }],
        } as any,
        extractTextFacts,
        interpretPage,
        usePageEvidenceCache: true,
      };

      const first = await ingestGeotechDocument({
        ...baseInput,
        pages: [{
          base64: 'first-generated-pdf-page-payload',
          mimeType: 'application/pdf',
          pageNumber: 1,
          totalPages: 1,
          sourceKind: 'pdf-page' as const,
        }],
      });
      expect(first.pageAudits[0]?.evidenceCache?.status).toBe('stored');
      expect(extractTextFacts).toHaveBeenCalledTimes(1);

      extractTextFacts.mockClear();

      const second = await ingestGeotechDocument({
        ...baseInput,
        pages: [{
          base64: 'second-generated-pdf-page-payload',
          mimeType: 'application/pdf',
          pageNumber: 1,
          totalPages: 1,
          sourceKind: 'pdf-page' as const,
        }],
      });
      expect(second.pageAudits[0]?.evidenceCache?.status).toBe('hit');
      expect(second.parameters[0]?.name).toBe('cohesion');
      expect(extractTextFacts).not.toHaveBeenCalled();
      expect(interpretPage).not.toHaveBeenCalled();
    } finally {
      if (previousConfigDir === undefined) {
        delete process.env.GEOTECHCLI_CONFIG_DIR;
      } else {
        process.env.GEOTECHCLI_CONFIG_DIR = previousConfigDir;
      }
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  it('sends hosted-beta image-only and text-unreadable raster pages directly to visual interpretation', async () => {
    const transcribePageImageText = vi.fn(async () => {
      throw new Error('OCR transcription should be skipped for direct visual hosted-beta pages.');
    });
    const extractTextFacts = vi.fn(async () => {
      throw new Error('Text-only extraction should be skipped for direct visual hosted-beta pages.');
    });
    const interpretPage = vi.fn(async (_imageBase64: string, _mimeType: string, _config: any, context: any) => makeResult({
      documentClass: context.pageNumber === 1 ? 'borehole-log' : 'lab-report',
      title: context.pageNumber === 1 ? 'Borehole BH-1' : 'Laboratory chart',
      summary: context.pageNumber === 1
        ? 'Visible borehole log values were interpreted from the page image.'
        : 'Visible laboratory chart values were interpreted from the unreadable page image.',
      materials: [
        { kind: 'soil', description: 'silty clay', uscsSymbol: 'CL', lithology: null },
      ],
      parameters: [
        {
          name: context.pageNumber === 1 ? 'sptN' : 'waterContent',
          valueText: context.pageNumber === 1 ? '18' : '22%',
          numericValue: context.pageNumber === 1 ? 18 : 22,
          unit: context.pageNumber === 1 ? null : '%',
          material: 'silty clay',
          context: 'direct visual page interpretation',
        },
      ],
      pageNumber: context.pageNumber ?? null,
      totalPages: context.totalPages ?? null,
      rawLLMText: 'mock',
      parseStatus: 'parsed',
      confidence: 86,
    }) as any);

    const result = await ingestGeotechDocument({
      config: { provider: 'hosted-beta', timeout: 60000 } as any,
      source: {
        filePath: 'visual-report.pdf',
        fileName: 'visual-report.pdf',
        inputKind: 'pdf',
      },
      inspection: {
        totalPages: 2,
        warnings: [],
        metadata: { pdfVersion: '1.7', objectCount: 6 },
        pages: ['image-only', 'text-unreadable'].map((classification, index) => ({
          pageNumber: index + 1,
          classification,
          degradation: { level: 'full', reasons: ['scan'] },
          capabilities: { nativeTextExtraction: 'unavailable', rasterImageExtraction: 'available' },
          normalizedText: '',
          rawText: '',
          normalizedArtifact: {
            pageNumber: index + 1,
            classification,
            rotation: 0,
            nativeText: '',
            textQuality: {
              accepted: false,
              score: 0.12,
              printableRatio: 0.2,
              replacementRatio: 0.4,
              symbolNoiseRatio: 0.5,
              suspiciousTokenRatio: 0.6,
              dictionaryCoverageRatio: 0.05,
              averageTokenShapeScore: 0.2,
              reasons: ['unreadable raster text'],
            },
            textSource: 'none',
            renderedImageAvailable: true,
            headingHints: [index === 0 ? 'Borehole BH-1 SPT values' : 'Laboratory moisture content chart'],
            tablesDetected: true,
            figuresDetected: index === 1,
            warnings: [],
            confidence: 18,
          },
          metadata: {
            width: 900,
            height: 1200,
            rotation: 0,
            characterCount: 0,
            wordCount: 0,
            lineCount: 0,
            hasTextOperators: false,
            hasRasterImages: true,
            contentStreamCount: 1,
            decodedContentStreamCount: 1,
            contentFilters: [],
            fontNames: [],
            objectRef: `${index + 1} 0 R`,
          },
        })),
      } as any,
      pages: [
        { base64: 'page-1', mimeType: 'image/png', pageNumber: 1, totalPages: 2, sourceKind: 'raster-image' },
        { base64: 'page-2', mimeType: 'image/png', pageNumber: 2, totalPages: 2, sourceKind: 'raster-image' },
      ],
      transcribePageImageText,
      extractTextFacts,
      interpretPage,
    });

    expect(transcribePageImageText).not.toHaveBeenCalled();
    expect(extractTextFacts).not.toHaveBeenCalled();
    expect(interpretPage).toHaveBeenCalledTimes(2);
    expect(interpretPage.mock.calls.map((call) => call[3])).toEqual([
      expect.objectContaining({ pageNumber: 1, pageClassification: 'image-only', directVisualPreferred: true }),
      expect.objectContaining({ pageNumber: 2, pageClassification: 'text-unreadable', directVisualPreferred: true }),
    ]);
    expect(result.inspectionSummary?.ocrRecoveredPageCount).toBe(0);
    expect(result.inspectionSummary?.imageHeavyPageCount).toBe(2);
    expect(result.pageAudits.map((audit) => audit.textHintSource)).toEqual(['vision-visual', 'vision-visual']);
    expect(result.warnings.join('\n')).toMatch(/Skipped OCR-only transcription and used direct visual extraction/i);
    expect(result.reviewRequired).toBe(true);
    expect(result.canAutoProceed).toBe(false);
    expect(result.reviewFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'direct_visual_review_required', pageNumber: 1, severity: 'review' }),
      expect.objectContaining({ code: 'direct_visual_review_required', pageNumber: 2, severity: 'review' }),
    ]));
    expect(result.source.successfulPages).toBe(2);
    expect(result.pageFailures).toEqual([]);
  });

  it('serializes hosted-beta extraction for image-heavy page packets', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const result = await ingestGeotechDocument({
      config: { provider: 'hosted-beta', timeout: 60000 } as any,
      source: {
        filePath: 'image-heavy-report.pdf',
        fileName: 'image-heavy-report.pdf',
        inputKind: 'pdf',
      },
      inspection: {
        totalPages: 3,
        warnings: [],
        metadata: { pdfVersion: '1.7', objectCount: 6 },
        pages: Array.from({ length: 3 }, (_, index) => ({
          pageNumber: index + 1,
          classification: 'image-only',
          degradation: { level: 'moderate', reasons: ['scan'] },
          capabilities: { nativeTextExtraction: 'available', rasterImageExtraction: 'available' },
          normalizedText: `Borehole BH-${index + 1}. Standard Penetration Test ASTM D1586. SPT ${10 + index}.`,
          rawText: `Borehole BH-${index + 1}. Standard Penetration Test ASTM D1586. SPT ${10 + index}.`,
          normalizedArtifact: {
            pageNumber: index + 1,
            classification: 'image-only',
            rotation: 0,
            nativeText: `Borehole BH-${index + 1}. Standard Penetration Test ASTM D1586. SPT ${10 + index}.`,
            textQuality: {
              accepted: true,
              score: 0.95,
              printableRatio: 1,
              replacementRatio: 0,
              symbolNoiseRatio: 0,
              suspiciousTokenRatio: 0,
              dictionaryCoverageRatio: 0.6,
              averageTokenShapeScore: 0.9,
              reasons: [],
            },
            textSource: 'native-text',
            renderedImageAvailable: true,
            headingHints: [`Borehole BH-${index + 1}`],
            tablesDetected: true,
            figuresDetected: false,
            warnings: [],
            confidence: 95,
          },
          metadata: {
            width: 900,
            height: 1200,
            rotation: 0,
            characterCount: 64,
            wordCount: 10,
            lineCount: 2,
            hasTextOperators: false,
            hasRasterImages: true,
            contentStreamCount: 1,
            decodedContentStreamCount: 1,
            contentFilters: [],
            fontNames: [],
            objectRef: `${index + 1} 0 R`,
          },
        })),
      } as any,
      pages: [
        { base64: 'page-1', mimeType: 'image/png', pageNumber: 1, totalPages: 3, sourceKind: 'raster-image' },
        { base64: 'page-2', mimeType: 'image/png', pageNumber: 2, totalPages: 3, sourceKind: 'raster-image' },
        { base64: 'page-3', mimeType: 'image/png', pageNumber: 3, totalPages: 3, sourceKind: 'raster-image' },
      ],
      extractTextFacts: async (_pageText, _config, context) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inFlight -= 1;

        return makeResult({
          documentClass: 'borehole-log',
          summary: `Borehole page ${context.pageNumber}.`,
          parameters: [
            {
              name: 'sptN',
              valueText: `${10 + (context.pageNumber ?? 0)}`,
              numericValue: 10 + (context.pageNumber ?? 0),
              unit: null,
              material: null,
              context: 'field log',
            },
          ],
          pageNumber: context.pageNumber ?? null,
          totalPages: context.totalPages ?? null,
          parseStatus: 'parsed',
          confidence: 82,
        }) as any;
      },
      interpretPage: vi.fn(),
    });

    expect(maxInFlight).toBe(1);
    expect(result.source.successfulPages).toBe(3);
    expect(result.pageFailures).toEqual([]);
  });

  it('prioritizes engineering pages over cover pages for title, summary, and document class', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible' } as any,
      source: {
        filePath: 'report.pdf',
        fileName: 'report.pdf',
        inputKind: 'pdf',
      },
      inspection: {
        totalPages: 2,
        warnings: [],
        metadata: { pdfVersion: '1.7', objectCount: 4 },
        pages: [
          {
            pageNumber: 1,
            classification: 'digital-text',
            degradation: { level: 'none', reasons: [] },
            capabilities: { nativeTextExtraction: 'available', rasterImageExtraction: 'available' },
            normalizedText: 'Project Alpha Cover Sheet',
            rawText: 'Project Alpha Cover Sheet',
            normalizedArtifact: {
              pageNumber: 1,
              classification: 'digital-text',
              rotation: 0,
              nativeText: 'Project Alpha Cover Sheet',
              textQuality: {
                accepted: true,
                score: 0.9,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0,
                suspiciousTokenRatio: 0,
                dictionaryCoverageRatio: 0.5,
                averageTokenShapeScore: 0.8,
                reasons: [],
              },
              textSource: 'native-text',
              renderedImageAvailable: true,
              headingHints: ['Project Alpha Cover Sheet'],
              tablesDetected: false,
              figuresDetected: false,
              warnings: [],
              confidence: 90,
            },
            metadata: {
              width: 600,
              height: 800,
              rotation: 0,
              characterCount: 24,
              wordCount: 4,
              lineCount: 1,
              hasTextOperators: true,
              hasRasterImages: false,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '1 0 R',
            },
          },
          {
            pageNumber: 2,
            classification: 'digital-text',
            degradation: { level: 'none', reasons: [] },
            capabilities: { nativeTextExtraction: 'available', rasterImageExtraction: 'available' },
            normalizedText: 'Ground Conditions and Laboratory Results',
            rawText: 'Ground Conditions and Laboratory Results',
            normalizedArtifact: {
              pageNumber: 2,
              classification: 'digital-text',
              rotation: 0,
              nativeText: 'Ground Conditions and Laboratory Results',
              textQuality: {
                accepted: true,
                score: 0.95,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0,
                suspiciousTokenRatio: 0,
                dictionaryCoverageRatio: 0.6,
                averageTokenShapeScore: 0.85,
                reasons: [],
              },
              textSource: 'native-text',
              renderedImageAvailable: true,
              headingHints: ['Ground Conditions'],
              tablesDetected: true,
              figuresDetected: false,
              warnings: [],
              confidence: 95,
            },
            metadata: {
              width: 600,
              height: 800,
              rotation: 0,
              characterCount: 40,
              wordCount: 6,
              lineCount: 1,
              hasTextOperators: true,
              hasRasterImages: false,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '2 0 R',
            },
          },
        ],
      } as any,
      pages: [
        { base64: 'page-1', mimeType: 'application/pdf', pageNumber: 1, totalPages: 2 },
        { base64: 'page-2', mimeType: 'application/pdf', pageNumber: 2, totalPages: 2 },
      ],
      extractTextFacts: async (_pageText, _config, context) => (
        context.pageNumber === 1
          ? makeResult({
              documentClass: 'geotechnical-document',
              title: 'Project Alpha Cover Sheet',
              summary: 'Project Alpha cover sheet and issue register.',
              pageNumber: 1,
              totalPages: 2,
              parseStatus: 'partial',
              confidence: 42,
              reviewRequired: true,
              canAutoProceed: false,
            })
          : makeResult({
              documentClass: 'site-investigation-report',
              title: 'Ground investigation report',
              summary: 'Ground conditions and laboratory parameters were extracted for design review.',
              materials: [
                { kind: 'soil', description: 'firm clay', uscsSymbol: 'CL', lithology: null },
              ],
              classifications: [
                { system: 'USCS', value: 'CL', context: 'firm clay' },
              ],
              parameters: [
                { name: 'cohesion', valueText: '22', numericValue: 22, unit: 'kPa', material: 'firm clay', context: 'triaxial test' },
              ],
              pageNumber: 2,
              totalPages: 2,
              parseStatus: 'parsed',
              confidence: 88,
            })
      ) as any,
    });

    expect(result.documentClass).toBe('site-investigation-report');
    expect(result.title).toBe('Ground investigation report');
    expect(result.summary).toContain('Ground conditions and laboratory parameters');
    expect(result.summary).not.toContain('cover sheet');
  });

  it('short-circuits obvious low-yield cover pages before multimodal extraction', async () => {
    const interpretPage = vi.fn();

    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible', timeout: 60000 } as any,
      source: {
        filePath: 'cover.pdf',
        fileName: 'cover.pdf',
        inputKind: 'pdf',
      },
      inspection: {
        totalPages: 1,
        warnings: [],
        metadata: { pdfVersion: '1.7', objectCount: 2 },
        pages: [
          {
            pageNumber: 1,
            classification: 'image-only',
            degradation: { level: 'full', reasons: ['cover_like'] },
            capabilities: { nativeTextExtraction: 'partial', rasterImageExtraction: 'available' },
            normalizedText: 'Prepared for Proposed Project',
            rawText: 'Prepared for Proposed Project',
            normalizedArtifact: {
              pageNumber: 1,
              classification: 'image-only',
              rotation: 0,
              nativeText: null,
              textQuality: {
                accepted: false,
                score: 0.45,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0.2,
                suspiciousTokenRatio: 0.5,
                dictionaryCoverageRatio: 0.1,
                averageTokenShapeScore: 0.7,
                reasons: ['low quality'],
              },
              textSource: 'native-text-low-quality',
              renderedImageAvailable: true,
              headingHints: [],
              tablesDetected: false,
              figuresDetected: false,
              warnings: [],
              confidence: 40,
            },
            metadata: {
              width: 612,
              height: 792,
              rotation: 0,
              characterCount: 120,
              wordCount: 24,
              lineCount: 4,
              hasTextOperators: true,
              hasRasterImages: true,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '1 0 R',
            },
          },
        ],
      } as any,
      pages: [
        { base64: 'page-1', mimeType: 'image/png', pageNumber: 1, totalPages: 1, sourceKind: 'raster-image' },
      ],
      interpretPage,
    });

    expect(interpretPage).not.toHaveBeenCalled();
    expect(result.source.successfulPages).toBe(1);
    expect(result.source.failedPages).toBe(0);
    expect(result.pageAudits[0]?.parseStatus).toBe('partial');
    expect(result.pageFailures).toEqual([]);
    expect(result.contentChunks?.[0]?.sectionType).toBe('administrative');
    expect(result.reviewFindings.some((finding) => finding.code === 'administrative_page_partial')).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/summarized without a full multimodal extraction call/i);
  });

  it('merges adjacent engineering sections and downgrades appendix page failures', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible', timeout: 60000 } as any,
      source: {
        filePath: 'long-report.pdf',
        fileName: 'long-report.pdf',
        inputKind: 'pdf',
      },
      inspection: {
        totalPages: 3,
        warnings: [],
        metadata: { pdfVersion: '1.7', objectCount: 8 },
        pages: [
          {
            pageNumber: 1,
            classification: 'digital-text',
            degradation: { level: 'none', reasons: [] },
            capabilities: { nativeTextExtraction: 'available', rasterImageExtraction: 'available' },
            normalizedText: 'Laboratory Testing',
            rawText: 'Laboratory Testing',
            normalizedArtifact: {
              pageNumber: 1,
              classification: 'digital-text',
              rotation: 0,
              nativeText: 'Laboratory Testing',
              textQuality: {
                accepted: true,
                score: 0.94,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0,
                suspiciousTokenRatio: 0,
                dictionaryCoverageRatio: 0.6,
                averageTokenShapeScore: 0.85,
                reasons: [],
              },
              textSource: 'native-text',
              renderedImageAvailable: true,
              headingHints: ['Laboratory Testing'],
              tablesDetected: true,
              figuresDetected: false,
              warnings: [],
              confidence: 94,
            },
            metadata: {
              width: 600,
              height: 800,
              rotation: 0,
              characterCount: 20,
              wordCount: 2,
              lineCount: 1,
              hasTextOperators: true,
              hasRasterImages: false,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '1 0 R',
            },
          },
          {
            pageNumber: 2,
            classification: 'digital-text',
            degradation: { level: 'none', reasons: [] },
            capabilities: { nativeTextExtraction: 'available', rasterImageExtraction: 'available' },
            normalizedText: 'Laboratory Testing',
            rawText: 'Laboratory Testing',
            normalizedArtifact: {
              pageNumber: 2,
              classification: 'digital-text',
              rotation: 0,
              nativeText: 'Laboratory Testing',
              textQuality: {
                accepted: true,
                score: 0.94,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0,
                suspiciousTokenRatio: 0,
                dictionaryCoverageRatio: 0.6,
                averageTokenShapeScore: 0.85,
                reasons: [],
              },
              textSource: 'native-text',
              renderedImageAvailable: true,
              headingHints: ['Laboratory Testing'],
              tablesDetected: true,
              figuresDetected: false,
              warnings: [],
              confidence: 94,
            },
            metadata: {
              width: 600,
              height: 800,
              rotation: 0,
              characterCount: 20,
              wordCount: 2,
              lineCount: 1,
              hasTextOperators: true,
              hasRasterImages: false,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '2 0 R',
            },
          },
          {
            pageNumber: 3,
            classification: 'mixed',
            degradation: { level: 'partial', reasons: ['figure_page'] },
            capabilities: { nativeTextExtraction: 'partial', rasterImageExtraction: 'available' },
            normalizedText: 'Appendix A Plate Log Figure 1',
            rawText: 'Appendix A Plate Log Figure 1',
            normalizedArtifact: {
              pageNumber: 3,
              classification: 'mixed',
              rotation: 0,
              nativeText: 'Appendix A Plate Log Figure 1',
              textQuality: {
                accepted: true,
                score: 0.9,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0,
                suspiciousTokenRatio: 0,
                dictionaryCoverageRatio: 0.4,
                averageTokenShapeScore: 0.8,
                reasons: [],
              },
              textSource: 'native-text',
              renderedImageAvailable: true,
              headingHints: ['Appendix A Plate Log'],
              tablesDetected: false,
              figuresDetected: true,
              warnings: [],
              confidence: 90,
            },
            metadata: {
              width: 600,
              height: 800,
              rotation: 0,
              characterCount: 28,
              wordCount: 5,
              lineCount: 1,
              hasTextOperators: true,
              hasRasterImages: true,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '3 0 R',
            },
          },
        ],
      } as any,
      pages: [
        { base64: 'page-1', mimeType: 'application/pdf', pageNumber: 1, totalPages: 3 },
        { base64: 'page-2', mimeType: 'application/pdf', pageNumber: 2, totalPages: 3 },
        { base64: 'page-3', mimeType: 'application/pdf', pageNumber: 3, totalPages: 3 },
      ],
      extractTextFacts: async (_pageText, _config, context) => {
        if (context.pageNumber === 3) {
          throw new Error('Page 3: visual page interpretation timed out after 60s');
        }

        return makeResult({
          documentClass: 'lab-report',
          summary: `Laboratory parameters page ${context.pageNumber}.`,
          parameters: [
            { name: 'cohesion', valueText: `${20 + (context.pageNumber ?? 0)}`, numericValue: 20 + (context.pageNumber ?? 0), unit: 'kPa', material: 'clay', context: 'triaxial test' },
          ],
          pageNumber: context.pageNumber ?? null,
          totalPages: context.totalPages ?? null,
          parseStatus: 'parsed',
          confidence: 86,
        }) as any;
      },
    });

    expect(result.contentChunks).toHaveLength(2);
    expect(result.contentChunks?.[0]?.pageRange).toEqual([1, 2]);
    expect(result.contentChunks?.[0]?.sectionType).toBe('laboratory');
    expect(result.contentChunks?.[1]?.sectionType).toBe('visual-appendix');
    expect(result.reviewFindings.some((finding) =>
      finding.code === 'visual_appendix_partial' && finding.severity === 'advisory',
    )).toBe(true);
    expect(result.reviewRequired).toBe(false);
    expect(result.canAutoProceed).toBe(false);
  });

  it('does not short-circuit engineering table pages just because appendix is mentioned later in the text', async () => {
    const extractTextFacts = vi.fn(async (_pageText: string, _config: any, context: any) => makeResult({
      documentClass: 'geotechnical-investigation',
      title: 'Borehole locations and field methods',
      summary: 'Borehole coordinates and SPT sampling methodology were extracted.',
      materials: [
        { kind: 'soil', description: 'field investigation locations and sampling program', uscsSymbol: null, lithology: null },
      ],
      parameters: [
        { name: 'sptSamplingProcedure', valueText: 'ASTM D1586', numericValue: null, unit: null, material: null, context: 'field methods' },
      ],
      pageNumber: context.pageNumber ?? null,
      totalPages: context.totalPages ?? null,
      rawLLMText: 'mock',
      latencyMs: 12,
    }) as any);
    const interpretPage = vi.fn();

    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible', timeout: 60000 } as any,
      source: {
        filePath: 'report.pdf',
        fileName: 'report.pdf',
        inputKind: 'pdf',
      },
      inspection: {
        totalPages: 1,
        warnings: [],
        metadata: { pdfVersion: '1.7', objectCount: 4 },
        pages: [
          {
            pageNumber: 1,
            classification: 'mixed',
            degradation: { level: 'none', reasons: [] },
            capabilities: { nativeTextExtraction: 'available', rasterImageExtraction: 'available' },
            normalizedText: 'BH121 BH122 Northing Easting Elevation Standard Penetration Test (SPT) ASTM D1586 Borehole logs are attached in Appendix B.',
            rawText: 'BH121 BH122 Northing Easting Elevation Standard Penetration Test (SPT) ASTM D1586 Borehole logs are attached in Appendix B.',
            normalizedArtifact: {
              pageNumber: 1,
              classification: 'mixed',
              rotation: 0,
              nativeText: 'BH121 BH122 Northing Easting Elevation Standard Penetration Test (SPT) ASTM D1586 Borehole logs are attached in Appendix B.',
              textQuality: {
                accepted: true,
                score: 0.96,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0,
                suspiciousTokenRatio: 0,
                dictionaryCoverageRatio: 0.5,
                averageTokenShapeScore: 0.9,
                reasons: [],
              },
              textSource: 'native-text',
              renderedImageAvailable: true,
              headingHints: ['BH121', 'BH122', 'Northing Easting Elevation'],
              tablesDetected: true,
              figuresDetected: false,
              warnings: [],
              confidence: 96,
            },
            metadata: {
              width: 612,
              height: 792,
              rotation: 0,
              characterCount: 124,
              wordCount: 18,
              lineCount: 3,
              hasTextOperators: true,
              hasRasterImages: false,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '1 0 R',
            },
          },
        ],
      } as any,
      pages: [
        { base64: 'page-1', mimeType: 'application/pdf', pageNumber: 1, totalPages: 1 },
      ],
      extractTextFacts,
      interpretPage,
    });

    expect(extractTextFacts).toHaveBeenCalledTimes(1);
    expect(interpretPage).not.toHaveBeenCalled();
    expect(result.parameters).toHaveLength(1);
    expect(result.pageAudits[0]?.warnings.join(' ')).not.toMatch(/short-circuited/i);
    expect(result.reviewFindings.some((finding) => finding.code === 'visual_appendix_partial')).toBe(false);
    expect(result.contentChunks?.[0]?.sectionType).not.toBe('visual-appendix');
  });

  it('keeps full geotechnical reports classified as reports when borehole logs appear in appendices', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible', timeout: 60000 } as any,
      source: {
        filePath: 'full-report.pdf',
        fileName: 'full-report.pdf',
        inputKind: 'pdf',
      },
      pages: Array.from({ length: 4 }, (_, index) => ({
        base64: `page-${index + 1}`,
        mimeType: 'application/pdf',
        pageNumber: index + 1,
        totalPages: 4,
      })),
      interpretPage: async (_imageBase64, _mimeType, _config, context) => {
        if (context.pageNumber === 1) {
          return makeResult({
            documentClass: 'site-investigation-report',
            title: 'Geotechnical Investigation Report',
            summary: 'Executive summary, scope of work, ground model, and foundation recommendations for the site investigation.',
            materials: [{ kind: 'soil', description: 'site-wide fill and clay profile', uscsSymbol: null, lithology: null }],
            classifications: [],
            parameters: [{ name: 'cohesion', valueText: '24', numericValue: 24, unit: 'kPa', material: 'clay', context: 'design summary' }],
            recommendations: ['Review borehole logs attached in Appendix B as supporting evidence.'],
            pageNumber: 1,
            totalPages: 4,
          }) as any;
        }

        return makeResult({
          documentClass: 'borehole-log',
          title: `Appendix B Borehole BH-${context.pageNumber}`,
          summary: `Borehole appendix page ${context.pageNumber} with SPT values.`,
          materials: [{ kind: 'soil', description: 'silty clay', uscsSymbol: 'CL', lithology: null }],
          classifications: [],
          parameters: [{ name: 'sptN', valueText: '18', numericValue: 18, unit: null, material: 'silty clay', context: `BH-${context.pageNumber}` }],
          pageNumber: context.pageNumber ?? null,
          totalPages: 4,
        }) as any;
      },
    });

    expect(result.documentClass).toBe('site-investigation-report');
    expect(result.parameters.some((parameter) => parameter.name === 'sptN')).toBe(true);
  });

  it('drops standards-reference numbers misread as geotech-document SPT values and preserves warnings', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible', timeout: 60000 } as any,
      source: {
        filePath: 'spt-standard.pdf',
        fileName: 'spt-standard.pdf',
        inputKind: 'pdf',
      },
      pages: [{ base64: 'page-1', mimeType: 'application/pdf', pageNumber: 1, totalPages: 1 }],
      interpretPage: async () => makeResult({
        documentClass: 'geotechnical-document',
        title: 'Field Testing',
        summary: 'SPT testing standard reference was detected.',
        materials: [{ kind: 'soil', description: 'silty sand', uscsSymbol: 'SM', lithology: null }],
        parameters: [{ name: 'sptN', valueText: 'IS 2131', numericValue: 2131, unit: null, material: null, context: 'standard penetration test reference' }],
        pageNumber: 1,
        totalPages: 1,
      }) as any,
    });

    expect(result.parameters.some((parameter) => parameter.name === 'sptN')).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/implausible SPT N value/i);
  });

  it('short-circuits zero-word late raster pages when adjacent tail pages are visual-only appendices', async () => {
    const interpretPage = vi.fn();
    const extractTextFacts = vi.fn(async (_pageText: string, _config: any, context: any) => makeResult({
      documentClass: 'site-investigation-report',
      title: 'Ground model and design summary',
      summary: 'Engineering summary page was parsed normally.',
      materials: [
        { kind: 'soil', description: 'silty clay', uscsSymbol: 'CL', lithology: null },
      ],
      parameters: [
        { name: 'cohesion', valueText: '24', numericValue: 24, unit: 'kPa', material: 'silty clay', context: 'summary table' },
      ],
      pageNumber: context.pageNumber ?? null,
      totalPages: context.totalPages ?? null,
      rawLLMText: 'mock',
      latencyMs: 10,
    }) as any);

    const result = await ingestGeotechDocument({
      config: { provider: 'hosted-beta', timeout: 60000 } as any,
      source: {
        filePath: 'tail-appendix.pdf',
        fileName: 'tail-appendix.pdf',
        inputKind: 'pdf',
      },
      inspection: {
        totalPages: 3,
        warnings: [],
        metadata: { pdfVersion: '1.7', objectCount: 6 },
        pages: [
          {
            pageNumber: 1,
            classification: 'digital-text',
            degradation: { level: 'none', reasons: [] },
            capabilities: { nativeTextExtraction: 'available', rasterImageExtraction: 'available' },
            normalizedText: 'Ground conditions and engineering parameters',
            rawText: 'Ground conditions and engineering parameters',
            normalizedArtifact: {
              pageNumber: 1,
              classification: 'digital-text',
              rotation: 0,
              nativeText: 'Ground conditions and engineering parameters',
              textQuality: {
                accepted: true,
                score: 0.97,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0,
                suspiciousTokenRatio: 0,
                dictionaryCoverageRatio: 0.7,
                averageTokenShapeScore: 0.9,
                reasons: [],
              },
              textSource: 'native-text',
              renderedImageAvailable: true,
              headingHints: ['Ground conditions'],
              tablesDetected: true,
              figuresDetected: false,
              warnings: [],
              confidence: 97,
            },
            metadata: {
              width: 612,
              height: 792,
              rotation: 0,
              characterCount: 42,
              wordCount: 5,
              lineCount: 1,
              hasTextOperators: true,
              hasRasterImages: false,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '1 0 R',
            },
          },
          {
            pageNumber: 2,
            classification: 'image-only',
            degradation: { level: 'full', reasons: ['scan'] },
            capabilities: { nativeTextExtraction: 'unavailable', rasterImageExtraction: 'available' },
            normalizedText: '',
            rawText: '',
            normalizedArtifact: {
              pageNumber: 2,
              classification: 'image-only',
              rotation: 0,
              nativeText: null,
              textQuality: null,
              textSource: 'none',
              renderedImageAvailable: true,
              headingHints: [],
              tablesDetected: false,
              figuresDetected: false,
              warnings: [],
              confidence: 20,
            },
            metadata: {
              width: 900,
              height: 1200,
              rotation: 0,
              characterCount: 0,
              wordCount: 0,
              lineCount: 0,
              hasTextOperators: false,
              hasRasterImages: true,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: [],
              objectRef: '2 0 R',
            },
          },
          {
            pageNumber: 3,
            classification: 'graphics-only',
            degradation: { level: 'full', reasons: ['figure_page'] },
            capabilities: { nativeTextExtraction: 'unavailable', rasterImageExtraction: 'available' },
            normalizedText: '',
            rawText: '',
            normalizedArtifact: {
              pageNumber: 3,
              classification: 'graphics-only',
              rotation: 0,
              nativeText: null,
              textQuality: null,
              textSource: 'none',
              renderedImageAvailable: true,
              headingHints: [],
              tablesDetected: false,
              figuresDetected: true,
              warnings: [],
              confidence: 15,
            },
            metadata: {
              width: 900,
              height: 1200,
              rotation: 0,
              characterCount: 0,
              wordCount: 0,
              lineCount: 0,
              hasTextOperators: false,
              hasRasterImages: true,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: [],
              objectRef: '3 0 R',
            },
          },
        ],
      } as any,
      pages: [
        { base64: 'page-1', mimeType: 'application/pdf', pageNumber: 1, totalPages: 3 },
        { base64: 'page-2', mimeType: 'image/png', pageNumber: 2, totalPages: 3, sourceKind: 'raster-image' },
        { base64: 'page-3', mimeType: 'image/png', pageNumber: 3, totalPages: 3, sourceKind: 'raster-image' },
      ],
      extractTextFacts,
      interpretPage,
    });

    expect(extractTextFacts).toHaveBeenCalledTimes(1);
    expect(interpretPage).not.toHaveBeenCalled();
    expect(result.source.successfulPages).toBe(3);
    expect(result.contentChunks?.some((chunk) => chunk.pageRange[0] === 2 && chunk.sectionType === 'visual-appendix')).toBe(true);
    expect(result.contentChunks?.some((chunk) => chunk.pageRange[0] === 3 && chunk.sectionType === 'visual-appendix')).toBe(true);
    expect(result.reviewFindings).toContainEqual(expect.objectContaining({
      code: 'visual_appendix_partial',
      pageNumber: 2,
      severity: 'advisory',
    }));
    expect(result.reviewFindings).not.toContainEqual(expect.objectContaining({
      code: 'page_geotech_extraction_partial',
      pageNumber: 2,
    }));
  });

  it('caps confidence and keeps auto-proceed disabled when partial or failed pages remain', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible', timeout: 60000 } as any,
      source: {
        filePath: 'report.pdf',
        fileName: 'report.pdf',
        inputKind: 'pdf',
      },
      inspection: {
        totalPages: 3,
        warnings: [],
        metadata: { pdfVersion: '1.7', objectCount: 6 },
        pages: [
          {
            pageNumber: 1,
            classification: 'image-only',
            degradation: { level: 'full', reasons: ['scan'] },
            capabilities: { nativeTextExtraction: 'unavailable', rasterImageExtraction: 'available' },
            normalizedText: '',
            rawText: '',
            metadata: {
              width: 900,
              height: 1200,
              rotation: 0,
              characterCount: 0,
              wordCount: 0,
              lineCount: 0,
              hasTextOperators: false,
              hasRasterImages: true,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: [],
              objectRef: '1 0 R',
            },
          },
          {
            pageNumber: 2,
            classification: 'digital-text',
            degradation: { level: 'none', reasons: [] },
            capabilities: { nativeTextExtraction: 'available', rasterImageExtraction: 'available' },
            normalizedText: 'Ground conditions and design parameters',
            rawText: 'Ground conditions and design parameters',
            normalizedArtifact: {
              pageNumber: 2,
              classification: 'digital-text',
              rotation: 0,
              nativeText: 'Ground conditions and design parameters',
              textQuality: {
                accepted: true,
                score: 0.96,
                printableRatio: 1,
                replacementRatio: 0,
                symbolNoiseRatio: 0,
                suspiciousTokenRatio: 0,
                dictionaryCoverageRatio: 0.7,
                averageTokenShapeScore: 0.9,
                reasons: [],
              },
              textSource: 'native-text',
              renderedImageAvailable: true,
              headingHints: ['Ground conditions'],
              tablesDetected: true,
              figuresDetected: false,
              warnings: [],
              confidence: 96,
            },
            metadata: {
              width: 612,
              height: 792,
              rotation: 0,
              characterCount: 40,
              wordCount: 5,
              lineCount: 1,
              hasTextOperators: true,
              hasRasterImages: false,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: ['Helvetica'],
              objectRef: '2 0 R',
            },
          },
          {
            pageNumber: 3,
            classification: 'image-only',
            degradation: { level: 'full', reasons: ['scan'] },
            capabilities: { nativeTextExtraction: 'unavailable', rasterImageExtraction: 'available' },
            normalizedText: '',
            rawText: '',
            metadata: {
              width: 900,
              height: 1200,
              rotation: 0,
              characterCount: 0,
              wordCount: 0,
              lineCount: 0,
              hasTextOperators: false,
              hasRasterImages: true,
              contentStreamCount: 1,
              decodedContentStreamCount: 1,
              contentFilters: [],
              fontNames: [],
              objectRef: '3 0 R',
            },
          },
        ],
      } as any,
      pages: [
        { base64: 'page-1', mimeType: 'image/png', pageNumber: 1, totalPages: 3, sourceKind: 'raster-image' },
        { base64: 'page-2', mimeType: 'application/pdf', pageNumber: 2, totalPages: 3, sourceKind: 'pdf-page' },
        { base64: 'page-3', mimeType: 'image/png', pageNumber: 3, totalPages: 3, sourceKind: 'raster-image' },
      ],
      transcribePageImageText: async (_base64, _mimeType, _config) => ({
        text: 'Chain of custody sample ID BH102 S01 required analysis VOCs.',
        latencyMs: 20,
        usedFallback: false,
        warnings: ['Recovered OCR text by chunking a dense document image into 2 slice(s).'],
      }),
      extractTextFacts: async (_pageText, _config, context) => {
        if (context.pageNumber === 3) {
          throw new Error('Page 3: Hosted beta request timed out after 150s.');
        }

        return makeResult({
          documentClass: context.pageNumber === 1 ? 'lab-report' : 'site-investigation-report',
          summary: context.pageNumber === 1
            ? 'Chain of custody and required analyses were recovered from a scanned laboratory page.'
            : 'Ground conditions and design parameters were extracted.',
          parameters: context.pageNumber === 1
            ? []
            : [
                { name: 'cohesion', valueText: '22', numericValue: 22, unit: 'kPa', material: 'clay', context: 'triaxial test' },
              ],
          pageNumber: context.pageNumber ?? null,
          totalPages: context.totalPages ?? null,
          parseStatus: context.pageNumber === 1 ? 'partial' : 'parsed',
          confidence: context.pageNumber === 1 ? 82 : 92,
          reviewRequired: context.pageNumber === 1,
          canAutoProceed: false,
          warnings: context.pageNumber === 1 ? ['Recovered from scanned laboratory form.'] : [],
        }) as any;
      },
    });

    expect(result.parseStatus).toBe('partial');
    expect(result.confidence).toBe(68);
    expect(result.canAutoProceed).toBe(false);
    expect(result.pageAudits[0]?.warnings.join(' ')).toMatch(/chunking a dense document image/i);
    expect(result.pageFailures).toEqual(['Page 3: Hosted beta request timed out after 150s.']);
  });

  it('keeps broader report classification when borehole appendix pages dominate', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible', timeout: 60000 } as any,
      source: {
        filePath: 'report.pdf',
        fileName: 'report.pdf',
        inputKind: 'pdf',
      },
      pages: [
        { base64: 'page-1', mimeType: 'application/pdf', pageNumber: 1, totalPages: 3 },
        { base64: 'page-2', mimeType: 'application/pdf', pageNumber: 2, totalPages: 3 },
        { base64: 'page-3', mimeType: 'application/pdf', pageNumber: 3, totalPages: 3 },
      ],
      interpretPage: async (_imageBase64, _mimeType, _config, context) => makeResult({
        documentClass: 'borehole-log',
        title: context.pageNumber === 1 ? 'Geotechnical report and foundation recommendations' : `Borehole appendix ${context.pageNumber}`,
        summary: context.pageNumber === 1
          ? 'Site investigation report with scope of work, ground model, and foundation recommendations.'
          : 'Borehole log appendix page with SPT observations.',
        materials: [{ kind: 'soil', description: 'silty sand', uscsSymbol: 'SM', lithology: null }],
        parameters: [{ name: 'sptN', valueText: '18', numericValue: 18, unit: null, material: null, context: 'borehole appendix' }],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        rawLLMText: 'mock',
      }) as any,
    });

    expect(result.documentClass).toBe('geotechnical-document');
    expect(result.materials.length).toBeGreaterThan(0);
  });

  it('removes implausible SPT parameter values that look like standards references', async () => {
    const result = await ingestGeotechDocument({
      config: { provider: 'openai-compatible', timeout: 60000 } as any,
      source: {
        filePath: 'report.pdf',
        fileName: 'report.pdf',
        inputKind: 'pdf',
      },
      pages: [{ base64: 'page-1', mimeType: 'application/pdf', pageNumber: 1, totalPages: 1 }],
      interpretPage: async (_imageBase64, _mimeType, _config, context) => makeResult({
        documentClass: 'geotechnical-document',
        title: 'Field and laboratory methods',
        summary: 'Standard references and real engineering parameters were extracted.',
        parameters: [
          { name: 'sptN', valueText: 'IS 9640', numericValue: 9640, unit: null, material: null, context: 'field methods standard reference' },
          { name: 'frictionAngle', valueText: '32', numericValue: 32, unit: 'deg', material: 'sand', context: 'design table' },
        ],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        rawLLMText: 'mock',
      }) as any,
    });

    expect(result.parameters.some((parameter) => parameter.name === 'sptN')).toBe(false);
    expect(result.parameters.some((parameter) => parameter.name === 'frictionAngle')).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/implausible SPT N value/i);
    expect(result.canAutoProceed).toBe(false);
  });
});
