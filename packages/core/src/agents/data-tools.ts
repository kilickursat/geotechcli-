import { toolRegistry, type ToolResult } from './tools.js';
import { parseAGS } from '../ingest/ags.js';
import { parseCPT } from '../ingest/cpt.js';
import {
  approvePersistedBoreholeIngestReview,
  countDocumentPdfPages,
  getGeotechIngestJob,
  ingestBoreholeLogDocument,
  ingestGeotechDocument,
  inspectPdfDocument,
  listGeotechIngestJobs,
  listPersistedBoreholeIngestReviewApprovals,
  loadLatestPersistedBoreholeIngestReviewApproval,
  loadGeotechIngestJobResult,
  loadPersistedBoreholeIngestReviewApproval,
  listPersistedBoreholeIngestReviews,
  loadLatestPersistedBoreholeIngestReview,
  loadPersistedBoreholeIngestReview,
  persistBoreholeIngestReview,
  promotePersistedBoreholeIngestReview,
  readDocumentPdfPageInputs,
  readDocumentVisionInput,
  startGeotechIngestJob,
  summarizePersistedBoreholeIngestReviewApproval,
  waitGeotechIngestJob,
} from '../ingest/index.js';
import {
  summarizeGeotechDocumentResultForAgent,
  type DocumentEvidencePacket,
} from '../ingest/document-evidence-packet.js';
import type { GeotechDocumentIngestResult } from '../ingest/geotech-document.js';
import { queryStandards, listStandards } from '../standards/index.js';
import { buildLLMConfig } from '../config/index.js';
import {
  createProject, loadProject, listProjects,
  addSimulationResult,
  saveNamedDataset, saveDerivedParameter,
  addAssumption, addArtifact,
} from '../storage/index.js';
import { validateReadPath } from './sandbox.js';
import { getToolRuntimeContext } from './tool-runtime.js';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

function resolveActiveLLMConfig() {
  return getToolRuntimeContext()?.config ?? buildLLMConfig();
}

function buildDocumentSource(filePath: string, kind: 'image' | 'pdf') {
  return {
    filePath,
    fileName: basename(filePath),
    inputKind: kind,
  } as const;
}

const MAX_SYNC_INGEST_PDF_PAGES = 5;
const MAX_SYNC_INGEST_FILE_BYTES = 8 * 1024 * 1024;

function reviewSourceLabel(record: {
  result: {
    source: {
      fileName?: string;
      filePath?: string;
    };
    documentType: string;
  };
}) {
  return record.result.source.fileName ?? record.result.source.filePath ?? record.result.documentType;
}

function summarizePersistedReviewRecord(record: {
  reviewId: string;
  datasetName: string;
  projectId: string;
  createdAt: string;
  title: string;
  result: {
    documentType: string;
    source: {
      fileName?: string;
      filePath?: string;
    };
  };
  summary: {
    reviewRequired: boolean;
    canAutoProceed: boolean;
    confidence: number;
    totalPages: number;
    successfulPages: number;
    failedPages: number;
    boreholeCount: number;
    boreholeIds: string[];
    blockingFindings: number;
    reviewFindings: number;
    advisoryFindings: number;
  };
  approval?: {
    datasetName: string;
    approvedAt: string;
    approvedBy?: string;
    rationale: string;
  };
}) {
  return {
    reviewId: record.reviewId,
    datasetName: record.datasetName,
    projectId: record.projectId,
    createdAt: record.createdAt,
    title: record.title,
    documentType: record.result.documentType,
    source: reviewSourceLabel(record),
    summary: record.summary,
    approval: record.approval
      ? {
        datasetName: record.approval.datasetName,
        approvedAt: record.approval.approvedAt,
        approvedBy: record.approval.approvedBy,
        rationale: record.approval.rationale,
      }
      : undefined,
  };
}

function shouldRequireAsyncIngestJob(file: { kind: string; fileBytes?: number }, inspection: { totalPages: number } | null) {
  return file.kind === 'pdf'
    && !!inspection
    && (
      inspection.totalPages > MAX_SYNC_INGEST_PDF_PAGES
      || (typeof file.fileBytes === 'number' && file.fileBytes > MAX_SYNC_INGEST_FILE_BYTES)
    );
}

function summarizeIngestJobRecord(record: {
  jobId: string;
  datasetName: string;
  projectId: string;
  documentType: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  request: {
    persistReview: boolean;
  };
  source: {
    fileName?: string;
    filePath: string;
    totalPages?: number;
  };
  sourceStamps: {
    sourceFingerprint: string;
    parserVersion: string;
    normalizedResultHash?: string;
  };
  resultSummary?: {
    confidence: number;
    blockingFindings: number;
    reviewFindings: number;
    advisoryFindings: number;
    canAutoProceed: boolean;
  };
  persistedReview?: {
    datasetName: string;
  };
  error?: string;
}) {
  return {
    jobId: record.jobId,
    datasetName: record.datasetName,
    projectId: record.projectId,
    documentType: record.documentType,
    title: record.title,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    source: record.source.fileName ?? record.source.filePath,
    totalPages: record.source.totalPages,
    persistReview: record.request.persistReview,
    persistedReviewDatasetName: record.persistedReview?.datasetName,
    sourceFingerprint: record.sourceStamps.sourceFingerprint,
    parserVersion: record.sourceStamps.parserVersion,
    normalizedResultHash: record.sourceStamps.normalizedResultHash,
    resultSummary: record.resultSummary,
    error: record.error,
  };
}

