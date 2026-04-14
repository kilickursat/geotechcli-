import {
  loadLatestScenarioArtifacts,
  loadScenarioCaseFile,
} from '../agents/case-file.js';

export type ScenarioArtifactType =
  | 'ground-model'
  | 'assumptions'
  | 'data-quality'
  | 'analysis-plan'
  | 'results'
  | 'option-matrix'
  | 'review-checklist'
  | 'acceptance-status'
  | 'issues-and-corrections'
  | 'final-report';

export interface EvidenceReference {
  evidenceId?: string;
  class: string;
  label: string;
  source: string;
  summary?: string;
}

export interface GroundModelPayload {
  summary: string;
  strata?: Array<{
    id?: string;
    fromM: number;
    toM: number;
    material: string;
    description?: string;
    uscsSymbol?: string;
    warnings?: string[];
    evidenceRefs?: EvidenceReference[];
  }>;
  groundwater?: {
    detected?: boolean;
    depthM?: number | null;
    note?: string;
  };
  missingInputs?: string[];
  blockedInputs?: string[];
}

export interface AssumptionsPayload {
  summary: string;
  assumptions?: Array<{
    assumptionId?: string;
    category?: string;
    statement: string;
    impact: string;
    basis?: string;
    evidenceRefs?: EvidenceReference[];
  }>;
  criticalAssumptions?: string[];
}

export interface DataQualityPayload {
  summary: string;
  parseStatus?: string;
  confidence?: number;
  missingInputs?: string[];
  blockedInputs?: string[];
  checks?: Array<{
    name: string;
    status: string;
    detail: string;
  }>;
}

export interface AnalysisPlanPayload {
  summary: string;
  steps?: Array<{
    label: string;
    detail?: string;
  }>;
  methods?: string[];
}

export interface ResultsPayload {
  summary: string;
  analysesRun?: string[];
  records?: Array<{
    resultId?: string;
    label: string;
    method?: string;
    toolName?: string;
    interpretation?: string;
    metrics?: Array<{
      name: string;
      value: number | string | null;
      units?: string;
      threshold?: string;
      status?: string;
    }>;
    warnings?: string[];
    evidenceRefs?: EvidenceReference[];
  }>;
}

export interface OptionMatrixPayload {
  summary: string;
  preferredOptionId?: string;
  decisionBasis?: string[];
  rows?: Array<{
    optionId?: string;
    label: string;
    category?: string;
    safety?: string;
    settlement?: string;
    constructability?: string;
    cost?: string;
    scheduleRisk?: string;
    rank: number;
    rationale?: string;
    supportingResultIds?: string[];
  }>;
}

export interface ReviewChecklistPayload {
  summary: string;
  items?: Array<{
    itemId?: string;
    category?: string;
    question: string;
    status: string;
    detail?: string;
  }>;
}

export interface AcceptanceStatusPayload {
  summary: string;
  verdict?: string;
  confidence?: number;
  reasons?: string[];
}

export interface IssuesAndCorrectionsPayload {
  summary: string;
  issues?: Array<{
    issueId?: string;
    severity?: string;
    issue: string;
    correction: string;
    affectedArtifacts?: string[];
  }>;
}

export interface FinalReportPayload {
  summary: string;
  markdown?: string;
  recommendation?: string;
  assumptionTable?: Array<{ assumption: string; impact: string; basis?: string }>;
  evidenceTable?: Array<{ evidenceId?: string; class: string; label: string; source: string; summary?: string }>;
}

export interface ScenarioArtifactPayloadMap {
  'ground-model': GroundModelPayload;
  assumptions: AssumptionsPayload;
  'data-quality': DataQualityPayload;
  'analysis-plan': AnalysisPlanPayload;
  results: ResultsPayload;
  'option-matrix': OptionMatrixPayload;
  'review-checklist': ReviewChecklistPayload;
  'acceptance-status': AcceptanceStatusPayload;
  'issues-and-corrections': IssuesAndCorrectionsPayload;
  'final-report': FinalReportPayload;
}

export interface ScenarioArtifact<T extends ScenarioArtifactType = ScenarioArtifactType> {
  artifactId: string;
  projectId: string;
  scenarioId: string;
  artifactType: T;
  version: number;
  title: string;
  payload: ScenarioArtifactPayloadMap[T];
  warnings?: string[];
  assumptionsUsed?: string[];
  evidenceRefs?: EvidenceReference[];
  derivedFrom?: string[];
}

export interface CaseFileArtifactBundle {
  artifacts: Partial<Record<ScenarioArtifactType, ScenarioArtifact>>;
}

