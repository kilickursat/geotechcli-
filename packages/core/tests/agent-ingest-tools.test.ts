import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ingestMocks = vi.hoisted(() => ({
  countDocumentPdfPages: vi.fn(),
  inspectPdfDocument: vi.fn(),
  readDocumentVisionInput: vi.fn(),
  readDocumentPdfPageInputs: vi.fn(),
  ingestBoreholeLogDocument: vi.fn(),
  ingestGeotechDocument: vi.fn(),
  startGeotechIngestJob: vi.fn(),
  getGeotechIngestJob: vi.fn(),
  waitGeotechIngestJob: vi.fn(),
  loadGeotechIngestJobResult: vi.fn(),
  listGeotechIngestJobs: vi.fn(),
  approvePersistedBoreholeIngestReview: vi.fn(),
  listPersistedBoreholeIngestReviewApprovals: vi.fn(),
  loadLatestPersistedBoreholeIngestReviewApproval: vi.fn(),
  loadPersistedBoreholeIngestReviewApproval: vi.fn(),
  listPersistedBoreholeIngestReviews: vi.fn(),
  loadLatestPersistedBoreholeIngestReview: vi.fn(),
  loadPersistedBoreholeIngestReview: vi.fn(),
  persistBoreholeIngestReview: vi.fn(),
  promotePersistedBoreholeIngestReview: vi.fn(),
  summarizePersistedBoreholeIngestReviewApproval: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  buildLLMConfig: vi.fn(),
}));

vi.mock('../src/ingest/index.js', () => ({
  countDocumentPdfPages: ingestMocks.countDocumentPdfPages,
  inspectPdfDocument: ingestMocks.inspectPdfDocument,
  readDocumentVisionInput: ingestMocks.readDocumentVisionInput,
  readDocumentPdfPageInputs: ingestMocks.readDocumentPdfPageInputs,
  ingestBoreholeLogDocument: ingestMocks.ingestBoreholeLogDocument,
  ingestGeotechDocument: ingestMocks.ingestGeotechDocument,
  startGeotechIngestJob: ingestMocks.startGeotechIngestJob,
  getGeotechIngestJob: ingestMocks.getGeotechIngestJob,
  waitGeotechIngestJob: ingestMocks.waitGeotechIngestJob,
  loadGeotechIngestJobResult: ingestMocks.loadGeotechIngestJobResult,
  listGeotechIngestJobs: ingestMocks.listGeotechIngestJobs,
  approvePersistedBoreholeIngestReview: ingestMocks.approvePersistedBoreholeIngestReview,
  listPersistedBoreholeIngestReviewApprovals: ingestMocks.listPersistedBoreholeIngestReviewApprovals,
  loadLatestPersistedBoreholeIngestReviewApproval: ingestMocks.loadLatestPersistedBoreholeIngestReviewApproval,
  loadPersistedBoreholeIngestReviewApproval: ingestMocks.loadPersistedBoreholeIngestReviewApproval,
  listPersistedBoreholeIngestReviews: ingestMocks.listPersistedBoreholeIngestReviews,
  loadLatestPersistedBoreholeIngestReview: ingestMocks.loadLatestPersistedBoreholeIngestReview,
  loadPersistedBoreholeIngestReview: ingestMocks.loadPersistedBoreholeIngestReview,
  persistBoreholeIngestReview: ingestMocks.persistBoreholeIngestReview,
  promotePersistedBoreholeIngestReview: ingestMocks.promotePersistedBoreholeIngestReview,
  summarizePersistedBoreholeIngestReviewApproval: ingestMocks.summarizePersistedBoreholeIngestReviewApproval,
}));

vi.mock('../src/config/index.js', () => ({
  buildLLMConfig: configMocks.buildLLMConfig,
}));

function createGeotechDocumentResult(overrides?: Record<string, unknown>) {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'geotech-document',
    generatedAt: '2026-04-21T00:00:00.000Z',
    source: {
      filePath: 'sample.pdf',
      fileName: 'sample.pdf',
      inputKind: 'pdf',
      totalPages: 1,
      successfulPages: 1,
      failedPages: 0,
    },
    inspection: null,
    inspectionSummary: null,
    documentClass: 'geotech-report',
    title: 'Sample report',
    summary: 'Geotechnical summary',
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
    confidence: 84,
    reviewRequired: false,
    canAutoProceed: true,
    ...overrides,
  };
}