function summarizePromotionResult(result: {
  documentType: string;
  promotedDatasetNames: string[];
  promotedBoreholeIds: string[];
  promotedDocuments?: Array<{ role: string }>;
  approvalDatasetName?: string;
}) {
  if (result.documentType === 'geotech-document') {
    return `Promoted persisted ingest review into ${result.promotedDatasetNames.length} document dataset(s)${result.approvalDatasetName ? ` using recorded approval ${result.approvalDatasetName}` : ''}.`;
  }

  return `Promoted persisted ingest review into ${result.promotedDatasetNames.length} dataset(s) for ${result.promotedBoreholeIds.length} borehole(s)${result.approvalDatasetName ? ` using recorded approval ${result.approvalDatasetName}` : ''}.`;
}

function getSelectedPersistedReview(projectId: string, datasetName?: string) {
  return datasetName
    ? loadPersistedBoreholeIngestReview(projectId, datasetName)
    : loadLatestPersistedBoreholeIngestReview(projectId);
}

function getSelectedPersistedReviewApproval(
  projectId: string,
  reviewDatasetName?: string,
  approvalDatasetName?: string,
) {
  if (approvalDatasetName) {
    return loadPersistedBoreholeIngestReviewApproval(projectId, approvalDatasetName);
  }

  if (reviewDatasetName) {
    return loadLatestPersistedBoreholeIngestReviewApproval(projectId, reviewDatasetName);
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGeotechDocumentResult(value: unknown): value is GeotechDocumentIngestResult {
  return isRecord(value)
    && value.kind === 'geotech-ingest-result'
    && value.documentType === 'geotech-document'
    && isRecord(value.source)
    && Array.isArray(value.materials)
    && Array.isArray(value.classifications)
    && Array.isArray(value.parameters)
    && Array.isArray(value.pageAudits)
    && Array.isArray(value.warnings)
    && typeof value.confidence === 'number';
}

function buildAgentEvidenceSummary(value: unknown): string | undefined {
  if (!isGeotechDocumentResult(value)) {
    return undefined;
  }

  try {
    return summarizeGeotechDocumentResultForAgent(value, { maxContentChars: 2200 });
  } catch {
    return undefined;
  }
}

function withAgentEvidenceSummary<T extends Record<string, unknown>>(
  value: T,
  result: unknown,
): T & { agentEvidenceSummary?: string; evidencePacket?: DocumentEvidencePacket } {
  const agentEvidenceSummary = buildAgentEvidenceSummary(result);
  if (!agentEvidenceSummary) {
    return value;
  }

  const packet = isGeotechDocumentResult(result) ? result.evidencePacket : undefined;
  return {
    agentEvidenceSummary,
    ...(packet ? { evidencePacket: packet } : {}),
    ...value,
  };
}

// ---------------------------------------------------------------------------
// AGS Borehole Data Parser
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'parse_ags',
    description:
      'Parse an AGS 4.0 borehole data file (the standard electronic transfer format for geotechnical data). Extracts boreholes, geology layers, SPT results, and sample information. Use this when the user has .ags files from site investigation.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Path to the .ags file' },
      },
    },
  },
  (args): ToolResult => {
    const pathCheck = validateReadPath(String(args.path));
    if (!pathCheck.safe) {
      return { success: false, data: null, summary: '', error: pathCheck.error! };
    }

    const filePath = pathCheck.resolved;
    if (!existsSync(filePath)) {
      return { success: false, data: null, summary: '', error: `File not found: ${filePath}` };
    }

    try {
      const ags = parseAGS(filePath);
      return {
        success: true,
        data: {
          boreholes: ags.boreholes,
          geology: ags.geology,
          sptResults: ags.sptResults,
          samples: ags.samples,
          projectInfo: ags.projectInfo,
          groupCount: ags.groups.size,
        },
        summary: `AGS parsed: ${ags.boreholes.length} boreholes, ${ags.geology.length} geology layers, ${ags.sptResults.length} SPT results, ${ags.groups.size} data groups`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: `AGS parse error: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
);

// ---------------------------------------------------------------------------
// CPT Data Parser with Robertson Classification
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'parse_cpt',
    description:
      'Parse a CPT (Cone Penetration Test) data file and apply Robertson SBTn classification. Returns corrected tip resistance (qt), soil behavior type index (Ic), and layer boundaries. CSV format expected with columns: depth, qc, fs, u2.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Path to CPT CSV data file' },
        waterTableDepth: { type: 'number', description: 'Depth to water table in meters', default: 1.0 },
        id: { type: 'string', description: 'CPT sounding ID' },
      },
    },
  },
  (args): ToolResult => {
    const pathCheck = validateReadPath(String(args.path));
    if (!pathCheck.safe) {
      return { success: false, data: null, summary: '', error: pathCheck.error! };
    }

    const filePath = pathCheck.resolved;
    if (!existsSync(filePath)) {
      return { success: false, data: null, summary: '', error: `File not found: ${filePath}` };
    }

    try {
      const cpt = parseCPT(filePath, {
        id: args.id as string,
        waterTableDepth: args.waterTableDepth as number,
      });
      return {
        success: true,
        data: cpt,
        summary: `CPT ${cpt.id}: ${cpt.readings.length} readings to ${cpt.summary.maxDepth}m, avg qc=${cpt.summary.avgQc} MPa, dominant: ${cpt.summary.dominantSoilType}, ${cpt.summary.layerBoundaries.length} layer transitions`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: `CPT parse error: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
);

// ---------------------------------------------------------------------------
// Geotechnical Document Ingest
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'ingest_geotech_document',
    description:
      'Ingest a geotechnical PDF or image into structured document understanding. Supports borehole logs and broader geotech/geology documents. Returns structured findings, confidence, review signals, and optional persisted review metadata. Large PDFs return async-job guidance instead of blocking the synchronous agent path.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Path to a PDF or image file to ingest' },
        type: {
          type: 'string',
          enum: ['borehole-log', 'geotech-document'],
          description: 'Document ingest mode',
          default: 'geotech-document',
        },
        boreholeId: {
          type: 'string',
          description: 'Optional override borehole ID for borehole-log ingest',
        },
        projectId: {
          type: 'string',
          description: 'Project ID used when persisting an ingest review and when the result should be promoted later',
        },
        persistReview: {
          type: 'boolean',
          description: 'Persist the ingest result as a project review record for later approval or promotion',
          default: false,
        },
        reviewTitle: {
          type: 'string',
          description: 'Optional title when persisting an ingest review',
        },
      },
    },
  },
  async (args): Promise<ToolResult> => {
    const pathCheck = validateReadPath(String(args.path));
    if (!pathCheck.safe) {
      return { success: false, data: null, summary: '', error: pathCheck.error! };
    }

    const filePath = pathCheck.resolved;
    if (!existsSync(filePath)) {
      return { success: false, data: null, summary: '', error: `File not found: ${filePath}` };
    }

    const documentType = (args.type as string | undefined) === 'borehole-log'
      ? 'borehole-log'
      : 'geotech-document';
    const persistReview = args.persistReview === true;
    const projectId = typeof args.projectId === 'string' && args.projectId.trim()
      ? args.projectId.trim()
      : undefined;

    if (persistReview && !projectId) {
      return {
        success: false,
        data: null,
        summary: '',
        error: 'Persisting an ingest review requires a projectId.',
      };
    }

    try {
      const config = resolveActiveLLMConfig();
      const file = readDocumentVisionInput(filePath);
      if (file.kind === 'unknown') {
        return {
          success: false,
          data: null,
          summary: '',
          error: `Unsupported document type for ingest: ${filePath}`,
        };
      }

      let totalPages: number | null = null;
      if (file.kind === 'pdf') {
        try {
          totalPages = await countDocumentPdfPages(filePath);
        } catch {
          totalPages = null;
        }
      }
      const shouldShortCircuitAsync =
        file.kind === 'pdf'
        && (
          (typeof totalPages === 'number' && totalPages > MAX_SYNC_INGEST_PDF_PAGES)
          || (typeof file.fileBytes === 'number' && file.fileBytes > MAX_SYNC_INGEST_FILE_BYTES)
        );
      const inspection =
        file.kind === 'pdf' && (!shouldShortCircuitAsync || totalPages == null)
          ? inspectPdfDocument(filePath)
          : null;
      if (shouldShortCircuitAsync || shouldRequireAsyncIngestJob(file, inspection)) {
        return {
          success: true,
          data: {
            documentType,
            requires_async_job: true,
            reason: `PDF ingest was deferred because the document has ${totalPages ?? inspection?.totalPages ?? 0} page(s) and exceeds the synchronous ingest budget.`,
            async_job_recommendation: {
              tool: 'start_geotech_ingest_job',
              projectId,
              path: filePath,
              type: documentType,
              boreholeId: typeof args.boreholeId === 'string' ? args.boreholeId : undefined,
              persistReview,
              reviewTitle: typeof args.reviewTitle === 'string' ? args.reviewTitle : undefined,
            },
            inspection: {
              totalPages: totalPages ?? inspection?.totalPages ?? 0,
              warnings: inspection?.warnings ?? [],
              parserVersion: inspection?.metadata.parser ?? 'deferred-async-inspection',
            },
          },
          summary: `Synchronous ingest was deferred for this ${totalPages ?? inspection?.totalPages ?? 0}-page PDF. Start an async ingest job instead.`,
        };
      }

      if (documentType === 'borehole-log') {
        const result = await ingestBoreholeLogDocument({
          config,
          source: buildDocumentSource(filePath, file.kind === 'pdf' ? 'pdf' : 'image'),
          overrideBoreholeId: args.boreholeId as string | undefined,
          inspection,
          image: file.kind === 'pdf' ? undefined : file,
          pages: file.kind === 'pdf'
            ? await readDocumentPdfPageInputs(filePath, {
              inspection,
              forceRasterImages: config.provider === 'hosted-beta',
            })
            : undefined,
        });

        const persistedReview =
          persistReview && projectId
            ? persistBoreholeIngestReview(projectId, result, {
              title: args.reviewTitle as string | undefined,
            })
            : null;

        return {
          success: true,
          data: {
            ...result,
            persistedReview: persistedReview
              ? {
                reviewId: persistedReview.reviewId,
                datasetName: persistedReview.datasetName,
                title: persistedReview.title,
                summary: persistedReview.summary,
              }
              : undefined,
          },
          summary: persistedReview
            ? `Borehole ingest parsed ${result.boreholes.length} boreholes at ${result.confidence}% confidence and saved review ${persistedReview.datasetName}.`
            : `Borehole ingest parsed ${result.boreholes.length} boreholes at ${result.confidence}% confidence (${result.reviewRequired ? 'review required' : 'auto-proceed ready'}).`,
        };
      }

      const result = await ingestGeotechDocument({
        config,
        source: buildDocumentSource(filePath, file.kind === 'pdf' ? 'pdf' : 'image'),
        inspection,
        image: file.kind === 'pdf' ? undefined : file,
        pages: file.kind === 'pdf'
          ? await readDocumentPdfPageInputs(filePath, {
            inspection,
            forceRasterImages: config.provider === 'hosted-beta',
          })
          : undefined,
      });

      const persistedReview =
        persistReview && projectId
          ? persistBoreholeIngestReview(projectId, result, {
              title: args.reviewTitle as string | undefined,
            })
          : null;

      return {
        success: true,
        data: withAgentEvidenceSummary({
          ...result,
          persistedReview: persistedReview
            ? {
                reviewId: persistedReview.reviewId,
                datasetName: persistedReview.datasetName,
                title: persistedReview.title,
                summary: persistedReview.summary,
              }
            : undefined,
        }, result),
        summary: persistedReview
          ? `Geotech document ingest found ${result.materials.length} materials, ${result.classifications.length} classifications, and ${result.parameters.length} parameters at ${result.confidence}% confidence and saved review ${persistedReview.datasetName}.`
          : `Geotech document ingest found ${result.materials.length} materials, ${result.classifications.length} classifications, and ${result.parameters.length} parameters at ${result.confidence}% confidence.`,
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: '',
        error: `Geotech document ingest failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
);

toolRegistry.register(
  {
    name: 'start_geotech_ingest_job',
    description:
      'Queue a durable geotechnical ingest job inside a project. Use this for large PDFs or when the ingest result should be inspected, persisted, approved, and promoted through the review workflow.',
    parameters: {
      type: 'object',
      required: ['projectId', 'path'],
      properties: {
        projectId: { type: 'string', description: 'Project ID that will own the persisted ingest job' },
        path: { type: 'string', description: 'Path to a PDF or image file to ingest asynchronously' },
        type: {
          type: 'string',
          enum: ['borehole-log', 'geotech-document'],
          description: 'Document ingest mode',
          default: 'geotech-document',
        },
        boreholeId: {
          type: 'string',
          description: 'Optional override borehole ID for borehole-log ingest',
        },
        persistReview: {
          type: 'boolean',
          description: 'Persist the completed ingest result as a project review record',
          default: false,
        },
        reviewTitle: {
          type: 'string',
          description: 'Optional review title to use if persistReview is enabled',
        },
      },
    },
  },
  (args): ToolResult => {
    const pathCheck = validateReadPath(String(args.path));
    if (!pathCheck.safe) {
      return { success: false, data: null, summary: '', error: pathCheck.error! };
    }

    const filePath = pathCheck.resolved;
    if (!existsSync(filePath)) {
      return { success: false, data: null, summary: '', error: `File not found: ${filePath}` };
    }

    try {
      const projectId = String(args.projectId);
      const job = startGeotechIngestJob(projectId, {
        path: filePath,
        type: (args.type as string | undefined) === 'borehole-log' ? 'borehole-log' : 'geotech-document',
        boreholeId: typeof args.boreholeId === 'string' ? args.boreholeId : undefined,
        persistReview: args.persistReview === true,
        reviewTitle: typeof args.reviewTitle === 'string' ? args.reviewTitle : undefined,
      });

      return {
        success: true,
        data: summarizeIngestJobRecord(job),
        summary: `Queued ${job.documentType} ingest job ${job.datasetName} for ${job.source.fileName}.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'get_geotech_ingest_job',
    description:
      'Load the current status of a durable geotechnical ingest job. If datasetName is omitted, the latest job in the project is returned.',
    parameters: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing the persisted ingest job' },
        datasetName: {
          type: 'string',
          description: 'Specific ingest job dataset name; omit to load the latest job',
        },
      },
    },
  },
  (args): ToolResult => {
    try {
      const projectId = String(args.projectId);
      const datasetName = typeof args.datasetName === 'string' && args.datasetName.trim()
        ? args.datasetName.trim()
        : undefined;
      const job = getGeotechIngestJob(projectId, datasetName);

      if (!job) {
        return {
          success: false,
          data: null,
          summary: '',
          error: datasetName
            ? `No persisted ingest job named "${datasetName}" was found in project "${projectId}".`
            : `No persisted ingest jobs were found in project "${projectId}".`,
        };
      }

      return {
        success: true,
        data: summarizeIngestJobRecord(job),
        summary: `Loaded ingest job ${job.datasetName} (${job.status}) for ${job.source.fileName}.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'wait_geotech_ingest_job',
    description:
      'Execute or wait for a durable geotechnical ingest job until it completes or fails. If datasetName is omitted, waits on the latest job in the project.',
    parameters: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing the persisted ingest job' },
        datasetName: {
          type: 'string',
          description: 'Specific ingest job dataset name; omit to use the latest job',
        },
      },
    },
  },
  async (args): Promise<ToolResult> => {
    try {
      const projectId = String(args.projectId);
      const datasetName = typeof args.datasetName === 'string' && args.datasetName.trim()
        ? args.datasetName.trim()
        : undefined;
      const job = await waitGeotechIngestJob(projectId, datasetName, {
        config: resolveActiveLLMConfig(),
      });

      if (job.status === 'failed') {
        return {
          success: false,
          data: summarizeIngestJobRecord(job),
          summary: '',
          error: job.error ?? `Persisted ingest job "${job.datasetName}" failed.`,
        };
      }

      return {
        success: true,
        data: withAgentEvidenceSummary(
          summarizeIngestJobRecord(job),
          isRecord(job.result) ? job.result.ingestResult : undefined,
        ),
        summary: job.persistedReview
          ? `Completed ${job.documentType} ingest job ${job.datasetName} and saved review ${job.persistedReview.datasetName}.`
          : `Completed ${job.documentType} ingest job ${job.datasetName}.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'load_geotech_ingest_job_result',
    description:
      'Load the completed result payload for a durable geotechnical ingest job. If datasetName is omitted, loads the latest job result in the project.',
    parameters: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing the persisted ingest job result' },
        datasetName: {
          type: 'string',
          description: 'Specific ingest job dataset name; omit to use the latest job',
        },
      },
    },
  },
  (args): ToolResult => {
    try {
      const projectId = String(args.projectId);
      const datasetName = typeof args.datasetName === 'string' && args.datasetName.trim()
        ? args.datasetName.trim()
        : undefined;
      const loaded = loadGeotechIngestJobResult(projectId, datasetName);

      return {
        success: true,
        data: withAgentEvidenceSummary({ ...loaded }, loaded.result),
        summary: loaded.persistedReview
          ? `Loaded completed ${loaded.documentType} ingest result from ${loaded.datasetName} with persisted review ${loaded.persistedReview.datasetName}.`
          : `Loaded completed ${loaded.documentType} ingest result from ${loaded.datasetName}.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'list_geotech_ingest_jobs',
    description:
      'List durable geotechnical ingest jobs in a project so the agent can inspect queued, completed, and failed ingest work before waiting on or loading a specific job.',
    parameters: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing persisted ingest jobs' },
      },
    },
  },
  (args): ToolResult => {
    try {
      const projectId = String(args.projectId);
      const jobs = listGeotechIngestJobs(projectId);
      const items = jobs.map((job) => summarizeIngestJobRecord(job));

      return {
        success: true,
        data: {
          projectId,
          count: items.length,
          jobs: items,
        },
        summary: items.length === 0
          ? `No persisted ingest jobs were found in project ${projectId}.`
          : `${items.length} persisted ingest job${items.length === 1 ? '' : 's'} found in project ${projectId}.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'list_persisted_ingest_reviews',
    description:
      'List persisted ingest reviews saved inside a project. Use this before loading, approving, or promoting a specific review dataset.',
    parameters: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing persisted ingest reviews' },
      },
    },
  },
  (args): ToolResult => {
    try {
      const projectId = String(args.projectId);
      const reviews = listPersistedBoreholeIngestReviews(projectId);
      const items = reviews.map((record) => summarizePersistedReviewRecord(record));

      return {
        success: true,
        data: {
          projectId,
          count: items.length,
          reviews: items,
        },
        summary: items.length === 0
          ? `No persisted ingest reviews were found in project ${projectId}.`
          : `${items.length} persisted ingest review${items.length === 1 ? '' : 's'} found in project ${projectId}: ${items.map((item) => item.datasetName).join(', ')}`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'load_persisted_ingest_review',
    description:
      'Load a persisted ingest review from project memory for inspection. If datasetName is omitted, loads the latest saved review in the project.',
    parameters: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing the persisted ingest review' },
        datasetName: {
          type: 'string',
          description: 'Specific persisted ingest review dataset name; omit to load the latest review',
        },
      },
    },
  },
  (args): ToolResult => {
    try {
      const projectId = String(args.projectId);
      const datasetName = typeof args.datasetName === 'string' && args.datasetName.trim()
        ? args.datasetName.trim()
        : undefined;
      const record = getSelectedPersistedReview(projectId, datasetName);

      if (!record) {
        return {
          success: false,
          data: null,
          summary: '',
          error: datasetName
            ? `No persisted ingest review named "${datasetName}" was found in project "${projectId}".`
            : `No persisted ingest reviews were found in project "${projectId}".`,
        };
      }

      return {
        success: true,
        data: withAgentEvidenceSummary({ ...record }, record.result),
        summary: `Loaded persisted ingest review ${record.datasetName} from ${reviewSourceLabel(record)} (${record.summary.confidence}% confidence, ${record.summary.blockingFindings} blocking, ${record.summary.reviewFindings} review, auto-proceed ${record.summary.canAutoProceed ? 'yes' : 'no'}).`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'promote_persisted_ingest_review',
    description:
      'Promote a specific persisted ingest review into durable project datasets. Only use this after loading the review and only when it is already auto-proceed ready or has an explicit recorded approval.',
    parameters: {
      type: 'object',
      required: ['projectId', 'datasetName'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing the persisted ingest review' },
        datasetName: {
          type: 'string',
          description: 'Specific persisted ingest review dataset name to promote',
        },
      },
    },
  },
  (args): ToolResult => {
    try {
      const projectId = String(args.projectId);
      const datasetName = String(args.datasetName);
      const record = loadPersistedBoreholeIngestReview(projectId, datasetName);

      if (!record) {
        return {
          success: false,
          data: null,
          summary: '',
          error: `No persisted ingest review named "${datasetName}" was found in project "${projectId}".`,
        };
      }

      if (
        (
          record.summary.canAutoProceed !== true
          || record.summary.reviewRequired
          || record.summary.blockingFindings > 0
        )
        && !record.approval
      ) {
        return {
          success: false,
          data: null,
          summary: '',
          error: `Persisted ingest review "${datasetName}" is not safe for autonomous promotion yet (auto-proceed: ${record.summary.canAutoProceed ? 'yes' : 'no'}, blocking findings: ${record.summary.blockingFindings}, review findings: ${record.summary.reviewFindings}). Load the review first, record an explicit approval, or ask the user for manual promotion outside the autonomous agent flow.`,
        };
      }

      const result = promotePersistedBoreholeIngestReview(projectId, datasetName);
      return {
        success: true,
        data: result,
        summary: summarizePromotionResult(result),
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'approve_persisted_ingest_review',
    description:
      'Record an explicit approval decision for a persisted ingest review so a flagged review can later be promoted with audit trail.',
    parameters: {
      type: 'object',
      required: ['projectId', 'datasetName', 'rationale'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing the persisted ingest review' },
        datasetName: {
          type: 'string',
          description: 'Specific persisted ingest review dataset name to approve',
        },
        rationale: {
          type: 'string',
          description: 'Why the flagged ingest review is approved for promotion despite requiring review',
        },
        approvedBy: {
          type: 'string',
          description: 'Optional reviewer name, role, or approval source for the audit trail',
        },
      },
    },
  },
  (args): ToolResult => {
    try {
      const projectId = String(args.projectId);
      const datasetName = String(args.datasetName);
      const approval = approvePersistedBoreholeIngestReview(projectId, datasetName, {
        rationale: String(args.rationale),
        approvedBy: typeof args.approvedBy === 'string' ? args.approvedBy : undefined,
      });

      return {
        success: true,
        data: approval,
        summary: `Recorded approval ${approval.datasetName} for persisted ingest review ${datasetName}.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'list_persisted_ingest_review_approvals',
    description:
      'List approval records for persisted ingest reviews inside a project. Optionally filter to one review dataset to inspect approval history, latest-approval status, and provenance validity.',
    parameters: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing persisted ingest review approvals' },
        reviewDatasetName: {
          type: 'string',
          description: 'Optional persisted ingest review dataset name to filter approval history',
        },
      },
    },
  },
  (args): ToolResult => {
    try {
      const projectId = String(args.projectId);
      const reviewDatasetName = typeof args.reviewDatasetName === 'string' && args.reviewDatasetName.trim()
        ? args.reviewDatasetName.trim()
        : undefined;
      const approvals = listPersistedBoreholeIngestReviewApprovals(projectId, reviewDatasetName);
      const latestApprovalByReviewDataset = new Map<string, string>();
      if (reviewDatasetName) {
        const latestApprovalDatasetName = loadLatestPersistedBoreholeIngestReviewApproval(projectId, reviewDatasetName)?.datasetName;
        if (latestApprovalDatasetName) {
          latestApprovalByReviewDataset.set(reviewDatasetName, latestApprovalDatasetName);
        }
      } else {
        for (const approval of approvals) {
          if (!latestApprovalByReviewDataset.has(approval.reviewDatasetName)) {
            const latestApprovalDatasetName = loadLatestPersistedBoreholeIngestReviewApproval(
              projectId,
              approval.reviewDatasetName,
            )?.datasetName;
            if (latestApprovalDatasetName) {
              latestApprovalByReviewDataset.set(approval.reviewDatasetName, latestApprovalDatasetName);
            }
          }
        }
      }

      const items = approvals.map((approval) =>
        summarizePersistedBoreholeIngestReviewApproval(approval, {
          latestApprovalDatasetName: latestApprovalByReviewDataset.get(approval.reviewDatasetName),
        }),
      );

      return {
        success: true,
        data: {
          projectId,
          reviewDatasetName,
          count: items.length,
          approvals: items,
        },
        summary: items.length === 0
          ? reviewDatasetName
            ? `No approval records were found for persisted ingest review ${reviewDatasetName} in project ${projectId}.`
            : `No persisted ingest review approvals were found in project ${projectId}.`
          : `${items.length} persisted ingest review approval${items.length === 1 ? '' : 's'} found${reviewDatasetName ? ` for ${reviewDatasetName}` : ''} in project ${projectId}.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'load_persisted_ingest_review_approval',
    description:
      'Load a specific persisted ingest review approval record, or the latest approval for a given review dataset.',
    parameters: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', description: 'Project ID containing the approval record' },
        reviewDatasetName: {
          type: 'string',
          description: 'Persisted ingest review dataset name whose latest approval should be loaded when approvalDatasetName is omitted',
        },
        approvalDatasetName: {
          type: 'string',
          description: 'Specific approval dataset name to load',
        },
      },
    },
  },
  (args): ToolResult => {
    try {
      const projectId = String(args.projectId);
      const reviewDatasetName = typeof args.reviewDatasetName === 'string' && args.reviewDatasetName.trim()
        ? args.reviewDatasetName.trim()
        : undefined;
      const approvalDatasetName = typeof args.approvalDatasetName === 'string' && args.approvalDatasetName.trim()
        ? args.approvalDatasetName.trim()
        : undefined;

      if (!reviewDatasetName && !approvalDatasetName) {
        return {
          success: false,
          data: null,
          summary: '',
          error: 'Loading an approval requires either approvalDatasetName or reviewDatasetName.',
        };
      }

      const approval = getSelectedPersistedReviewApproval(projectId, reviewDatasetName, approvalDatasetName);
      if (!approval) {
        return {
          success: false,
          data: null,
          summary: '',
          error: approvalDatasetName
            ? `No persisted ingest review approval named "${approvalDatasetName}" was found in project "${projectId}".`
            : `No persisted ingest review approvals were found for "${reviewDatasetName}" in project "${projectId}".`,
        };
      }

      const latestApprovalDatasetName = loadLatestPersistedBoreholeIngestReviewApproval(
        projectId,
        approval.reviewDatasetName,
      )?.datasetName;
      const summary = summarizePersistedBoreholeIngestReviewApproval(approval, { latestApprovalDatasetName });

      return {
        success: true,
        data: {
          ...approval,
          isLatestForReview: summary.isLatestForReview,
          isValidForCurrentReview: summary.isValidForCurrentReview,
          invalidationReasons: summary.invalidationReasons,
        },
        summary: `Loaded persisted ingest review approval ${approval.datasetName} for ${approval.reviewDatasetName}${summary.isLatestForReview ? ' (latest approval)' : ''}${summary.isValidForCurrentReview ? '' : ' (invalid for current review provenance)'}.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

// ---------------------------------------------------------------------------
// Standards Database Query (RAG-like)
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'query_standards',
    description:
      'Search the geotechnical standards database for relevant provisions. Covers: Eurocode 7, ASTM (D2487, D1586, D5778, D4318), Bieniawski RMR, Barton Q-system, Boulanger & Idriss liquefaction, ITA TBM selection, Terzaghi settlement. Use this to cite standards, check design requirements, or verify calculation methods.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "bearing capacity eurocode", "liquefaction triggering", "RMR support recommendations")' },
        maxResults: { type: 'number', description: 'Maximum results to return', default: 3 },
      },
    },
  },
  (args): ToolResult => {
    const result = queryStandards(String(args.query), (args.maxResults as number) ?? 3);

    if (result.matches.length === 0) {
      return { success: true, data: result, summary: `No standards found matching "${args.query}". Try broader terms.` };
    }

    const summaryParts = result.matches.map((m) => `${m.standard} §${m.section}: ${m.title}`);
    return {
      success: true,
      data: result,
      summary: `Found ${result.matches.length} standard provisions: ${summaryParts.join(' | ')}`,
    };
  },
);

// ---------------------------------------------------------------------------
// Project Management
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'project_create',
    description: 'Create a new geotechCLI project to store soil profiles, simulation results, and notes persistently across sessions.',
    parameters: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Project name' },
        location: { type: 'string', description: 'Project location' },
        description: { type: 'string', description: 'Brief description' },
      },
    },
  },
  (args): ToolResult => {
    try {
      const project = createProject(String(args.name), {
        location: args.location as string,
        description: args.description as string,
      });
      return { success: true, data: project.meta, summary: `Project "${project.meta.name}" created (id: ${project.meta.id})` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_load',
    description: 'Load an existing project and retrieve its soil profiles, simulation history, and notes.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Project ID' },
      },
    },
  },
  (args): ToolResult => {
    try {
      const project = loadProject(String(args.id));
      return {
        success: true,
        data: project,
        summary: `Project "${project.meta.name}" loaded: ${project.soilProfiles.length} soil profiles, ${project.simulationResults.length} simulation results, ${project.assumptions.length} assumptions, ${Object.keys(project.namedDatasets).length} datasets`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_list',
    description: 'List all geotechCLI projects stored on this machine.',
    parameters: { type: 'object', properties: {} },
  },
  (): ToolResult => {
    const projects = listProjects();
    if (projects.length === 0) {
      return { success: true, data: [], summary: 'No projects found. Use project_create to start one.' };
    }
    return {
      success: true,
      data: projects,
      summary: `${projects.length} projects: ${projects.map((p) => `${p.name} (${p.id})`).join(', ')}`,
    };
  },
);

toolRegistry.register(
  {
    name: 'project_save_dataset',
    description: 'Save a structured named dataset into project memory so future agent runs can reuse it. Use for interpreted borehole logs, parameter tables, tabular summaries, or normalized intermediate data.',
    parameters: {
      type: 'object',
      required: ['projectId', 'name', 'kind', 'data'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Dataset name or key' },
        kind: { type: 'string', description: 'Dataset kind, e.g. borehole-log, cpt-summary, assumptions-table' },
        data: { type: 'object', description: 'Structured dataset content' },
        source: { type: 'string', description: 'Where the dataset came from' },
      },
    },
  },
  (args): ToolResult => {
    try {
      saveNamedDataset(String(args.projectId), {
        name: String(args.name),
        kind: String(args.kind),
        data: args.data ?? null,
        source: args.source as string | undefined,
      });
      return { success: true, data: null, summary: `Dataset "${args.name}" saved to project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_save_parameter',
    description: 'Persist a derived parameter or key design assumption into project memory for reuse across sessions.',
    parameters: {
      type: 'object',
      required: ['projectId', 'name', 'value'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Parameter name' },
        value: { description: 'Parameter value' },
        source: { type: 'string', description: 'Source or rationale for the parameter' },
      },
    },
  },
  (args): ToolResult => {
    try {
      saveDerivedParameter(String(args.projectId), {
        name: String(args.name),
        value: args.value ?? null,
        source: args.source as string | undefined,
      });
      return { success: true, data: null, summary: `Parameter "${args.name}" saved to project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_add_assumption',
    description: 'Record an engineering assumption in project memory, including its basis when known.',
    parameters: {
      type: 'object',
      required: ['projectId', 'text'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        text: { type: 'string', description: 'Assumption text' },
        source: { type: 'string', description: 'Basis, source, or standard used' },
      },
    },
  },
  (args): ToolResult => {
    try {
      addAssumption(String(args.projectId), {
        text: String(args.text),
        source: args.source as string | undefined,
      });
      return { success: true, data: null, summary: `Assumption recorded in project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_add_artifact',
    description: 'Save a report, note, or generated artifact reference into project memory for later review.',
    parameters: {
      type: 'object',
      required: ['projectId', 'kind', 'title'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        kind: { type: 'string', description: 'Artifact kind, e.g. report, memo, output-file' },
        title: { type: 'string', description: 'Human-readable artifact title' },
        content: { type: 'string', description: 'Inline artifact content if stored directly' },
        path: { type: 'string', description: 'Filesystem path if artifact was written to disk' },
        mimeType: { type: 'string', description: 'Artifact MIME type' },
        metadata: { type: 'object', description: 'Additional artifact metadata' },
      },
    },
  },
  (args): ToolResult => {
    try {
      addArtifact(String(args.projectId), {
        kind: String(args.kind),
        title: String(args.title),
        content: args.content as string | undefined,
        path: args.path as string | undefined,
        mimeType: args.mimeType as string | undefined,
        metadata: (args.metadata as Record<string, unknown> | undefined) ?? undefined,
      });
      return { success: true, data: null, summary: `Artifact "${args.title}" saved to project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_save_result',
    description: 'Save a calculation result to the current project for future reference. The agent should call this after completing analyses to build a persistent project history.',
    parameters: {
      type: 'object',
      required: ['projectId', 'tool', 'summary'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        tool: { type: 'string', description: 'Tool name that produced the result' },
        args: { type: 'object', description: 'Arguments used' },
        result: { type: 'object', description: 'Calculation result data' },
        summary: { type: 'string', description: 'One-line summary of the result' },
      },
    },
  },
  (args): ToolResult => {
    try {
      addSimulationResult(String(args.projectId), {
        tool: String(args.tool),
        args: (args.args as Record<string, unknown>) ?? {},
        result: args.result ?? null,
        summary: String(args.summary),
      });
      return { success: true, data: null, summary: `Result saved to project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);
