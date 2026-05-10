import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ingestJobMocks = vi.hoisted(() => ({
  readDocumentVisionInput: vi.fn(),
  readDocumentPdfPageInputs: vi.fn(),
  inspectPdfDocument: vi.fn(),
  ingestBoreholeLogDocument: vi.fn(),
  ingestGeotechDocument: vi.fn(),
}));

vi.mock('../src/ingest/document-inputs.js', async () => {
  const actual = await vi.importActual<typeof import('../src/ingest/document-inputs.js')>('../src/ingest/document-inputs.js');
  return {
    ...actual,
    readDocumentVisionInput: ingestJobMocks.readDocumentVisionInput,
    readDocumentPdfPageInputs: ingestJobMocks.readDocumentPdfPageInputs,
  };
});

vi.mock('../src/ingest/pdf.js', async () => {
  const actual = await vi.importActual<typeof import('../src/ingest/pdf.js')>('../src/ingest/pdf.js');
  return {
    ...actual,
    inspectPdfDocument: ingestJobMocks.inspectPdfDocument,
  };
});

vi.mock('../src/ingest/geotech-extract.js', async () => {
  const actual = await vi.importActual<typeof import('../src/ingest/geotech-extract.js')>('../src/ingest/geotech-extract.js');
  return {
    ...actual,
    ingestBoreholeLogDocument: ingestJobMocks.ingestBoreholeLogDocument,
  };
});

vi.mock('../src/ingest/geotech-document.js', async () => {
  const actual = await vi.importActual<typeof import('../src/ingest/geotech-document.js')>('../src/ingest/geotech-document.js');
  return {
    ...actual,
    ingestGeotechDocument: ingestJobMocks.ingestGeotechDocument,
  };
});

import {
  createProject,
  loadProject,
} from '../src/storage/index.js';
import {
  approvePersistedBoreholeIngestReview,
  getGeotechIngestJob,
  listPersistedBoreholeIngestReviewApprovals,
  listGeotechIngestJobs,
  loadLatestPersistedBoreholeIngestReviewApproval,
  loadGeotechIngestJobResult,
  listPersistedBoreholeIngestReviews,
  loadPersistedBoreholeIngestReviewApproval,
  loadLatestPersistedBoreholeIngestReview,
  loadPersistedBoreholeIngestReview,
  persistBoreholeIngestReview,
  promotePersistedBoreholeIngestReview,
  startGeotechIngestJob,
  waitGeotechIngestJob,
  type BoreholeDocumentIngestResult,
  type GeotechDocumentIngestResult,
} from '../src/index.js';

function makeIngestResult(
  overrides?: Partial<BoreholeDocumentIngestResult>,
): BoreholeDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'borehole-log',
    generatedAt: '2026-04-21T01:00:00.000Z',
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
    boreholes: [
      {
        boreholeId: 'BH-01',
        projectName: 'Demo Project',
        drillingMethod: null,
        dateDrilled: null,
        groundElevation: null,
        waterTableDepth: 2.4,
        location: null,
        totalDepth: 8,
        layers: [
          {
            depthFrom: 0,
            depthTo: 3,
            description: 'Clayey SILT',
            uscsSymbol: 'ML',
            sptN: 8,
            waterContent: null,
            notes: null,
          },
          {
            depthFrom: 3,
            depthTo: 8,
            description: 'Silty SAND',
            uscsSymbol: 'SM',
            sptN: 18,
            waterContent: null,
            notes: null,
          },
        ],
        summary: 'Parsed borehole log.',
        rawLLMText: 'mock',
        pageNumber: 1,
        totalPages: 2,
        continuationDepth: 8,
        latencyMs: 120,
        parseStatus: 'parsed',
        confidence: 84,
        warnings: [],
        canAutoProceed: true,
      },
    ],
    pageAudits: [],
    pageFailures: [],
    warnings: [],
    reviewFindings: [],
    reviewReasons: [],
    reviewRequired: false,
    confidence: 84,
    canAutoProceed: true,
    ...overrides,
  };
}

