import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const coreMocks = vi.hoisted(() => ({
  approvePersistedBoreholeIngestReview: vi.fn(),
  buildIngestDossier: vi.fn(),
  buildLLMConfig: vi.fn(),
  cancelPersistedIngestJob: vi.fn(),
  computeWeightedPdfPageCost: vi.fn(),
  createAndStartPersistedIngestJob: vi.fn(),
  ingestBoreholeLogDocument: vi.fn(),
  ingestGeotechDocument: vi.fn(),
  inspectPdfDocument: vi.fn(),
  listPersistedBoreholeIngestReviewApprovals: vi.fn(),
  loadLatestPersistedBoreholeIngestReview: vi.fn(),
  loadLatestPersistedBoreholeIngestReviewApproval: vi.fn(),
  loadPersistedIngestJob: vi.fn(),
  loadPersistedIngestJobResult: vi.fn(),
  loadPersistedBoreholeIngestReview: vi.fn(),
  loadPersistedBoreholeIngestReviewApproval: vi.fn(),
  listPersistedBoreholeIngestReviews: vi.fn(),
  persistBoreholeIngestReview: vi.fn(),
  promotePersistedBoreholeIngestReview: vi.fn(),
  renderIngestDossierAsHtml: vi.fn(),
  resolvePersistedIngestJobExtractionConcurrency: vi.fn(),
  resumePersistedIngestJob: vi.fn(),
  shouldUseAsyncIngestJob: vi.fn(),
  waitForPersistedIngestJob: vi.fn(),
}));

const visionMocks = vi.hoisted(() => ({
  estimateHostedBetaVisionBodyBytes: vi.fn(),
  formatByteSize: vi.fn(),
  countPdfPages: vi.fn(),
  readVisionInput: vi.fn(),
  readVisionPdfPageInputs: vi.fn(),
}));

const uiMocks = vi.hoisted(() => ({
  heading: vi.fn(),
  keyValue: vi.fn(),
  renderJSON: vi.fn(),
  renderTable: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
}));

vi.mock('@geotechcli/core', () => ({
  approvePersistedBoreholeIngestReview: coreMocks.approvePersistedBoreholeIngestReview,
  buildIngestDossier: coreMocks.buildIngestDossier,
  buildLLMConfig: coreMocks.buildLLMConfig,
  cancelPersistedIngestJob: coreMocks.cancelPersistedIngestJob,
  computeWeightedPdfPageCost: coreMocks.computeWeightedPdfPageCost,
  createAndStartPersistedIngestJob: coreMocks.createAndStartPersistedIngestJob,
  DEFAULT_LLM_VISION_MODEL: 'Qwen/Qwen3.5-9B',
  GLOBAL_FLAG_DEFINITIONS: [
    { key: 'json', option: '--json', description: 'json' },
    { key: 'quiet', option: '--quiet', description: 'quiet' },
    { key: 'dryRun', option: '--dry-run', description: 'dry run' },
    { key: 'output', option: '--output <file>', description: 'output' },
  ],
  ingestBoreholeLogDocument: coreMocks.ingestBoreholeLogDocument,
  ingestGeotechDocument: coreMocks.ingestGeotechDocument,
  inspectPdfDocument: coreMocks.inspectPdfDocument,
  listPersistedBoreholeIngestReviewApprovals: coreMocks.listPersistedBoreholeIngestReviewApprovals,
  loadLatestPersistedBoreholeIngestReview: coreMocks.loadLatestPersistedBoreholeIngestReview,
  loadLatestPersistedBoreholeIngestReviewApproval: coreMocks.loadLatestPersistedBoreholeIngestReviewApproval,
  loadPersistedIngestJob: coreMocks.loadPersistedIngestJob,
  loadPersistedIngestJobResult: coreMocks.loadPersistedIngestJobResult,
  loadPersistedBoreholeIngestReview: coreMocks.loadPersistedBoreholeIngestReview,
  loadPersistedBoreholeIngestReviewApproval: coreMocks.loadPersistedBoreholeIngestReviewApproval,
  listPersistedBoreholeIngestReviews: coreMocks.listPersistedBoreholeIngestReviews,
  persistBoreholeIngestReview: coreMocks.persistBoreholeIngestReview,
  promotePersistedBoreholeIngestReview: coreMocks.promotePersistedBoreholeIngestReview,
  renderIngestDossierAsHtml: coreMocks.renderIngestDossierAsHtml,
  resolvePersistedIngestJobExtractionConcurrency: coreMocks.resolvePersistedIngestJobExtractionConcurrency,
  resumePersistedIngestJob: coreMocks.resumePersistedIngestJob,
  shouldUseAsyncIngestJob: coreMocks.shouldUseAsyncIngestJob,
  waitForPersistedIngestJob: coreMocks.waitForPersistedIngestJob,
}));

vi.mock('../src/util/vision-output.js', () => ({
  HOSTED_BETA_REQUEST_LIMIT_BYTES: 8 * 1024 * 1024,
  HOSTED_BETA_REQUEST_SAFE_BYTES: 8 * 1024 * 1024,
  estimateHostedBetaVisionBodyBytes: visionMocks.estimateHostedBetaVisionBodyBytes,
  formatByteSize: visionMocks.formatByteSize,
  countPdfPages: visionMocks.countPdfPages,
  readVisionInput: visionMocks.readVisionInput,
  readVisionPdfPageInputs: visionMocks.readVisionPdfPageInputs,
}));

vi.mock('node:fs', () => ({
  writeFileSync: fsMocks.writeFileSync,
}));

vi.mock('../src/ui/terminal.js', () => ({
  heading: uiMocks.heading,
  keyValue: uiMocks.keyValue,
  renderJSON: uiMocks.renderJSON,
  renderTable: uiMocks.renderTable,
  success: uiMocks.success,
  error: uiMocks.error,
  info: uiMocks.info,
  warn: uiMocks.warn,
}));

async function loadRegisterIngestCommand(): Promise<(program: Command) => void> {
  const module = await import('../src/commands/ingest.js');
  return module.registerIngestCommand;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

function collectConsoleOutput(logSpy: ReturnType<typeof vi.spyOn>): string {
  return logSpy.mock.calls
    .map((call) => stripAnsi(call.map((entry) => String(entry)).join(' ')))
    .join('\n');
}

function makeBoreholeIngestResult(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'borehole-log',
    generatedAt: '2026-04-22T00:00:00.000Z',
    source: {
      filePath: 'sample.pdf',
      fileName: 'sample.pdf',
      inputKind: 'pdf',
      totalPages: 6,
      successfulPages: 6,
      failedPages: 0,
    },
    inspection: null,
    inspectionSummary: null,
    boreholes: [],
    pageAudits: [],
    pageFailures: [],
    warnings: [],
    reviewFindings: [],
    reviewReasons: [],
    reviewRequired: false,
    confidence: 82,
    canAutoProceed: true,
    ...overrides,
  };
}

function makePersistedIngestJobRecord(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'geotech-ingest-job-record',
    schemaVersion: 1,
    jobId: 'ingest-job-20260422-large-pdf',
    documentType: 'borehole-log',
    status: 'running',
    createdAt: '2026-04-22T00:00:00.000Z',
    updatedAt: '2026-04-22T00:01:00.000Z',
    startedAt: '2026-04-22T00:00:10.000Z',
    source: {
      filePath: 'large.pdf',
      fileName: 'large.pdf',
      inputKind: 'pdf',
      totalPages: 6,
      weightedPageCost: 7,
    },
    processing: {
      pagePreprocessingConcurrency: 2,
      chunkExtractionConcurrency: 2,
    },
    request: {},
    execution: {
      runCount: 1,
      pid: 4321,
      lastHeartbeatAt: '2026-04-22T00:01:00.000Z',
      cancelRequested: false,
    },
    checkpoints: {
      pages: [
        {
          pageNumber: 1,
          status: 'completed',
          classification: 'digital-text',
          sourceKind: 'pdf-page',
          weight: 1,
          attempts: 1,
          updatedAt: '2026-04-22T00:00:30.000Z',
        },
        {
          pageNumber: 2,
          status: 'pending',
          classification: 'image-only',
          sourceKind: 'raster-image',
          weight: 2,
          attempts: 0,
          updatedAt: '2026-04-22T00:00:10.000Z',
        },
      ],
    },
    ...overrides,
  };
}

