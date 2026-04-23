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
});
