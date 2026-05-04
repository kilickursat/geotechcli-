import { describe, expect, it, vi } from 'vitest';

import {
  extractPrimaryPdfPageImages,
  ingestBoreholeLogDocument,
  inspectPdfDocument,
  type BoreholeInterpretation,
  type BoreholeVisionPageInput,
  type PdfDocumentInspection,
} from '../src/index.js';

function createPdfInspection(
  classifications: Array<'digital-text' | 'image-only' | 'text-unreadable'>,
): PdfDocumentInspection {
  return {
    kind: 'pdf-document-inspection',
    totalPages: classifications.length,
    pages: classifications.map((classification, index) => ({
      pageNumber: index + 1,
      totalPages: classifications.length,
      classification,
      extractedText: classification === 'digital-text' ? `BH-${index + 1}` : '',
      normalizedText: classification === 'digital-text' ? `BH-${index + 1}` : '',
      gracefulDegradationNotes:
        classification === 'digital-text'
          ? []
          : ['Native text is unavailable on this page.'],
      degradation: {
        level: classification === 'digital-text' ? 'none' : 'partial',
        notes: classification === 'digital-text' ? [] : ['Fallback-only page analysis.'],
      },
      capabilities: {
        nativeTextExtraction: classification === 'digital-text' ? 'available' : 'unavailable',
        pageRendering: 'unavailable',
        ocr: 'unavailable',
      },
      metadata: {
        objectRef: `${index + 1} 0 R`,
        width: 595,
        height: 842,
        rotation: 0,
        characterCount: classification === 'digital-text' ? 20 : 0,
        wordCount: classification === 'digital-text' ? 4 : 0,
        lineCount: classification === 'digital-text' ? 2 : 0,
        contentStreamCount: 1,
        decodedContentStreamCount: 1,
        undecodedContentStreamCount: 0,
        contentFilters: [],
        fontNames: [],
        hasTextOperators: classification === 'digital-text',
        hasRasterImages: classification !== 'digital-text',
        hasVectorGraphics: false,
      },
      warnings: [],
    })),
    capabilities: {
      nativeTextExtraction: classifications.every((value) => value === 'digital-text')
        ? 'available'
        : 'partial',
      pageRendering: 'unavailable',
      ocr: 'unavailable',
    },
    degradation: {
      level: classifications.every((value) => value === 'digital-text') ? 'none' : 'partial',
      notes: classifications.every((value) => value === 'digital-text')
        ? []
        : ['One or more pages do not have a native text layer.'],
    },
    gracefulDegradationNotes: classifications.every((value) => value === 'digital-text')
      ? []
      : ['One or more pages do not have a native text layer.'],
    metadata: {
      parser: 'lightweight-page-inspector',
      byteLength: 2048,
      pdfVersion: '1.7',
      isEncrypted: false,
      objectCount: 24,
    },
    warnings: [],
  };
}

function createPageInput(
  pageNumber: number,
  totalPages: number,
  overrides: Partial<BoreholeVisionPageInput> = {},
): BoreholeVisionPageInput {
  return {
    base64: `page-${pageNumber}`,
    mimeType: 'application/pdf',
    fileBytes: 1024,
    pageNumber,
    totalPages,
    sourceKind: 'pdf-page',
    ...overrides,
  };
}

function createInterpretation(overrides: Partial<BoreholeInterpretation>): BoreholeInterpretation {
  return {
    boreholeId: 'BH-01',
    totalDepth: 12,
    waterTableDepth: 3,
    layers: [
      {
        depthFrom: 0,
        depthTo: 12,
        description: 'Silty sand',
        uscsSymbol: 'SM',
        sptN: 8,
        waterContent: null,
        notes: null,
      },
    ],
    summary: 'Default borehole interpretation.',
    location: null,
    groundElevation: null,
    dateDrilled: null,
    drillingMethod: null,
    projectName: null,
    continuationDepth: 12,
    pageNumber: 1,
    totalPages: 1,
    rawLLMText: 'mock',
    latencyMs: 100,
    parseStatus: 'parsed',
    confidence: 84,
    warnings: [],
    canAutoProceed: true,
    ...overrides,
  };
}