function makeGeotechDocumentResult(
  overrides?: Partial<GeotechDocumentIngestResult>,
): GeotechDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'geotech-document',
    generatedAt: '2026-04-21T02:00:00.000Z',
    source: {
      filePath: 'site-investigation.pdf',
      fileName: 'site-investigation.pdf',
      inputKind: 'pdf',
      totalPages: 3,
      successfulPages: 3,
      failedPages: 0,
    },
    inspection: null,
    inspectionSummary: null,
    documentClass: 'site-investigation-report',
    title: 'Site investigation summary',
    summary: 'Clay over weathered shale with laboratory parameters.',
    materials: [
      {
        kind: 'soil',
        description: 'stiff clay',
        uscsSymbol: 'CL',
        lithology: null,
      },
      {
        kind: 'rock',
        description: 'weathered shale',
        uscsSymbol: null,
        lithology: 'shale',
      },
    ],
    classifications: [
      {
        system: 'USCS',
        value: 'CL',
        context: 'stiff clay',
      },
    ],
    parameters: [
      {
        name: 'cohesion',
        valueText: '25',
        numericValue: 25,
        unit: 'kPa',
        material: 'stiff clay',
        context: 'triaxial',
      },
    ],
    risks: ['Weathered shale durability should be reviewed.'],
    recommendations: ['Confirm representative sampling before final design.'],
    pageAudits: [],
    pageFailures: [],
    warnings: [],
    reviewFindings: [],
    reviewReasons: [],
    parseStatus: 'parsed',
    confidence: 79,
    confidenceBreakdown: {
      schemaVersion: 1,
      overall: 79,
      extractionConfidence: 86,
      engineeringCompleteness: 74,
      traceabilityScore: 100,
      corroborationScore: 88,
      readinessScore: 78,
      pageEvidenceConfidence: 82,
      methodCoverage: {
        nativeTextPages: 1,
        layoutOcrPages: 0,
        visualReasoningPages: 0,
        directVisualPages: 0,
      },
      missingCriticalData: ['groundwater level', 'SPT N-values', 'RQD', 'friction angle'],
      reviewGates: [],
      notes: ['Confidence is provider-neutral workflow trust, not a model self-score.'],
    },
    reviewRequired: false,
    canAutoProceed: true,
    ...overrides,
  };
}

