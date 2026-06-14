import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  exportCSV,
  exportGeoJSON,
  exportBoreholeProfileDXF,
  exportBoreholeAgsi,
  exportBoreholeDiggs,
  type InterchangeBorehole,
} from '../export/index.js';
import {
  generateReportFromCaseFile,
  renderReportAsDocx,
  renderReportAsPdf,
  type CaseFileGeneratedReport,
  type GenerateStoredCaseFileReportOptions,
} from '../report/index.js';
import type { EvidenceRecord, ScenarioArtifactType } from './contracts.js';
import {
  loadLatestScenarioArtifact,
  loadScenarioCaseFile,
} from './case-file.js';
import { listEvidenceRecords } from './evidence.js';
import { validateWritePath } from './sandbox.js';
import { toolRegistry, type ToolResult } from './tools.js';

const INLINE_TEXT_BYTE_LIMIT = 16 * 1024;
const INLINE_BINARY_BYTE_LIMIT = 256 * 1024;

const CSV_SOURCE_ARTIFACTS = [
  'results',
  'option-matrix',
  'review-checklist',
  'assumptions',
  'evidence',
] as const;
type CsvSourceArtifact = (typeof CSV_SOURCE_ARTIFACTS)[number];

type CsvRowValue = string | number | null | undefined;

interface CsvExportPayload {
  headers: string[];
  rows: CsvRowValue[][];
  sourceArtifact: CsvSourceArtifact;
}

function readString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required string argument: ${name}`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(value: unknown, name: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Missing required numeric argument: ${name}`);
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error('Expected a finite number.');
}

function readCsvSourceArtifact(value: unknown): CsvSourceArtifact {
  if (typeof value !== 'string' || !(CSV_SOURCE_ARTIFACTS as readonly string[]).includes(value)) {
    throw new Error(`sourceArtifact must be one of: ${CSV_SOURCE_ARTIFACTS.join(', ')}`);
  }
  return value as CsvSourceArtifact;
}

function sanitizeFilename(name: string, fallbackBase: string, extension: string): string {
  const base = name.trim().length > 0 ? name.trim() : fallbackBase;
  const sanitizedBase = base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\s+/g, ' ').trim();
  const safeBase = sanitizedBase.length > 0 ? sanitizedBase : fallbackBase;
  return safeBase.endsWith(extension) ? safeBase : `${safeBase}${extension}`;
}

function inlineTextPayload(content: string): {
  content?: string;
  preview?: string;
  truncated: boolean;
  byteLength: number;
  note?: string;
} {
  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength <= INLINE_TEXT_BYTE_LIMIT) {
    return { content, truncated: false, byteLength };
  }

  return {
    preview: content.slice(0, INLINE_TEXT_BYTE_LIMIT),
    truncated: true,
    byteLength,
    note: 'Output was truncated for tool safety. Provide outputPath to write the full file.',
  };
}

function inlineBinaryPayload(buffer: Buffer): {
  base64?: string;
  inline: boolean;
  byteLength: number;
  note?: string;
} {
  if (buffer.length <= INLINE_BINARY_BYTE_LIMIT) {
    return {
      base64: buffer.toString('base64'),
      inline: true,
      byteLength: buffer.length,
    };
  }

  return {
    inline: false,
    byteLength: buffer.length,
    note: 'Binary output omitted because it exceeds inline size limits. Provide outputPath to write the full file.',
  };
}

function writeOutputFile(outputPath: string, content: string | Buffer): string {
  const check = validateWritePath(outputPath);
  if (!check.safe || !check.resolved) {
    throw new Error(check.error ?? `Invalid output path: ${outputPath}`);
  }

  mkdirSync(dirname(check.resolved), { recursive: true });
  writeFileSync(check.resolved, content);
  return check.resolved;
}

function toReportOptions(args: Record<string, unknown>): GenerateStoredCaseFileReportOptions {
  return {
    projectId: readString(args.projectId, 'projectId'),
    scenarioId: readString(args.scenarioId, 'scenarioId'),
    projectName: readOptionalString(args.projectName),
    task: readOptionalString(args.task),
    location: readOptionalString(args.location),
    title: readOptionalString(args.title),
  };
}