export interface CaseFileReportSection {
  title: string;
  content: string;
}

export interface CaseFileGeneratedReport {
  title: string;
  summary: string;
  sections: CaseFileReportSection[];
  fullMarkdown: string;
  latencyMs: number;
  metadata: {
    source: 'case-file';
    projectName?: string;
    scenarioId?: string;
    task?: string;
    artifactTypes: ScenarioArtifactType[];
    missingArtifactTypes: ScenarioArtifactType[];
  };
}

export interface CaseFileReportInput {
  projectName?: string;
  scenarioId?: string;
  task?: string;
  location?: string;
  title?: string;
  artifacts: Partial<Record<ScenarioArtifactType, ScenarioArtifact>>;
}

export interface GenerateStoredCaseFileReportOptions {
  projectId: string;
  scenarioId: string;
  projectName?: string;
  task?: string;
  location?: string;
  title?: string;
}

const ARTIFACT_ORDER: ScenarioArtifactType[] = [
  'ground-model',
  'assumptions',
  'data-quality',
  'analysis-plan',
  'results',
  'option-matrix',
  'review-checklist',
  'acceptance-status',
  'issues-and-corrections',
  'final-report',
];

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return '_None._';
  }

  const headerRow = `| ${headers.map(escapeCell).join(' | ')} |`;
  const dividerRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyRows = rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`);
  return [headerRow, dividerRow, ...bodyRows].join('\n');
}

function bullets(values: string[] | undefined): string {
  if (!values || values.length === 0) {
    return '_None._';
  }
  return values.map((value) => `- ${value}`).join('\n');
}

function renderGroundModel(payload?: GroundModelPayload): string {
  if (!payload) {
    return 'No ground-model artifact was available.';
  }

  const strataRows = (payload.strata ?? []).map((stratum) => [
    `${stratum.fromM}`,
    `${stratum.toM}`,
    stratum.material,
    stratum.uscsSymbol ?? '-',
    stratum.description ?? '-',
  ]);

  const groundwater = payload.groundwater
    ? `Detected: ${payload.groundwater.detected ? 'yes' : 'no'}\nDepth: ${payload.groundwater.depthM ?? 'unknown'} m${payload.groundwater.note ? `\nNote: ${payload.groundwater.note}` : ''}`
    : 'No groundwater information was available.';

  const missing = payload.missingInputs && payload.missingInputs.length > 0
    ? `\n\n### Missing inputs\n${bullets(payload.missingInputs)}`
    : '';
  const blocked = payload.blockedInputs && payload.blockedInputs.length > 0
    ? `\n\n### Blocked inputs\n${bullets(payload.blockedInputs)}`
    : '';

  return [
    payload.summary,
    '',
    '### Strata',
    table(['From (m)', 'To (m)', 'Material', 'USCS', 'Description'], strataRows),
    '',
    '### Groundwater',
    groundwater,
    missing,
    blocked,
  ].join('\n').trim();
}

function renderAssumptions(payload?: AssumptionsPayload): string {
  if (!payload) {
    return 'No assumptions artifact was available.';
  }

  const rows = (payload.assumptions ?? []).map((item) => [
    item.category ?? '-',
    item.statement,
    item.impact,
    item.basis ?? '-',
  ]);

  return [
    payload.summary,
    '',
    '### Assumptions',
    table(['Category', 'Statement', 'Impact', 'Basis'], rows),
    '',
    '### Critical assumptions',
    bullets(payload.criticalAssumptions),
  ].join('\n').trim();
}

function renderDataQuality(payload?: DataQualityPayload): string {
  if (!payload) {
    return 'No data-quality artifact was available.';
  }

  const checks = (payload.checks ?? []).map((check) => [
    check.name,
    check.status.toUpperCase(),
    check.detail,
  ]);

  return [
    payload.summary,
    '',
    `Parse status: ${payload.parseStatus ? payload.parseStatus.toUpperCase() : 'UNKNOWN'}`,
    `Confidence: ${payload.confidence == null ? 'unknown' : `${payload.confidence}%`}`,
    '',
    '### Missing inputs',
    bullets(payload.missingInputs),
    '',
    '### Blocked inputs',
    bullets(payload.blockedInputs),
    '',
    '### Checks',
    table(['Check', 'Status', 'Detail'], checks),
  ].join('\n').trim();
}