describe('ingest review persistence', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-ingest-review-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;

    ingestJobMocks.readDocumentVisionInput.mockReturnValue({
      base64: 'ZmFrZQ==',
      mimeType: 'application/pdf',
      fileBytes: 1024,
      filePath: 'sample.pdf',
      ext: 'pdf',
      kind: 'pdf',
    });
    ingestJobMocks.readDocumentPdfPageInputs.mockResolvedValue([{
      base64: 'cGFnZQ==',
      mimeType: 'application/pdf',
      fileBytes: 256,
      filePath: 'sample.pdf',
      ext: 'pdf',
      kind: 'pdf',
      pageNumber: 1,
      totalPages: 1,
      sourceKind: 'pdf-page',
    }]);
    ingestJobMocks.inspectPdfDocument.mockReturnValue({
      kind: 'pdf-document-inspection',
      totalPages: 1,
      pages: [{
        pageNumber: 1,
        totalPages: 1,
        classification: 'digital-text',
        extractedText: '',
        normalizedText: '',
        gracefulDegradationNotes: [],
        degradation: { level: 'none', notes: [] },
        capabilities: {
          nativeTextExtraction: 'available',
          pageRendering: 'unavailable',
          ocr: 'unavailable',
        },
        metadata: {
          objectRef: '1 0 R',
          width: null,
          height: null,
          rotation: 0,
          characterCount: 0,
          wordCount: 0,
          lineCount: 0,
          contentStreamCount: 1,
          decodedContentStreamCount: 1,
          undecodedContentStreamCount: 0,
          contentFilters: [],
          fontNames: [],
          hasTextOperators: true,
          hasRasterImages: false,
          hasVectorGraphics: false,
        },
        warnings: [],
      }],
      capabilities: {
        nativeTextExtraction: 'available',
        pageRendering: 'unavailable',
        ocr: 'unavailable',
      },
      degradation: { level: 'none', notes: [] },
      gracefulDegradationNotes: [],
      metadata: {
        parser: 'lightweight-page-inspector',
        byteLength: 1024,
        pdfVersion: '1.4',
        isEncrypted: false,
        objectCount: 1,
      },
      warnings: [],
    });
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.GEOTECHCLI_CONFIG_DIR;
    } else {
      process.env.GEOTECHCLI_CONFIG_DIR = previousConfigDir;
    }

    rmSync(configDir, { recursive: true, force: true });
  });

  it('persists ingest review records, artifacts, and latest pointer into project storage', () => {
    const project = createProject('Review Project');
    const result = makeIngestResult({
      reviewFindings: [
        {
          code: 'low_crs_confidence',
          severity: 'review',
          scope: 'borehole',
          message: 'Borehole BH-01 has projected coordinates with low CRS confidence (45%) for UTM.',
          boreholeId: 'BH-01',
        },
      ],
      reviewReasons: [
        'Borehole BH-01 has projected coordinates with low CRS confidence (45%) for UTM.',
      ],
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 68,
    });

    const record = persistBoreholeIngestReview(project.meta.id, result);

    expect(record.datasetName).toMatch(/^ingest-review:/);
    expect(record.summary.reviewRequired).toBe(true);
    expect(record.summary.reviewFindings).toBe(1);
    expect(record.summary.blockingFindings).toBe(0);
    expect(record.sourceStamps.sourceFingerprint).toBeTruthy();
    expect(record.sourceStamps.parserVersion).toContain('geotech-extract@1');
    expect(record.sourceStamps.normalizedResultHash).toBeTruthy();

    const loaded = loadProject(project.meta.id);
    expect(loaded.namedDatasets[record.datasetName]?.kind).toBe('geotech-ingest-review');
    expect(loaded.namedDatasets[record.datasetName]?.metadata?.sourceFingerprint).toBe(record.sourceStamps.sourceFingerprint);
    expect(loaded.namedDatasets['ingest-review:latest']?.kind).toBe('geotech-ingest-review-pointer');
    expect(loaded.artifacts.at(-1)?.kind).toBe('ingest-review');
    expect(loaded.notes.at(-1)).toContain('Persisted ingest review');
    expect(loaded.activeAnalysisContext.currentTask).toContain('Review ingest result');
    expect(loaded.activeAnalysisContext.relatedDatasets).toContain(record.datasetName);

    const latest = loadLatestPersistedBoreholeIngestReview(project.meta.id);
    expect(latest?.reviewId).toBe(record.reviewId);
    expect(latest?.result.reviewFindings).toHaveLength(1);

    const direct = loadPersistedBoreholeIngestReview(project.meta.id, record.datasetName);
    expect(direct?.datasetName).toBe(record.datasetName);
    expect(direct?.summary.confidence).toBe(68);
  });

  it('records approval as a separate audit trail and exposes it when loading reviews', () => {
    const project = createProject('Approved Review Project');
    const review = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      reviewFindings: [
        {
          code: 'page_failures_present',
          severity: 'blocking',
          scope: 'document',
          message: '1 page(s) failed during ingest and should be reviewed.',
        },
      ],
      reviewReasons: ['1 page(s) failed during ingest and should be reviewed.'],
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 61,
      source: {
        filePath: 'packet.pdf',
        fileName: 'packet.pdf',
        inputKind: 'pdf',
        totalPages: 2,
        successfulPages: 1,
        failedPages: 1,
      },
    }));

    const approval = approvePersistedBoreholeIngestReview(project.meta.id, review.datasetName, {
      rationale: 'Reviewed manually against the scanned source packet.',
      approvedBy: 'QA reviewer',
      approvedAt: '2026-04-22T00:00:00.000Z',
    });

    expect(approval.datasetName).toMatch(/^ingest-review-approval:/);
    expect(approval.reviewDatasetName).toBe(review.datasetName);
    expect(approval.sourceStamps?.sourceFingerprint).toBe(review.sourceStamps.sourceFingerprint);

    const direct = loadPersistedBoreholeIngestReview(project.meta.id, review.datasetName);
    expect(direct?.approval?.datasetName).toBe(approval.datasetName);
    expect(direct?.approval?.approvedBy).toBe('QA reviewer');

    const latest = loadLatestPersistedBoreholeIngestReview(project.meta.id);
    expect(latest?.approval?.rationale).toContain('scanned source packet');

    const listed = listPersistedBoreholeIngestReviews(project.meta.id);
    expect(listed[0]?.approval?.datasetName).toBe(approval.datasetName);

    const loaded = loadProject(project.meta.id);
    expect(loaded.namedDatasets[approval.datasetName]?.kind).toBe('geotech-ingest-review-approval');
    expect(loaded.namedDatasets[`ingest-review-approval:latest:${review.reviewId}`]?.kind).toBe('geotech-ingest-review-approval-pointer');
    expect(loaded.artifacts.at(-1)?.kind).toBe('ingest-review-approval');
    expect(loaded.notes.at(-1)).toContain('Approved ingest review');
    expect(
      ((loaded.activeAnalysisContext.context.latestApprovedIngestReview as Record<string, unknown>)?.approvalDatasetName),
    ).toBe(approval.datasetName);
  });

  it('persists geotech-document reviews and exposes stamped approval/list/load flows', () => {
    const project = createProject('Geotech Document Review Project');
    const review = persistBoreholeIngestReview(project.meta.id, makeGeotechDocumentResult({
      reviewFindings: [
        {
          code: 'material_parameter_review',
          severity: 'review',
          scope: 'material',
          message: 'Weathered shale parameters should be spot-checked before reuse.',
          pageNumber: 2,
          materialDescription: 'weathered shale',
        },
        {
          code: 'ocr_review',
          severity: 'advisory',
          scope: 'document',
          message: 'Recovered OCR hints should be spot-checked.',
        },
      ],
      reviewReasons: ['Weathered shale parameters should be spot-checked before reuse.'],
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 71,
    }), {
      title: 'Desk study packet',
    });

    expect(review.result.documentType).toBe('geotech-document');
    expect(review.title).toBe('Desk study packet');
    expect(review.summary.boreholeCount).toBe(0);
    expect(review.summary.boreholeIds).toEqual([]);
    expect(review.summary.reviewFindings).toBe(1);
    expect(review.summary.advisoryFindings).toBe(1);
    expect(review.sourceStamps.parserVersion).toContain('geotech-document@1');
    expect(review.sourceStamps.normalizedResultHash).toBeTruthy();

    const listed = listPersistedBoreholeIngestReviews(project.meta.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.datasetName).toBe(review.datasetName);
    expect(listed[0]?.result.documentType).toBe('geotech-document');

    const latest = loadLatestPersistedBoreholeIngestReview(project.meta.id);
    expect(latest?.datasetName).toBe(review.datasetName);
    expect(latest?.result.documentType).toBe('geotech-document');

    const approval = approvePersistedBoreholeIngestReview(project.meta.id, review.datasetName, {
      rationale: 'Reviewed manually against the scanned site investigation summary.',
      approvedBy: 'Engineering reviewer',
      approvedAt: '2026-04-22T03:00:00.000Z',
    });
    expect(approval.reviewDatasetName).toBe(review.datasetName);
    expect(approval.sourceStamps?.normalizedResultHash).toBe(review.sourceStamps.normalizedResultHash);

    const latestApproval = loadLatestPersistedBoreholeIngestReviewApproval(project.meta.id, review.datasetName);
    expect(latestApproval?.datasetName).toBe(approval.datasetName);

    const approvals = listPersistedBoreholeIngestReviewApprovals(project.meta.id, review.datasetName);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.datasetName).toBe(approval.datasetName);

    const direct = loadPersistedBoreholeIngestReview(project.meta.id, review.datasetName);
    expect(direct?.approval?.datasetName).toBe(approval.datasetName);
    expect((direct?.result as GeotechDocumentIngestResult | undefined)?.confidenceBreakdown).toEqual(expect.objectContaining({
      schemaVersion: 1,
      overall: 79,
      readinessScore: expect.any(Number),
    }));

    const loaded = loadProject(project.meta.id);
    expect(loaded.namedDatasets[review.datasetName]?.kind).toBe('geotech-ingest-review');
    expect(loaded.namedDatasets[approval.datasetName]?.kind).toBe('geotech-ingest-review-approval');
    expect(loaded.artifacts.map((artifact) => artifact.kind)).toContain('ingest-review');
    expect(loaded.artifacts.map((artifact) => artifact.kind)).toContain('ingest-review-approval');
    expect(loaded.notes.some((note) => note.includes('Persisted ingest review'))).toBe(true);
    expect(loaded.notes.at(-1)).toContain('Approved ingest review');
    expect(
      ((loaded.activeAnalysisContext.context.latestIngestReview as Record<string, unknown>)?.documentType),
    ).toBe('geotech-document');
    expect(
      ((loaded.activeAnalysisContext.context.latestApprovedIngestReview as Record<string, unknown>)?.documentType),
    ).toBe('geotech-document');
  });

  it('lists approval history newest first and resolves the latest approval for a review', () => {
    const project = createProject('Approval History Project');
    const review = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      reviewFindings: [
        {
          code: 'page_failures_present',
          severity: 'blocking',
          scope: 'document',
          message: '1 page(s) failed during ingest and should be reviewed.',
        },
      ],
      reviewReasons: ['1 page(s) failed during ingest and should be reviewed.'],
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 61,
    }));

    const firstApproval = approvePersistedBoreholeIngestReview(project.meta.id, review.datasetName, {
      rationale: 'Initial manual approval.',
      approvedBy: 'QA reviewer',
      approvedAt: '2026-04-22T00:00:00.000Z',
    });
    const secondApproval = approvePersistedBoreholeIngestReview(project.meta.id, review.datasetName, {
      rationale: 'Superseding approval after packet recheck.',
      approvedBy: 'Lead reviewer',
      approvedAt: '2026-04-23T00:00:00.000Z',
    });

    const listed = listPersistedBoreholeIngestReviewApprovals(project.meta.id, review.datasetName);
    expect(listed).toHaveLength(2);
    expect(listed[0]?.datasetName).toBe(secondApproval.datasetName);
    expect(listed[1]?.datasetName).toBe(firstApproval.datasetName);

    const loadedLatest = loadLatestPersistedBoreholeIngestReviewApproval(project.meta.id, review.datasetName);
    expect(loadedLatest?.datasetName).toBe(secondApproval.datasetName);

    const loadedSpecific = loadPersistedBoreholeIngestReviewApproval(project.meta.id, firstApproval.datasetName);
    expect(loadedSpecific?.approvedBy).toBe('QA reviewer');

    const reviewRecord = loadPersistedBoreholeIngestReview(project.meta.id, review.datasetName);
    expect(reviewRecord?.approval?.datasetName).toBe(secondApproval.datasetName);
  });

  it('invalidates recorded approvals when review provenance stamps change', () => {
    const project = createProject('Approval Invalidation Project');
    const originalReview = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      reviewFindings: [
        {
          code: 'page_failures_present',
          severity: 'review',
          scope: 'document',
          message: 'Packet should be manually spot-checked.',
        },
      ],
      reviewReasons: ['Packet should be manually spot-checked.'],
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 62,
    }));
    const approval = approvePersistedBoreholeIngestReview(project.meta.id, originalReview.datasetName, {
      rationale: 'Manual reviewer confirmed the source packet.',
      approvedBy: 'QA reviewer',
      approvedAt: '2026-04-22T00:00:00.000Z',
    });

    const rewrittenReview = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      confidence: 74,
      warnings: ['Reparsed after packet normalization.'],
      reviewFindings: [],
      reviewReasons: [],
      reviewRequired: false,
      canAutoProceed: true,
    }));
    expect(rewrittenReview.datasetName).toBe(originalReview.datasetName);
    expect(rewrittenReview.sourceStamps.normalizedResultHash).not.toBe(originalReview.sourceStamps.normalizedResultHash);

    const latestApproval = loadLatestPersistedBoreholeIngestReviewApproval(project.meta.id, rewrittenReview.datasetName);
    expect(latestApproval).toBeNull();

    const specificApproval = loadPersistedBoreholeIngestReviewApproval(project.meta.id, approval.datasetName);
    expect(specificApproval?.validForCurrentReview).toBe(false);
    expect(specificApproval?.invalidationReasons?.join(' ')).toMatch(/normalized result hash changed/i);

    const reviewRecord = loadPersistedBoreholeIngestReview(project.meta.id, rewrittenReview.datasetName);
    expect(reviewRecord?.approval).toBeUndefined();
  });

  it('lists persisted ingest reviews newest first', () => {
    const project = createProject('Review Ordering');

    const first = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      generatedAt: '2026-04-21T00:30:00.000Z',
      source: {
        filePath: 'first.pdf',
        fileName: 'first.pdf',
        inputKind: 'pdf',
        totalPages: 1,
        successfulPages: 1,
        failedPages: 0,
      },
    }));
    const second = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      generatedAt: '2026-04-21T01:45:00.000Z',
      source: {
        filePath: 'second.pdf',
        fileName: 'second.pdf',
        inputKind: 'pdf',
        totalPages: 3,
        successfulPages: 2,
        failedPages: 1,
      },
      pageFailures: ['Page 3: timeout'],
      reviewFindings: [
        {
          code: 'page_failures_present',
          severity: 'blocking',
          scope: 'document',
          message: '1 page(s) failed during ingest and should be reviewed.',
        },
      ],
      reviewReasons: ['1 page(s) failed during ingest and should be reviewed.'],
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 60,
    }));

    const reviews = listPersistedBoreholeIngestReviews(project.meta.id);
    expect(reviews).toHaveLength(2);
    expect(reviews[0]?.reviewId).toBe(second.reviewId);
    expect(reviews[1]?.reviewId).toBe(first.reviewId);
    expect(reviews[0]?.summary.blockingFindings).toBe(1);
  });

  it('persists durable geotech ingest jobs and exposes completed job results', async () => {
    const project = createProject('Ingest Job Project');
    const jobPath = join(configDir, 'job.pdf');
    writeFileSync(jobPath, 'mock-job-pdf', 'utf-8');

    ingestJobMocks.readDocumentVisionInput.mockReturnValue({
      base64: 'ZmFrZQ==',
      mimeType: 'application/pdf',
      fileBytes: 1024,
      filePath: jobPath,
      ext: 'pdf',
      kind: 'pdf',
    });
    ingestJobMocks.readDocumentPdfPageInputs.mockResolvedValue([{
      base64: 'cGFnZQ==',
      mimeType: 'application/pdf',
      fileBytes: 256,
      filePath: jobPath,
      ext: 'pdf',
      kind: 'pdf',
      pageNumber: 1,
      totalPages: 1,
      sourceKind: 'pdf-page',
    }]);
    ingestJobMocks.ingestGeotechDocument.mockResolvedValue(makeGeotechDocumentResult({
      source: {
        filePath: jobPath,
        fileName: 'job.pdf',
        inputKind: 'pdf',
        totalPages: 1,
        successfulPages: 1,
        failedPages: 0,
      },
      generatedAt: '2026-04-22T02:00:00.000Z',
    }));

    const job = startGeotechIngestJob(project.meta.id, {
      path: jobPath,
      type: 'geotech-document',
      persistReview: true,
      reviewTitle: 'Job-backed review',
    });
    expect(job.status).toBe('queued');
    expect(job.sourceStamps.sourceFingerprint).toBeTruthy();
    expect(getGeotechIngestJob(project.meta.id, job.datasetName)?.status).toBe('queued');

    const completed = await waitGeotechIngestJob(project.meta.id, job.datasetName, {
      config: { provider: 'hosted-beta', apiKey: '', timeout: 1000 } as any,
    });
    expect(completed.status).toBe('completed');
    expect(completed.persistedReview?.datasetName).toMatch(/^ingest-review:/);
    expect(completed.sourceStamps.normalizedResultHash).toBeTruthy();

    const loadedResult = loadGeotechIngestJobResult(project.meta.id, job.datasetName);
    expect(loadedResult.documentType).toBe('geotech-document');
    expect(loadedResult.persistedReview?.datasetName).toBe(completed.persistedReview?.datasetName);
    expect(loadedResult.sourceStamps.normalizedResultHash).toBe(completed.sourceStamps.normalizedResultHash);

    const jobs = listGeotechIngestJobs(project.meta.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.datasetName).toBe(job.datasetName);
    expect(jobs[0]?.status).toBe('completed');

    const loaded = loadProject(project.meta.id);
    expect(loaded.namedDatasets[job.datasetName]?.kind).toBe('geotech-ingest-job');
    expect(loaded.namedDatasets[job.datasetName]?.metadata?.normalizedResultHash).toBe(
      completed.sourceStamps.normalizedResultHash,
    );
    expect(loaded.artifacts.at(-1)?.kind).toBe('ingest-job');
  });

  it('requires recorded approval before promoting a flagged review', () => {
    const project = createProject('Promotion Requires Approval');
    const review = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      reviewFindings: [
        {
          code: 'page_failures_present',
          severity: 'blocking',
          scope: 'document',
          message: '1 page(s) failed during ingest and should be reviewed.',
        },
      ],
      reviewReasons: ['1 page(s) failed during ingest and should be reviewed.'],
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 60,
    }));

    expect(() => promotePersistedBoreholeIngestReview(project.meta.id, review.datasetName)).toThrow(/requires recorded approval/i);
  });

  it('promotes persisted geotech-document reviews into durable document datasets', () => {
    const project = createProject('Document Promotion Project');
    const review = persistBoreholeIngestReview(project.meta.id, makeGeotechDocumentResult());

    const promotion = promotePersistedBoreholeIngestReview(project.meta.id, review.datasetName);

    expect(promotion.documentType).toBe('geotech-document');
    expect(promotion.promotedBoreholes).toEqual([]);
    expect(promotion.promotedBoreholeIds).toEqual([]);
    expect(promotion.promotedDocuments.map((item) => item.role)).toEqual([
      'document-insight',
      'material-observations',
      'parameter-catalog',
      'classification-summary',
    ]);
    expect(promotion.promotedDatasetNames).toEqual([
      `document-insight:${review.reviewId}`,
      `material-observations:${review.reviewId}`,
      `parameter-catalog:${review.reviewId}`,
      `classification-summary:${review.reviewId}`,
    ]);
    expect(promotion.promotedDatasetKinds).toEqual([
      'document-insight',
      'material-observations',
      'parameter-catalog',
      'classification-summary',
    ]);
    expect(promotion.sourceStamps.normalizedResultHash).toBe(review.sourceStamps.normalizedResultHash);

    const loaded = loadProject(project.meta.id);
    expect(loaded.namedDatasets[`document-insight:${review.reviewId}`]?.kind).toBe('document-insight');
    expect(loaded.namedDatasets[`material-observations:${review.reviewId}`]?.kind).toBe('material-observations');
    expect(loaded.namedDatasets[`parameter-catalog:${review.reviewId}`]?.kind).toBe('parameter-catalog');
    expect(loaded.namedDatasets[`classification-summary:${review.reviewId}`]?.kind).toBe('classification-summary');
    expect(loaded.namedDatasets[`document-insight:${review.reviewId}`]?.metadata?.promotedDatasetRole).toBe('document-insight');
    expect(loaded.namedDatasets[`document-insight:${review.reviewId}`]?.metadata?.normalizedResultHash).toBe(
      review.sourceStamps.normalizedResultHash,
    );
    expect(loaded.namedDatasets[promotion.promotionDatasetName]?.kind).toBe('geotech-ingest-promotion');
    expect(loaded.namedDatasets[promotion.promotionDatasetName]?.metadata?.promotedDatasetRole).toBe('promotion-result');
  });

  it('promotes a persisted ingest review into raw borehole datasets and soil profiles', () => {
    const project = createProject('Promotion Project');
    const review = persistBoreholeIngestReview(project.meta.id, makeIngestResult());

    const promotion = promotePersistedBoreholeIngestReview(project.meta.id, review.datasetName);

    expect(promotion.sourceDatasetName).toBe(review.datasetName);
    expect(promotion.sourceReviewDatasetName).toBe(review.datasetName);
    expect(promotion.promotedDatasetNames).toEqual([
      promotion.promotedBoreholes[0]!.rawDatasetName,
      'BH-01',
    ]);
    expect(promotion.promotedBoreholeIds).toEqual(['BH-01']);
    expect(promotion.supersededDatasetNames).toEqual([]);
    expect(promotion.snapshotDatasetNames).toEqual([]);
    expect(promotion.promotedBoreholes).toHaveLength(1);
    expect(promotion.promotedBoreholes[0]?.rawDatasetName).toMatch(/^promoted-borehole:/);
    expect(promotion.promotedBoreholes[0]?.promotedSoilProfile).toBe(true);
    expect(promotion.promotedBoreholes[0]?.soilProfileDatasetName).toBe('BH-01');
    expect(promotion.promotedBoreholes[0]?.supersededDatasetNames).toEqual([]);
    expect(promotion.promotedBoreholes[0]?.snapshotDatasetNames).toEqual([]);

    const loaded = loadProject(project.meta.id);
    expect(loaded.namedDatasets[promotion.promotionDatasetName]?.kind).toBe('geotech-ingest-promotion');
    expect(loaded.namedDatasets[promotion.promotedBoreholes[0]!.rawDatasetName]?.kind).toBe('borehole-log');
    expect(loaded.namedDatasets['BH-01']?.kind).toBe('soil-profile');
    expect(loaded.namedDatasets[promotion.promotedBoreholes[0]!.rawDatasetName]?.metadata?.promotedFromReviewId).toBe(review.reviewId);
    expect(loaded.namedDatasets[promotion.promotedBoreholes[0]!.rawDatasetName]?.metadata?.promotedDatasetRole).toBe('raw-borehole');
    expect(loaded.namedDatasets['BH-01']?.metadata?.promotedDatasetRole).toBe('soil-profile');
    expect(loaded.namedDatasets[promotion.promotionDatasetName]?.metadata?.promotedDatasetRole).toBe('promotion-result');
    expect(loaded.soilProfiles).toHaveLength(1);
    expect(loaded.artifacts.at(-1)?.kind).toBe('ingest-promotion');
    expect(loaded.notes.at(-1)).toContain('Promoted ingest review');
    expect(
      ((loaded.activeAnalysisContext.context.latestPromotedIngestReview as Record<string, unknown>)?.promotionDatasetName),
    ).toBe(promotion.promotionDatasetName);
  });

  it('allows promotion of a flagged review after recorded approval and threads approval provenance', () => {
    const project = createProject('Approved Promotion Project');
    const review = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      reviewFindings: [
        {
          code: 'suspicious_continuation',
          severity: 'review',
          scope: 'borehole',
          message: 'Continuation should be verified manually.',
          boreholeId: 'BH-01',
        },
      ],
      reviewReasons: ['Continuation should be verified manually.'],
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 66,
    }));
    const approval = approvePersistedBoreholeIngestReview(project.meta.id, review.datasetName, {
      rationale: 'Continuation was verified manually against the scanned packet.',
      approvedBy: 'Senior geotech reviewer',
      approvedAt: '2026-04-22T01:00:00.000Z',
    });

    const promotion = promotePersistedBoreholeIngestReview(project.meta.id, review.datasetName);

    expect(promotion.approvalDatasetName).toBe(approval.datasetName);
    expect(promotion.approvedBy).toBe('Senior geotech reviewer');
    expect(promotion.approvalRationale).toContain('verified manually');

    const loaded = loadProject(project.meta.id);
    expect(loaded.namedDatasets[promotion.promotedBoreholes[0]!.rawDatasetName]?.metadata?.approvalDatasetName).toBe(approval.datasetName);
    expect(loaded.namedDatasets[promotion.promotionDatasetName]?.metadata?.approvalDatasetName).toBe(approval.datasetName);
    expect(loaded.notes.at(-1)).toContain('using recorded approval');
  });

  it('uses the latest approval when a flagged review is approved multiple times before promotion', () => {
    const project = createProject('Latest Approval Wins');
    const review = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      reviewFindings: [
        {
          code: 'suspicious_continuation',
          severity: 'review',
          scope: 'borehole',
          message: 'Continuation should be verified manually.',
          boreholeId: 'BH-01',
        },
      ],
      reviewReasons: ['Continuation should be verified manually.'],
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 66,
    }));

    approvePersistedBoreholeIngestReview(project.meta.id, review.datasetName, {
      rationale: 'First approval.',
      approvedBy: 'QA reviewer',
      approvedAt: '2026-04-22T00:00:00.000Z',
    });
    const latestApproval = approvePersistedBoreholeIngestReview(project.meta.id, review.datasetName, {
      rationale: 'Second approval after full packet recheck.',
      approvedBy: 'Lead reviewer',
      approvedAt: '2026-04-23T00:00:00.000Z',
    });

    const promotion = promotePersistedBoreholeIngestReview(project.meta.id, review.datasetName);
    expect(promotion.approvalDatasetName).toBe(latestApproval.datasetName);
    expect(promotion.approvedBy).toBe('Lead reviewer');
    expect(promotion.approvalRationale).toContain('Second approval');
  });

  it('skips soil-profile promotion when a promoted borehole lacks complete layer depths', () => {
    const project = createProject('Promotion With Partial Geometry');
    const review = persistBoreholeIngestReview(project.meta.id, makeIngestResult({
      boreholes: [
        {
          ...makeIngestResult().boreholes[0]!,
          boreholeId: 'BH-PARTIAL',
          layers: [
            {
              depthFrom: 0,
              depthTo: null,
              description: 'Silty clay',
              uscsSymbol: 'CL',
              sptN: 6,
              waterContent: null,
              notes: null,
            },
          ],
        },
      ],
    }));

    const promotion = promotePersistedBoreholeIngestReview(project.meta.id, review.datasetName);

    expect(promotion.promotedBoreholes).toHaveLength(1);
    expect(promotion.promotedBoreholes[0]?.promotedSoilProfile).toBe(false);
    expect(promotion.promotedBoreholes[0]?.warnings.join(' ')).toMatch(/missing complete depth geometry/i);
    expect(promotion.warnings.join(' ')).toMatch(/skipped soil-profile promotion/i);

    const loaded = loadProject(project.meta.id);
    expect(loaded.namedDatasets[promotion.promotedBoreholes[0]!.rawDatasetName]?.kind).toBe('borehole-log');
    expect(loaded.namedDatasets['BH-PARTIAL']).toBeUndefined();
    expect(loaded.soilProfiles).toHaveLength(0);
  });

  it('creates rollback snapshots and supersession metadata when a persisted review is promoted again', () => {
    const project = createProject('Promotion Replay');
    const review = persistBoreholeIngestReview(project.meta.id, makeIngestResult());

    const firstPromotion = promotePersistedBoreholeIngestReview(project.meta.id, review.datasetName);
    const secondPromotion = promotePersistedBoreholeIngestReview(project.meta.id, review.datasetName);

    expect(secondPromotion.promotedDatasetNames).toEqual(firstPromotion.promotedDatasetNames);
    expect(secondPromotion.promotedBoreholeIds).toEqual(['BH-01']);
    expect(secondPromotion.supersededDatasetNames).toEqual([
      firstPromotion.promotedBoreholes[0]!.rawDatasetName,
      'BH-01',
      firstPromotion.promotionDatasetName,
    ]);
    expect(secondPromotion.snapshotDatasetNames).toHaveLength(3);
    expect(secondPromotion.promotedBoreholes[0]?.supersededDatasetNames).toEqual([
      firstPromotion.promotedBoreholes[0]!.rawDatasetName,
      'BH-01',
    ]);
    expect(secondPromotion.promotedBoreholes[0]?.snapshotDatasetNames).toHaveLength(2);
    expect(secondPromotion.warnings.join(' ')).toMatch(/snapshotted/i);

    const loaded = loadProject(project.meta.id);
    expect(loaded.namedDatasets[firstPromotion.promotedBoreholes[0]!.rawDatasetName]?.metadata?.snapshotDatasetName).toMatch(
      /^ingest-promotion-snapshot:/,
    );
    expect(loaded.namedDatasets['BH-01']?.metadata?.snapshotDatasetName).toMatch(/^ingest-promotion-snapshot:/);
    expect(loaded.namedDatasets[firstPromotion.promotionDatasetName]?.metadata?.snapshotDatasetName).toMatch(
      /^ingest-promotion-snapshot:/,
    );

    const snapshotDatasets = secondPromotion.snapshotDatasetNames.map((name) => loaded.namedDatasets[name]);
    expect(snapshotDatasets.every((dataset) => dataset?.kind === 'geotech-ingest-promotion-snapshot')).toBe(true);
    expect(snapshotDatasets[0]?.metadata?.promotedDatasetRole).toBe('snapshot');
    expect((snapshotDatasets[0]?.data as { kind: string }).kind).toBe('geotech-ingest-promotion-snapshot-record');
    expect(loaded.notes.at(-1)).toContain('rollback snapshot');
    expect(
      ((loaded.activeAnalysisContext.context.latestPromotedIngestReview as Record<string, unknown>)?.snapshotDatasetNames as string[]),
    ).toHaveLength(3);
  });
});
