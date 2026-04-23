import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  computeWeightedPdfPageCost,
  createPersistedIngestJob,
  loadPersistedIngestJob,
  waitForPersistedIngestJob,
  runPersistedIngestJobWorker,
  savePersistedIngestJob,
  shouldUseAsyncIngestJob,
  type BoreholeInterpretation,
  type LLMConfig,
  type PdfDocumentInspection,
} from '../src/index.js';

function makeConfig(): LLMConfig {
  return {
    provider: 'openai-compatible',
    apiKey: 'test-key',
    timeout: 1000,
    visionModelId: 'Qwen/Qwen3.5-9B',
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