function renderAnalysisPlan(payload?: AnalysisPlanPayload): string {
  if (!payload) {
    return 'No analysis-plan artifact was available.';
  }

  const rows = (payload.steps ?? []).map((step) => [step.label, step.detail ?? '-']);

  return [
    payload.summary,
    '',
    '### Methods',
    bullets(payload.methods),
    '',
    '### Steps',
    table(['Step', 'Detail'], rows),
  ].join('\n').trim();
}

function renderResults(payload?: ResultsPayload): string {
  if (!payload) {
    return 'No results artifact was available.';
  }

  const records = (payload.records ?? []).map((record) => {
    const metrics = table(
      ['Metric', 'Value', 'Units', 'Threshold', 'Status'],
      (record.metrics ?? []).map((metric) => [
        metric.name,
        metric.value == null ? '-' : String(metric.value),
        metric.units ?? '-',
        metric.threshold ?? '-',
        metric.status ? metric.status.toUpperCase() : '-',
      ]),
    );

    return [
      `### ${record.label}`,
      record.method ? `Method: ${record.method}` : undefined,
      record.toolName ? `Tool: ${record.toolName}` : undefined,
      '',
      metrics,
      '',
      record.interpretation ?? '_No interpretation was recorded._',
      record.warnings && record.warnings.length > 0 ? `\nWarnings:\n${bullets(record.warnings)}` : '',
    ].filter((value): value is string => Boolean(value)).join('\n');
  });

  return [
    payload.summary,
    '',
    '### Analyses run',
    bullets(payload.analysesRun),
    '',
    records.length > 0 ? records.join('\n\n') : '_No calculation records were stored._',
  ].join('\n').trim();
}

function renderOptionMatrix(payload?: OptionMatrixPayload): string {
  if (!payload) {
    return 'No option-matrix artifact was available.';
  }

  const rows = (payload.rows ?? [])
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map((row) => [
      String(row.rank),
      row.label,
      row.category ?? '-',
      row.safety ?? '-',
      row.settlement ?? '-',
      row.constructability ?? '-',
      row.cost ?? '-',
      row.scheduleRisk ?? '-',
      row.rationale ?? '-',
    ]);

  return [
    payload.summary,
    '',
    `Preferred option: ${payload.preferredOptionId ?? 'Not selected'}`,
    '',
    '### Decision basis',
    bullets(payload.decisionBasis),
    '',
    '### Ranked options',
    table(['Rank', 'Option', 'Category', 'Safety', 'Settlement', 'Constructability', 'Cost', 'Schedule risk', 'Rationale'], rows),
  ].join('\n').trim();
}

function renderReviewChecklist(payload?: ReviewChecklistPayload): string {
  if (!payload) {
    return 'No review-checklist artifact was available.';
  }

  const rows = (payload.items ?? []).map((item) => [
    item.category ?? '-',
    item.question,
    item.status.toUpperCase(),
    item.detail ?? '-',
  ]);

  return [
    payload.summary,
    '',
    '### Review checklist',
    table(['Category', 'Question', 'Status', 'Detail'], rows),
  ].join('\n').trim();
}

function renderAcceptanceStatus(payload?: AcceptanceStatusPayload): string {
  if (!payload) {
    return 'No acceptance-status artifact was available.';
  }

  return [
    payload.summary,
    '',
    `Verdict: ${payload.verdict ?? 'UNKNOWN'}`,
    `Confidence: ${payload.confidence == null ? 'unknown' : `${payload.confidence}%`}`,
    '',
    '### Reasons',
    bullets(payload.reasons),
  ].join('\n').trim();
}

function renderIssuesAndCorrections(payload?: IssuesAndCorrectionsPayload): string {
  if (!payload) {
    return 'No issues-and-corrections artifact was available.';
  }

  const rows = (payload.issues ?? []).map((issue) => [
    issue.severity ?? '-',
    issue.issue,
    issue.correction,
    (issue.affectedArtifacts ?? []).join(', ') || '-',
  ]);

  return [
    payload.summary,
    '',
    '### Issues and corrections',
    table(['Severity', 'Issue', 'Correction', 'Affected artifacts'], rows),
  ].join('\n').trim();
}

interface CollectedEvidenceRow extends EvidenceReference {
  artifactType: ScenarioArtifactType;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}