function createBoreholeIngestResult(overrides?: Record<string, unknown>) {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'borehole-log',
    generatedAt: '2026-04-21T00:00:00.000Z',
    source: {
      filePath: 'sample.pdf',
      fileName: 'sample.pdf',
      inputKind: 'pdf',
      totalPages: 1,
      successfulPages: 1,
      failedPages: 0,
    },
    inspection: null,
    inspectionSummary: null,
    boreholes: [{
      boreholeId: 'BH-01',
      projectName: null,
      location: null,
      groundElevation: null,
      dateDrilled: null,
      drillingMethod: null,
      totalDepth: 6,
      waterTableDepth: null,
      layers: [],
      warnings: [],
      parseStatus: 'parsed',
      confidence: 78,
    }],
    pageAudits: [],
    pageFailures: [],
    warnings: ['manual review needed'],
    reviewFindings: [],
    reviewReasons: ['manual review needed'],
    reviewRequired: true,
    confidence: 78,
    canAutoProceed: false,
    ...overrides,
  };
}

function createPersistedReviewRecord(overrides?: Record<string, unknown>) {
  const result = createBoreholeIngestResult();
  return {
    kind: 'geotech-ingest-review-record',
    schemaVersion: 1,
    reviewId: 'rev-1',
    datasetName: 'ingest-review:rev-1',
    projectId: 'project-123',
    createdAt: '2026-04-21T00:00:00.000Z',
    title: 'Review 1',
    result,
    summary: {
      reviewRequired: false,
      canAutoProceed: true,
      confidence: 78,
      totalPages: 1,
      successfulPages: 1,
      failedPages: 0,
      boreholeCount: 1,
      boreholeIds: ['BH-01'],
      blockingFindings: 0,
      reviewFindings: 0,
      advisoryFindings: 0,
    },
    sourceStamps: {
      sourceFingerprint: 'source-fingerprint-1',
      parserVersion: 'geotech-extract@1|result-schema@1|pdf-parser:lightweight-page-inspector',
      normalizedResultHash: 'normalized-result-hash-1',
    },
    ...overrides,
  };
}

function createApprovalRecord(overrides?: Record<string, unknown>) {
  return {
    kind: 'geotech-ingest-review-approval-record',
    schemaVersion: 1,
    approvalId: 'approval-1',
    datasetName: 'ingest-review-approval:rev-1:20260422t000000000z',
    projectId: 'project-123',
    reviewId: 'rev-1',
    reviewDatasetName: 'ingest-review:rev-1',
    approvedAt: '2026-04-22T00:00:00.000Z',
    approvedBy: 'QA reviewer',
    rationale: 'Reviewed against the source packet.',
    sourceSummary: {
      reviewRequired: true,
      canAutoProceed: false,
      confidence: 61,
      totalPages: 2,
      successfulPages: 1,
      failedPages: 1,
      boreholeCount: 1,
      boreholeIds: ['BH-01'],
      blockingFindings: 1,
      reviewFindings: 1,
      advisoryFindings: 0,
    },
    sourceStamps: {
      sourceFingerprint: 'source-fingerprint-1',
      parserVersion: 'geotech-extract@1|result-schema@1|pdf-parser:lightweight-page-inspector',
      normalizedResultHash: 'normalized-result-hash-1',
    },
    validForCurrentReview: true,
    ...overrides,
  };
}