function toReportSummary(report: CaseFileGeneratedReport) {
  return {
    title: report.title,
    summary: report.summary,
    sections: report.sections,
    latencyMs: report.latencyMs,
    metadata: report.metadata,
  };
}

async function loadStoredCaseFileReport(args: Record<string, unknown>): Promise<CaseFileGeneratedReport> {
  return generateReportFromCaseFile(toReportOptions(args));
}

function requireArtifact<T extends ScenarioArtifactType>(
  projectId: string,
  scenarioId: string,
  artifactType: T,
) {
  const artifact = loadLatestScenarioArtifact(projectId, scenarioId, artifactType);
  if (!artifact) {
    throw new Error(`No ${artifactType} artifact found for scenario "${scenarioId}" in project "${projectId}".`);
  }
  return artifact;
}

function joinValues(values: Array<string | undefined | null>): string {
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join('; ');
}

function formatMetricList(
  metrics: Array<{
    name: string;
    value: string | number | boolean | null;
    units?: string;
    status?: string;
  }> | undefined,
): string {
  return (metrics ?? [])
    .map((metric) => {
      const valueParts = [metric.value == null ? '' : String(metric.value), metric.units].filter(Boolean);
      const valueText = valueParts.join(' ');
      return `${metric.name}${valueText ? `=${valueText}` : ''}${metric.status ? ` [${metric.status}]` : ''}`;
    })
    .join('; ');
}

function buildCsvPayload(projectId: string, scenarioId: string, sourceArtifact: CsvSourceArtifact): CsvExportPayload {
  if (sourceArtifact === 'evidence') {
    const evidence = listEvidenceRecords(projectId, scenarioId);
    return {
      sourceArtifact,
      headers: ['evidenceId', 'class', 'label', 'source', 'summary', 'detail', 'linkedArtifactIds'],
      rows: evidence.map((record) => [
        record.evidenceId,
        record.class,
        record.label,
        record.source,
        record.summary,
        record.detail,
        record.linkedArtifactIds.join('; '),
      ]),
    };
  }

  if (sourceArtifact === 'assumptions') {
    const artifact = requireArtifact(projectId, scenarioId, 'assumptions');
    return {
      sourceArtifact,
      headers: ['assumptionId', 'category', 'statement', 'impact', 'basis'],
      rows: (artifact.payload.assumptions ?? []).map((assumption) => [
        assumption.assumptionId,
        assumption.category,
        assumption.statement,
        assumption.impact,
        assumption.basis,
      ]),
    };
  }

  if (sourceArtifact === 'results') {
    const artifact = requireArtifact(projectId, scenarioId, 'results');
    return {
      sourceArtifact,
      headers: ['resultId', 'label', 'method', 'toolName', 'metrics', 'interpretation', 'warnings'],
      rows: (artifact.payload.records ?? []).map((record) => [
        record.resultId,
        record.label,
        record.method,
        record.toolName,
        formatMetricList(record.metrics),
        record.interpretation,
        joinValues(record.warnings ?? []),
      ]),
    };
  }

  if (sourceArtifact === 'option-matrix') {
    const artifact = requireArtifact(projectId, scenarioId, 'option-matrix');
    return {
      sourceArtifact,
      headers: [
        'rank',
        'optionId',
        'label',
        'category',
        'safety',
        'settlement',
        'constructability',
        'cost',
        'scheduleRisk',
        'rationale',
      ],
      rows: (artifact.payload.rows ?? []).map((row) => [
        row.rank,
        row.optionId,
        row.label,
        row.category,
        row.safety,
        row.settlement,
        row.constructability,
        row.cost,
        row.scheduleRisk,
        row.rationale,
      ]),
    };
  }

  const artifact = requireArtifact(projectId, scenarioId, 'review-checklist');
  return {
    sourceArtifact,
    headers: ['itemId', 'category', 'question', 'status', 'detail'],
    rows: (artifact.payload.items ?? []).map((item) => [
      item.itemId,
      item.category,
      item.question,
      item.status,
      item.detail,
    ]),
  };
}