describe('ingestBoreholeLogDocument', () => {
  it('recovers OCR-style text hints for raster page inputs and keeps the JSON envelope coherent', async () => {
    const interpretPageWithContext = vi.fn(async (_base64: string, _mimeType: string, _config: unknown, context?: { pageNumber?: number; pageTextHint?: string }) => {
      if (context?.pageNumber === 3) {
        expect(context.pageTextHint).toContain('BH-02');
      }

      switch (context?.pageNumber) {
        case 1:
          return createInterpretation({
            boreholeId: 'BH-01',
            totalDepth: 10,
            continuationDepth: 10,
            pageNumber: 1,
            totalPages: 3,
            layers: [
              {
                depthFrom: 0,
                depthTo: 10,
                description: 'Silty sand',
                uscsSymbol: 'SM',
                sptN: 8,
                waterContent: null,
                notes: null,
              },
            ],
            summary: 'Upper profile for BH-01.',
          });
        case 2:
          return createInterpretation({
            boreholeId: 'BH-01',
            totalDepth: 20,
            continuationDepth: 20,
            pageNumber: 2,
            totalPages: 3,
            layers: [
              {
                depthFrom: 10,
                depthTo: 20,
                description: 'Clay',
                uscsSymbol: 'CL',
                sptN: 14,
                waterContent: null,
                notes: null,
              },
            ],
            summary: 'Lower profile for BH-01.',
          });
        default:
          return createInterpretation({
            boreholeId: 'BH-02',
            totalDepth: 8,
            continuationDepth: 8,
            pageNumber: 3,
            totalPages: 3,
            layers: [
              {
                depthFrom: 0,
                depthTo: 8,
                description: 'Dense sand',
                uscsSymbol: 'SP',
                sptN: 20,
                waterContent: null,
                notes: null,
              },
            ],
            summary: 'Independent borehole BH-02.',
          });
      }
    });

    const transcribePageImageText = vi.fn(async () => ({
      text: 'BH-02\nPage 3\n0 - 8 m dense sand',
      latencyMs: 80,
      usedFallback: false,
      warnings: [],
    }));

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'sample.pdf', fileName: 'sample.pdf', inputKind: 'pdf' },
      inspection: createPdfInspection(['digital-text', 'digital-text', 'image-only']),
      pages: [
        createPageInput(1, 3),
        createPageInput(2, 3),
        createPageInput(3, 3, { mimeType: 'image/png', sourceKind: 'raster-image' }),
      ],
      interpretPageWithContext,
      transcribePageImageText,
      now: () => new Date('2026-04-21T00:00:00.000Z'),
    });

    expect(result.kind).toBe('geotech-ingest-result');
    expect(result.schemaVersion).toBe(1);
    expect(result.documentType).toBe('borehole-log');
    expect(result.generatedAt).toBe('2026-04-21T00:00:00.000Z');
    expect(result.boreholes).toHaveLength(2);
    expect(result.boreholes.map((borehole) => borehole.boreholeId)).toEqual(['BH-01', 'BH-02']);
    expect(result.boreholes[0]?.layers).toHaveLength(2);
    expect(result.inspectionSummary?.pageClassificationCounts['image-only']).toBe(1);
    expect(result.inspectionSummary?.ocrRecoveredPageCount).toBe(1);
    expect(result.pageAudits[2]?.textHintSource).toBe('vision-ocr');
    expect(result.reviewRequired).toBe(false);
    expect(result.reviewFindings).toEqual([]);
    expect(result.reviewReasons).toEqual([]);
    expect(result.canAutoProceed).toBe(true);
    expect(result.source.totalPages).toBe(3);
    expect(result.source.successfulPages).toBe(3);
    expect(result.source.failedPages).toBe(0);
    expect(result.pageFailures).toHaveLength(0);
    expect(transcribePageImageText).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('captures page failures and downgrades auto-proceed state', async () => {
    const interpretPageWithContext = vi.fn(async (_base64: string, _mimeType: string, _config: unknown, context?: { pageNumber?: number }) => {
      if (context?.pageNumber === 2) {
        throw new Error('Hosted beta timeout');
      }

      return createInterpretation({
        boreholeId: 'BH-09',
        pageNumber: context?.pageNumber ?? 1,
        totalPages: 2,
      });
    });

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'failure.pdf', fileName: 'failure.pdf', inputKind: 'pdf' },
      inspection: createPdfInspection(['digital-text', 'digital-text']),
      pages: [createPageInput(1, 2), createPageInput(2, 2)],
      interpretPageWithContext,
    });

    expect(result.boreholes).toHaveLength(1);
    expect(result.pageFailures).toHaveLength(1);
    expect(result.pageFailures[0]).toContain('Hosted beta timeout');
    expect(result.reviewRequired).toBe(true);
    expect(result.reviewFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'page_ingest_failed',
        severity: 'blocking',
        scope: 'page',
        pageNumber: 2,
      }),
      expect.objectContaining({
        code: 'page_failures_present',
        severity: 'blocking',
        scope: 'document',
      }),
    ]));
    expect(result.reviewReasons.join(' ')).toMatch(/failed during ingest/i);
    expect(result.canAutoProceed).toBe(false);
    expect(result.source.failedPages).toBe(1);
    expect(result.pageAudits[1]?.parseStatus).toBe('failed');
    expect(result.pageFailures.length).toBe(result.source.failedPages);
    expect(result.reviewRequired).toBe(result.reviewReasons.length > 0);
  });

  it('starts a new unresolved group when depths restart near surface without a stable ID', async () => {
    const interpretPageWithContext = vi.fn(async (_base64: string, _mimeType: string, _config: unknown, context?: { pageNumber?: number }) => {
      if (context?.pageNumber === 1) {
        return createInterpretation({
          boreholeId: 'BH-01',
          continuationDepth: 15,
          totalDepth: 15,
          pageNumber: 1,
          totalPages: 2,
        });
      }

      return createInterpretation({
        boreholeId: 'BH-unknown',
        totalDepth: 6,
        continuationDepth: 6,
        pageNumber: 2,
        totalPages: 2,
        layers: [
          {
            depthFrom: 0,
            depthTo: 6,
            description: 'Restarted profile',
            uscsSymbol: 'ML',
            sptN: 4,
            waterContent: null,
            notes: null,
          },
        ],
        summary: 'Potential new borehole without a stable ID.',
      });
    });

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'restart.pdf', fileName: 'restart.pdf', inputKind: 'pdf' },
      inspection: createPdfInspection(['digital-text', 'digital-text']),
      pages: [createPageInput(1, 2), createPageInput(2, 2)],
      interpretPageWithContext,
    });

    expect(result.boreholes).toHaveLength(2);
    expect(result.pageAudits[1]?.assignedGroup).toMatch(/^unresolved:/);
    expect(result.reviewRequired).toBe(true);
    expect(result.reviewFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'unstable_borehole_group',
        severity: 'blocking',
        scope: 'document',
      }),
    ]));
    expect(result.reviewReasons.join(' ')).toMatch(/stable borehole ID/i);
  });

  it('supports direct image ingest and leaves inspection summary empty', async () => {
    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'log.png', fileName: 'log.png', inputKind: 'image' },
      image: {
        base64: 'image-data',
        mimeType: 'image/png',
        fileBytes: 512,
      },
      interpretSingleImage: vi.fn(async () => createInterpretation({
        boreholeId: 'BH-IMG',
        totalDepth: 18,
        pageNumber: 1,
        totalPages: 1,
      })),
    });

    expect(result.boreholes).toHaveLength(1);
    expect(result.boreholes[0]?.boreholeId).toBe('BH-IMG');
    expect(result.inspection).toBeNull();
    expect(result.inspectionSummary).toBeNull();
    expect(result.pageAudits[0]?.textHintSource).toBe('none');
  });

  it('ignores packet cover pages that do not contain usable borehole signals', async () => {
    const inspection: PdfDocumentInspection = {
      ...createPdfInspection(['digital-text', 'digital-text', 'digital-text']),
      pages: [
        {
          ...createPdfInspection(['digital-text']).pages[0],
          pageNumber: 1,
          totalPages: 3,
          extractedText: 'Project Alpha Cover Sheet\nRevision A',
          normalizedText: 'Project Alpha Cover Sheet Revision A',
        },
        {
          ...createPdfInspection(['digital-text']).pages[0],
          pageNumber: 2,
          totalPages: 3,
          extractedText: 'BH-21 Page 1\n0 - 5 m Silty sand',
          normalizedText: 'BH-21 Page 1 0 - 5 m Silty sand',
        },
        {
          ...createPdfInspection(['digital-text']).pages[0],
          pageNumber: 3,
          totalPages: 3,
          extractedText: 'BH-21 Page 2\n5 - 10 m Clay',
          normalizedText: 'BH-21 Page 2 5 - 10 m Clay',
        },
      ],
    };

    const interpretPageWithContext = vi.fn(async (_base64: string, _mimeType: string, _config: unknown, context?: { pageNumber?: number }) => {
      if (context?.pageNumber === 1) {
        return createInterpretation({
          boreholeId: 'BH-unknown',
          totalDepth: null,
          waterTableDepth: null,
          layers: [],
          summary: 'Project cover page.',
          projectName: 'Project Alpha',
          continuationDepth: null,
          pageNumber: 1,
          totalPages: 3,
          parseStatus: 'partial',
          confidence: 32,
        });
      }

      if (context?.pageNumber === 2) {
        return createInterpretation({
          boreholeId: 'BH-21',
          totalDepth: 5,
          continuationDepth: 5,
          pageNumber: 2,
          totalPages: 3,
          layers: [
            {
              depthFrom: 0,
              depthTo: 5,
              description: 'Silty sand',
              uscsSymbol: 'SM',
              sptN: 10,
              waterContent: null,
              notes: null,
            },
          ],
        });
      }

      return createInterpretation({
        boreholeId: 'BH-21',
        totalDepth: 10,
        continuationDepth: 10,
        pageNumber: 3,
        totalPages: 3,
        layers: [
          {
            depthFrom: 5,
            depthTo: 10,
            description: 'Clay',
            uscsSymbol: 'CL',
            sptN: 14,
            waterContent: null,
            notes: null,
          },
        ],
      });
    });

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'packet.pdf', fileName: 'packet.pdf', inputKind: 'pdf' },
      inspection,
      pages: [createPageInput(1, 3), createPageInput(2, 3), createPageInput(3, 3)],
      interpretPageWithContext,
    });

    expect(result.boreholes).toHaveLength(1);
    expect(result.boreholes[0]?.boreholeId).toBe('BH-21');
    expect(result.pageAudits[0]?.assignedGroup).toBe('ignored:non-log');
    expect(result.reviewReasons.join(' ')).not.toMatch(/stable borehole ID/i);
    expect(result.reviewReasons.join(' ')).not.toMatch(/parsed only partially or failed/i);
    expect(result.reviewRequired).toBe(false);
    expect(result.canAutoProceed).toBe(true);
  });

  it('ingests a real packet-style PDF and excludes the cover while merging digital and scanned borehole pages', async () => {
    const pdfBytes = await createReportPacketPdfBuffer();
    const inspection = inspectPdfDocument(pdfBytes);
    const pages = await createHybridPageInputsFromBuffer(pdfBytes, inspection);
    const interpretPageWithContext = vi.fn(async (
      _base64: string,
      _mimeType: string,
      _config: unknown,
      context?: { pageNumber?: number; pageTextHint?: string },
    ) => {
      if (context?.pageNumber === 1) {
        expect(context.pageTextHint).toContain('Project Alpha Cover Sheet');
        return createInterpretation({
          boreholeId: 'BH-unknown',
          totalDepth: null,
          waterTableDepth: null,
          layers: [],
          summary: 'Project cover page.',
          projectName: 'Project Alpha',
          continuationDepth: null,
          pageNumber: 1,
          totalPages: 3,
          parseStatus: 'partial',
          confidence: 30,
        });
      }

      if (context?.pageNumber === 2) {
        expect(context.pageTextHint).toContain('BH-21 Page 1');
        return createInterpretation({
          boreholeId: 'BH-21',
          totalDepth: 5,
          continuationDepth: 5,
          pageNumber: 2,
          totalPages: 3,
          layers: [
            {
              depthFrom: 0,
              depthTo: 5,
              description: 'Silty sand',
              uscsSymbol: 'SM',
              sptN: 10,
              waterContent: null,
              notes: null,
            },
          ],
        });
      }

      expect(context?.pageTextHint).toContain('BH-21');
      return createInterpretation({
        boreholeId: 'BH-21',
        totalDepth: 10,
        continuationDepth: 10,
        pageNumber: 3,
        totalPages: 3,
        layers: [
          {
            depthFrom: 5,
            depthTo: 10,
            description: 'Clay',
            uscsSymbol: 'CL',
            sptN: 14,
            waterContent: null,
            notes: null,
          },
        ],
      });
    });

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'packet.pdf', fileName: 'packet.pdf', inputKind: 'pdf' },
      inspection,
      pages,
      interpretPageWithContext,
      transcribePageImageText: vi.fn(async () => ({
        text: 'BH-21\nPage 2\n5 - 10 m Clay',
        latencyMs: 40,
        usedFallback: false,
        warnings: [],
      })),
    });

    expect(result.boreholes).toHaveLength(1);
    expect(result.boreholes[0]?.boreholeId).toBe('BH-21');
    expect(result.boreholes[0]?.layers).toHaveLength(2);
    expect(result.pageAudits[0]?.assignedGroup).toBe('ignored:non-log');
    expect(result.pageAudits[2]?.textHintSource).toBe('vision-ocr');
    expect(result.inspectionSummary?.imageHeavyPageCount).toBe(1);
    expect(result.inspectionSummary?.ocrRecoveredPageCount).toBe(1);
    expect(result.reviewReasons.join(' ')).not.toMatch(/stable borehole ID/i);
    expect(result.reviewReasons.join(' ')).not.toMatch(/did not yield a recovered OCR-style text hint/i);
    expect(result.reviewRequired).toBe(false);
    expect(result.canAutoProceed).toBe(true);
  }, 10000);

  it('recovers OCR hints for scanned pages with a useless native text layer', async () => {
    const pdfBytes = await createImagePdfWithWhitespaceTextLayer();
    const inspection = inspectPdfDocument(pdfBytes);
    const images = await extractPrimaryPdfPageImages(pdfBytes);
    expect(images).toHaveLength(1);

    const interpretPageWithContext = vi.fn(async (
      _base64: string,
      _mimeType: string,
      _config: unknown,
      context?: { pageTextHint?: string; pageNumber?: number },
    ) => {
      expect(context?.pageNumber).toBe(1);
      expect(context?.pageTextHint).toContain('BH-31');
      return createInterpretation({
        boreholeId: 'BH-31',
        totalDepth: 6,
        continuationDepth: 6,
        pageNumber: 1,
        totalPages: 1,
        layers: [
          {
            depthFrom: 0,
            depthTo: 6,
            description: 'Clay',
            uscsSymbol: 'CL',
            sptN: 12,
            waterContent: null,
            notes: null,
          },
        ],
      });
    });

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'ocr-layer.pdf', fileName: 'ocr-layer.pdf', inputKind: 'pdf' },
      inspection,
      pages: images.map((image) => ({
        base64: Buffer.from(image.data).toString('base64'),
        mimeType: image.mimeType,
        fileBytes: image.byteLength,
        pageNumber: image.pageNumber,
        totalPages: image.totalPages,
        sourceKind: 'raster-image' as const,
      })),
      interpretPageWithContext,
      transcribePageImageText: vi.fn(async () => ({
        text: 'BH-31\nPage 1\n0 - 6 m Clay\nGroundwater 2.0 m',
        latencyMs: 40,
        usedFallback: false,
        warnings: [],
      })),
    });

    expect(inspection.pages[0]?.capabilities.nativeTextExtraction).toBe('partial');
    expect(result.inspectionSummary?.ocrRecoveredPageCount).toBe(1);
    expect(result.pageAudits[0]?.textHintSource).toBe('vision-ocr');
    expect(result.reviewReasons.join(' ')).not.toMatch(/did not yield a recovered OCR-style text hint/i);
    expect(result.reviewRequired).toBe(false);
    expect(result.canAutoProceed).toBe(true);
  });

  it('applies override borehole ids and preserves page ordering even when inputs are unsorted', async () => {
    const interpretPageWithContext = vi.fn(async (_base64: string, _mimeType: string, _config: unknown, context?: { pageNumber?: number }) =>
      createInterpretation({
        boreholeId: context?.pageNumber === 2 ? 'BH-ORIGINAL-2' : 'BH-ORIGINAL-1',
        pageNumber: context?.pageNumber ?? 1,
        totalPages: 2,
      }),
    );

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'override.pdf', fileName: 'override.pdf', inputKind: 'pdf' },
      inspection: createPdfInspection(['digital-text', 'digital-text']),
      pages: [createPageInput(2, 2), createPageInput(1, 2)],
      interpretPageWithContext,
      overrideBoreholeId: 'BH-OVERRIDE',
    });

    expect(result.boreholes).toHaveLength(1);
    expect(result.boreholes[0]?.boreholeId).toBe('BH-OVERRIDE');
    expect(result.pageAudits.map((audit) => audit.pageNumber)).toEqual([1, 2]);
    expect(result.pageAudits.every((audit) => audit.assignedGroup === 'borehole:BH-OVERRIDE')).toBe(true);
  });

  it('deduplicates duplicated continuation pages without inflating merged layers', async () => {
    const interpretPageWithContext = vi.fn(async (_base64: string, _mimeType: string, _config: unknown, context?: { pageNumber?: number }) => {
      if (context?.pageNumber === 1) {
        return createInterpretation({
          boreholeId: 'BH-DUP',
          totalDepth: 5,
          continuationDepth: 5,
          pageNumber: 1,
          totalPages: 3,
          layers: [
            {
              depthFrom: 0,
              depthTo: 5,
              description: 'Silty sand',
              uscsSymbol: 'SM',
              sptN: 8,
              waterContent: null,
              notes: null,
            },
          ],
        });
      }

      return createInterpretation({
        boreholeId: 'BH-DUP',
        totalDepth: 10,
        continuationDepth: 10,
        pageNumber: context?.pageNumber ?? 2,
        totalPages: 3,
        layers: [
          {
            depthFrom: 5,
            depthTo: 10,
            description: 'Clay',
            uscsSymbol: 'CL',
            sptN: 14,
            waterContent: null,
            notes: null,
          },
        ],
      });
    });

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'duplicate.pdf', fileName: 'duplicate.pdf', inputKind: 'pdf' },
      inspection: createPdfInspection(['digital-text', 'digital-text', 'digital-text']),
      pages: [createPageInput(1, 3), createPageInput(2, 3), createPageInput(3, 3)],
      interpretPageWithContext,
    });

    expect(result.boreholes).toHaveLength(1);
    expect(result.boreholes[0]?.layers).toHaveLength(2);
    expect(result.boreholes[0]?.totalDepth).toBe(10);
    expect(result.reviewRequired).toBe(false);
    expect(result.canAutoProceed).toBe(true);
  });

  it('preserves rotated continuation-page text hints during ingest', async () => {
    const pdfBytes = await createRotatedContinuationPdfBuffer();
    const inspection = inspectPdfDocument(pdfBytes);
    const pages = await createPdfPageInputsFromBuffer(pdfBytes);
    const interpretPageWithContext = vi.fn(async (
      _base64: string,
      _mimeType: string,
      _config: unknown,
      context?: { pageNumber?: number; pageTextHint?: string },
    ) => {
      if (context?.pageNumber === 2) {
        expect(context.pageTextHint).toContain('BH-51 Page 2');
        expect(inspection.pages[1]?.metadata.rotation).toBe(90);
        return createInterpretation({
          boreholeId: 'BH-51',
          totalDepth: 10,
          continuationDepth: 10,
          pageNumber: 2,
          totalPages: 2,
          layers: [
            {
              depthFrom: 5,
              depthTo: 10,
              description: 'Clay',
              uscsSymbol: 'CL',
              sptN: 14,
              waterContent: null,
              notes: null,
            },
          ],
        });
      }

      return createInterpretation({
        boreholeId: 'BH-51',
        totalDepth: 5,
        continuationDepth: 5,
        pageNumber: 1,
        totalPages: 2,
        layers: [
          {
            depthFrom: 0,
            depthTo: 5,
            description: 'Silty sand',
            uscsSymbol: 'SM',
            sptN: 8,
            waterContent: null,
            notes: null,
          },
        ],
      });
    });

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'rotated.pdf', fileName: 'rotated.pdf', inputKind: 'pdf' },
      inspection,
      pages,
      interpretPageWithContext,
    });

    expect(result.boreholes).toHaveLength(1);
    expect(result.boreholes[0]?.boreholeId).toBe('BH-51');
    expect(result.boreholes[0]?.totalDepth).toBe(10);
    expect(result.reviewRequired).toBe(false);
    expect(result.canAutoProceed).toBe(true);
  });

  it('uses inherited multi-stream text hints during ingest', async () => {
    const pdfBytes = await createInheritedMultiStreamPdfBuffer();
    const inspection = inspectPdfDocument(pdfBytes);
    const pages = await createPdfPageInputsFromBuffer(pdfBytes);
    const interpretPageWithContext = vi.fn(async (
      _base64: string,
      _mimeType: string,
      _config: unknown,
      context?: { pageNumber?: number; pageTextHint?: string },
    ) => {
      expect(context?.pageNumber).toBe(1);
      expect(context?.pageTextHint).toContain('BH-81 Page 1');
      expect(context?.pageTextHint).toContain('0 - 6 m Silty sand');
      return createInterpretation({
        boreholeId: 'BH-81',
        totalDepth: 6,
        continuationDepth: 6,
        pageNumber: 1,
        totalPages: 1,
        layers: [
          {
            depthFrom: 0,
            depthTo: 6,
            description: 'Silty sand',
            uscsSymbol: 'SM',
            sptN: 10,
            waterContent: null,
            notes: null,
          },
        ],
      });
    });

    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'office-like.pdf', fileName: 'office-like.pdf', inputKind: 'pdf' },
      inspection,
      pages,
      interpretPageWithContext,
    });

    expect(result.boreholes).toHaveLength(1);
    expect(result.boreholes[0]?.boreholeId).toBe('BH-81');
    expect(result.boreholes[0]?.totalDepth).toBe(6);
    expect(result.pageAudits[0]?.textHintSource).toBe('native-text');
    expect(result.reviewRequired).toBe(false);
    expect(result.canAutoProceed).toBe(true);
  });

  it('flags merged boreholes with non-monotonic depths and implausible values', async () => {
    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'validation.pdf', fileName: 'validation.pdf', inputKind: 'pdf' },
      inspection: createPdfInspection(['digital-text']),
      pages: [createPageInput(1, 1)],
      interpretPageWithContext: vi.fn(async () => createInterpretation({
        boreholeId: 'BH-VAL',
        totalDepth: 8,
        waterTableDepth: 11,
        groundElevation: 10050,
        layers: [
          {
            depthFrom: 0,
            depthTo: 5,
            description: 'Sand',
            uscsSymbol: 'SP',
            sptN: 12,
            waterContent: null,
            notes: null,
          },
          {
            depthFrom: 4,
            depthTo: 3,
            description: 'Clay',
            uscsSymbol: 'CL',
            sptN: -1,
            waterContent: 230,
            notes: null,
          },
        ],
      })),
    });

    expect(result.reviewRequired).toBe(true);
    expect(result.canAutoProceed).toBe(false);
    expect(result.boreholes[0]?.canAutoProceed).toBe(false);
    expect(result.boreholes[0]?.parseStatus).toBe('partial');
    expect(result.boreholes[0]?.confidence).toBeLessThan(84);
    expect(result.reviewFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'water_table_below_total_depth',
        severity: 'blocking',
        scope: 'borehole',
        boreholeId: 'BH-VAL',
      }),
      expect.objectContaining({
        code: 'layer_depth_restart',
        severity: 'blocking',
        scope: 'borehole',
        boreholeId: 'BH-VAL',
      }),
      expect.objectContaining({
        code: 'implausible_spt_n',
        severity: 'blocking',
        scope: 'borehole',
        boreholeId: 'BH-VAL',
      }),
    ]));
    expect(result.reviewReasons.join(' ')).toMatch(/water table depth/i);
    expect(result.reviewReasons.join(' ')).toMatch(/overlapping or restarted layer depths/i);
    expect(result.reviewReasons.join(' ')).toMatch(/implausible SPT N/i);
  });

  it('sanitizes standards-reference numbers misread as SPT values while preserving warnings', async () => {
    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'spt-standard.pdf', fileName: 'spt-standard.pdf', inputKind: 'pdf' },
      inspection: createPdfInspection(['digital-text']),
      pages: [createPageInput(1, 1)],
      interpretPageWithContext: vi.fn(async () => createInterpretation({
        boreholeId: 'BH-SPT',
        totalDepth: 6,
        layers: [
          {
            depthFrom: 0,
            depthTo: 6,
            description: 'Silty sand; standard penetration testing noted by IS 2131 reference.',
            uscsSymbol: 'SM',
            sptN: 2131,
            waterContent: null,
            notes: null,
          },
        ],
      })),
    });

    expect(result.boreholes[0]?.layers[0]?.sptN).toBeNull();
    expect(result.boreholes[0]?.warnings.join(' ')).toMatch(/implausible SPT N value/i);
    expect(result.reviewFindings.some((finding) => finding.code === 'implausible_spt_n')).toBe(false);
  });

  it('flags low-confidence projected coordinates for manual review', async () => {
    const result = await ingestBoreholeLogDocument({
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
      source: { filePath: 'coordinates.pdf', fileName: 'coordinates.pdf', inputKind: 'pdf' },
      inspection: createPdfInspection(['digital-text']),
      pages: [createPageInput(1, 1)],
      interpretPageWithContext: vi.fn(async () => createInterpretation({
        boreholeId: 'BH-COORD',
        location: {
          boreholeId: 'BH-COORD',
          crs: {
            kind: 'projected',
            code: 'UTM',
            name: 'Universal Transverse Mercator',
            source: 'heuristic',
            confidence: 0.45,
          },
          projected: {
            easting: 448251,
            northing: 5411932,
          },
        },
      })),
    });

    expect(result.reviewRequired).toBe(true);
    expect(result.canAutoProceed).toBe(false);
    expect(result.boreholes[0]?.canAutoProceed).toBe(false);
    expect(result.reviewFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'low_crs_confidence',
        severity: 'review',
        scope: 'borehole',
        boreholeId: 'BH-COORD',
      }),
    ]));
    expect(result.reviewReasons.join(' ')).toMatch(/low CRS confidence/i);
  });

  it('throws a combined error when every page fails', async () => {
    await expect(() =>
      ingestBoreholeLogDocument({
        config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 },
        source: { filePath: 'all-fail.pdf', fileName: 'all-fail.pdf', inputKind: 'pdf' },
        inspection: createPdfInspection(['digital-text', 'digital-text']),
        pages: [createPageInput(1, 2), createPageInput(2, 2)],
        interpretPageWithContext: vi.fn(async (_base64: string, _mimeType: string, _config: unknown, context?: { pageNumber?: number }) => {
          throw new Error(`Failure on page ${context?.pageNumber}`);
        }),
      }),
    ).rejects.toThrow(/No pages could be ingested successfully/i);
  });
});