function createJobRecord(overrides?: Record<string, unknown>) {
  return {
    kind: 'geotech-ingest-job-record',
    schemaVersion: 1,
    jobId: 'job-1',
    datasetName: 'ingest-job:job-1',
    projectId: 'project-123',
    documentType: 'geotech-document',
    title: 'Ingest job: sample.pdf',
    status: 'queued',
    createdAt: '2026-04-22T00:00:00.000Z',
    updatedAt: '2026-04-22T00:00:00.000Z',
    request: {
      path: 'sample.pdf',
      persistReview: false,
    },
    source: {
      filePath: 'sample.pdf',
      fileName: 'sample.pdf',
      inputKind: 'pdf',
      fileBytes: 14,
      totalPages: 1,
    },
    inspection: {
      totalPages: 1,
      warnings: [],
      parserVersion: 'lightweight-page-inspector',
    },
    sourceStamps: {
      sourceFingerprint: 'job-source-fingerprint-1',
      parserVersion: 'geotech-document@1|result-schema@1|pdf-parser:lightweight-page-inspector',
    },
    ...overrides,
  };
}

describe('agent ingest tools', () => {
  let tempDir = '';
  let pdfPath = '';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    ingestMocks.countDocumentPdfPages.mockResolvedValue(1);

    tempDir = mkdtempSync(join(process.cwd(), '__agent-ingest-tool-'));
    pdfPath = join(tempDir, 'sample.pdf');
    writeFileSync(pdfPath, 'placeholder-pdf', 'utf-8');

    configMocks.buildLLMConfig.mockReturnValue({
      provider: 'hosted-beta',
      timeout: 1000,
      skillsEnabled: false,
      visionModelId: 'default-vision',
    });

    ingestMocks.readDocumentVisionInput.mockReturnValue({
      base64: 'ZmFrZQ==',
      mimeType: 'application/pdf',
      fileBytes: 14,
      filePath: pdfPath,
      ext: 'pdf',
      kind: 'pdf',
    });
    ingestMocks.inspectPdfDocument.mockReturnValue({
      totalPages: 1,
      pages: [{ pageNumber: 1, classification: 'digital-text', warnings: [] }],
      warnings: [],
    });
    ingestMocks.readDocumentPdfPageInputs.mockResolvedValue([{
      base64: 'cGFnZQ==',
      mimeType: 'application/pdf',
      fileBytes: 4,
      filePath: pdfPath,
      ext: 'pdf',
      kind: 'pdf',
      pageNumber: 1,
      totalPages: 1,
      sourceKind: 'pdf-page',
    }]);
    ingestMocks.summarizePersistedBoreholeIngestReviewApproval.mockImplementation((approval, options) => ({
      approvalId: approval.approvalId,
      datasetName: approval.datasetName,
      projectId: approval.projectId,
      reviewId: approval.reviewId,
      reviewDatasetName: approval.reviewDatasetName,
      approvedAt: approval.approvedAt,
      approvedBy: approval.approvedBy,
      rationale: approval.rationale,
      isLatestForReview: options?.latestApprovalDatasetName === approval.datasetName,
      isValidForCurrentReview: approval.validForCurrentReview !== false,
      invalidationReasons: approval.invalidationReasons,
    }));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers ingest_geotech_document through the live brain and swarm runtime imports', async () => {
    await import('../src/agents/brain.js');
    await import('../src/agents/swarm.js');
    const { toolRegistry } = await import('../src/agents/tools.js');

    const names = toolRegistry.list().map((tool) => tool.name);

    expect(names).toContain('ingest_geotech_document');
    expect(names).toContain('start_geotech_ingest_job');
    expect(names).toContain('get_geotech_ingest_job');
    expect(names).toContain('wait_geotech_ingest_job');
    expect(names).toContain('load_geotech_ingest_job_result');
    expect(names).toContain('list_geotech_ingest_jobs');
    expect(names).toContain('list_persisted_ingest_reviews');
    expect(names).toContain('load_persisted_ingest_review');
    expect(names).toContain('list_persisted_ingest_review_approvals');
    expect(names).toContain('load_persisted_ingest_review_approval');
    expect(names).toContain('approve_persisted_ingest_review');
    expect(names).toContain('promote_persisted_ingest_review');
  });

  it('uses the active agent runtime config when ingesting a geotech document', async () => {
    ingestMocks.ingestGeotechDocument.mockResolvedValue(
      createGeotechDocumentResult({
        parameters: [{ name: 'frictionAngle', valueText: '32', unit: 'deg' }],
      }),
    );

    const { runWithToolRuntimeContext } = await import('../src/agents/tool-runtime.js');
    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const runtimeConfig = {
      provider: 'openai-compatible',
      timeout: 2500,
      skillsEnabled: false,
      visionModelId: 'runtime-vision-model',
    } as any;

    const result = await runWithToolRuntimeContext(
      { config: runtimeConfig },
      () => toolRegistry.execute('ingest_geotech_document', {
        path: pdfPath,
        type: 'geotech-document',
      }),
    );

    expect(result.success).toBe(true);
    expect(ingestMocks.ingestGeotechDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        config: runtimeConfig,
      }),
    );
    expect(configMocks.buildLLMConfig).not.toHaveBeenCalled();
    expect((result.data as any).documentType).toBe('geotech-document');
    expect((result.data as any).canAutoProceed).toBe(true);
  });

  it('can persist a borehole ingest review and keeps safety fields at the top level', async () => {
    ingestMocks.ingestBoreholeLogDocument.mockResolvedValue(createBoreholeIngestResult());
    ingestMocks.persistBoreholeIngestReview.mockReturnValue({
      reviewId: 'rev-1',
      datasetName: 'ingest-review:rev-1',
      title: 'Review 1',
      summary: {
        reviewRequired: true,
        canAutoProceed: false,
      },
    });

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('ingest_geotech_document', {
      path: pdfPath,
      type: 'borehole-log',
      projectId: 'project-123',
      persistReview: true,
      reviewTitle: 'Review 1',
    });

    expect(result.success).toBe(true);
    expect(ingestMocks.persistBoreholeIngestReview).toHaveBeenCalledWith(
      'project-123',
      expect.objectContaining({ documentType: 'borehole-log' }),
      { title: 'Review 1' },
    );
    expect((result.data as any).canAutoProceed).toBe(false);
    expect((result.data as any).persistedReview.datasetName).toBe('ingest-review:rev-1');
  });

  it('can persist a geotech-document ingest review when a project is provided', async () => {
    ingestMocks.ingestGeotechDocument.mockResolvedValue(createGeotechDocumentResult());
    ingestMocks.persistBoreholeIngestReview.mockReturnValue({
      reviewId: 'rev-doc-1',
      datasetName: 'ingest-review:rev-doc-1',
      title: 'Desk study packet',
      summary: {
        reviewRequired: false,
        canAutoProceed: true,
      },
    });

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('ingest_geotech_document', {
      path: pdfPath,
      type: 'geotech-document',
      projectId: 'project-123',
      persistReview: true,
      reviewTitle: 'Desk study packet',
    });

    expect(result.success).toBe(true);
    expect(ingestMocks.persistBoreholeIngestReview).toHaveBeenCalledWith(
      'project-123',
      expect.objectContaining({ documentType: 'geotech-document' }),
      { title: 'Desk study packet' },
    );
    expect((result.data as any).persistedReview.datasetName).toBe('ingest-review:rev-doc-1');
  });

  it('defers large PDF ingest to an async job instead of calling the sync ingest path', async () => {
    ingestMocks.inspectPdfDocument.mockReturnValue({
      totalPages: 12,
      pages: Array.from({ length: 12 }, (_, index) => ({
        pageNumber: index + 1,
        classification: 'digital-text',
        warnings: [],
      })),
      warnings: [],
      metadata: {
        parser: 'lightweight-page-inspector',
      },
    });

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('ingest_geotech_document', {
      path: pdfPath,
      type: 'geotech-document',
      projectId: 'project-123',
    });

    expect(result.success).toBe(true);
    expect((result.data as any).requires_async_job).toBe(true);
    expect((result.data as any).async_job_recommendation.tool).toBe('start_geotech_ingest_job');
    expect(ingestMocks.ingestGeotechDocument).not.toHaveBeenCalled();
    expect(ingestMocks.readDocumentPdfPageInputs).not.toHaveBeenCalled();
  });

  it('blocks ingest paths outside the allowed workspace', async () => {
    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const blockedPath = join(process.cwd(), '..', '__outside__.pdf');
    const result = await toolRegistry.execute('ingest_geotech_document', {
      path: blockedPath,
      type: 'geotech-document',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('outside allowed directories');
  });

  it('queues a durable ingest job', async () => {
    ingestMocks.startGeotechIngestJob.mockReturnValue(createJobRecord());

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('start_geotech_ingest_job', {
      projectId: 'project-123',
      path: pdfPath,
      type: 'geotech-document',
      persistReview: true,
      reviewTitle: 'Desk study packet',
    });

    expect(result.success).toBe(true);
    expect(ingestMocks.startGeotechIngestJob).toHaveBeenCalledWith('project-123', {
      path: pdfPath,
      type: 'geotech-document',
      boreholeId: undefined,
      persistReview: true,
      reviewTitle: 'Desk study packet',
    });
    expect((result.data as any).datasetName).toBe('ingest-job:job-1');
  });

  it('loads and lists durable ingest jobs', async () => {
    ingestMocks.getGeotechIngestJob.mockReturnValue(createJobRecord({
      status: 'completed',
      completedAt: '2026-04-22T01:00:00.000Z',
      sourceStamps: {
        sourceFingerprint: 'job-source-fingerprint-1',
        parserVersion: 'geotech-document@1|result-schema@1|pdf-parser:lightweight-page-inspector',
        normalizedResultHash: 'normalized-result-hash-1',
      },
      resultSummary: {
        confidence: 84,
        blockingFindings: 0,
        reviewFindings: 0,
        advisoryFindings: 0,
        canAutoProceed: true,
      },
    }));
    ingestMocks.listGeotechIngestJobs.mockReturnValue([
      createJobRecord({
        jobId: 'job-2',
        datasetName: 'ingest-job:job-2',
        updatedAt: '2026-04-23T00:00:00.000Z',
        status: 'completed',
      }),
      createJobRecord(),
    ]);

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const getResult = await toolRegistry.execute('get_geotech_ingest_job', {
      projectId: 'project-123',
      datasetName: 'ingest-job:job-1',
    });
    expect(getResult.success).toBe(true);
    expect((getResult.data as any).status).toBe('completed');

    const listResult = await toolRegistry.execute('list_geotech_ingest_jobs', {
      projectId: 'project-123',
    });
    expect(listResult.success).toBe(true);
    expect((listResult.data as any).count).toBe(2);
    expect((listResult.data as any).jobs[0].datasetName).toBe('ingest-job:job-2');
  });

  it('waits for a durable ingest job and loads its completed result', async () => {
    ingestMocks.waitGeotechIngestJob.mockResolvedValue(createJobRecord({
      status: 'completed',
      completedAt: '2026-04-22T01:00:00.000Z',
      sourceStamps: {
        sourceFingerprint: 'job-source-fingerprint-1',
        parserVersion: 'geotech-document@1|result-schema@1|pdf-parser:lightweight-page-inspector',
        normalizedResultHash: 'normalized-result-hash-1',
      },
      resultSummary: {
        confidence: 84,
        blockingFindings: 0,
        reviewFindings: 0,
        advisoryFindings: 0,
        canAutoProceed: true,
      },
      persistedReview: {
        reviewId: 'rev-doc-1',
        datasetName: 'ingest-review:rev-doc-1',
        title: 'Desk study packet',
        summary: {
          reviewRequired: false,
          canAutoProceed: true,
          confidence: 84,
          totalPages: 1,
          successfulPages: 1,
          failedPages: 0,
          boreholeCount: 0,
          boreholeIds: [],
          blockingFindings: 0,
          reviewFindings: 0,
          advisoryFindings: 0,
        },
        sourceStamps: {
          sourceFingerprint: 'job-source-fingerprint-1',
          parserVersion: 'geotech-document@1|result-schema@1|pdf-parser:lightweight-page-inspector',
          normalizedResultHash: 'normalized-result-hash-1',
        },
      },
    }));
    ingestMocks.loadGeotechIngestJobResult.mockReturnValue({
      jobId: 'job-1',
      datasetName: 'ingest-job:job-1',
      projectId: 'project-123',
      documentType: 'geotech-document',
      completedAt: '2026-04-22T01:00:00.000Z',
      sourceStamps: {
        sourceFingerprint: 'job-source-fingerprint-1',
        parserVersion: 'geotech-document@1|result-schema@1|pdf-parser:lightweight-page-inspector',
        normalizedResultHash: 'normalized-result-hash-1',
      },
      result: createGeotechDocumentResult(),
      resultSummary: {
        reviewRequired: false,
        canAutoProceed: true,
        confidence: 84,
        totalPages: 1,
        successfulPages: 1,
        failedPages: 0,
        boreholeCount: 0,
        boreholeIds: [],
        blockingFindings: 0,
        reviewFindings: 0,
        advisoryFindings: 0,
      },
      persistedReview: {
        reviewId: 'rev-doc-1',
        datasetName: 'ingest-review:rev-doc-1',
        title: 'Desk study packet',
      },
    });

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const waitResult = await toolRegistry.execute('wait_geotech_ingest_job', {
      projectId: 'project-123',
      datasetName: 'ingest-job:job-1',
    });
    expect(waitResult.success).toBe(true);
    expect(ingestMocks.waitGeotechIngestJob).toHaveBeenCalledWith(
      'project-123',
      'ingest-job:job-1',
      expect.objectContaining({
        config: expect.objectContaining({
          provider: 'hosted-beta',
        }),
      }),
    );

    const loadResult = await toolRegistry.execute('load_geotech_ingest_job_result', {
      projectId: 'project-123',
      datasetName: 'ingest-job:job-1',
    });
    expect(loadResult.success).toBe(true);
    expect((loadResult.data as any).persistedReview.datasetName).toBe('ingest-review:rev-doc-1');
  });

  it('lists persisted ingest reviews with concise summaries', async () => {
    ingestMocks.listPersistedBoreholeIngestReviews.mockReturnValue([
      createPersistedReviewRecord(),
      createPersistedReviewRecord({
        reviewId: 'rev-2',
        datasetName: 'ingest-review:rev-2',
        createdAt: '2026-04-22T00:00:00.000Z',
        title: 'Review 2',
        summary: {
          reviewRequired: true,
          canAutoProceed: false,
          confidence: 61,
          totalPages: 2,
          successfulPages: 1,
          failedPages: 1,
          boreholeCount: 1,
          boreholeIds: ['BH-02'],
          blockingFindings: 1,
          reviewFindings: 0,
          advisoryFindings: 0,
        },
      }),
    ]);

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('list_persisted_ingest_reviews', {
      projectId: 'project-123',
    });

    expect(result.success).toBe(true);
    expect((result.data as any).projectId).toBe('project-123');
    expect((result.data as any).count).toBe(2);
    expect((result.data as any).reviews[0]).toEqual(expect.objectContaining({
      datasetName: 'ingest-review:rev-1',
      documentType: 'borehole-log',
    }));
  });

  it('loads the latest persisted ingest review when datasetName is omitted', async () => {
    ingestMocks.loadLatestPersistedBoreholeIngestReview.mockReturnValue(createPersistedReviewRecord({
      reviewId: 'rev-latest',
      datasetName: 'ingest-review:rev-latest',
    }));

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('load_persisted_ingest_review', {
      projectId: 'project-123',
    });

    expect(result.success).toBe(true);
    expect(ingestMocks.loadLatestPersistedBoreholeIngestReview).toHaveBeenCalledWith('project-123');
    expect((result.data as any).datasetName).toBe('ingest-review:rev-latest');
  });

  it('records an approval for a persisted ingest review', async () => {
    ingestMocks.approvePersistedBoreholeIngestReview.mockReturnValue({
      kind: 'geotech-ingest-review-approval-record',
      schemaVersion: 1,
      approvalId: 'approval-1',
      datasetName: 'ingest-review-approval:rev-1:20260422t000000000z',
      projectId: 'project-123',
      reviewId: 'rev-1',
      reviewDatasetName: 'ingest-review:rev-1',
      approvedAt: '2026-04-22T00:00:00.000Z',
      approvedBy: 'QA reviewer',
      rationale: 'Reviewed manually against the source packet.',
      sourceSummary: {
        reviewRequired: true,
        canAutoProceed: false,
        confidence: 61,
        totalPages: 2,
        successfulPages: 1,
        failedPages: 1,
        boreholeCount: 1,
        boreholeIds: ['BH-01'],
        blockingFindings: 1,
        reviewFindings: 2,
        advisoryFindings: 0,
      },
    });

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('approve_persisted_ingest_review', {
      projectId: 'project-123',
      datasetName: 'ingest-review:rev-1',
      rationale: 'Reviewed manually against the source packet.',
      approvedBy: 'QA reviewer',
    });

    expect(result.success).toBe(true);
    expect(ingestMocks.approvePersistedBoreholeIngestReview).toHaveBeenCalledWith(
      'project-123',
      'ingest-review:rev-1',
      {
        rationale: 'Reviewed manually against the source packet.',
        approvedBy: 'QA reviewer',
      },
    );
    expect((result.data as any).datasetName).toContain('ingest-review-approval:rev-1');
  });

  it('lists approval history with latest-approval status', async () => {
    ingestMocks.listPersistedBoreholeIngestReviewApprovals.mockReturnValue([
      createApprovalRecord({
        approvalId: 'approval-2',
        datasetName: 'ingest-review-approval:rev-1:20260423t000000000z',
        approvedAt: '2026-04-23T00:00:00.000Z',
      }),
      createApprovalRecord(),
    ]);
    ingestMocks.loadLatestPersistedBoreholeIngestReviewApproval.mockReturnValue(
      createApprovalRecord({
        approvalId: 'approval-2',
        datasetName: 'ingest-review-approval:rev-1:20260423t000000000z',
        approvedAt: '2026-04-23T00:00:00.000Z',
      }),
    );

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('list_persisted_ingest_review_approvals', {
      projectId: 'project-123',
      reviewDatasetName: 'ingest-review:rev-1',
    });

    expect(result.success).toBe(true);
    expect((result.data as any).count).toBe(2);
    expect((result.data as any).approvals[0].isLatestForReview).toBe(true);
    expect((result.data as any).approvals[1].isLatestForReview).toBe(false);
  });

  it('loads a specific approval record', async () => {
    ingestMocks.loadPersistedBoreholeIngestReviewApproval.mockReturnValue(createApprovalRecord());
    ingestMocks.loadLatestPersistedBoreholeIngestReviewApproval.mockReturnValue(createApprovalRecord());

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('load_persisted_ingest_review_approval', {
      projectId: 'project-123',
      approvalDatasetName: 'ingest-review-approval:rev-1:20260422t000000000z',
    });

    expect(result.success).toBe(true);
    expect(ingestMocks.loadPersistedBoreholeIngestReviewApproval).toHaveBeenCalledWith(
      'project-123',
      'ingest-review-approval:rev-1:20260422t000000000z',
    );
    expect((result.data as any).approvalId).toBe('approval-1');
  });

  it('blocks autonomous promotion when a persisted review is not auto-proceed ready', async () => {
    ingestMocks.loadPersistedBoreholeIngestReview.mockReturnValue(createPersistedReviewRecord({
      summary: {
        reviewRequired: true,
        canAutoProceed: false,
        confidence: 61,
        totalPages: 2,
        successfulPages: 1,
        failedPages: 1,
        boreholeCount: 1,
        boreholeIds: ['BH-01'],
        blockingFindings: 1,
        reviewFindings: 2,
        advisoryFindings: 0,
      },
    }));

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('promote_persisted_ingest_review', {
      projectId: 'project-123',
      datasetName: 'ingest-review:rev-1',
    });

    expect(result.success).toBe(false);
    expect(ingestMocks.promotePersistedBoreholeIngestReview).not.toHaveBeenCalled();
    expect(result.error).toContain('not safe for autonomous promotion');
  });

  it('allows promotion of a flagged review when a recorded approval exists', async () => {
    ingestMocks.loadPersistedBoreholeIngestReview.mockReturnValue(createPersistedReviewRecord({
      summary: {
        reviewRequired: true,
        canAutoProceed: false,
        confidence: 61,
        totalPages: 2,
        successfulPages: 1,
        failedPages: 1,
        boreholeCount: 1,
        boreholeIds: ['BH-01'],
        blockingFindings: 1,
        reviewFindings: 2,
        advisoryFindings: 0,
      },
      approval: {
        datasetName: 'ingest-review-approval:rev-1:20260422t000000000z',
        approvedAt: '2026-04-22T00:00:00.000Z',
        rationale: 'Reviewed manually against the source packet.',
      },
    }));
    ingestMocks.promotePersistedBoreholeIngestReview.mockReturnValue({
      kind: 'geotech-ingest-promotion-result',
      schemaVersion: 1,
      projectId: 'project-123',
      sourceDatasetName: 'ingest-review:rev-1',
      sourceReviewDatasetName: 'ingest-review:rev-1',
      sourceReviewId: 'rev-1',
      approvalDatasetName: 'ingest-review-approval:rev-1:20260422t000000000z',
      approvedAt: '2026-04-22T00:00:00.000Z',
      approvalRationale: 'Reviewed manually against the source packet.',
      promotedAt: '2026-04-22T01:00:00.000Z',
      promotionDatasetName: 'ingest-promotion:rev-1',
      promotedDatasetNames: ['promoted-borehole:rev-1:bh-01', 'BH-01'],
      promotedBoreholeIds: ['BH-01'],
      supersededDatasetNames: [],
      snapshotDatasetNames: [],
      promotedBoreholes: [],
      warnings: [],
    });

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('promote_persisted_ingest_review', {
      projectId: 'project-123',
      datasetName: 'ingest-review:rev-1',
    });

    expect(result.success).toBe(true);
    expect(ingestMocks.promotePersistedBoreholeIngestReview).toHaveBeenCalledWith(
      'project-123',
      'ingest-review:rev-1',
    );
    expect((result.data as any).approvalDatasetName).toContain('ingest-review-approval:rev-1');
  });

  it('promotes an explicitly selected safe persisted review', async () => {
    ingestMocks.loadPersistedBoreholeIngestReview.mockReturnValue(createPersistedReviewRecord());
    ingestMocks.promotePersistedBoreholeIngestReview.mockReturnValue({
      kind: 'geotech-ingest-promotion-result',
      schemaVersion: 1,
      projectId: 'project-123',
      sourceDatasetName: 'ingest-review:rev-1',
      sourceReviewDatasetName: 'ingest-review:rev-1',
      sourceReviewId: 'rev-1',
      promotedAt: '2026-04-22T00:00:00.000Z',
      promotionDatasetName: 'ingest-promotion:rev-1',
      promotedDatasetNames: ['promoted-borehole:rev-1:bh-01', 'BH-01'],
      promotedBoreholeIds: ['BH-01'],
      supersededDatasetNames: [],
      snapshotDatasetNames: [],
      promotedBoreholes: [],
      warnings: [],
    });

    const { toolRegistry } = await import('../src/agents/tools.js');
    await import('../src/agents/data-tools.js');

    const result = await toolRegistry.execute('promote_persisted_ingest_review', {
      projectId: 'project-123',
      datasetName: 'ingest-review:rev-1',
    });

    expect(result.success).toBe(true);
    expect(ingestMocks.promotePersistedBoreholeIngestReview).toHaveBeenCalledWith(
      'project-123',
      'ingest-review:rev-1',
    );
    expect((result.data as any).promotionDatasetName).toBe('ingest-promotion:rev-1');
  });

  it('adds the new ingest job tools to swarm role allowlists', async () => {
    const { getAllowedToolsForAgent } = await import('../src/agents/swarm.js');

    expect(getAllowedToolsForAgent('interpretation')).toEqual(expect.arrayContaining([
      'start_geotech_ingest_job',
      'get_geotech_ingest_job',
      'wait_geotech_ingest_job',
      'load_geotech_ingest_job_result',
      'list_geotech_ingest_jobs',
    ]));
    expect(getAllowedToolsForAgent('reviewer')).toEqual(expect.arrayContaining([
      'get_geotech_ingest_job',
      'wait_geotech_ingest_job',
      'load_geotech_ingest_job_result',
      'list_geotech_ingest_jobs',
    ]));
  });
});