function createGeoJsonFeature(
  projectId: string,
  scenarioId: string,
  latitude: number,
  longitude: number,
  name?: string,
) {
  const caseFile = loadScenarioCaseFile(projectId, scenarioId);
  const acceptanceStatus = loadLatestScenarioArtifact(projectId, scenarioId, 'acceptance-status');
  const optionMatrix = loadLatestScenarioArtifact(projectId, scenarioId, 'option-matrix');
  const results = loadLatestScenarioArtifact(projectId, scenarioId, 'results');
  const evidenceCount = listEvidenceRecords(projectId, scenarioId).length;
  const preferredOptionId = optionMatrix?.payload.preferredOptionId;
  const preferredRow = optionMatrix?.payload.rows?.find((row) => row.optionId === preferredOptionId);

  return {
    lat: latitude,
    lng: longitude,
    name: name ?? caseFile?.title ?? scenarioId,
    properties: {
      projectId,
      scenarioId,
      scenarioTitle: caseFile?.title ?? scenarioId,
      verdict: acceptanceStatus?.payload.verdict ?? null,
      confidence: acceptanceStatus?.payload.confidence ?? null,
      acceptanceSummary: acceptanceStatus?.payload.summary ?? null,
      preferredOptionId: preferredOptionId ?? null,
      preferredOptionLabel: preferredRow?.label ?? null,
      decisionBasis: optionMatrix?.payload.decisionBasis ?? [],
      analysesRun: results?.payload.analysesRun ?? [],
      resultCount: results?.payload.records?.length ?? 0,
      evidenceCount,
    },
  };
}

function summarizeEvidence(records: EvidenceRecord[]): string {
  return records.length === 1 ? '1 evidence record' : `${records.length} evidence records`;
}

toolRegistry.register(
  {
    name: 'generate_report',
    description:
      'Generate a deterministic report from stored case-file artifacts and evidence without changing the project state.',
    parameters: {
      type: 'object',
      required: ['projectId', 'scenarioId'],
      properties: {
        projectId: { type: 'string', description: 'Project identifier' },
        scenarioId: { type: 'string', description: 'Scenario identifier' },
        projectName: { type: 'string', description: 'Optional display name for the project' },
        task: { type: 'string', description: 'Optional task summary for the report' },
        location: { type: 'string', description: 'Optional location label' },
        title: { type: 'string', description: 'Optional custom report title' },
      },
    },
  },
  async (args): Promise<ToolResult> => {
    const report = await loadStoredCaseFileReport(args);

    return {
      success: true,
      data: {
        source: 'case-file',
        format: 'report',
        report: toReportSummary(report),
        markdown: inlineTextPayload(report.fullMarkdown),
      },
      summary: `Generated report for ${report.title}`,
    };
  },
);

toolRegistry.register(
  {
    name: 'render_pdf',
    description:
      'Render a stored case-file report as PDF. Returns inline base64 when small, or writes a file when outputPath is provided.',
    parameters: {
      type: 'object',
      required: ['projectId', 'scenarioId'],
      properties: {
        projectId: { type: 'string', description: 'Project identifier' },
        scenarioId: { type: 'string', description: 'Scenario identifier' },
        projectName: { type: 'string', description: 'Optional display name for the project' },
        task: { type: 'string', description: 'Optional task summary for the report' },
        location: { type: 'string', description: 'Optional location label' },
        title: { type: 'string', description: 'Optional custom report title' },
        outputPath: { type: 'string', description: 'Optional file path for the rendered PDF' },
      },
    },
  },
  async (args): Promise<ToolResult> => {
    const report = await loadStoredCaseFileReport(args);
    const buffer = await renderReportAsPdf(report);
    const outputPath = readOptionalString(args.outputPath);
    const filename = sanitizeFilename(report.title, 'geotech-report', '.pdf');

    return {
      success: true,
      data: {
        source: 'case-file',
        format: 'pdf',
        mimeType: 'application/pdf',
        filename,
        report: toReportSummary(report),
        ...(outputPath
          ? { outputPath: writeOutputFile(outputPath, buffer), byteLength: buffer.length, inline: false }
          : inlineBinaryPayload(buffer)),
      },
      summary: `Rendered PDF for ${report.title}`,
    };
  },
);