async function createImagePdfWithWhitespaceTextLayer(): Promise<Buffer> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z0e0AAAAASUVORK5CYII=',
    'base64',
  );

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const image = await pdf.embedPng(pngBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawImage(image, {
    x: 0,
    y: 0,
    width: 595,
    height: 842,
  });
  page.drawText('   ', {
    x: 24,
    y: 24,
    size: 12,
    font,
  });

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function createReportPacketPdfBuffer(): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z0e0AAAAASUVORK5CYII=',
    'base64',
  );

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      margin: 0,
    });

    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))));
    doc.on('error', reject);

    doc.addPage({ size: [612, 792], margin: 48 });
    doc.fontSize(18).text('Project Alpha Cover Sheet');
    doc.fontSize(12).text('Revision A');

    doc.addPage({ size: [612, 792], margin: 48 });
    doc.fontSize(16).text('BH-21 Page 1');
    doc.fontSize(12).text('0 - 5 m Silty sand');

    doc.addPage({ size: [595, 842], margin: 0 });
    doc.image(pngBytes, 0, 0, { width: 595, height: 842 });
    doc.end();
  });
}

async function createInheritedMultiStreamPdfBuffer(): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');

  const base = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      margin: 48,
    });

    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))));
    doc.on('error', reject);

    doc.addPage({ size: [612, 792], margin: 48 });
    doc.fontSize(16).text('BH-81 Page 1');
    doc.end();
  });

  const source = base.toString('latin1');
  const patchedPage = source.replace(
    /<<\s*\/Type \/Page\s*\/Parent 1 0 R\s*\/MediaBox \[0 0 612 792\]\s*\/Contents 5 0 R\s*\/Resources 6 0 R\s*>>/,
    [
      '<<',
      '/Type /Page',
      '/Parent 1 0 R',
      '/Contents [5 0 R 13 0 R]',
      '>>',
    ].join('\n'),
  );
  const patchedPages = patchedPage.replace(
    /<<\s*\/Type \/Pages\s*\/Count 1\s*\/Kids \[7 0 R\]\s*>>/,
    [
      '<<',
      '/Type /Pages',
      '/Count 1',
      '/Kids [7 0 R]',
      '/MediaBox [0 0 612 792]',
      '/Resources 6 0 R',
      '>>',
    ].join('\n'),
  );

  const secondStreamSource = [
    'BT',
    '/F1 12 Tf',
    '1 0 0 1 48 700 Tm',
    '(0 - 6 m Silty sand) Tj',
    'ET',
  ].join('\n');
  const secondObject = [
    '',
    '13 0 obj',
    '<<',
    `/Length ${Buffer.byteLength(secondStreamSource, 'latin1')}`,
    '>>',
    'stream',
    secondStreamSource,
    'endstream',
    'endobj',
    '',
  ].join('\n');

  const finalSource = patchedPages.includes('\nxref')
    ? patchedPages.replace(/\nxref/, `\n${secondObject}\nxref`)
    : `${patchedPages}\n${secondObject}`;

  return Buffer.from(finalSource, 'latin1');
}