describe('registerIngestCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    visionMocks.countPdfPages.mockReset();
    visionMocks.estimateHostedBetaVisionBodyBytes.mockReturnValue(1024);
    visionMocks.formatByteSize.mockImplementation((value: number) => `${value} B`);
    coreMocks.computeWeightedPdfPageCost.mockReturnValue(2);
    coreMocks.buildLLMConfig.mockReturnValue({
      provider: 'openai-compatible',
      apiKey: 'test-key',
      timeout: 1000,
      visionModelId: 'Qwen/Qwen3.5-9B',
    });
    coreMocks.buildIngestDossier.mockReturnValue({
      title: 'Dossier',
      subtitle: 'Test dossier',
      summary: 'Generated dossier',
      sourceLabel: 'sample.pdf',
      documentType: 'borehole-log',
      generatedAt: '2026-04-22T00:00:00.000Z',
      badges: [],
      metrics: [],
      findings: [],
      tables: [],
      pageCards: [],
      sections: [],
      footerNotes: [],
    });
    coreMocks.renderIngestDossierAsHtml.mockReturnValue('<!doctype html><html><body>Dossier</body></html>');
    coreMocks.resolvePersistedIngestJobExtractionConcurrency.mockReturnValue(2);
    coreMocks.shouldUseAsyncIngestJob.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a stable dry-run JSON envelope for PDFs even when lightweight inspection cannot count pages', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'pdf-base64',
      mimeType: 'application/pdf',
      fileBytes: 1024,
      filePath: 'sample.pdf',
      ext: 'pdf',
      kind: 'pdf',
    });
    coreMocks.inspectPdfDocument.mockReturnValue({
      totalPages: 0,
    });
    visionMocks.countPdfPages.mockResolvedValue(3);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'sample.pdf', '--dry-run', '--json'], { from: 'user' });

    expect(uiMocks.renderJSON).toHaveBeenCalledTimes(1);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith({
      kind: 'geotech-ingest-dry-run',
      documentType: 'borehole-log',
      source: {
        filePath: 'sample.pdf',
        inputKind: 'pdf',
      },
      wouldUseHostedVision: true,
      projectId: undefined,
      totalPages: 3,
      pageClassifications: [
        { pageNumber: 1, classification: 'n/a' },
        { pageNumber: 2, classification: 'n/a' },
        { pageNumber: 3, classification: 'n/a' },
      ],
      overrideBoreholeId: undefined,
    });
    expect(coreMocks.ingestBoreholeLogDocument).not.toHaveBeenCalled();
  });

  it('emits a stable dry-run JSON envelope for geotech-document ingest', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'pdf-base64',
      mimeType: 'application/pdf',
      fileBytes: 1024,
      filePath: 'site-report.pdf',
      ext: 'pdf',
      kind: 'pdf',
    });
    coreMocks.inspectPdfDocument.mockReturnValue({
      totalPages: 2,
      pages: [
        { pageNumber: 1, classification: 'digital-text' },
        { pageNumber: 2, classification: 'image-only' },
      ],
    });

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'site-report.pdf', '--type', 'geotech-document', '--dry-run', '--json'], { from: 'user' });

    expect(uiMocks.renderJSON).toHaveBeenCalledWith({
      kind: 'geotech-ingest-dry-run',
      documentType: 'geotech-document',
      source: {
        filePath: 'site-report.pdf',
        inputKind: 'pdf',
      },
      wouldUseHostedVision: true,
      projectId: undefined,
      totalPages: 2,
      pageClassifications: [
        { pageNumber: 1, classification: 'digital-text' },
        { pageNumber: 2, classification: 'image-only' },
      ],
      overrideBoreholeId: undefined,
    });
  });

  it('emits a stable dry-run JSON envelope for persisted ingest review lookup without calling storage helpers', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'demo-project',
      '--dataset',
      'ingest-review:demo',
      '--dry-run',
      '--json',
    ], { from: 'user' });

    expect(uiMocks.renderJSON).toHaveBeenCalledTimes(1);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith({
      kind: 'geotech-ingest-review-dry-run',
      projectId: 'demo-project',
      datasetName: 'ingest-review:demo',
      sourceSelection: 'specific-dataset',
      wouldLoadPersistedReview: true,
    });
    expect(coreMocks.loadPersistedBoreholeIngestReview).not.toHaveBeenCalled();
    expect(coreMocks.loadLatestPersistedBoreholeIngestReview).not.toHaveBeenCalled();
  });

  it('emits a stable dry-run JSON envelope for persisted ingest review promotion', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'promote',
      'demo-project',
      '--dataset',
      'ingest-review:demo',
      '--dry-run',
      '--json',
    ], { from: 'user' });

    expect(uiMocks.renderJSON).toHaveBeenCalledTimes(1);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith({
      kind: 'geotech-ingest-review-promotion-dry-run',
      projectId: 'demo-project',
      datasetName: 'ingest-review:demo',
      sourceSelection: 'specific-dataset',
      wouldLoadPersistedReview: true,
      wouldPromotePersistedReview: true,
    });
    expect(coreMocks.promotePersistedBoreholeIngestReview).not.toHaveBeenCalled();
  });

  it('emits a stable dry-run JSON envelope for persisted ingest review approval', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'approve',
      'demo-project',
      '--dataset',
      'ingest-review:demo',
      '--note',
      'Reviewed against the scanned packet.',
      '--by',
      'QA reviewer',
      '--dry-run',
      '--json',
    ], { from: 'user' });

    expect(uiMocks.renderJSON).toHaveBeenCalledTimes(1);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith({
      kind: 'geotech-ingest-review-approval-dry-run',
      projectId: 'demo-project',
      datasetName: 'ingest-review:demo',
      sourceSelection: 'specific-dataset',
      wouldLoadPersistedReview: true,
      wouldRecordApproval: true,
      note: 'Reviewed against the scanned packet.',
      approvedBy: 'QA reviewer',
    });
    expect(coreMocks.approvePersistedBoreholeIngestReview).not.toHaveBeenCalled();
  });

  it('emits a stable dry-run JSON envelope for persisted ingest review approval lookup', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'approvals',
      'demo-project',
      '--dataset',
      'ingest-review:demo',
      '--latest',
      '--dry-run',
      '--json',
    ], { from: 'user' });

    expect(uiMocks.renderJSON).toHaveBeenCalledTimes(1);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith({
      kind: 'geotech-ingest-review-approval-lookup-dry-run',
      projectId: 'demo-project',
      reviewDatasetName: 'ingest-review:demo',
      approvalDatasetName: undefined,
      latest: true,
      wouldLoadPersistedReviewApproval: true,
      wouldListPersistedReviewApprovals: false,
    });
    expect(coreMocks.listPersistedBoreholeIngestReviewApprovals).not.toHaveBeenCalled();
    expect(coreMocks.loadLatestPersistedBoreholeIngestReviewApproval).not.toHaveBeenCalled();
  });

  it('creates a persisted async ingest job for large PDFs and returns the job in JSON mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const inspection = {
      totalPages: 6,
      pages: Array.from({ length: 6 }, (_, index) => ({
        pageNumber: index + 1,
        classification: index === 4 ? 'image-only' : 'digital-text',
      })),
    };
    const jobRecord = makePersistedIngestJobRecord({
      request: {
        projectId: 'demo-project',
      },
    });

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'pdf-base64',
      mimeType: 'application/pdf',
      fileBytes: 2048,
      filePath: 'large.pdf',
      ext: 'pdf',
      kind: 'pdf',
    });
    coreMocks.inspectPdfDocument.mockReturnValue(inspection);
    coreMocks.computeWeightedPdfPageCost.mockReturnValue(7);
    coreMocks.shouldUseAsyncIngestJob.mockReturnValue(true);
    coreMocks.createAndStartPersistedIngestJob.mockReturnValue(jobRecord);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'large.pdf', '--project', 'demo-project', '--json'], { from: 'user' });

    expect(coreMocks.createAndStartPersistedIngestJob).toHaveBeenCalledWith(expect.objectContaining({
      documentType: 'borehole-log',
      filePath: 'large.pdf',
      inspection,
      projectId: 'demo-project',
    }));
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(jobRecord);
    expect(coreMocks.ingestBoreholeLogDocument).not.toHaveBeenCalled();
  });

  it('loads persisted ingest job status in JSON mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const jobRecord = makePersistedIngestJobRecord();

    coreMocks.loadPersistedIngestJob.mockReturnValue(jobRecord);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'status', jobRecord.jobId, '--json'], { from: 'user' });

    expect(coreMocks.loadPersistedIngestJob).toHaveBeenCalledWith(jobRecord.jobId);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(jobRecord);
  });

  it('waits for a completed ingest job and returns the completed result in JSON mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const completedResult = {
      ingestResult: makeBoreholeIngestResult(),
      persistedReview: {
        datasetName: 'ingest-review:latest',
        reviewId: 'review-1',
        createdAt: '2026-04-22T00:02:00.000Z',
      },
    };
    const jobRecord = makePersistedIngestJobRecord({
      status: 'completed',
      completedAt: '2026-04-22T00:02:00.000Z',
      result: completedResult,
      checkpoints: {
        pages: [
          {
            pageNumber: 1,
            status: 'completed',
            classification: 'digital-text',
            sourceKind: 'pdf-page',
            weight: 1,
            attempts: 1,
            updatedAt: '2026-04-22T00:01:00.000Z',
          },
          {
            pageNumber: 2,
            status: 'completed',
            classification: 'image-only',
            sourceKind: 'raster-image',
            weight: 2,
            attempts: 1,
            updatedAt: '2026-04-22T00:01:30.000Z',
          },
        ],
      },
    });

    coreMocks.waitForPersistedIngestJob.mockResolvedValue(jobRecord);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'wait', jobRecord.jobId, '--json'], { from: 'user' });

    expect(coreMocks.waitForPersistedIngestJob).toHaveBeenCalledWith(jobRecord.jobId);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(completedResult);
  });

  it('resumes a persisted ingest job in JSON mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const resumedJob = makePersistedIngestJobRecord({
      status: 'running',
      execution: {
        runCount: 2,
        pid: 9876,
        lastHeartbeatAt: '2026-04-22T00:03:00.000Z',
        cancelRequested: false,
      },
    });

    coreMocks.resumePersistedIngestJob.mockReturnValue(resumedJob);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'resume', resumedJob.jobId, '--json'], { from: 'user' });

    expect(coreMocks.resumePersistedIngestJob).toHaveBeenCalledWith(resumedJob.jobId);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(resumedJob);
  });

  it('loads a completed ingest job result in JSON mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const completedResult = {
      ingestResult: makeBoreholeIngestResult(),
    };
    const jobRecord = makePersistedIngestJobRecord({
      status: 'completed',
      completedAt: '2026-04-22T00:02:00.000Z',
      result: completedResult,
    });

    coreMocks.loadPersistedIngestJob.mockReturnValue(jobRecord);
    coreMocks.loadPersistedIngestJobResult.mockReturnValue(completedResult);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'result', jobRecord.jobId, '--json'], { from: 'user' });

    expect(coreMocks.loadPersistedIngestJob).toHaveBeenCalledWith(jobRecord.jobId);
    expect(coreMocks.loadPersistedIngestJobResult).toHaveBeenCalledWith(jobRecord.jobId);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(completedResult);
  });

  it('cancels a persisted ingest job in JSON mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const canceledJob = makePersistedIngestJobRecord({
      status: 'canceled',
      canceledAt: '2026-04-22T00:04:00.000Z',
      execution: {
        runCount: 1,
        lastHeartbeatAt: '2026-04-22T00:03:30.000Z',
        cancelRequested: true,
      },
    });

    coreMocks.cancelPersistedIngestJob.mockReturnValue(canceledJob);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'cancel', canceledJob.jobId, '--json'], { from: 'user' });

    expect(coreMocks.cancelPersistedIngestJob).toHaveBeenCalledWith(canceledJob.jobId);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(canceledJob);
  });

  it('passes through the structured ingest result in JSON mode without human chatter', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const inspection = {
      totalPages: 2,
      pages: [
        { pageNumber: 1, classification: 'digital-text' },
        { pageNumber: 2, classification: 'image-only' },
      ],
    };
    const pageInputs = [
      {
        base64: 'page-1',
        mimeType: 'application/pdf',
        fileBytes: 100,
        filePath: 'sample.pdf',
        ext: 'pdf',
        kind: 'pdf',
        pageNumber: 1,
        totalPages: 2,
        sourceKind: 'pdf-page',
      },
      {
        base64: 'page-2',
        mimeType: 'image/png',
        fileBytes: 200,
        filePath: 'sample.pdf',
        ext: 'png',
        kind: 'image',
        pageNumber: 2,
        totalPages: 2,
        sourceKind: 'raster-image',
      },
    ];
    const ingestResult = {
      kind: 'geotech-ingest-result',
      schemaVersion: 1,
      documentType: 'borehole-log',
      generatedAt: '2026-04-21T00:00:00.000Z',
      source: {
        filePath: 'sample.pdf',
        fileName: 'sample.pdf',
        inputKind: 'pdf',
        totalPages: 2,
        successfulPages: 2,
        failedPages: 0,
      },
      inspection,
      inspectionSummary: {
        pageClassificationCounts: { 'digital-text': 1, 'image-only': 1 },
        imageHeavyPageCount: 1,
        nativeTextPageCount: 1,
        degradedPageCount: 1,
        ocrRecoveredPageCount: 1,
      },
      boreholes: [],
      pageAudits: [],
      pageFailures: [],
      warnings: [],
      reviewFindings: [],
      reviewReasons: [],
      reviewRequired: false,
      confidence: 82,
      canAutoProceed: true,
    };

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'pdf-base64',
      mimeType: 'application/pdf',
      fileBytes: 1024,
      filePath: 'sample.pdf',
      ext: 'pdf',
      kind: 'pdf',
    });
    coreMocks.inspectPdfDocument.mockReturnValue(inspection);
    visionMocks.readVisionPdfPageInputs.mockResolvedValue(pageInputs);
    coreMocks.ingestBoreholeLogDocument.mockResolvedValue(ingestResult);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'sample.pdf', '--json'], { from: 'user' });

    expect(visionMocks.readVisionPdfPageInputs).toHaveBeenCalledWith('sample.pdf', { inspection });
    expect(coreMocks.ingestBoreholeLogDocument).toHaveBeenCalledWith(expect.objectContaining({
      inspection,
      pages: pageInputs,
      source: expect.objectContaining({
        filePath: 'sample.pdf',
        fileName: 'sample.pdf',
        inputKind: 'pdf',
      }),
    }));
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(ingestResult);
    expect(uiMocks.info).not.toHaveBeenCalled();
    expect(uiMocks.success).not.toHaveBeenCalled();
  });

  it('passes through the geotech-document ingest result in JSON mode without human chatter', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const inspection = {
      totalPages: 2,
      pages: [
        { pageNumber: 1, classification: 'digital-text' },
        { pageNumber: 2, classification: 'image-only' },
      ],
    };
    const pageInputs = [
      {
        base64: 'page-1',
        mimeType: 'application/pdf',
        fileBytes: 100,
        filePath: 'site-report.pdf',
        ext: 'pdf',
        kind: 'pdf',
        pageNumber: 1,
        totalPages: 2,
        sourceKind: 'pdf-page',
      },
      {
        base64: 'page-2',
        mimeType: 'image/png',
        fileBytes: 200,
        filePath: 'site-report.pdf',
        ext: 'png',
        kind: 'image',
        pageNumber: 2,
        totalPages: 2,
        sourceKind: 'raster-image',
      },
    ];
    const ingestResult = {
      kind: 'geotech-ingest-result',
      schemaVersion: 1,
      documentType: 'geotech-document',
      generatedAt: '2026-04-21T00:00:00.000Z',
      source: {
        filePath: 'site-report.pdf',
        fileName: 'site-report.pdf',
        inputKind: 'pdf',
        totalPages: 2,
        successfulPages: 2,
        failedPages: 0,
      },
      inspection,
      inspectionSummary: {
        pageClassificationCounts: { 'digital-text': 1, 'image-only': 1 },
        imageHeavyPageCount: 1,
        nativeTextPageCount: 1,
        degradedPageCount: 1,
        ocrRecoveredPageCount: 1,
      },
      documentClass: 'geotechnical-document',
      title: 'Site investigation summary',
      summary: 'Clay over weathered shale with laboratory parameters.',
      materials: [
        { kind: 'soil', description: 'stiff clay', uscsSymbol: 'CL', lithology: null },
      ],
      classifications: [
        { system: 'USCS', value: 'CL', context: 'stiff clay' },
      ],
      parameters: [
        { name: 'cohesion', valueText: '25', numericValue: 25, unit: 'kPa', material: 'stiff clay', context: 'triaxial' },
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
      reviewRequired: false,
      canAutoProceed: true,
    };

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'pdf-base64',
      mimeType: 'application/pdf',
      fileBytes: 1024,
      filePath: 'site-report.pdf',
      ext: 'pdf',
      kind: 'pdf',
    });
    coreMocks.inspectPdfDocument.mockReturnValue(inspection);
    visionMocks.readVisionPdfPageInputs.mockResolvedValue(pageInputs);
    coreMocks.ingestGeotechDocument.mockResolvedValue(ingestResult);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'site-report.pdf', '--type', 'geotech-document', '--json'], { from: 'user' });

    expect(coreMocks.ingestGeotechDocument).toHaveBeenCalledWith(expect.objectContaining({
      inspection,
      pages: pageInputs,
      source: expect.objectContaining({
        filePath: 'site-report.pdf',
        fileName: 'site-report.pdf',
        inputKind: 'pdf',
      }),
    }));
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(ingestResult);
    expect(coreMocks.persistBoreholeIngestReview).not.toHaveBeenCalled();
  });

  it('passes through the latest persisted ingest review record in JSON mode without human chatter', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const reviewRecord = {
      kind: 'geotech-ingest-review-record',
      schemaVersion: 1,
      reviewId: '20260421-demo',
      datasetName: 'ingest-review:20260421-demo',
      projectId: 'demo-project',
      createdAt: '2026-04-21T00:00:00.000Z',
      title: 'Ingest review: sample.pdf',
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
        reviewFindings: 1,
        advisoryFindings: 0,
      },
      result: {
        kind: 'geotech-ingest-result',
        schemaVersion: 1,
        documentType: 'borehole-log',
        generatedAt: '2026-04-21T00:00:00.000Z',
        source: {
          filePath: 'sample.pdf',
          fileName: 'sample.pdf',
          inputKind: 'pdf',
          totalPages: 2,
          successfulPages: 1,
          failedPages: 1,
        },
        inspection: null,
        inspectionSummary: null,
        boreholes: [],
        pageAudits: [],
        pageFailures: ['Page 2: timeout'],
        warnings: ['Stored OCR recovery hints should be spot-checked.'],
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
        confidence: 61,
        canAutoProceed: false,
      },
    };

    coreMocks.loadLatestPersistedBoreholeIngestReview.mockReturnValue(reviewRecord);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'demo-project',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.loadLatestPersistedBoreholeIngestReview).toHaveBeenCalledWith('demo-project');
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(reviewRecord);
    expect(uiMocks.info).not.toHaveBeenCalled();
    expect(uiMocks.success).not.toHaveBeenCalled();
  });

  it('passes through the persisted ingest promotion result in JSON mode without human chatter', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const promotionResult = {
      kind: 'geotech-ingest-review-promotion-result',
      schemaVersion: 1,
      projectId: 'demo-project',
      sourceDatasetName: 'ingest-review:20260421-demo',
      promotedDatasetNames: [
        'promoted-borehole:20260421-demo:bh-01',
        'promoted-borehole:20260421-demo:bh-02',
      ],
      promotedBoreholeIds: ['BH-01', 'BH-02'],
    };

    coreMocks.promotePersistedBoreholeIngestReview.mockResolvedValue(promotionResult);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'promote',
      'demo-project',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.promotePersistedBoreholeIngestReview).toHaveBeenCalledWith('demo-project', undefined);
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(promotionResult);
    expect(uiMocks.info).not.toHaveBeenCalled();
    expect(uiMocks.success).not.toHaveBeenCalled();
  });

  it('passes through the persisted ingest approval result in JSON mode without human chatter', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const approvalRecord = {
      kind: 'geotech-ingest-review-approval-record',
      schemaVersion: 1,
      approvalId: 'approval-1',
      datasetName: 'ingest-review-approval:20260421-demo:20260422t000000000z',
      projectId: 'demo-project',
      reviewId: '20260421-demo',
      reviewDatasetName: 'ingest-review:20260421-demo',
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
    };

    coreMocks.approvePersistedBoreholeIngestReview.mockReturnValue(approvalRecord);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'approve',
      'demo-project',
      '--dataset',
      'ingest-review:20260421-demo',
      '--note',
      'Reviewed against the source packet.',
      '--by',
      'QA reviewer',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.approvePersistedBoreholeIngestReview).toHaveBeenCalledWith(
      'demo-project',
      'ingest-review:20260421-demo',
      {
        rationale: 'Reviewed against the source packet.',
        approvedBy: 'QA reviewer',
      },
    );
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(approvalRecord);
    expect(uiMocks.info).not.toHaveBeenCalled();
    expect(uiMocks.success).not.toHaveBeenCalled();
  });

  it('passes through persisted ingest approval history summaries in JSON mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const approvalHistory = [
      {
        datasetName: 'ingest-review-approval:rev-1:20260423t000000000z',
        reviewDatasetName: 'ingest-review:rev-1',
        approvedAt: '2026-04-23T00:00:00.000Z',
        approvedBy: 'Lead reviewer',
        rationale: 'Newest approval.',
        isLatestForReview: true,
      },
      {
        datasetName: 'ingest-review-approval:rev-1:20260422t000000000z',
        reviewDatasetName: 'ingest-review:rev-1',
        approvedAt: '2026-04-22T00:00:00.000Z',
        approvedBy: 'QA reviewer',
        rationale: 'Older approval.',
        isLatestForReview: false,
      },
    ];

    coreMocks.listPersistedBoreholeIngestReviewApprovals.mockReturnValue([
      { ...approvalHistory[0], approvalId: 'approval-2', projectId: 'demo-project', reviewId: 'rev-1', sourceSummary: {} },
      { ...approvalHistory[1], approvalId: 'approval-1', projectId: 'demo-project', reviewId: 'rev-1', sourceSummary: {} },
    ]);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'approvals',
      'demo-project',
      '--dataset',
      'ingest-review:rev-1',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.listPersistedBoreholeIngestReviewApprovals).toHaveBeenCalledWith(
      'demo-project',
      'ingest-review:rev-1',
    );
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(approvalHistory);
  });

  it('lists persisted ingest reviews in plain mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    coreMocks.listPersistedBoreholeIngestReviews.mockReturnValue([
      {
        datasetName: 'ingest-review:20260421-b',
        createdAt: '2026-04-21T01:00:00.000Z',
        title: 'Ingest review: b.pdf',
        summary: { confidence: 72, reviewRequired: true, canAutoProceed: false },
        result: { source: { fileName: 'b.pdf', filePath: 'b.pdf' }, documentType: 'borehole-log' },
      },
      {
        datasetName: 'ingest-review:20260421-a',
        createdAt: '2026-04-21T00:00:00.000Z',
        title: 'Desk study packet',
        summary: { confidence: 88, reviewRequired: false, canAutoProceed: true },
        approval: { datasetName: 'ingest-review-approval:20260421-a:latest' },
        result: { source: { fileName: 'a.pdf', filePath: 'a.pdf' }, documentType: 'geotech-document' },
      },
    ]);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'review', 'demo-project', '--list'], { from: 'user' });

    collectConsoleOutput(logSpy);
    expect(uiMocks.heading).toHaveBeenCalledWith('Persisted Ingest Reviews');
    expect(coreMocks.listPersistedBoreholeIngestReviews).toHaveBeenCalledWith('demo-project');
    expect(uiMocks.renderTable).toHaveBeenCalledWith(
      ['Dataset', 'Type', 'Created', 'Source', 'Confidence', 'Review', 'Auto', 'Approved'],
      [
        ['ingest-review:20260421-b', 'borehole-log', '2026-04-21T01:00:00.000Z', 'b.pdf', '72%', 'Yes', 'No', 'No'],
        ['ingest-review:20260421-a', 'geotech-document', '2026-04-21T00:00:00.000Z', 'a.pdf', '88%', 'No', 'Yes', 'Yes'],
      ],
    );
  });

  it('passes through the persisted ingest promotion result in JSON mode for a selected review dataset', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const promotionResult = {
      kind: 'geotech-ingest-review-promotion-result',
      schemaVersion: 1,
      projectId: 'demo-project',
      sourceDatasetName: 'ingest-review:20260421-demo',
      promotedDatasetNames: ['promoted-borehole:20260421-demo:bh-01'],
      promotedBoreholeIds: ['BH-01'],
      warnings: [],
    };

    coreMocks.promotePersistedBoreholeIngestReview.mockReturnValue(promotionResult);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'promote',
      'demo-project',
      '--dataset',
      'ingest-review:20260421-demo',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.promotePersistedBoreholeIngestReview).toHaveBeenCalledWith(
      'demo-project',
      'ingest-review:20260421-demo',
    );
    expect(uiMocks.renderJSON).toHaveBeenCalledWith(promotionResult);
  });

  it('prints structured review findings, persists the review record, and writes JSON output in plain mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ingestResult = {
      kind: 'geotech-ingest-result',
      schemaVersion: 1,
      documentType: 'borehole-log',
      generatedAt: '2026-04-21T00:00:00.000Z',
      source: {
        filePath: 'sample.pdf',
        fileName: 'sample.pdf',
        inputKind: 'pdf',
        totalPages: 2,
        successfulPages: 1,
        failedPages: 1,
      },
      inspection: null,
      inspectionSummary: null,
      boreholes: [
        {
          boreholeId: 'BH-REVIEW',
          totalDepth: 8,
          waterTableDepth: 2.5,
          layers: [],
          summary: 'Manual review recommended.',
          location: null,
          groundElevation: null,
          dateDrilled: null,
          drillingMethod: null,
          projectName: 'Demo project',
          continuationDepth: 8,
          pageNumber: 1,
          totalPages: 2,
          rawLLMText: 'mock',
          latencyMs: 140,
          parseStatus: 'partial',
          confidence: 62,
          warnings: ['Borehole warning from merged result.'],
          canAutoProceed: false,
        },
      ],
      pageAudits: [],
      pageFailures: ['Page 2: provider timeout'],
      warnings: [
        'Recovered OCR text should be verified.',
        'Borehole warning from merged result.',
        'Recovered OCR-style text hint for page 1 from the raster image input.',
      ],
      reviewFindings: [
        {
          severity: 'blocking',
          scope: 'page',
          message: 'Provider timeout blocked page extraction.',
          pageNumber: 2,
        },
        {
          severity: 'review',
          scope: 'borehole',
          message: 'Merged borehole data is partial.',
          pageNumber: 1,
          boreholeId: 'BH-REVIEW',
        },
        {
          severity: 'advisory',
          scope: 'document',
          message: 'Recovered OCR text should be verified.',
        },
      ],
      reviewReasons: [
        'Legacy review reason that should stay hidden when structured findings are present.',
      ],
      reviewRequired: true,
      confidence: 62,
      canAutoProceed: false,
    };

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'image-base64',
      mimeType: 'image/png',
      fileBytes: 512,
      filePath: 'sample.png',
      ext: 'png',
      kind: 'image',
    });
    coreMocks.ingestBoreholeLogDocument.mockResolvedValue(ingestResult);
    coreMocks.persistBoreholeIngestReview.mockReturnValue({
      datasetName: 'ingest-review:20260421-sample',
      reviewId: '20260421-sample',
      createdAt: '2026-04-21T00:00:00.000Z',
    });

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'sample.png', '--project', 'demo-project', '--output', 'result.json'], { from: 'user' });

    const output = collectConsoleOutput(logSpy);
    expect(output).toContain('Stored review:');
    expect(output).toContain('Review findings:');
    expect(output).toContain('Blocking:');
    expect(output).toContain('Needs review:');
    expect(output).toContain('Advisory:');
    expect(output).toContain('Page failures:');
    expect(output).toContain('Warnings:');
    expect(output).toContain('First borehole summary (BH-REVIEW):');
    expect(coreMocks.persistBoreholeIngestReview).toHaveBeenCalledWith('demo-project', ingestResult);
    expect(uiMocks.error).toHaveBeenCalledWith('Page 2: Provider timeout blocked page extraction.');
    expect(uiMocks.warn).toHaveBeenCalledWith('Page 1 | Borehole BH-REVIEW: Merged borehole data is partial.');
    expect(uiMocks.info).toHaveBeenCalledWith('Document: Recovered OCR text should be verified.');
    expect(uiMocks.warn).not.toHaveBeenCalledWith('Legacy review reason that should stay hidden when structured findings are present.');
    expect(uiMocks.warn).not.toHaveBeenCalledWith('Recovered OCR text should be verified.');
    expect(uiMocks.warn).toHaveBeenCalledWith('Page 2: provider timeout');
    expect(uiMocks.warn).toHaveBeenCalledWith('Recovered OCR-style text hint for page 1 from the raster image input.');
    expect(uiMocks.success).toHaveBeenCalledWith('Results saved to result.json');
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'result.json',
      JSON.stringify(ingestResult, null, 2),
    );
  });

  it('prints a persisted ingest review record in plain mode and writes JSON output', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const reviewRecord = {
      kind: 'geotech-ingest-review-record',
      schemaVersion: 1,
      reviewId: '20260421-bh-packet',
      datasetName: 'ingest-review:20260421-bh-packet',
      projectId: 'demo-project',
      createdAt: '2026-04-21T00:00:00.000Z',
      title: 'Ingest review: packet.pdf',
      summary: {
        reviewRequired: true,
        canAutoProceed: false,
        confidence: 59,
        totalPages: 3,
        successfulPages: 2,
        failedPages: 1,
        boreholeCount: 1,
        boreholeIds: ['BH-02'],
        blockingFindings: 1,
        reviewFindings: 1,
        advisoryFindings: 1,
      },
      result: {
        kind: 'geotech-ingest-result',
        schemaVersion: 1,
        documentType: 'borehole-log',
        generatedAt: '2026-04-21T00:00:00.000Z',
        source: {
          filePath: 'packet.pdf',
          fileName: 'packet.pdf',
          inputKind: 'pdf',
          totalPages: 3,
          successfulPages: 2,
          failedPages: 1,
        },
        inspection: null,
        inspectionSummary: null,
        boreholes: [
          {
            boreholeId: 'BH-02',
            totalDepth: 11,
            waterTableDepth: 3,
            layers: [],
            summary: 'Manual review required before design use.',
            location: null,
            groundElevation: null,
            dateDrilled: null,
            drillingMethod: null,
            projectName: 'Demo project',
            continuationDepth: 11,
            pageNumber: 1,
            totalPages: 3,
            rawLLMText: 'mock',
            latencyMs: 140,
            parseStatus: 'partial',
            confidence: 59,
            warnings: ['Project metadata still uses the desk-study location name.'],
            canAutoProceed: false,
          },
        ],
        pageAudits: [],
        pageFailures: ['Page 3: timeout'],
        warnings: [
          'Stored OCR recovery hints should be spot-checked.',
          'Project metadata still uses the desk-study location name.',
        ],
        reviewFindings: [
          {
            code: 'page_missing_depth',
            severity: 'blocking',
            scope: 'page',
            message: 'Page 3 is missing a legible total depth.',
            pageNumber: 3,
          },
          {
            code: 'suspicious_continuation',
            severity: 'review',
            scope: 'borehole',
            message: 'BH-02 contains a suspicious layer continuation.',
            boreholeId: 'BH-02',
            pageNumber: 2,
          },
          {
            code: 'ocr_review',
            severity: 'advisory',
            scope: 'document',
            message: 'Stored OCR recovery hints should be spot-checked.',
          },
        ],
        reviewReasons: [
          'Page 3 is missing a legible total depth.',
          'BH-02 contains a suspicious layer continuation.',
        ],
        reviewRequired: true,
        confidence: 59,
        canAutoProceed: false,
      },
      approval: {
        datasetName: 'ingest-review-approval:20260421-bh-packet:20260422t000000000z',
        approvedAt: '2026-04-22T00:00:00.000Z',
        approvedBy: 'QA reviewer',
        rationale: 'Verified the continuation manually from the scanned appendix.',
      },
    };

    coreMocks.loadPersistedBoreholeIngestReview.mockReturnValue(reviewRecord);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'demo-project',
      '--dataset',
      'ingest-review:20260421-bh-packet',
      '--output',
      'review.json',
    ], { from: 'user' });

    const output = collectConsoleOutput(logSpy);
    expect(output).toContain('Stored review:');
    expect(output).toContain('Approval:');
    expect(output).toContain('Review findings:');
    expect(output).toContain('Blocking:');
    expect(output).toContain('Needs review:');
    expect(output).toContain('Advisory:');
    expect(output).toContain('Page failures:');
    expect(output).toContain('Warnings:');
    expect(uiMocks.error).toHaveBeenCalledWith('Page 3: Page 3 is missing a legible total depth.');
    expect(uiMocks.warn).toHaveBeenCalledWith('Page 2 | Borehole BH-02: BH-02 contains a suspicious layer continuation.');
    expect(uiMocks.info).toHaveBeenCalledWith('Document: Stored OCR recovery hints should be spot-checked.');
    expect(uiMocks.warn).toHaveBeenCalledWith('Project metadata still uses the desk-study location name.');
    expect(uiMocks.warn).not.toHaveBeenCalledWith('Stored OCR recovery hints should be spot-checked.');
    expect(coreMocks.loadPersistedBoreholeIngestReview).toHaveBeenCalledWith(
      'demo-project',
      'ingest-review:20260421-bh-packet',
    );
    expect(uiMocks.success).toHaveBeenCalledWith('Review details saved to review.json');
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'review.json',
      JSON.stringify(reviewRecord, null, 2),
    );
  });

  it('prints a persisted geotech-document review record in plain mode and writes JSON output', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const reviewRecord = {
      kind: 'geotech-ingest-review-record',
      schemaVersion: 1,
      reviewId: '20260421-site-packet',
      datasetName: 'ingest-review:20260421-site-packet',
      projectId: 'demo-project',
      createdAt: '2026-04-21T00:00:00.000Z',
      title: 'Desk study packet',
      summary: {
        reviewRequired: true,
        canAutoProceed: false,
        confidence: 64,
        totalPages: 2,
        successfulPages: 2,
        failedPages: 0,
        boreholeCount: 0,
        boreholeIds: [],
        blockingFindings: 1,
        reviewFindings: 1,
        advisoryFindings: 1,
      },
      result: {
        kind: 'geotech-ingest-result',
        schemaVersion: 1,
        documentType: 'geotech-document',
        generatedAt: '2026-04-21T00:00:00.000Z',
        source: {
          filePath: 'desk-study.pdf',
          fileName: 'desk-study.pdf',
          inputKind: 'pdf',
          totalPages: 2,
          successfulPages: 2,
          failedPages: 0,
        },
        inspection: null,
        inspectionSummary: null,
        documentClass: 'site-investigation-report',
        title: 'Desk study summary',
        summary: 'Clay over weathered shale with laboratory parameters.',
        materials: [
          { kind: 'soil', description: 'stiff clay', uscsSymbol: 'CL', lithology: null },
          { kind: 'rock', description: 'weathered shale', uscsSymbol: null, lithology: 'shale' },
        ],
        classifications: [
          { system: 'USCS', value: 'CL', context: 'stiff clay' },
        ],
        parameters: [
          { name: 'cohesion', valueText: '25', numericValue: 25, unit: 'kPa', material: 'stiff clay', context: 'triaxial' },
        ],
        risks: ['Weathered shale durability should be reviewed before design reuse.'],
        recommendations: ['Confirm representative sampling before final design.'],
        pageAudits: [],
        pageFailures: [],
        warnings: [
          'Recovered OCR hints should be spot-checked.',
          'Laboratory correlation should be confirmed against the appendix.',
        ],
        reviewFindings: [
          {
            code: 'table_ocr_truncation',
            severity: 'blocking',
            scope: 'page',
            message: 'Page 2 table values were truncated during OCR.',
            pageNumber: 2,
          },
          {
            code: 'material_parameter_review',
            severity: 'review',
            scope: 'material',
            message: 'Weathered shale shear-strength parameters should be confirmed manually.',
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
        reviewReasons: [
          'Page 2 table values were truncated during OCR.',
          'Weathered shale shear-strength parameters should be confirmed manually.',
        ],
        parseStatus: 'partial',
        confidence: 64,
        reviewRequired: true,
        canAutoProceed: false,
      },
      approval: {
        datasetName: 'ingest-review-approval:20260421-site-packet:20260422t000000000z',
        approvedAt: '2026-04-22T00:00:00.000Z',
        approvedBy: 'Engineering reviewer',
        rationale: 'Reviewed manually against the scanned desk study appendix.',
      },
    };

    coreMocks.loadPersistedBoreholeIngestReview.mockReturnValue(reviewRecord);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'demo-project',
      '--dataset',
      'ingest-review:20260421-site-packet',
      '--output',
      'review.json',
    ], { from: 'user' });

    const output = collectConsoleOutput(logSpy);
    expect(output).toContain('Stored review:');
    expect(output).toContain('Approval:');
    expect(output).toContain('Materials:');
    expect(output).toContain('Parameters:');
    expect(output).toContain('Risks:');
    expect(output).toContain('Recommendations:');
    expect(output).toContain('Review findings:');
    expect(uiMocks.error).toHaveBeenCalledWith('Page 2: Page 2 table values were truncated during OCR.');
    expect(uiMocks.warn).toHaveBeenCalledWith(
      'Page 2 | Material weathered shale: Weathered shale shear-strength parameters should be confirmed manually.',
    );
    expect(uiMocks.info).toHaveBeenCalledWith('Document: Recovered OCR hints should be spot-checked.');
    expect(uiMocks.warn).toHaveBeenCalledWith('Laboratory correlation should be confirmed against the appendix.');
    expect(uiMocks.info).toHaveBeenCalledWith('Confirm representative sampling before final design.');
    expect(uiMocks.warn).not.toHaveBeenCalledWith('Recovered OCR hints should be spot-checked.');
    expect(coreMocks.loadPersistedBoreholeIngestReview).toHaveBeenCalledWith(
      'demo-project',
      'ingest-review:20260421-site-packet',
    );
    expect(uiMocks.success).toHaveBeenCalledWith('Review details saved to review.json');
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'review.json',
      JSON.stringify(reviewRecord, null, 2),
    );
  });

  it('prints a persisted ingest approval summary in plain mode and writes JSON output', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const approvalRecord = {
      kind: 'geotech-ingest-review-approval-record',
      schemaVersion: 1,
      approvalId: 'approval-1',
      datasetName: 'ingest-review-approval:20260421-demo:20260422t000000000z',
      projectId: 'demo-project',
      reviewId: '20260421-demo',
      reviewDatasetName: 'ingest-review:20260421-demo',
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
    };

    coreMocks.approvePersistedBoreholeIngestReview.mockReturnValue(approvalRecord);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'approve',
      'demo-project',
      '--dataset',
      'ingest-review:20260421-demo',
      '--note',
      'Reviewed against the source packet.',
      '--by',
      'QA reviewer',
      '--output',
      'approval.json',
    ], { from: 'user' });

    const output = collectConsoleOutput(logSpy);
    expect(uiMocks.heading).toHaveBeenCalledWith('Persisted Ingest Review Approval');
    expect(output).toContain('Rationale:');
    expect(uiMocks.success).toHaveBeenCalledWith('Approval details saved to approval.json');
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'approval.json',
      JSON.stringify(approvalRecord, null, 2),
    );
  });

  it('prints approval history in plain mode for a specific review dataset', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    coreMocks.listPersistedBoreholeIngestReviewApprovals.mockReturnValue([
      {
        kind: 'geotech-ingest-review-approval-record',
        schemaVersion: 1,
        approvalId: 'approval-2',
        datasetName: 'ingest-review-approval:rev-1:20260423t000000000z',
        projectId: 'demo-project',
        reviewId: 'rev-1',
        reviewDatasetName: 'ingest-review:rev-1',
        approvedAt: '2026-04-23T00:00:00.000Z',
        approvedBy: 'Lead reviewer',
        rationale: 'Newest approval.',
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
      },
      {
        kind: 'geotech-ingest-review-approval-record',
        schemaVersion: 1,
        approvalId: 'approval-1',
        datasetName: 'ingest-review-approval:rev-1:20260422t000000000z',
        projectId: 'demo-project',
        reviewId: 'rev-1',
        reviewDatasetName: 'ingest-review:rev-1',
        approvedAt: '2026-04-22T00:00:00.000Z',
        approvedBy: 'QA reviewer',
        rationale: 'Older approval.',
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
      },
    ]);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'approvals',
      'demo-project',
      '--dataset',
      'ingest-review:rev-1',
    ], { from: 'user' });

    const output = collectConsoleOutput(logSpy);
    expect(output).toContain('Latest rationale:');
    expect(uiMocks.heading).toHaveBeenCalledWith('Persisted Ingest Review Approvals');
    expect(uiMocks.renderTable).toHaveBeenCalledWith(
      ['Approval dataset', 'Review dataset', 'Approved', 'By', 'Latest'],
      [
        ['ingest-review-approval:rev-1:20260423t000000000z', 'ingest-review:rev-1', '2026-04-23T00:00:00.000Z', 'Lead reviewer', 'Yes'],
        ['ingest-review-approval:rev-1:20260422t000000000z', 'ingest-review:rev-1', '2026-04-22T00:00:00.000Z', 'QA reviewer', 'No'],
      ],
    );
  });

  it('loads the latest approval for a review dataset in plain mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const approvalRecord = {
      kind: 'geotech-ingest-review-approval-record',
      schemaVersion: 1,
      approvalId: 'approval-2',
      datasetName: 'ingest-review-approval:rev-1:20260423t000000000z',
      projectId: 'demo-project',
      reviewId: 'rev-1',
      reviewDatasetName: 'ingest-review:rev-1',
      approvedAt: '2026-04-23T00:00:00.000Z',
      approvedBy: 'Lead reviewer',
      rationale: 'Newest approval.',
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
    };

    coreMocks.loadLatestPersistedBoreholeIngestReviewApproval.mockReturnValue(approvalRecord);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'approvals',
      'demo-project',
      '--dataset',
      'ingest-review:rev-1',
      '--latest',
    ], { from: 'user' });

    collectConsoleOutput(logSpy);
    expect(coreMocks.loadLatestPersistedBoreholeIngestReviewApproval).toHaveBeenCalledWith(
      'demo-project',
      'ingest-review:rev-1',
    );
    expect(uiMocks.heading).toHaveBeenCalledWith('Persisted Ingest Review Approval');
  });

  it('prints a persisted ingest promotion summary in plain mode and writes JSON output', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const promotionResult = {
      kind: 'geotech-ingest-review-promotion-result',
      schemaVersion: 1,
      projectId: 'demo-project',
      sourceDatasetName: 'ingest-review:20260421-demo',
      promotedDatasetNames: [
        'promoted-borehole:20260421-demo:bh-01',
        'promoted-borehole:20260421-demo:bh-02',
        'soil-profile:20260421-demo',
      ],
      promotedBoreholeIds: ['BH-01', 'BH-02'],
      warnings: ['Dataset "soil-profile:20260421-demo" already existed and was updated.'],
    };

    coreMocks.promotePersistedBoreholeIngestReview.mockReturnValue(promotionResult);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'promote',
      'demo-project',
      '--dataset',
      'ingest-review:20260421-demo',
      '--output',
      'promotion.json',
    ], { from: 'user' });

    const output = collectConsoleOutput(logSpy);
    expect(output).toContain('Project datasets:');
    expect(output).toContain('Promoted boreholes:');
    expect(uiMocks.heading).toHaveBeenCalledWith('Persisted Ingest Review Promotion');
    expect(coreMocks.promotePersistedBoreholeIngestReview).toHaveBeenCalledWith(
      'demo-project',
      'ingest-review:20260421-demo',
    );
    expect(uiMocks.renderTable).toHaveBeenNthCalledWith(
      1,
      ['Dataset'],
      [
        ['promoted-borehole:20260421-demo:bh-01'],
        ['promoted-borehole:20260421-demo:bh-02'],
        ['soil-profile:20260421-demo'],
      ],
    );
    expect(uiMocks.renderTable).toHaveBeenNthCalledWith(
      2,
      ['Borehole'],
      [
        ['BH-01'],
        ['BH-02'],
      ],
    );
    expect(uiMocks.warn).toHaveBeenCalledWith('Dataset "soil-profile:20260421-demo" already existed and was updated.');
    expect(uiMocks.success).toHaveBeenCalledWith('Promotion details saved to promotion.json');
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'promotion.json',
      JSON.stringify(promotionResult, null, 2),
    );
  });

  it('prints rollback snapshot details for a superseding ingest promotion in plain mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const promotionResult = {
      kind: 'geotech-ingest-review-promotion-result',
      schemaVersion: 1,
      projectId: 'demo-project',
      sourceReviewDatasetName: 'ingest-review:20260421-demo',
      promotedDatasetNames: [
        'promoted-borehole:20260421-demo:bh-01',
        'BH-01',
      ],
      promotedBoreholeIds: ['BH-01'],
      supersededDatasetNames: [
        'promoted-borehole:20260421-demo:bh-01',
        'BH-01',
        'ingest-promotion:20260421-demo',
      ],
      snapshotDatasetNames: [
        'ingest-promotion-snapshot:20260421-demo:promoted-borehole-20260421-demo-bh-01:20260421t010000000z',
        'ingest-promotion-snapshot:20260421-demo:bh-01:20260421t010000000z',
      ],
      warnings: [
        'Raw promoted dataset "promoted-borehole:20260421-demo:bh-01" already existed and was snapshotted before update.',
      ],
    };

    coreMocks.promotePersistedBoreholeIngestReview.mockReturnValue(promotionResult);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'promote',
      'demo-project',
    ], { from: 'user' });

    const output = collectConsoleOutput(logSpy);
    expect(output).toContain('Snapshot datasets:');
    expect(uiMocks.keyValue).toHaveBeenCalledWith('Superseded datasets', '3');
    expect(uiMocks.keyValue).toHaveBeenCalledWith('Rollback snapshots', '2');
    expect(uiMocks.renderTable).toHaveBeenNthCalledWith(
      3,
      ['Dataset'],
      [
        ['ingest-promotion-snapshot:20260421-demo:promoted-borehole-20260421-demo-bh-01:20260421t010000000z'],
        ['ingest-promotion-snapshot:20260421-demo:bh-01:20260421t010000000z'],
      ],
    );
  });

  it('falls back to legacy reviewReasons when structured findings are absent', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ingestResult = {
      kind: 'geotech-ingest-result',
      schemaVersion: 1,
      documentType: 'borehole-log',
      generatedAt: '2026-04-21T00:00:00.000Z',
      source: {
        filePath: 'sample.png',
        fileName: 'sample.png',
        inputKind: 'image',
        totalPages: 1,
        successfulPages: 1,
        failedPages: 0,
      },
      inspection: null,
      inspectionSummary: null,
      boreholes: [],
      pageAudits: [],
      pageFailures: [],
      warnings: [],
      reviewReasons: ['At least one merged borehole result is low-confidence or incomplete.'],
      reviewRequired: true,
      confidence: 68,
      canAutoProceed: false,
    };

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'image-base64',
      mimeType: 'image/png',
      fileBytes: 512,
      filePath: 'sample.png',
      ext: 'png',
      kind: 'image',
    });
    coreMocks.ingestBoreholeLogDocument.mockResolvedValue(ingestResult);

    registerIngestCommand(program);

    await program.parseAsync(['ingest', 'sample.png'], { from: 'user' });

    const output = collectConsoleOutput(logSpy);
    expect(output).toContain('Review findings:');
    expect(output).toContain('Needs review:');
    expect(output).not.toContain('Blocking:');
    expect(output).not.toContain('Advisory:');
    expect(uiMocks.warn).toHaveBeenCalledWith(
      'Document: At least one merged borehole result is low-confidence or incomplete.',
    );
  });

  it('persists geotech-document reviews for project-backed ingest in plain mode', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const ingestResult = {
      kind: 'geotech-ingest-result',
      schemaVersion: 1,
      documentType: 'geotech-document',
      generatedAt: '2026-04-21T00:00:00.000Z',
      source: {
        filePath: 'site-report.png',
        fileName: 'site-report.png',
        inputKind: 'image',
        totalPages: 1,
        successfulPages: 1,
        failedPages: 0,
      },
      inspection: null,
      inspectionSummary: null,
      documentClass: 'site-investigation-report',
      title: 'Site investigation summary',
      summary: 'Clay over weathered shale with laboratory parameters.',
      materials: [
        { kind: 'rock', description: 'weathered shale', uscsSymbol: null, lithology: 'shale' },
      ],
      classifications: [
        { system: 'USCS', value: 'CL', context: 'weathered shale seam' },
      ],
      parameters: [
        { name: 'cohesion', valueText: '25', numericValue: 25, unit: 'kPa', material: 'weathered shale', context: 'triaxial' },
      ],
      risks: ['Weathered shale durability should be reviewed before design reuse.'],
      recommendations: ['Confirm representative sampling before final design.'],
      pageAudits: [],
      pageFailures: [],
      warnings: [
        'Recovered OCR hints should be spot-checked.',
        'Laboratory correlation should be confirmed against the appendix.',
      ],
      reviewFindings: [
        {
          severity: 'review',
          scope: 'material',
          message: 'Weathered shale parameters should be spot-checked before reuse.',
          pageNumber: 1,
          materialDescription: 'weathered shale',
        },
        {
          severity: 'advisory',
          scope: 'document',
          message: 'Recovered OCR hints should be spot-checked.',
        },
      ],
      reviewReasons: ['Weathered shale parameters should be spot-checked before reuse.'],
      parseStatus: 'partial',
      confidence: 73,
      reviewRequired: true,
      canAutoProceed: false,
    };

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'image-base64',
      mimeType: 'image/png',
      fileBytes: 512,
      filePath: 'site-report.png',
      ext: 'png',
      kind: 'image',
    });
    coreMocks.ingestGeotechDocument.mockResolvedValue(ingestResult);
    coreMocks.persistBoreholeIngestReview.mockReturnValue({
      datasetName: 'ingest-review:20260421-site-report',
      reviewId: '20260421-site-report',
      createdAt: '2026-04-21T00:00:00.000Z',
    });

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'site-report.png',
      '--type',
      'geotech-document',
      '--project',
      'demo-project',
      '--output',
      'result.json',
    ], { from: 'user' });

    const output = collectConsoleOutput(logSpy);
    expect(output).toContain('Stored review:');
    expect(output).toContain('Materials:');
    expect(output).toContain('Parameters:');
    expect(output).toContain('Risks:');
    expect(output).toContain('Recommendations:');
    expect(output).toContain('Review findings:');
    expect(coreMocks.ingestGeotechDocument).toHaveBeenCalledTimes(1);
    expect(coreMocks.persistBoreholeIngestReview).toHaveBeenCalledWith('demo-project', ingestResult);
    expect(uiMocks.warn).toHaveBeenCalledWith(
      'Page 1 | Material weathered shale: Weathered shale parameters should be spot-checked before reuse.',
    );
    expect(uiMocks.info).toHaveBeenCalledWith('Document: Recovered OCR hints should be spot-checked.');
    expect(uiMocks.warn).toHaveBeenCalledWith('Laboratory correlation should be confirmed against the appendix.');
    expect(uiMocks.warn).not.toHaveBeenCalledWith('Recovered OCR hints should be spot-checked.');
    expect(uiMocks.success).toHaveBeenCalledWith('Results saved to result.json');
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'result.json',
      JSON.stringify(ingestResult, null, 2),
    );
  });

  it('writes an HTML ingest dossier for a completed sync ingest result', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const ingestResult = {
      kind: 'geotech-ingest-result',
      schemaVersion: 1,
      documentType: 'geotech-document',
      generatedAt: '2026-04-21T00:00:00.000Z',
      source: {
        filePath: 'site-report.png',
        fileName: 'site-report.png',
        inputKind: 'image',
        totalPages: 1,
        successfulPages: 1,
        failedPages: 0,
      },
      inspection: null,
      inspectionSummary: null,
      documentClass: 'site-investigation-report',
      title: 'Site investigation summary',
      summary: 'Clay over weathered shale with laboratory parameters.',
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
      confidence: 88,
      reviewRequired: false,
      canAutoProceed: true,
    };

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'image-base64',
      mimeType: 'image/png',
      fileBytes: 512,
      filePath: 'site-report.png',
      ext: 'png',
      kind: 'image',
    });
    coreMocks.ingestGeotechDocument.mockResolvedValue(ingestResult);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'site-report.png',
      '--type',
      'geotech-document',
      '--format',
      'html',
      '--output',
      'site-report.html',
    ], { from: 'user' });

    collectConsoleOutput(logSpy);
    expect(coreMocks.buildIngestDossier).toHaveBeenCalledWith(ingestResult, {
      sourceLabel: 'site-report.png',
      storedReview: null,
      approval: null,
    });
    expect(coreMocks.renderIngestDossierAsHtml).toHaveBeenCalledTimes(1);
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'site-report.html',
      '<!doctype html><html><body>Dossier</body></html>',
    );
    expect(uiMocks.success).toHaveBeenCalledWith('HTML ingest dossier saved to site-report.html');
  });

  it('writes an HTML ingest dossier for a persisted review with approval metadata', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const reviewRecord = {
      title: 'Site investigation packet',
      datasetName: 'ingest-review:20260421-site-packet',
      reviewId: 'review-1',
      createdAt: '2026-04-21T00:00:00.000Z',
      result: {
        kind: 'geotech-ingest-result',
        schemaVersion: 1,
        documentType: 'geotech-document',
        generatedAt: '2026-04-21T00:00:00.000Z',
        source: {
          filePath: 'site-report.pdf',
          fileName: 'site-report.pdf',
          inputKind: 'pdf',
          totalPages: 2,
          successfulPages: 2,
          failedPages: 0,
        },
        inspection: null,
        inspectionSummary: null,
        documentClass: 'site-investigation-report',
        title: 'Site investigation summary',
        summary: 'Clay over weathered shale with laboratory parameters.',
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
        confidence: 88,
        reviewRequired: false,
        canAutoProceed: true,
      },
      approval: {
        datasetName: 'ingest-review-approval:20260421-site-packet',
        approvedAt: '2026-04-22T00:00:00.000Z',
        approvedBy: 'Lead reviewer',
        rationale: 'Reviewed against the signed report packet.',
      },
    };

    coreMocks.loadPersistedBoreholeIngestReview.mockReturnValue(reviewRecord);

    registerIngestCommand(program);

    await program.parseAsync([
      'ingest',
      'review',
      'demo-project',
      '--dataset',
      'ingest-review:20260421-site-packet',
      '--format',
      'html',
      '--output',
      'review-dossier.html',
    ], { from: 'user' });

    collectConsoleOutput(logSpy);
    expect(coreMocks.buildIngestDossier).toHaveBeenCalledWith(reviewRecord.result, {
      sourceLabel: 'Site investigation packet',
      storedReview: {
        projectId: 'demo-project',
        datasetName: 'ingest-review:20260421-site-packet',
        reviewId: 'review-1',
        createdAt: '2026-04-21T00:00:00.000Z',
      },
      approval: {
        datasetName: 'ingest-review-approval:20260421-site-packet',
        approvedAt: '2026-04-22T00:00:00.000Z',
        approvedBy: 'Lead reviewer',
        rationale: 'Reviewed against the signed report packet.',
      },
    });
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'review-dossier.html',
      '<!doctype html><html><body>Dossier</body></html>',
    );
    expect(uiMocks.success).toHaveBeenCalledWith('HTML ingest dossier saved to review-dossier.html');
  });

  it('fails fast for unsupported ingest types before any LLM work starts', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();

    registerIngestCommand(program);

    await expect(
      program.parseAsync(['ingest', 'sample.pdf', '--type', 'gbr'], { from: 'user' }),
    ).rejects.toThrow(/Unsupported ingest type "gbr"/i);

    expect(visionMocks.readVisionInput).not.toHaveBeenCalled();
    expect(coreMocks.buildLLMConfig).not.toHaveBeenCalled();
    expect(coreMocks.ingestBoreholeLogDocument).not.toHaveBeenCalled();
  });

  it('marks the command as failed when ingest throws', async () => {
    const registerIngestCommand = await loadRegisterIngestCommand();
    const program = new Command();

    visionMocks.readVisionInput.mockReturnValue({
      base64: 'image-base64',
      mimeType: 'image/png',
      fileBytes: 512,
      filePath: 'sample.png',
      ext: 'png',
      kind: 'image',
    });
    coreMocks.ingestBoreholeLogDocument.mockRejectedValue(new Error('provider timeout'));

    registerIngestCommand(program);

    await expect(
      program.parseAsync(['ingest', 'sample.png'], { from: 'user' }),
    ).rejects.toThrow(/provider timeout/i);

    expect(uiMocks.info).toHaveBeenCalledWith('Running geotechnical ingest...');
    expect(uiMocks.error).toHaveBeenCalledWith('Geotechnical ingest failed');
  });
});
