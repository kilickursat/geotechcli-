import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPersistedIngestJobSegments,
  computeWeightedPdfPageCost,
  createPersistedIngestJob,
  loadPersistedIngestJob,
  resolvePersistedIngestJobExtractionConcurrency,
  resumePersistedIngestJob,
  runPersistedIngestJobWorker,
  savePersistedIngestJob,
  shouldSegmentHostedBetaLongPdf,
  shouldUseAsyncIngestJob,
  waitForPersistedIngestJob,
  type BoreholeInterpretation,
  type GeotechDocumentInsight,
  type LLMConfig,
  type PdfDocumentInspection,
} from '../src/index.js';

function makeConfig(): LLMConfig {
  return {
    provider: 'openai-compatible',
    apiKey: 'test-key',
    timeout: 1000,
    visionModelId: 'glm-5v-turbo',
  };
}

function makeBoreholeInterpretation(pageNumber: number, totalPages: number): BoreholeInterpretation {
  const depthFrom = (pageNumber - 1) * 5;
  const depthTo = pageNumber * 5;

  return {
    boreholeId: 'BH-01',
    totalDepth: depthTo,
    waterTableDepth: null,
    layers: [
      {
        depthFrom,
        depthTo,
        description: `Layer ${pageNumber}`,
        uscsSymbol: 'CL',
        sptN: null,
        waterContent: null,
        notes: null,
      },
    ],
    summary: `Page ${pageNumber}`,
    location: null,
    groundElevation: null,
    dateDrilled: null,
    drillingMethod: null,
    projectName: 'Demo Project',
    continuationDepth: depthTo,
    pageNumber,
    totalPages,
    rawLLMText: 'mock',
    latencyMs: 0,
    parseStatus: 'parsed',
    confidence: 85,
    warnings: [],
    canAutoProceed: true,
  };
}

function makeGeotechInsight(pageNumber: number, totalPages: number, summary = `Page ${pageNumber}`): GeotechDocumentInsight {
  return {
    documentClass: 'geotechnical-document',
    title: null,
    summary,
    materials: [],
    classifications: [],
    parameters: [],
    risks: [],
    recommendations: [],
    pageNumber,
    totalPages,
    rawLLMText: 'mock',
    latencyMs: 0,
    parseStatus: 'parsed',
    confidence: 82,
    warnings: [],
    canAutoProceed: true,
  };
}

function makeInspection(
  totalPages: number,
  classifier?: (pageNumber: number) => PdfDocumentInspection['pages'][number]['classification'],
): PdfDocumentInspection {
  const pages = Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + 1;
    const classification = classifier?.(pageNumber) ?? 'digital-text';

    return {
      pageNumber,
      totalPages,
      classification,
      extractedText: '',
      normalizedText: '',
      normalizedArtifact: {
        pageNumber,
        classification,
        rotation: 0,
        nativeText: null,
        textQuality: {
          accepted: false,
          score: 0,
          printableRatio: 0,
          replacementRatio: 0,
          symbolNoiseRatio: 0,
          suspiciousTokenRatio: 0,
          dictionaryCoverageRatio: 0,
          averageTokenShapeScore: 0,
          reasons: [],
        },
        textSource: 'none' as const,
        renderedImageAvailable: classification === 'image-only' || classification === 'text-unreadable',
        headingHints: [],
        tablesDetected: false,
        figuresDetected: false,
        warnings: [],
        confidence: 0,
      },
      gracefulDegradationNotes: [],
      degradation: {
        level: 'none' as const,
        notes: [],
      },
      capabilities: {
        nativeTextExtraction: 'unavailable' as const,
        pageRendering: 'unavailable' as const,
        ocr: 'unavailable' as const,
      },
      metadata: {
        objectRef: `${pageNumber} 0 R`,
        width: 612,
        height: 792,
        rotation: 0,
        characterCount: 0,
        wordCount: 0,
        lineCount: 0,
        contentStreamCount: 0,
        decodedContentStreamCount: 0,
        undecodedContentStreamCount: 0,
        contentFilters: [],
        fontNames: [],
        hasTextOperators: false,
        hasRasterImages: classification === 'image-only' || classification === 'text-unreadable',
        hasVectorGraphics: false,
      },
      warnings: [],
    };
  });

  return {
    kind: 'pdf-document-inspection',
    totalPages,
    pages,
    capabilities: {
      nativeTextExtraction: 'unavailable',
      pageRendering: 'unavailable',
      ocr: 'unavailable',
    },
    degradation: {
      level: 'none',
      notes: [],
    },
    gracefulDegradationNotes: [],
    metadata: {
      parser: 'lightweight-page-inspector',
      byteLength: 0,
      pdfVersion: '1.7',
      isEncrypted: false,
      objectCount: totalPages,
    },
    warnings: [],
  };
}

async function writeBlankPdf(filePath: string, pageCount: number): Promise<void> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([612, 792]);
  }
  writeFileSync(filePath, Buffer.from(await pdf.save()));
}