function collectEvidenceRows(
  artifacts: Partial<Record<ScenarioArtifactType, ScenarioArtifact>>,
): CollectedEvidenceRow[] {
  const seen = new Set<string>();
  const rows: CollectedEvidenceRow[] = [];

  for (const artifactType of ARTIFACT_ORDER) {
    const artifact = artifacts[artifactType];
    const references: EvidenceReference[] = [];

    if (artifact?.evidenceRefs) {
      references.push(...artifact.evidenceRefs);
    }

    const payload = artifact?.payload;
    if (artifactType === 'ground-model') {
      const groundModel = payload as GroundModelPayload | undefined;
      for (const stratum of groundModel?.strata ?? []) {
        if (stratum.evidenceRefs) {
          references.push(...stratum.evidenceRefs);
        }
      }
    } else if (artifactType === 'assumptions') {
      const assumptions = payload as AssumptionsPayload | undefined;
      for (const assumption of assumptions?.assumptions ?? []) {
        if (assumption.evidenceRefs) {
          references.push(...assumption.evidenceRefs);
        }
      }
    } else if (artifactType === 'results') {
      const results = payload as ResultsPayload | undefined;
      for (const record of results?.records ?? []) {
        if (record.evidenceRefs) {
          references.push(...record.evidenceRefs);
        }
      }
    }

    for (const reference of references) {
      const key = `${artifactType}::${reference.class}::${reference.label}::${reference.source}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      rows.push({
        artifactType,
        class: reference.class,
        label: reference.label,
        source: reference.source,
      });
    }
  }

  const artifactOrder = new Map<ScenarioArtifactType, number>(
    ARTIFACT_ORDER.map((artifactType, index) => [artifactType, index]),
  );

  return rows.sort((left, right) => (
    (artifactOrder.get(left.artifactType) ?? Number.MAX_SAFE_INTEGER)
    - (artifactOrder.get(right.artifactType) ?? Number.MAX_SAFE_INTEGER)
    || compareText(left.class, right.class)
    || compareText(left.label, right.label)
    || compareText(left.source, right.source)
  ));
}

function renderEvidenceRecords(
  artifacts: Partial<Record<ScenarioArtifactType, ScenarioArtifact>>,
): string {
  const rows = collectEvidenceRows(artifacts).map((row) => [
    row.artifactType,
    row.class,
    row.label,
    row.source,
  ]);

  return [
    '### Evidence records',
    table(['Artifact', 'Class', 'Label', 'Source'], rows),
  ].join('\n').trim();
}

function renderEvidenceTable(payload?: FinalReportPayload): string {
  if (!payload) {
    return 'No final-report artifact was available.';
  }

  const rows = (payload.evidenceTable ?? [])
    .slice()
    .sort((left, right) => (
      compareText(left.class, right.class)
      || compareText(left.label, right.label)
      || compareText(left.source, right.source)
    ))
    .map((item) => [item.class, item.label, item.source]);

  return [
    '### Evidence table',
    table(['Class', 'Label', 'Source'], rows),
  ].join('\n').trim();
}

function renderFinalReport(payload?: FinalReportPayload): string {
  if (!payload) {
    return 'No final-report artifact was available.';
  }

  const body = payload.markdown?.trim() || payload.summary;
  const extras: string[] = [];
  const assumptionTable = payload.assumptionTable ?? [];

  if (payload.recommendation) {
    extras.push(`Recommendation: ${payload.recommendation}`);
  }
  if (assumptionTable.length > 0) {
    extras.push(
      [
        '### Assumption table',
        table(
          ['Assumption', 'Impact', 'Basis'],
          assumptionTable.map((item) => [item.assumption, item.impact, item.basis ?? '-']),
        ),
      ].join('\n'),
    );
  }
  if ((payload.evidenceTable ?? []).length > 0) {
    extras.push(renderEvidenceTable(payload));
  }

  return [body, ...extras].join('\n\n').trim();
}

function pickSummary(input: CaseFileReportInput): string {
  const finalReport = input.artifacts['final-report']?.payload as FinalReportPayload | undefined;
  if (finalReport?.summary) return finalReport.summary;

  const acceptance = input.artifacts['acceptance-status']?.payload as AcceptanceStatusPayload | undefined;
  if (acceptance?.summary) return acceptance.summary;

  const optionMatrix = input.artifacts['option-matrix']?.payload as OptionMatrixPayload | undefined;
  if (optionMatrix?.summary) return optionMatrix.summary;

  const results = input.artifacts.results?.payload as ResultsPayload | undefined;
  if (results?.summary) return results.summary;

  const groundModel = input.artifacts['ground-model']?.payload as GroundModelPayload | undefined;
  if (groundModel?.summary) return groundModel.summary;

  const dataQuality = input.artifacts['data-quality']?.payload as DataQualityPayload | undefined;
  if (dataQuality?.summary) return dataQuality.summary;

  return input.task
    ? `Case-file report for ${input.task}.`
    : 'Case-file report assembled from typed artifacts.';
}

function buildSection(title: string, content: string): CaseFileReportSection {
  return { title, content };
}

export function buildArtifactDrivenReport(input: CaseFileReportInput): CaseFileGeneratedReport {
  const artifactTypes = ARTIFACT_ORDER.filter((artifactType) => Boolean(input.artifacts[artifactType]));
  const missingArtifactTypes = ARTIFACT_ORDER.filter((artifactType) => !input.artifacts[artifactType]);
  const summary = pickSummary(input);
  const title = input.title
    ?? `${input.projectName ?? 'geotechCLI Project'}${input.scenarioId ? ` / ${input.scenarioId}` : ''} Report`;

  const sections: CaseFileReportSection[] = [
    buildSection('Executive Summary', summary),
    buildSection(
      'Project and Scenario',
      [
        input.projectName ? `Project: ${input.projectName}` : 'Project: not specified',
        input.scenarioId ? `Scenario: ${input.scenarioId}` : 'Scenario: not specified',
        input.location ? `Location: ${input.location}` : 'Location: not specified',
        input.task ? `Task: ${input.task}` : 'Task: not specified',
      ].join('\n'),
    ),
    buildSection('Ground Model', renderGroundModel(input.artifacts['ground-model']?.payload as GroundModelPayload | undefined)),
    buildSection('Assumptions', renderAssumptions(input.artifacts.assumptions?.payload as AssumptionsPayload | undefined)),
    buildSection('Data Quality', renderDataQuality(input.artifacts['data-quality']?.payload as DataQualityPayload | undefined)),
    buildSection('Analysis Plan', renderAnalysisPlan(input.artifacts['analysis-plan']?.payload as AnalysisPlanPayload | undefined)),
    buildSection('Results', renderResults(input.artifacts.results?.payload as ResultsPayload | undefined)),
    buildSection('Evidence Records', renderEvidenceRecords(input.artifacts)),
    buildSection('Option Matrix', renderOptionMatrix(input.artifacts['option-matrix']?.payload as OptionMatrixPayload | undefined)),
    buildSection('Review Checklist', renderReviewChecklist(input.artifacts['review-checklist']?.payload as ReviewChecklistPayload | undefined)),
    buildSection('Acceptance Status', renderAcceptanceStatus(input.artifacts['acceptance-status']?.payload as AcceptanceStatusPayload | undefined)),
    buildSection('Issues and Corrections', renderIssuesAndCorrections(input.artifacts['issues-and-corrections']?.payload as IssuesAndCorrectionsPayload | undefined)),
    buildSection('Final Report', renderFinalReport(input.artifacts['final-report']?.payload as FinalReportPayload | undefined)),
    buildSection(
      'Missing Artifacts',
      missingArtifactTypes.length > 0 ? bullets(missingArtifactTypes) : '_None._',
    ),
  ];

  const markdownLines = [
    `# ${title}`,
    '',
    `> ${summary}`,
    '',
  ];

  for (const section of sections) {
    markdownLines.push(`## ${section.title}`);
    markdownLines.push(section.content);
    markdownLines.push('');
  }

  return {
    title,
    summary,
    sections,
    fullMarkdown: markdownLines.join('\n').trim(),
    latencyMs: 1,
    metadata: {
      source: 'case-file',
      projectName: input.projectName,
      scenarioId: input.scenarioId,
      task: input.task,
      artifactTypes,
      missingArtifactTypes,
    },
  };
}

export async function generateReportFromCaseFile(
  input: CaseFileReportInput | GenerateStoredCaseFileReportOptions,
): Promise<CaseFileGeneratedReport> {
  if ('artifacts' in input) {
    return buildArtifactDrivenReport(input);
  }

  const caseFile = loadScenarioCaseFile(input.projectId, input.scenarioId);
  if (!caseFile) {
    throw new Error(
      `Case file "${input.scenarioId}" was not found in project "${input.projectId}".`,
    );
  }

  const artifacts = loadLatestScenarioArtifacts(input.projectId, input.scenarioId) as Partial<
    Record<ScenarioArtifactType, ScenarioArtifact>
  >;

  return buildArtifactDrivenReport({
    projectName: input.projectName ?? input.projectId,
    scenarioId: input.scenarioId,
    task: input.task ?? caseFile.title,
    location: input.location,
    title: input.title ?? `${caseFile.title} Report`,
    artifacts,
  });
}