toolRegistry.register(
  {
    name: 'render_docx',
    description:
      'Render a stored case-file report as DOCX. Returns inline base64 when small, or writes a file when outputPath is provided.',
    parameters: {
      type: 'object',
      required: ['projectId', 'scenarioId'],
      properties: {
        projectId: { type: 'string', description: 'Project identifier' },
        scenarioId: { type: 'string', description: 'Scenario identifier' },
        projectName: { type: 'string', description: 'Optional display name for the project' },
        task: { type: 'string', description: 'Optional task summary for the report' },
        location: { type: 'string', description: 'Optional location label' },
        title: { type: 'string', description: 'Optional custom report title' },
        outputPath: { type: 'string', description: 'Optional file path for the rendered DOCX' },
      },
    },
  },
  async (args): Promise<ToolResult> => {
    const report = await loadStoredCaseFileReport(args);
    const buffer = await renderReportAsDocx(report);
    const outputPath = readOptionalString(args.outputPath);
    const filename = sanitizeFilename(report.title, 'geotech-report', '.docx');

    return {
      success: true,
      data: {
        source: 'case-file',
        format: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename,
        report: toReportSummary(report),
        ...(outputPath
          ? { outputPath: writeOutputFile(outputPath, buffer), byteLength: buffer.length, inline: false }
          : inlineBinaryPayload(buffer)),
      },
      summary: `Rendered DOCX for ${report.title}`,
    };
  },
);

toolRegistry.register(
  {
    name: 'export_csv',
    description:
      'Export stored case-file artifacts or evidence as CSV. Supports results, option-matrix, review-checklist, assumptions, and evidence.',
    parameters: {
      type: 'object',
      required: ['projectId', 'scenarioId', 'sourceArtifact'],
      properties: {
        projectId: { type: 'string', description: 'Project identifier' },
        scenarioId: { type: 'string', description: 'Scenario identifier' },
        sourceArtifact: {
          type: 'string',
          enum: [...CSV_SOURCE_ARTIFACTS],
          description: 'Stored case-file source to export',
        },
        outputPath: { type: 'string', description: 'Optional file path for the CSV output' },
      },
    },
  },
  (args): ToolResult => {
    const projectId = readString(args.projectId, 'projectId');
    const scenarioId = readString(args.scenarioId, 'scenarioId');
    const sourceArtifact = readCsvSourceArtifact(args.sourceArtifact);
    const outputPath = readOptionalString(args.outputPath);
    const csvPayload = buildCsvPayload(projectId, scenarioId, sourceArtifact);
    const csv = exportCSV(csvPayload.headers, csvPayload.rows);

    return {
      success: true,
      data: {
        source: 'case-file',
        format: 'csv',
        mimeType: 'text/csv',
        sourceArtifact,
        headers: csvPayload.headers,
        rowCount: csvPayload.rows.length,
        ...(outputPath
          ? { outputPath: writeOutputFile(outputPath, csv), byteLength: Buffer.byteLength(csv, 'utf8') }
          : inlineTextPayload(csv)),
      },
      summary: `Exported ${sourceArtifact} as CSV (${csvPayload.rows.length} rows)`,
    };
  },
);