describe('persisted ingest jobs', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-ingest-jobs-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.GEOTECHCLI_CONFIG_DIR;
    } else {
      process.env.GEOTECHCLI_CONFIG_DIR = previousConfigDir;
    }

    rmSync(configDir, { recursive: true, force: true });
  });

  it('uses weighted page cost and total page count to decide when to create async jobs', () => {
    const weightedInspection = {
      totalPages: 4,
      pages: [
        { classification: 'digital-text' },
        { classification: 'image-only' },
        { classification: 'text-unreadable' },
        { classification: 'digital-text' },
      ],
    } as unknown as PdfDocumentInspection;
    const smallInspection = {
      totalPages: 5,
      pages: Array.from({ length: 5 }, () => ({ classification: 'digital-text' })),
    } as unknown as PdfDocumentInspection;

    expect(computeWeightedPdfPageCost(weightedInspection)).toBe(6);
    expect(shouldUseAsyncIngestJob(weightedInspection)).toBe(true);
    expect(shouldUseAsyncIngestJob(smallInspection)).toBe(false);
    expect(shouldUseAsyncIngestJob(null, 6)).toBe(true);
  });

  it('builds hosted-beta segments from effective page cost and detects long geotech PDFs', () => {
    const inspection = makeInspection(31, () => 'image-only');

    const segments = buildPersistedIngestJobSegments(inspection);

    expect(segments).toEqual([
      expect.objectContaining({ startPage: 1, endPage: 30, effectivePageCost: 60 }),
      expect.objectContaining({ startPage: 31, endPage: 31, effectivePageCost: 2 }),
    ]);
    expect(shouldSegmentHostedBetaLongPdf(
      'geotech-document',
      { provider: 'hosted-beta' },
      inspection,
    )).toBe(true);
    expect(shouldSegmentHostedBetaLongPdf(
      'borehole-log',
      { provider: 'hosted-beta' },
      inspection,
    )).toBe(false);
  });

  it('serializes async hosted-beta extraction for image-heavy inspections', () => {
    const config = {
      provider: 'hosted-beta',
      modelId: 'glm-5.1',
      visionModelId: 'glm-5v-turbo',
    } satisfies Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>;
    const inspection = makeInspection(4, (pageNumber) => (pageNumber <= 3 ? 'image-only' : 'digital-text'));
    const concurrency = resolvePersistedIngestJobExtractionConcurrency(config, inspection);
    const filePath = join(configDir, 'serialized-image-heavy-source.pdf');

    expect(concurrency).toBe(1);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection,
      config: {
        ...makeConfig(),
        provider: 'hosted-beta',
        modelId: 'glm-5.1',
      },
    });

    expect(job.processing.chunkExtractionConcurrency).toBe(1);
    expect(resolvePersistedIngestJobExtractionConcurrency(config, makeInspection(4))).toBe(2);
  });

  it('serializes hosted-beta extraction for long mixed PDFs with visual tail pressure', () => {
    const config = {
      provider: 'hosted-beta',
      modelId: 'glm-5.1',
      visionModelId: 'glm-5v-turbo',
    } satisfies Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>;
    const inspection = makeInspection(34, (pageNumber) =>
      pageNumber >= 27 ? 'image-only' : 'mixed'
    );

    expect(resolvePersistedIngestJobExtractionConcurrency(config, inspection)).toBe(1);
  });

  it('recomputes extraction concurrency after worker-side inspection when the async job started without inspection data', async () => {
    const filePath = join(configDir, 'late-inspection-source.pdf');
    await writeBlankPdf(filePath, 4);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      totalPagesFallback: 4,
      config: {
        ...makeConfig(),
        provider: 'hosted-beta',
        modelId: 'glm-5.1',
      },
    });

    expect(job.processing.chunkExtractionConcurrency).toBe(2);

    await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: () => ({
        ...makeConfig(),
        provider: 'hosted-beta',
        modelId: 'glm-5.1',
      }),
      inspectPdfDocument: () => makeInspection(4, (pageNumber) => (pageNumber <= 3 ? 'image-only' : 'digital-text')),
      readDocumentPdfPageInputs: async () => [
        {
          base64: 'page-1',
          mimeType: 'image/png',
          fileBytes: 120,
          filePath,
          ext: 'png',
          kind: 'image',
          pageNumber: 1,
          totalPages: 4,
          sourceKind: 'raster-image',
          normalizedArtifact: {
            kind: 'image',
            source: 'full-page-raster',
            mimeType: 'image/png',
            fileBytes: 120,
            textSource: 'none',
            textQuality: null,
            warnings: [],
          },
        },
        {
          base64: 'page-2',
          mimeType: 'image/png',
          fileBytes: 120,
          filePath,
          ext: 'png',
          kind: 'image',
          pageNumber: 2,
          totalPages: 4,
          sourceKind: 'raster-image',
          normalizedArtifact: {
            kind: 'image',
            source: 'full-page-raster',
            mimeType: 'image/png',
            fileBytes: 120,
            textSource: 'none',
            textQuality: null,
            warnings: [],
          },
        },
        {
          base64: 'page-3',
          mimeType: 'image/png',
          fileBytes: 120,
          filePath,
          ext: 'png',
          kind: 'image',
          pageNumber: 3,
          totalPages: 4,
          sourceKind: 'raster-image',
          normalizedArtifact: {
            kind: 'image',
            source: 'full-page-raster',
            mimeType: 'image/png',
            fileBytes: 120,
            textSource: 'none',
            textQuality: null,
            warnings: [],
          },
        },
        {
          base64: 'page-4',
          mimeType: 'application/pdf',
          fileBytes: 120,
          filePath,
          ext: 'pdf',
          kind: 'document',
          pageNumber: 4,
          totalPages: 4,
          sourceKind: 'pdf-page',
          normalizedArtifact: {
            kind: 'document',
            source: 'pdf-page',
            mimeType: 'application/pdf',
            fileBytes: 120,
            textSource: 'native-text',
            textQuality: null,
            warnings: [],
          },
        },
      ],
      interpretGeotechDocumentPage: async (_imageBase64, _mimeType, _config, context) => ({
        documentClass: 'geotechnical-document',
        title: `Page ${context.pageNumber}`,
        summary: `Page ${context.pageNumber} summary.`,
        materials: [],
        classifications: [],
        parameters: [],
        risks: [],
        recommendations: [],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        rawLLMText: 'mock',
        latencyMs: 0,
        parseStatus: 'parsed',
        confidence: 81,
        warnings: [],
        canAutoProceed: true,
      }),
    });

    const persisted = loadPersistedIngestJob(job.jobId);
    expect(persisted?.processing.chunkExtractionConcurrency).toBe(1);
  }, 15_000);

  it('keeps a PDF page-count fallback when lightweight inspection cannot enumerate pages', async () => {
    const filePath = join(configDir, 'fallback-count-source.pdf');
    writeFileSync(
      filePath,
      [
        '%PDF-1.7',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Count 4 /Kids [] >> endobj',
        '%%EOF',
      ].join('\n'),
    );

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      config: makeConfig(),
    });

    expect(job.source.totalPages).toBe(4);
    expect(job.checkpoints.pages).toHaveLength(4);

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      inspectPdfDocument: () => makeInspection(0),
      readDocumentPdfPageInputs: async () => Array.from({ length: 4 }, (_, index) => ({
        base64: `fallback-page-${index + 1}`,
        mimeType: 'image/png',
        fileBytes: 120,
        filePath,
        ext: 'png',
        kind: 'image' as const,
        pageNumber: index + 1,
        totalPages: 4,
        sourceKind: 'raster-image' as const,
        normalizedArtifact: {
          kind: 'image' as const,
          source: 'full-page-raster' as const,
          mimeType: 'image/png',
          fileBytes: 120,
          textSource: 'none' as const,
          textQuality: null,
          warnings: [],
        },
      })),
      recoverDocumentTextHint: async () => ({
        textHint: undefined,
        source: 'none' as const,
        warnings: [],
        latencyMs: 0,
        transformed: false,
      }),
      interpretGeotechDocumentPage: async (_imageBase64, _mimeType, _config, context) => ({
        documentClass: 'geotechnical-document',
        title: `Page ${context.pageNumber}`,
        summary: `Fallback page ${context.pageNumber}.`,
        materials: [{ kind: 'soil', description: 'silty sand', uscsSymbol: 'SM', lithology: null }],
        classifications: [],
        parameters: [],
        risks: [],
        recommendations: [],
        pageNumber: context.pageNumber ?? null,
        totalPages: context.totalPages ?? null,
        rawLLMText: 'mock',
        latencyMs: 0,
        parseStatus: 'parsed',
        confidence: 80,
        warnings: [],
        canAutoProceed: true,
      }),
    });

    expect(completed.status).toBe('completed');
    expect(completed.source.totalPages).toBe(4);
    expect(completed.checkpoints.pages).toHaveLength(4);
    expect(completed.result?.ingestResult.source.totalPages).toBe(4);
  });

  it('runs segmented parent geotech jobs sequentially and merges one final result', async () => {
    const filePath = join(configDir, 'segmented-parent-source.pdf');
    await writeBlankPdf(filePath, 31);
    const inspection = makeInspection(31, () => 'image-only');

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection,
      config: {
        ...makeConfig(),
        provider: 'hosted-beta',
        modelId: 'glm-5.1',
      },
      segmentation: {
        mode: 'segmented-parent',
        pageRange: [1, 31],
        effectivePageLimit: 60,
      },
    });

    const interpretGeotechDocumentPage = vi.fn().mockImplementation(async (_imageBase64, _mimeType, _config, context) => ({
      documentClass: 'site-investigation-report',
      title: `Page ${context.pageNumber}`,
      summary: `Page ${context.pageNumber} summary.`,
      materials: [],
      classifications: [],
      parameters: [],
      risks: [],
      recommendations: [],
      pageNumber: context.pageNumber ?? null,
      totalPages: context.totalPages ?? null,
      rawLLMText: 'mock',
      latencyMs: 0,
      parseStatus: 'parsed',
      confidence: 82,
      warnings: [],
      canAutoProceed: true,
    }));

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: () => ({
        ...makeConfig(),
        provider: 'hosted-beta',
        modelId: 'glm-5.1',
      }),
      readDocumentPdfPageInputs: async (inputFilePath, options) => {
        const totalPages = options?.inspection?.totalPages ?? 31;
        const pageNumbers = options?.inspection?.pages?.map((page) => page.pageNumber) ?? Array.from({ length: totalPages }, (_, index) => index + 1);
        return pageNumbers.map((pageNumber) => ({
          base64: `${basename(inputFilePath)}-page-${pageNumber}`,
          mimeType: 'image/png',
          fileBytes: 120,
          filePath: inputFilePath,
          ext: 'png',
          kind: 'image' as const,
          pageNumber,
          totalPages,
          sourceKind: 'raster-image' as const,
          normalizedArtifact: {
            kind: 'image' as const,
            source: 'full-page-raster' as const,
            mimeType: 'image/png',
            fileBytes: 120,
            textSource: 'none' as const,
            textQuality: null,
            warnings: [],
          },
        }));
      },
      recoverDocumentTextHint: async () => ({
        textHint: undefined,
        source: 'none' as const,
        warnings: [],
        latencyMs: 0,
        transformed: false,
      }),
      interpretGeotechDocumentPage,
    });

    expect(completed.status).toBe('completed');
    expect(interpretGeotechDocumentPage).toHaveBeenCalledTimes(31);
    expect(completed.result?.ingestResult.source.segmentation?.mode).toBe('segmented-parent');
    expect(completed.result?.ingestResult.source.segmentation?.segments).toHaveLength(2);
    expect(completed.result?.ingestResult.source.successfulPages).toBe(31);
    expect(completed.result?.ingestResult.pageFailures).toEqual([]);

    const persisted = loadPersistedIngestJob(job.jobId);
    expect(persisted?.segmentation?.segments?.map((segment) => segment.status)).toEqual(['completed', 'completed']);
    expect(persisted?.processing.chunkExtractionConcurrency).toBe(1);
  });

  it('resumes from checkpoints and skips already completed pages', async () => {
    const filePath = join(configDir, 'resume-source.pdf');
    await writeBlankPdf(filePath, 2);

    const job = createPersistedIngestJob({
      documentType: 'borehole-log',
      filePath,
      inspection: makeInspection(2),
      config: makeConfig(),
      overrideBoreholeId: 'BH-01',
    });

    const pageCalls: number[] = [];
    const sharedDependencies = {
      buildLLMConfig: makeConfig,
      extractPrimaryPdfPageImages: async () => [],
      recoverDocumentTextHint: async () => ({
        textHint: 'BH-01',
        source: 'native-text' as const,
        warnings: [],
      }),
      interpretBoreholeLogWithContext: async (
        _base64: string,
        _mimeType: string,
        _config: LLMConfig,
        context?: { pageNumber?: number; totalPages?: number },
      ) => {
        const pageNumber = context?.pageNumber ?? 0;
        pageCalls.push(pageNumber);
        return makeBoreholeInterpretation(pageNumber, context?.totalPages ?? 2);
      },
    };

    const interrupted = await runPersistedIngestJobWorker(job.jobId, {
      ...sharedDependencies,
      stopAfterNewPages: 1,
    });

    expect(interrupted.status).toBe('failed');
    expect(pageCalls).toEqual([1]);

    const interruptedJob = loadPersistedIngestJob(job.jobId);
    expect(interruptedJob?.checkpoints.pages[0]?.status).toBe('completed');
    expect(interruptedJob?.checkpoints.pages[1]?.status).toBe('pending');

    const resumed = await runPersistedIngestJobWorker(job.jobId, sharedDependencies);

    expect(resumed.status).toBe('completed');
    expect(pageCalls).toEqual([1, 2]);
    expect(resumed.result?.ingestResult.documentType).toBe('borehole-log');
    expect(resumed.result?.ingestResult.source.successfulPages).toBe(2);
  });

  it('resume resets failed checkpoints from completed partial jobs for retry', async () => {
    const filePath = join(configDir, 'completed-partial-resume-source.pdf');
    await writeBlankPdf(filePath, 2);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(2),
      config: makeConfig(),
    });

    const persisted = loadPersistedIngestJob(job.jobId);
    if (!persisted) {
      throw new Error('Expected persisted ingest job to exist.');
    }

    const timestamp = new Date().toISOString();
    persisted.status = 'completed';
    persisted.completedAt = timestamp;
    persisted.checkpoints.pages[0] = {
      ...persisted.checkpoints.pages[0]!,
      status: 'completed',
      completedAt: timestamp,
      result: {
        documentClass: 'geotechnical-document',
        title: 'Completed page',
        summary: 'Completed before resume.',
        materials: [],
        classifications: [],
        parameters: [],
        risks: [],
        recommendations: [],
        pageNumber: 1,
        totalPages: 2,
        rawLLMText: 'mock',
        latencyMs: 0,
        parseStatus: 'parsed',
        confidence: 80,
        warnings: [],
        canAutoProceed: true,
      },
    };
    persisted.checkpoints.pages[1] = {
      ...persisted.checkpoints.pages[1]!,
      status: 'failed',
      attempts: 1,
      error: 'Page 2: upstream request failed with 524 timeout',
      downgraded: true,
    };
    persisted.result = {
      ingestResult: {
        kind: 'geotech-ingest-result',
        schemaVersion: 1,
        documentType: 'geotech-document',
        generatedAt: timestamp,
        source: {
          filePath,
          fileName: basename(filePath),
          inputKind: 'pdf',
          totalPages: 2,
          successfulPages: 1,
          failedPages: 1,
        },
        inspection: makeInspection(2),
        inspectionSummary: null,
        documentClass: 'geotechnical-document',
        title: null,
        summary: null,
        materials: [],
        classifications: [],
        parameters: [],
        risks: [],
        recommendations: [],
        pageAudits: [],
        pageFailures: ['Page 2: upstream request failed with 524 timeout'],
        warnings: [],
        reviewFindings: [],
        reviewReasons: [],
        parseStatus: 'partial',
        confidence: 60,
        reviewRequired: true,
        canAutoProceed: false,
      },
    };
    savePersistedIngestJob(persisted);

    expect(() => resumePersistedIngestJob(job.jobId)).toThrow(/child runner|Build @geotechcli\/core/i);

    const queued = loadPersistedIngestJob(job.jobId);
    expect(queued?.status).toBe('queued');
    expect(queued?.completedAt).toBeUndefined();
    expect(queued?.result).toBeUndefined();
    expect(queued?.checkpoints.pages[0]?.status).toBe('completed');
    expect(queued?.checkpoints.pages[1]?.status).toBe('pending');
    expect(queued?.checkpoints.pages[1]?.error).toBeUndefined();
    expect(queued?.checkpoints.pages[1]?.downgraded).toBe(false);
  });

  it('downgrades slow visual page failures into review findings instead of hard-failing the job', async () => {
    const filePath = join(configDir, 'slow-visual-source.pdf');
    await writeBlankPdf(filePath, 1);

    const job = createPersistedIngestJob({
      documentType: 'borehole-log',
      filePath,
      inspection: makeInspection(1, () => 'image-only'),
      config: makeConfig(),
    });

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      extractPrimaryPdfPageImages: async () => [],
      recoverDocumentTextHint: async () => ({
        textHint: undefined,
        source: 'none' as const,
        warnings: [],
      }),
      interpretBoreholeLogWithContext: async () => {
        throw new Error('timeout while waiting for visual model');
      },
    });

    expect(completed.status).toBe('completed');

    const persisted = loadPersistedIngestJob(job.jobId);
    expect(persisted?.checkpoints.pages[0]?.status).toBe('failed');
    expect(persisted?.checkpoints.pages[0]?.downgraded).toBe(true);

    expect(completed.result?.ingestResult.reviewFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'page_visual_ingest_downgraded',
        severity: 'review',
      }),
      expect.objectContaining({
        code: 'slow_visual_pages_present',
        severity: 'review',
      }),
    ]));
    expect(completed.result?.ingestResult.reviewRequired).toBe(true);
    expect(completed.result?.ingestResult.canAutoProceed).toBe(false);
  }, 15000);

  it('retries 524 upstream timeouts with backoff and carries OCR checkpoint counts into the final summary', async () => {
    const filePath = join(configDir, 'retry-524-ocr-source.pdf');
    await writeBlankPdf(filePath, 1);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(1, () => 'image-only'),
      config: makeConfig(),
    });

    const extractGeotechDocumentFactsFromText = vi.fn()
      .mockRejectedValueOnce(new Error('upstream request failed with 524 timeout'))
      .mockResolvedValue({
        documentClass: 'geotechnical-document',
        title: 'Recovered retry page',
        summary: 'Recovered after a 524 retry.',
        materials: [{ kind: 'soil', description: 'silty clay', uscsSymbol: 'CL', lithology: null }],
        classifications: [],
        parameters: [],
        risks: [],
        recommendations: [],
        pageNumber: 1,
        totalPages: 1,
        rawLLMText: 'mock',
        latencyMs: 0,
        parseStatus: 'parsed',
        confidence: 82,
        warnings: [],
        canAutoProceed: true,
      });

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      readDocumentPdfPageInputs: async () => [{
        base64: 'retry-page',
        mimeType: 'image/png',
        fileBytes: 120,
        filePath,
        ext: 'png',
        kind: 'image',
        pageNumber: 1,
        totalPages: 1,
        sourceKind: 'raster-image',
        normalizedArtifact: {
          kind: 'image',
          source: 'full-page-raster',
          mimeType: 'image/png',
          fileBytes: 120,
          textSource: 'none',
          textQuality: null,
          warnings: [],
        },
      }],
      recoverDocumentTextHint: async () => ({
        textHint: 'Recovered OCR text with silty clay.',
        source: 'vision-ocr' as const,
        warnings: ['Recovered OCR before retry.'],
        latencyMs: 0,
        transformed: false,
      }),
      extractGeotechDocumentFactsFromText,
    });

    expect(completed.status).toBe('completed');
    expect(extractGeotechDocumentFactsFromText).toHaveBeenCalledTimes(2);
    expect(completed.checkpoints.pages[0]?.attempts).toBe(2);
    expect(completed.checkpoints.pages[0]?.status).toBe('completed');
    expect(completed.result?.ingestResult.inspectionSummary?.ocrRecoveredPageCount).toBe(1);
    expect(completed.result?.ingestResult.pageFailures).toEqual([]);
  });

  it('falls back to deterministic document facts when text extraction times out', async () => {
    const filePath = join(configDir, 'text-timeout-fallback.pdf');
    await writeBlankPdf(filePath, 1);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(1, () => 'mixed'),
      config: makeConfig(),
    });
    const interpretGeotechDocumentPage = vi.fn();

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      readDocumentPdfPageInputs: async () => [{
        base64: 'text-page',
        mimeType: 'application/pdf',
        fileBytes: 120,
        filePath,
        ext: 'pdf',
        kind: 'pdf',
        pageNumber: 1,
        totalPages: 1,
        sourceKind: 'pdf-page',
      }],
      recoverDocumentTextHint: async () => ({
        textHint: 'Foundation recommendations indicate silty sand with allowable bearing capacity 35 t/m2 and settlement review required.',
        source: 'native-text' as const,
        warnings: [],
      }),
      extractGeotechDocumentFactsFromText: async () => {
        throw new Error('Page 1: text extraction timed out after 60s');
      },
      interpretGeotechDocumentPage,
    });

    expect(completed.status).toBe('completed');
    expect(completed.checkpoints.pages[0]?.status).toBe('completed');
    expect(completed.result?.ingestResult.pageFailures).toEqual([]);
    expect(completed.result?.ingestResult.reviewRequired).toBe(true);
    expect(completed.result?.ingestResult.warnings.join('\n')).toMatch(/deterministic partial extraction/i);
    expect(interpretGeotechDocumentPage).not.toHaveBeenCalled();
  });

  it('marks text recovery attempted so visual interpretation does not rerun OCR blindly', async () => {
    const filePath = join(configDir, 'no-duplicate-ocr.pdf');
    await writeBlankPdf(filePath, 1);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(1, () => 'image-only'),
      config: makeConfig(),
    });
    const interpretGeotechDocumentPage = vi.fn(async (_base64, _mimeType, _config, context) => {
      expect(context.textRecoveryAttempted).toBe(true);
      return makeGeotechInsight(1, 1, 'Visual fallback completed.');
    });

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      readDocumentPdfPageInputs: async () => [{
        base64: 'image-page',
        mimeType: 'image/png',
        fileBytes: 120,
        filePath,
        ext: 'png',
        kind: 'image',
        pageNumber: 1,
        totalPages: 1,
        sourceKind: 'raster-image',
      }],
      recoverDocumentTextHint: async () => {
        throw new Error('OCR/text recovery timed out after 180s');
      },
      interpretGeotechDocumentPage,
    });

    expect(completed.status).toBe('completed');
    expect(interpretGeotechDocumentPage).toHaveBeenCalledTimes(1);
    expect(completed.checkpoints.pages[0]?.ocrWarnings?.join('\n')).toMatch(/recovery failed/i);
  });

  it('marks remaining pages failed and completes the job when the provider hits a fatal quota stop', async () => {
    const filePath = join(configDir, 'quota-stop-source.pdf');
    await writeBlankPdf(filePath, 3);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(3),
      config: makeConfig(),
    });

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      extractPrimaryPdfPageImages: async () => [],
      interpretGeotechDocumentPage: async () => {
        throw new Error('Hosted beta daily limit reached. Remaining today: 0.');
      },
    });

    expect(completed.status).toBe('completed');
    expect(completed.result?.ingestResult.documentType).toBe('geotech-document');

    const persisted = loadPersistedIngestJob(job.jobId);
    expect(persisted?.checkpoints.pages).toHaveLength(3);
    expect(persisted?.checkpoints.pages.every((page) => page.status === 'failed')).toBe(true);
    expect(persisted?.checkpoints.pages.some((page) => page.status === 'pending')).toBe(false);
    expect(persisted?.result?.ingestResult.pageFailures.join('\n')).toMatch(/daily limit reached|upstream provider stop/i);
  });

  it('uses the shared normalized page-input pipeline for async geotech jobs', async () => {
    const filePath = join(configDir, 'normalized-page-input-source.pdf');
    await writeBlankPdf(filePath, 1);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(1, () => 'image-only'),
      config: makeConfig(),
    });

    const readDocumentPdfPageInputs = vi.fn().mockResolvedValue([{
      base64: 'rendered-png-base64',
      mimeType: 'image/png',
      fileBytes: 128,
      filePath,
      ext: 'png',
      kind: 'image',
      pageNumber: 1,
      totalPages: 1,
      sourceKind: 'raster-image',
      normalizedArtifact: {
        kind: 'image',
        source: 'full-page-raster',
        mimeType: 'image/png',
        fileBytes: 128,
        textSource: 'none',
        textQuality: null,
        warnings: [],
      },
    }]);
    const interpretGeotechDocumentPage = vi.fn().mockResolvedValue({
      documentClass: 'geotechnical-document',
      title: 'Recovered page',
      summary: 'Recovered through raster-image pipeline.',
      materials: [],
      classifications: [],
      parameters: [],
      risks: [],
      recommendations: [],
      pageNumber: 1,
      totalPages: 1,
      rawLLMText: 'mock',
      latencyMs: 0,
      parseStatus: 'parsed',
      confidence: 81,
      warnings: [],
      canAutoProceed: true,
    });

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      readDocumentPdfPageInputs,
      recoverDocumentTextHint: async () => ({
        textHint: undefined,
        source: 'none' as const,
        warnings: [],
        latencyMs: 0,
        transformed: false,
      }),
      interpretGeotechDocumentPage,
    });

    expect(readDocumentPdfPageInputs).toHaveBeenCalledTimes(1);
    expect(interpretGeotechDocumentPage).toHaveBeenCalledWith(
      'rendered-png-base64',
      'image/png',
      expect.objectContaining({ provider: 'openai-compatible' }),
      expect.objectContaining({ pageNumber: 1 }),
    );
    expect(completed.status).toBe('completed');
    expect(completed.result?.ingestResult.source.successfulPages).toBe(1);
    expect(completed.result?.ingestResult.pageFailures).toEqual([]);
  });

  it('records direct visual source and requires review for hosted-beta async geotech image pages', async () => {
    const filePath = join(configDir, 'hosted-direct-visual-source.pdf');
    await writeBlankPdf(filePath, 1);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(1, () => 'image-only'),
      config: { ...makeConfig(), provider: 'hosted-beta' },
    });

    const recoverDocumentTextHint = vi.fn(async () => {
      throw new Error('OCR recovery should be skipped for hosted-beta direct visual pages.');
    });
    const interpretGeotechDocumentPage = vi.fn().mockResolvedValue({
      documentClass: 'geotechnical-document',
      title: 'Visual borehole log',
      summary: 'SPT values were interpreted directly from the rendered page image.',
      materials: [{ kind: 'soil', description: 'silty sand', uscsSymbol: 'SM', lithology: null }],
      classifications: [{ system: 'USCS', value: 'SM', context: 'visible borehole log' }],
      parameters: [{
        name: 'sptN',
        valueText: '22',
        numericValue: 22,
        unit: null,
        material: 'silty sand',
        context: 'direct visual page interpretation',
      }],
      risks: [],
      recommendations: [],
      pageNumber: 1,
      totalPages: 1,
      rawLLMText: 'mock',
      latencyMs: 20,
      parseStatus: 'parsed',
      confidence: 88,
      warnings: [],
      canAutoProceed: true,
    });

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: () => ({ ...makeConfig(), provider: 'hosted-beta' }),
      readDocumentPdfPageInputs: async () => [{
        base64: 'hosted-direct-visual-page',
        mimeType: 'image/png',
        fileBytes: 128,
        filePath,
        ext: 'png',
        kind: 'image',
        pageNumber: 1,
        totalPages: 1,
        sourceKind: 'raster-image',
        normalizedArtifact: {
          kind: 'image',
          source: 'full-page-raster',
          mimeType: 'image/png',
          fileBytes: 128,
          textSource: 'none',
          textQuality: null,
          warnings: [],
        },
      }],
      recoverDocumentTextHint,
      interpretGeotechDocumentPage,
    });

    const persisted = loadPersistedIngestJob(job.jobId);

    expect(recoverDocumentTextHint).not.toHaveBeenCalled();
    expect(interpretGeotechDocumentPage).toHaveBeenCalledWith(
      'hosted-direct-visual-page',
      'image/png',
      expect.objectContaining({ provider: 'hosted-beta' }),
      expect.objectContaining({ pageNumber: 1, directVisualPreferred: true }),
    );
    expect(persisted?.checkpoints.pages[0]?.ocrSource).toBe('vision-visual');
    expect(completed.result?.ingestResult.pageAudits[0]?.textHintSource).toBe('vision-visual');
    expect(completed.result?.ingestResult.reviewFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'direct_visual_review_required', pageNumber: 1, severity: 'review' }),
    ]));
    expect(completed.result?.ingestResult.reviewRequired).toBe(true);
    expect(completed.result?.ingestResult.canAutoProceed).toBe(false);
  });

  it('short-circuits obvious low-yield cover pages in async geotech jobs', async () => {
    const filePath = join(configDir, 'cover-low-yield-source.pdf');
    await writeBlankPdf(filePath, 1);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(1, () => 'image-only'),
      config: makeConfig(),
    });

    const persisted = loadPersistedIngestJob(job.jobId);
    if (persisted) {
      persisted.inspection!.pages[0]!.normalizedText = 'Prepared for Proposed Project';
      persisted.inspection!.pages[0]!.normalizedArtifact.textSource = 'native-text-low-quality';
      persisted.inspection!.pages[0]!.metadata.wordCount = 24;
      savePersistedIngestJob(persisted);
    }

    const interpretGeotechDocumentPage = vi.fn();

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      readDocumentPdfPageInputs: async () => [{
        base64: 'cover-page',
        mimeType: 'image/png',
        fileBytes: 120,
        filePath,
        ext: 'png',
        kind: 'image',
        pageNumber: 1,
        totalPages: 1,
        sourceKind: 'raster-image',
        normalizedArtifact: {
          kind: 'image',
          source: 'full-page-raster',
          mimeType: 'image/png',
          fileBytes: 120,
          textSource: 'native-text-low-quality',
          textQuality: null,
          warnings: [],
        },
      }],
      interpretGeotechDocumentPage,
    });

    expect(interpretGeotechDocumentPage).not.toHaveBeenCalled();
    expect(completed.status).toBe('completed');
    expect(completed.result?.ingestResult.source.successfulPages).toBe(1);
    expect(completed.result?.ingestResult.pageFailures).toEqual([]);
    expect(completed.result?.ingestResult.reviewFindings.some((finding) => finding.code === 'administrative_page_partial')).toBe(true);
  });

  it('short-circuits image-only figure appendix pages after a visual appendix divider', async () => {
    const filePath = join(configDir, 'figure-appendix-source.pdf');
    await writeBlankPdf(filePath, 2);

    const inspection = makeInspection(2, (pageNumber) => pageNumber === 1 ? 'mixed' : 'image-only');
    inspection.pages[0]!.normalizedText = 'Appendix A\nFigures';
    inspection.pages[0]!.normalizedArtifact.nativeText = 'Appendix A\nFigures';
    inspection.pages[0]!.normalizedArtifact.textQuality.accepted = true;
    inspection.pages[0]!.normalizedArtifact.textSource = 'native-text';
    inspection.pages[0]!.metadata.wordCount = 3;
    inspection.pages[1]!.normalizedText = '! " # site layout';
    inspection.pages[1]!.normalizedArtifact.textSource = 'native-text-low-quality';
    inspection.pages[1]!.metadata.wordCount = 44;

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection,
      config: makeConfig(),
    });

    const interpretGeotechDocumentPage = vi.fn();

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      readDocumentPdfPageInputs: async () => [
        {
          base64: 'appendix-divider',
          mimeType: 'application/pdf',
          fileBytes: 120,
          filePath,
          ext: 'pdf',
          kind: 'document',
          pageNumber: 1,
          totalPages: 2,
          sourceKind: 'pdf-page',
          normalizedArtifact: {
            kind: 'document',
            source: 'pdf-page',
            mimeType: 'application/pdf',
            fileBytes: 120,
            textSource: 'native-text',
            textQuality: null,
            warnings: [],
          },
        },
        {
          base64: 'figure-page',
          mimeType: 'image/png',
          fileBytes: 240,
          filePath,
          ext: 'png',
          kind: 'image',
          pageNumber: 2,
          totalPages: 2,
          sourceKind: 'raster-image',
          normalizedArtifact: {
            kind: 'image',
            source: 'full-page-raster',
            mimeType: 'image/png',
            fileBytes: 240,
            textSource: 'native-text-low-quality',
            textQuality: null,
            warnings: [],
          },
        },
      ],
      interpretGeotechDocumentPage,
    });

    expect(interpretGeotechDocumentPage).not.toHaveBeenCalled();
    expect(completed.status).toBe('completed');
    expect(completed.result?.ingestResult.source.successfulPages).toBe(2);
    expect(completed.result?.ingestResult.reviewFindings.some((finding) => finding.code === 'visual_appendix_partial')).toBe(true);
  });

  it('does not short-circuit borehole appendices just because the divider page says appendix', async () => {
    const filePath = join(configDir, 'borehole-appendix-source.pdf');
    await writeBlankPdf(filePath, 2);

    const inspection = makeInspection(2, (pageNumber) => pageNumber === 1 ? 'mixed' : 'image-only');
    inspection.pages[0]!.normalizedText = 'Appendix B\nRecord of Boreholes';
    inspection.pages[0]!.normalizedArtifact.nativeText = 'Appendix B\nRecord of Boreholes';
    inspection.pages[0]!.normalizedArtifact.textQuality.accepted = true;
    inspection.pages[0]!.normalizedArtifact.textSource = 'native-text';
    inspection.pages[0]!.metadata.wordCount = 5;
    inspection.pages[1]!.normalizedText = '! " # borehole';
    inspection.pages[1]!.normalizedArtifact.textSource = 'native-text-low-quality';
    inspection.pages[1]!.metadata.wordCount = 156;

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection,
      config: makeConfig(),
    });

    const interpretGeotechDocumentPage = vi.fn().mockResolvedValue({
      documentClass: 'borehole-log',
      title: 'Borehole Log',
      summary: 'Recovered borehole appendix content.',
      materials: [{ kind: 'soil', description: 'Clayey silt', uscsSymbol: 'ML', lithology: null }],
      classifications: [],
      parameters: [{ name: 'sptN', valueText: '26', numericValue: 26, unit: null, material: null, context: 'SS1' }],
      risks: [],
      recommendations: [],
      pageNumber: 2,
      totalPages: 2,
      rawLLMText: 'mock',
      latencyMs: 0,
      parseStatus: 'parsed',
      confidence: 82,
      warnings: [],
      canAutoProceed: true,
    });

    await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      readDocumentPdfPageInputs: async () => [
        {
          base64: 'appendix-divider',
          mimeType: 'application/pdf',
          fileBytes: 120,
          filePath,
          ext: 'pdf',
          kind: 'document',
          pageNumber: 1,
          totalPages: 2,
          sourceKind: 'pdf-page',
          normalizedArtifact: {
            kind: 'document',
            source: 'pdf-page',
            mimeType: 'application/pdf',
            fileBytes: 120,
            textSource: 'native-text',
            textQuality: null,
            warnings: [],
          },
        },
        {
          base64: 'borehole-log-page',
          mimeType: 'image/png',
          fileBytes: 240,
          filePath,
          ext: 'png',
          kind: 'image',
          pageNumber: 2,
          totalPages: 2,
          sourceKind: 'raster-image',
          normalizedArtifact: {
            kind: 'image',
            source: 'full-page-raster',
            mimeType: 'image/png',
            fileBytes: 240,
            textSource: 'native-text-low-quality',
            textQuality: null,
            warnings: [],
          },
        },
      ],
      recoverDocumentTextHint: async () => ({
        textHint: undefined,
        source: 'none' as const,
        warnings: [],
        latencyMs: 0,
        transformed: false,
      }),
      interpretGeotechDocumentPage,
    });

    expect(interpretGeotechDocumentPage).toHaveBeenCalledWith(
      'borehole-log-page',
      'image/png',
      expect.anything(),
      expect.objectContaining({ pageNumber: 2 }),
    );
  });

  it('treats stale-heartbeat running jobs as wedged during wait', async () => {
    const filePath = join(configDir, 'stale-heartbeat-source.pdf');
    await writeBlankPdf(filePath, 1);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(1),
      config: makeConfig(),
    });

    const persisted = loadPersistedIngestJob(job.jobId);
    if (!persisted) {
      throw new Error('Expected persisted ingest job to exist.');
    }

    persisted.status = 'running';
    persisted.execution.pid = process.pid;
    persisted.execution.lastHeartbeatAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    savePersistedIngestJob(persisted);

    await expect(waitForPersistedIngestJob(job.jobId, {
      pollMs: 10,
      timeoutMs: 100,
    })).rejects.toThrow(/stopped heartbeating|wedged/i);
  });

  it('falls back to direct page interpretation when OCR recovery times out in async geotech jobs', async () => {
    const filePath = join(configDir, 'ocr-timeout-fallback-source.pdf');
    await writeBlankPdf(filePath, 1);

    const job = createPersistedIngestJob({
      documentType: 'geotech-document',
      filePath,
      inspection: makeInspection(1, () => 'image-only'),
      config: makeConfig(),
    });

    const interpretGeotechDocumentPage = vi.fn().mockResolvedValue({
      documentClass: 'lab-report',
      title: 'Chain of Custody',
      summary: 'Recovered after OCR timeout fallback.',
      materials: [],
      classifications: [],
      parameters: [],
      risks: [],
      recommendations: [],
      pageNumber: 1,
      totalPages: 1,
      rawLLMText: 'mock',
      latencyMs: 25,
      parseStatus: 'partial',
      confidence: 72,
      warnings: [],
      canAutoProceed: false,
    });

    const completed = await runPersistedIngestJobWorker(job.jobId, {
      buildLLMConfig: makeConfig,
      readDocumentPdfPageInputs: async () => [{
        base64: 'chain-of-custody-page',
        mimeType: 'image/png',
        fileBytes: 240,
        filePath,
        ext: 'png',
        kind: 'image',
        pageNumber: 1,
        totalPages: 1,
        sourceKind: 'raster-image',
        normalizedArtifact: {
          kind: 'image',
          source: 'full-page-raster',
          mimeType: 'image/png',
          fileBytes: 240,
          textSource: 'none',
          textQuality: null,
          warnings: [],
        },
      }],
      recoverDocumentTextHint: async () => {
        throw new Error('OCR/text recovery timed out after 180s');
      },
      interpretGeotechDocumentPage,
    });

    expect(interpretGeotechDocumentPage).toHaveBeenCalledTimes(1);
    expect(completed.status).toBe('completed');
    expect(completed.result?.ingestResult.pageFailures).toEqual([]);
    expect(completed.result?.ingestResult.source.successfulPages).toBe(1);
  });
});