async function createRotatedContinuationPdfBuffer(): Promise<Buffer> {
  const { PDFDocument, StandardFonts, degrees } = await import('pdf-lib');

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const firstPage = pdf.addPage([595, 842]);
  firstPage.drawText('BH-51 Page 1', { x: 40, y: 780, size: 16, font });
  firstPage.drawText('0 - 5 m Silty sand', { x: 40, y: 740, size: 12, font });

  const secondPage = pdf.addPage([595, 842]);
  secondPage.setRotation(degrees(90));
  secondPage.drawText('BH-51 Page 2', { x: 40, y: 780, size: 16, font });
  secondPage.drawText('5 - 10 m Clay', { x: 40, y: 740, size: 12, font });

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function createPdfPageInputsFromBuffer(pdfBytes: Buffer): Promise<BoreholeVisionPageInput[]> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = source.getPageCount();
  const pageInputs: BoreholeVisionPageInput[] = [];

  for (let index = 0; index < totalPages; index += 1) {
    const pageDoc = await PDFDocument.create();
    const [copiedPage] = await pageDoc.copyPages(source, [index]);
    pageDoc.addPage(copiedPage);
    const pageBytes = await pageDoc.save();
    const pageBuffer = Buffer.from(pageBytes);

    pageInputs.push({
      base64: pageBuffer.toString('base64'),
      mimeType: 'application/pdf',
      fileBytes: pageBuffer.length,
      pageNumber: index + 1,
      totalPages,
      sourceKind: 'pdf-page',
    });
  }

  return pageInputs;
}