toolRegistry.register(
  {
    name: 'export_dxf',
    description:
      'Export a borehole-profile DXF from the latest stored ground-model artifact.',
    parameters: {
      type: 'object',
      required: ['projectId', 'scenarioId'],
      properties: {
        projectId: { type: 'string', description: 'Project identifier' },
        scenarioId: { type: 'string', description: 'Scenario identifier' },
        boreholeId: { type: 'string', description: 'Optional borehole label for the generated profile' },
        x: { type: 'number', description: 'Optional x origin for the generated borehole column' },
        spacing: { type: 'number', description: 'Optional profile spacing' },
        outputPath: { type: 'string', description: 'Optional file path for the DXF output' },
      },
    },
  },
  (args): ToolResult => {
    const projectId = readString(args.projectId, 'projectId');
    const scenarioId = readString(args.scenarioId, 'scenarioId');
    const outputPath = readOptionalString(args.outputPath);
    const groundModel = requireArtifact(projectId, scenarioId, 'ground-model');
    const caseFile = loadScenarioCaseFile(projectId, scenarioId);
    const strata = groundModel.payload.strata ?? [];

    if (strata.length === 0) {
      throw new Error(`Ground-model artifact for scenario "${scenarioId}" does not contain any strata.`);
    }

    const dxf = exportBoreholeProfileDXF(
      [
        {
          id: readOptionalString(args.boreholeId) ?? caseFile?.title ?? scenarioId,
          x: readOptionalNumber(args.x) ?? 0,
          layers: strata.map((stratum) => ({
            depthFrom: stratum.fromM,
            depthTo: stratum.toM,
            description: stratum.description ?? stratum.material,
          })),
        },
      ],
      readOptionalNumber(args.spacing) ?? 10,
    );

    return {
      success: true,
      data: {
        source: 'case-file',
        format: 'dxf',
        mimeType: 'application/dxf',
        boreholeCount: 1,
        layerCount: strata.length,
        ...(outputPath
          ? { outputPath: writeOutputFile(outputPath, dxf), byteLength: Buffer.byteLength(dxf, 'utf8') }
          : inlineTextPayload(dxf)),
      },
      summary: `Exported DXF from ${strata.length} stored ground-model layers`,
    };
  },
);

toolRegistry.register(
  {
    name: 'export_geojson',
    description:
      'Export a point GeoJSON feature that summarizes the stored scenario acceptance, option, results, and evidence state.',
    parameters: {
      type: 'object',
      required: ['projectId', 'scenarioId', 'latitude', 'longitude'],
      properties: {
        projectId: { type: 'string', description: 'Project identifier' },
        scenarioId: { type: 'string', description: 'Scenario identifier' },
        latitude: { type: 'number', description: 'Feature latitude' },
        longitude: { type: 'number', description: 'Feature longitude' },
        name: { type: 'string', description: 'Optional feature display name' },
        outputPath: { type: 'string', description: 'Optional file path for the GeoJSON output' },
      },
    },
  },
  (args): ToolResult => {
    const projectId = readString(args.projectId, 'projectId');
    const scenarioId = readString(args.scenarioId, 'scenarioId');
    const outputPath = readOptionalString(args.outputPath);
    const feature = createGeoJsonFeature(
      projectId,
      scenarioId,
      readNumber(args.latitude, 'latitude'),
      readNumber(args.longitude, 'longitude'),
      readOptionalString(args.name),
    );
    const geojson = exportGeoJSON([feature]);
    const evidence = listEvidenceRecords(projectId, scenarioId);

    return {
      success: true,
      data: {
        source: 'case-file',
        format: 'geojson',
        mimeType: 'application/geo+json',
        featureCount: 1,
        evidenceSummary: summarizeEvidence(evidence),
        ...(outputPath
          ? { outputPath: writeOutputFile(outputPath, geojson), byteLength: Buffer.byteLength(geojson, 'utf8') }
          : inlineTextPayload(geojson)),
      },
      summary: `Exported GeoJSON summary for scenario "${scenarioId}"`,
    };
  },
);

// Build a single interchange borehole from the stored ground-model artifact strata
// (mirrors export_dxf's sourcing). Returns the borehole plus its stratum count.
function interchangeBoreholeFromGroundModel(
  projectId: string,
  scenarioId: string,
  args: Record<string, unknown>,
): { borehole: InterchangeBorehole; layerCount: number } {
  const groundModel = requireArtifact(projectId, scenarioId, 'ground-model');
  const caseFile = loadScenarioCaseFile(projectId, scenarioId);
  const strata = groundModel.payload.strata ?? [];

  if (strata.length === 0) {
    throw new Error(`Ground-model artifact for scenario "${scenarioId}" does not contain any strata.`);
  }

  const layers = strata.map((stratum) => ({
    depthFrom: stratum.fromM,
    depthTo: stratum.toM,
    description: stratum.description ?? stratum.material,
    uscs: stratum.uscsSymbol,
  }));

  const borehole: InterchangeBorehole = {
    id: readOptionalString(args.boreholeId) ?? caseFile?.title ?? scenarioId,
    lat: readOptionalNumber(args.latitude),
    lng: readOptionalNumber(args.longitude),
    crs: readOptionalString(args.crs),
    depth: layers.reduce((max, layer) => Math.max(max, layer.depthTo), 0),
    layers,
  };

  return { borehole, layerCount: strata.length };
}