async function createHybridPageInputsFromBuffer(
  pdfBytes: Buffer,
  inspection: PdfDocumentInspection,
): Promise<BoreholeVisionPageInput[]> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const extractedImages = await extractPrimaryPdfPageImages(pdfBytes);
  const extractedImageByPage = new Map(extractedImages.map((image) => [image.pageNumber, image] as const));
  const totalPages = source.getPageCount();
  const pageInputs: BoreholeVisionPageInput[] = [];

  for (let index = 0; index < totalPages; index += 1) {
    const pageNumber = index + 1;
    const inspectionPage = inspection.pages[index];
    const extractedImage = extractedImageByPage.get(pageNumber);

    if (
      extractedImage
      && (inspectionPage?.classification === 'image-only' || inspectionPage?.classification === 'text-unreadable')
    ) {
      pageInputs.push({
        base64: Buffer.from(extractedImage.data).toString('base64'),
        mimeType: extractedImage.mimeType,
        fileBytes: extractedImage.byteLength,
        pageNumber,
        totalPages,
        sourceKind: 'raster-image',
      });
      continue;
    }

    const pageDoc = await PDFDocument.create();
    const [copiedPage] = await pageDoc.copyPages(source, [index]);
    pageDoc.addPage(copiedPage);
    const pageBytes = await pageDoc.save();
    const pageBuffer = Buffer.from(pageBytes);

    pageInputs.push({
      base64: pageBuffer.toString('base64'),
      mimeType: 'application/pdf',
      fileBytes: pageBuffer.length,
      pageNumber,
      totalPages,
      sourceKind: 'pdf-page',
    });
  }

  return pageInputs;
}