toolRegistry.register(
  {
    name: 'export_agsi',
    description:
      'Export an AGSi ground-model interchange file (JSON) from the latest stored ground-model artifact.',
    parameters: {
      type: 'object',
      required: ['projectId', 'scenarioId'],
      properties: {
        projectId: { type: 'string', description: 'Project identifier' },
        scenarioId: { type: 'string', description: 'Scenario identifier' },
        projectName: { type: 'string', description: 'Optional project name for the AGSi document' },
        boreholeId: { type: 'string', description: 'Optional borehole label for the generated model' },
        latitude: { type: 'number', description: 'Optional borehole latitude' },
        longitude: { type: 'number', description: 'Optional borehole longitude' },
        crs: { type: 'string', description: 'Optional coordinate reference system (e.g. EPSG:27700)' },
        outputPath: { type: 'string', description: 'Optional file path for the AGSi output' },
      },
    },
  },
  (args): ToolResult => {
    const projectId = readString(args.projectId, 'projectId');
    const scenarioId = readString(args.scenarioId, 'scenarioId');
    const outputPath = readOptionalString(args.outputPath);
    const { borehole, layerCount } = interchangeBoreholeFromGroundModel(projectId, scenarioId, args);

    const agsi = exportBoreholeAgsi([borehole], {
      projectName: readOptionalString(args.projectName),
      crs: readOptionalString(args.crs),
    });

    return {
      success: true,
      data: {
        source: 'case-file',
        format: 'agsi',
        mimeType: 'application/json',
        boreholeCount: 1,
        layerCount,
        ...(outputPath
          ? { outputPath: writeOutputFile(outputPath, agsi), byteLength: Buffer.byteLength(agsi, 'utf8') }
          : inlineTextPayload(agsi)),
      },
      summary: `Exported AGSi from ${layerCount} stored ground-model layers`,
    };
  },
);

toolRegistry.register(
  {
    name: 'export_diggs',
    description:
      'Export a DIGGS 2.x interchange file (XML) from the latest stored ground-model artifact.',
    parameters: {
      type: 'object',
      required: ['projectId', 'scenarioId'],
      properties: {
        projectId: { type: 'string', description: 'Project identifier' },
        scenarioId: { type: 'string', description: 'Scenario identifier' },
        projectName: { type: 'string', description: 'Optional project name for the DIGGS document' },
        boreholeId: { type: 'string', description: 'Optional borehole label for the generated model' },
        latitude: { type: 'number', description: 'Optional borehole latitude' },
        longitude: { type: 'number', description: 'Optional borehole longitude' },
        crs: { type: 'string', description: 'Optional coordinate reference system (e.g. EPSG:27700)' },
        outputPath: { type: 'string', description: 'Optional file path for the DIGGS output' },
      },
    },
  },
  (args): ToolResult => {
    const projectId = readString(args.projectId, 'projectId');
    const scenarioId = readString(args.scenarioId, 'scenarioId');
    const outputPath = readOptionalString(args.outputPath);
    const { borehole, layerCount } = interchangeBoreholeFromGroundModel(projectId, scenarioId, args);

    const diggs = exportBoreholeDiggs([borehole], {
      projectName: readOptionalString(args.projectName),
      crs: readOptionalString(args.crs),
    });

    return {
      success: true,
      data: {
        source: 'case-file',
        format: 'diggs',
        mimeType: 'application/xml',
        boreholeCount: 1,
        layerCount,
        ...(outputPath
          ? { outputPath: writeOutputFile(outputPath, diggs), byteLength: Buffer.byteLength(diggs, 'utf8') }
          : inlineTextPayload(diggs)),
      },
      summary: `Exported DIGGS from ${layerCount} stored ground-model layers`,
    };
  },
);
