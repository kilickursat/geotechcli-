import type { GroundModel, GroundModelParameter } from '../ground-model/index.js';
import type { GroundModelCalculationReadiness, GroundModelFinding } from '../verifier/index.js';
import type { ProjectManifest, WorkspaceFileEntry } from './manifest.js';

export type ProjectWorkflowTask =
  | 'data-quality'
  | 'ground-model'
  | 'calculation-readiness'
  | 'risk-analysis'
  | 'anomaly-detection'
  | 'recommendations'
  | 'signal-analysis'
  | 'visualization';

export type ProjectWorkflowStatus = 'pass' | 'review' | 'blocked';

export type ProjectWorkflowFindingSeverity = 'info' | 'warning' | 'risk' | 'blocking';

export interface ProjectWorkflowFinding {
  id: string;
  severity: ProjectWorkflowFindingSeverity;
  title: string;
  detail: string;
  evidenceIds: string[];
  source?: string;
  recommendation?: string;
}

export interface ProjectWorkflowAction {
  id: string;
  label: string;
  status: 'ready' | 'needs_input' | 'blocked';
  command?: string;
  missing: string[];
  evidenceIds: string[];
  recommendation: string;
}

export interface ProjectWorkflowChartPoint {
  x: number;
  y: number;
  label?: string;
  evidenceIds?: string[];
}

export interface ProjectWorkflowChartSeries {
  id: string;
  label: string;
  points: ProjectWorkflowChartPoint[];
}

export interface ProjectWorkflowChartSpec {
  id: string;
  title: string;
  kind: 'map' | 'xy' | 'table';
  xLabel?: string;
  yLabel?: string;
  series: ProjectWorkflowChartSeries[];
  warnings: string[];
}

export interface ProjectWorkflowRun {
  schemaVersion: 'geotech.project-workflow-run.v1';
  runId: string;
  task: ProjectWorkflowTask;
  generatedAt: string;
  status: ProjectWorkflowStatus;
  providerContract: {
    providerNeutral: true;
    purpose: 'deterministic-project-workflow';
    llmRole: 'none';
  };
  workspace: {
    rootPath: string;
    totalFiles: number;
    supportedFiles: number;
    branches: string[];
  };
  summary: string[];
  findings: ProjectWorkflowFinding[];
  actions: ProjectWorkflowAction[];
  charts: ProjectWorkflowChartSpec[];
  artifacts: Array<{
    kind: 'json' | 'markdown' | 'chart-spec';
    path: string;
    description: string;
  }>;
  trace: {
    steps: Array<{
      type: 'tool_call' | 'review_gate';
      name: string;
      status: 'pass' | 'review' | 'blocked';
      detail: string;
    }>;
  };
  toolCalls: Array<{
    type: 'tool_call';
    tool: string;
    status: 'pass' | 'review' | 'blocked';
    summary: string;
  }>;
  modelCalls: [];
}

export interface RunProjectWorkflowOptions {
  manifest: ProjectManifest;
  task: ProjectWorkflowTask;
  runId?: string;
  now?: string;
}

export function runProjectWorkflow(options: RunProjectWorkflowOptions): ProjectWorkflowRun {
  const generatedAt = options.now ?? new Date().toISOString();
  const runId = options.runId ?? `workflow_${generatedAt.replace(/\D/g, '').slice(0, 17)}`;
  const findings = buildFindings(options.manifest, options.task);
  const actions = buildActions(options.manifest, options.task);
  const charts = options.task === 'visualization'
    ? buildVisualizationCharts(options.manifest)
    : options.task === 'signal-analysis'
      ? buildSignalAnalysisCharts(options.manifest)
      : [];
  const status = deriveWorkflowStatus(options.manifest, findings, charts, options.task);
  const summary = buildSummary(options.manifest, options.task, status, findings, actions, charts);
  const taskLabel = taskTitle(options.task);

  const toolCalls: ProjectWorkflowRun['toolCalls'] = [
    {
      type: 'tool_call',
      tool: 'workspace.project_workflow_executor',
      status,
      summary: `${taskLabel} evaluated deterministically from workspace manifest, GroundModel, verifier, and schema evidence.`,
    },
  ];

  if (charts.length > 0) {
    toolCalls.push({
      type: 'tool_call',
      tool: options.task === 'signal-analysis' ? 'signal.project_chart_specs' : 'viz.project_chart_specs',
      status: 'pass',
      summary: options.task === 'signal-analysis'
        ? `${charts.length} deterministic signal coverage chart spec(s) prepared from monitoring evidence.`
        : `${charts.length} deterministic chart spec(s) prepared from GroundModel evidence.`,
    });
  }

  return {
    schemaVersion: 'geotech.project-workflow-run.v1',
    runId,
    task: options.task,
    generatedAt,
    status,
    providerContract: {
      providerNeutral: true,
      purpose: 'deterministic-project-workflow',
      llmRole: 'none',
    },
    workspace: {
      rootPath: options.manifest.rootPath,
      totalFiles: options.manifest.summary.totalFiles,
      supportedFiles: options.manifest.summary.supportedFiles,
      branches: options.manifest.summary.branches,
    },
    summary,
    findings,
    actions,
    charts,
    artifacts: [
      { kind: 'json', path: `.geotech/runs/${runId}/workflow_result.json`, description: 'Deterministic workflow result' },
      { kind: 'markdown', path: `.geotech/runs/${runId}/workflow_report.md`, description: 'Human-readable deterministic workflow report' },
      ...(charts.length > 0
        ? [{ kind: 'chart-spec' as const, path: `.geotech/runs/${runId}/workflow_result.json#charts`, description: 'Deterministic visualization chart specs' }]
        : []),
    ],
    trace: {
      steps: [
        {
          type: 'tool_call',
          name: 'workspace.project_workflow_executor',
          status,
          detail: `${taskLabel} used provider-neutral manifest evidence only.`,
        },
        {
          type: 'review_gate',
          name: 'engineering_review_required',
          status: status === 'blocked' ? 'blocked' : 'review',
          detail: 'Project workflow output supports engineering review and must not be treated as final design without human approval.',
        },
      ],
    },
    toolCalls,
    modelCalls: [],
  };
}

function buildFindings(manifest: ProjectManifest, task: ProjectWorkflowTask): ProjectWorkflowFinding[] {
  const findings: ProjectWorkflowFinding[] = [];
  const push = (finding: Omit<ProjectWorkflowFinding, 'id'>) => {
    findings.push({ id: `finding_${String(findings.length + 1).padStart(3, '0')}`, ...finding });
  };

  if (manifest.summary.supportedFiles === 0) {
    push({
      severity: 'blocking',
      title: 'No supported project evidence indexed',
      detail: 'The workspace scan did not find supported geotechnical files for this workflow.',
      evidenceIds: [],
      recommendation: 'Add AGS, CSV/XLSX, PDF, image, GIS, CAD, or JSON geotechnical evidence and rerun project discovery.',
    });
  }

  for (const warning of manifest.warnings.slice(0, 8)) {
    push({
      severity: 'warning',
      title: 'Workspace warning',
      detail: warning,
      evidenceIds: [],
      recommendation: 'Review the workspace scan warning before using downstream workflow output.',
    });
  }

  if (task === 'data-quality') {
    addDataQualityFindings(manifest, push);
  }
  if (task === 'ground-model') {
    addGroundModelFindings(manifest, push);
  }
  if (task === 'calculation-readiness') {
    addCalculationReadinessFindings(manifest, push);
  }
  if (task === 'risk-analysis') {
    addRiskFindings(manifest, push);
  }
  if (task === 'anomaly-detection') {
    addAnomalyFindings(manifest, push);
  }
  if (task === 'recommendations') {
    addRecommendationFindings(manifest, push);
  }
  if (task === 'signal-analysis') {
    addSignalAnalysisFindings(manifest, push);
  }
  if (task === 'visualization') {
    addVisualizationFindings(manifest, push);
  }

  if (findings.length === 0) {
    push({
      severity: 'info',
      title: 'No deterministic issues found',
      detail: `${taskTitle(task)} did not find obvious blockers in the current workspace evidence.`,
      evidenceIds: [],
      recommendation: 'Continue with engineering review and deeper extraction where required.',
    });
  }

  return findings;
}

function addDataQualityFindings(
  manifest: ProjectManifest,
  push: (finding: Omit<ProjectWorkflowFinding, 'id'>) => void,
): void {
  if (manifest.summary.skippedFiles > 0) {
    push({
      severity: 'warning',
      title: 'Skipped files present',
      detail: `${manifest.summary.skippedFiles} file(s) were skipped by workspace discovery.`,
      evidenceIds: [],
      recommendation: 'Confirm whether skipped files include project-critical drawings, reports, or monitoring data.',
    });
  }

  for (const file of filesWithWarnings(manifest).slice(0, 8)) {
    push({
      severity: 'warning',
      title: `File warning: ${file.path}`,
      detail: file.classification.warnings.join('; '),
      evidenceIds: [`file:${file.path}`],
      source: file.path,
      recommendation: 'Inspect this source before relying on its extracted schema or classification.',
    });
  }

  const duplicateNames = duplicated(manifest.files.map((file) => file.name.toLowerCase()));
  for (const name of duplicateNames.slice(0, 5)) {
    push({
      severity: 'info',
      title: `Duplicate filename: ${name}`,
      detail: 'Multiple files share the same filename, which may indicate duplicate exports or repeated evidence packages.',
      evidenceIds: manifest.files.filter((file) => file.name.toLowerCase() === name).map((file) => `file:${file.path}`),
      recommendation: 'Check whether duplicate filenames refer to unique revisions or redundant evidence.',
    });
  }
}

function addGroundModelFindings(
  manifest: ProjectManifest,
  push: (finding: Omit<ProjectWorkflowFinding, 'id'>) => void,
): void {
  const model = manifest.groundModel;
  if (!model || model.stats.evidenceRefs === 0) {
    push({
      severity: 'blocking',
      title: 'GroundModel evidence not available',
      detail: 'The manifest does not contain evidence-bound boreholes, strata, parameters, or groundwater observations.',
      evidenceIds: [],
      recommendation: 'Add structured borehole/log/lab data or ingest PDFs before ground-model interpretation.',
    });
    return;
  }

  for (const warning of model.warnings.slice(0, 8)) {
    push({
      severity: 'warning',
      title: 'GroundModel warning',
      detail: warning,
      evidenceIds: [],
      recommendation: 'Verify the GroundModel source evidence and extracted field mapping.',
    });
  }

  addVerifierFindings(manifest.verifier?.findings ?? [], push);
}

function addCalculationReadinessFindings(
  manifest: ProjectManifest,
  push: (finding: Omit<ProjectWorkflowFinding, 'id'>) => void,
): void {
  const readiness = manifest.verifier?.calculationReadiness;
  if (!manifest.groundModel) {
    push({
      severity: 'blocking',
      title: 'GroundModel evidence missing',
      detail: 'Calculation readiness needs an evidence-bound GroundModel before draft routing can be evaluated.',
      evidenceIds: [],
      recommendation: 'Run workspace analysis or ingest project evidence so boreholes, strata, groundwater, and parameters are bound to evidence.',
    });
    return;
  }
  if (!readiness || readiness.workflows.length === 0) {
    push({
      severity: 'blocking',
      title: 'Calculation readiness not available',
      detail: 'The workspace manifest does not contain calculation workflow readiness records.',
      evidenceIds: manifest.groundModel.evidence.map((item) => item.id).slice(0, 8),
      recommendation: 'Refresh workspace analysis with calculation readiness enabled before asking agents to route calculations.',
    });
    return;
  }

  const ready = readiness.workflows.filter((workflow) => workflow.status === 'ready');
  const assumptionBound = readiness.workflows.filter((workflow) => workflow.status === 'ready_with_assumptions');
  const blocked = readiness.workflows.filter((workflow) => workflow.status === 'blocked');

  if (ready.length > 0) {
    push({
      severity: 'info',
      title: 'Calculation routes ready',
      detail: `${ready.length} workflow(s) have sufficient core evidence: ${ready.map((workflow) => workflow.label).join(', ')}.`,
      evidenceIds: ready.flatMap((workflow) => workflow.evidenceIds).slice(0, 8),
      recommendation: 'Prepare opt-in input drafts and require explicit geometry/load user inputs before running deterministic tools.',
    });
  }

  if (assumptionBound.length > 0) {
    push({
      severity: 'warning',
      title: 'Calculation routes require assumptions',
      detail: `${assumptionBound.length} workflow(s) can be drafted only after assumptions or missing user inputs are declared: ${assumptionBound.map((workflow) => workflow.label).join(', ')}.`,
      evidenceIds: assumptionBound.flatMap((workflow) => workflow.evidenceIds).slice(0, 8),
      recommendation: 'Keep these routes review-gated and do not let an LLM infer missing geometry, loads, groundwater, or standard assumptions.',
    });
  }

  if (blocked.length > 0) {
    push({
      severity: ready.length === 0 && assumptionBound.length === 0 ? 'blocking' : 'warning',
      title: 'Calculation routes blocked',
      detail: `${blocked.length} workflow(s) are blocked by missing evidence: ${blocked.map((workflow) => `${workflow.label} (${workflow.missing.join(', ') || 'required evidence'})`).join('; ')}.`,
      evidenceIds: blocked.flatMap((workflow) => workflow.evidenceIds).slice(0, 8),
      recommendation: 'Collect the missing GroundModel evidence before routing blocked workflows into calculations or FEM drafts.',
    });
  }
}

function addRiskFindings(
  manifest: ProjectManifest,
  push: (finding: Omit<ProjectWorkflowFinding, 'id'>) => void,
): void {
  const model = manifest.groundModel;
  if (!manifest.verifier) {
    push({
      severity: 'blocking',
      title: 'Verifier output missing',
      detail: 'Risk analysis needs GroundModel verifier findings and workflow readiness.',
      evidenceIds: [],
      recommendation: 'Build or refresh GroundModel verification before risk analysis.',
    });
    return;
  }

  addVerifierFindings(manifest.verifier.findings, push, 'risk');
  if (model && model.stats.boreholes > 0 && model.stats.groundwaterObservations === 0) {
    push({
      severity: 'risk',
      title: 'Groundwater data missing',
      detail: 'Borehole evidence exists, but no groundwater observations are bound to evidence.',
      evidenceIds: model.boreholes.flatMap((borehole) => borehole.evidenceIds).slice(0, 8),
      recommendation: 'Confirm groundwater strikes, standpipe readings, or an explicit dry/unknown groundwater assumption before design use.',
    });
  }
}

function addAnomalyFindings(
  manifest: ProjectManifest,
  push: (finding: Omit<ProjectWorkflowFinding, 'id'>) => void,
): void {
  const model = manifest.groundModel;
  if (manifest.summary.supportedFiles < 2) {
    push({
      severity: 'warning',
      title: 'Limited cross-source comparison',
      detail: 'Anomaly detection is stronger when multiple independent files or data tables can be compared.',
      evidenceIds: manifest.files.map((file) => `file:${file.path}`).slice(0, 8),
      recommendation: 'Add AGS, tabular, PDF, or monitoring sources to improve cross-source conflict checks.',
    });
  }

  for (const rejected of model?.rejectedObservations ?? []) {
    push({
      severity: rejected.kind === 'spt' ? 'warning' : 'info',
      title: `Rejected ${rejected.kind} observation`,
      detail: rejected.reason,
      source: rejected.sourcePath,
      evidenceIds: rejected.evidenceIds,
      recommendation: 'Review the source value and confirm whether it is project data or a standards/reference number.',
    });
  }

  addVerifierFindings((manifest.verifier?.findings ?? []).filter((finding) => /duplicate|negative|rejected|missing|conflict/i.test(finding.code)), push);
}

function addRecommendationFindings(
  manifest: ProjectManifest,
  push: (finding: Omit<ProjectWorkflowFinding, 'id'>) => void,
): void {
  const workflows = manifest.verifier?.calculationReadiness.workflows ?? [];
  if (workflows.length === 0) {
    push({
      severity: 'blocking',
      title: 'No calculation readiness routes',
      detail: 'No calculation workflow readiness records are available for recommendation routing.',
      evidenceIds: [],
      recommendation: 'Refresh workspace analysis with GroundModel and calculation readiness enabled.',
    });
    return;
  }

  for (const workflow of workflows.filter((item) => item.status === 'blocked').slice(0, 8)) {
    push({
      severity: 'warning',
      title: `${workflow.label} blocked`,
      detail: `Missing: ${workflow.missing.join(', ') || 'required inputs'}.`,
      evidenceIds: workflow.evidenceIds,
      recommendation: workflow.recommendation,
    });
  }
}

function addSignalAnalysisFindings(
  manifest: ProjectManifest,
  push: (finding: Omit<ProjectWorkflowFinding, 'id'>) => void,
): void {
  const sources = signalAnalysisSources(manifest);
  if (sources.length === 0) {
    push({
      severity: 'blocking',
      title: 'No monitoring or signal files detected',
      detail: 'The workspace manifest does not contain CSV/TSV/XLSX monitoring, signal, piezometer, inclinometer, settlement, vibration, or load-test evidence.',
      evidenceIds: [],
      recommendation: 'Add monitoring or signal files, then run geotech agent --task signal-analysis or geotech signal analyze <file>.',
    });
    return;
  }

  const typeCounts = countBy(sources.map((source) => source.signalType));
  push({
    severity: 'info',
    title: 'Signal analysis sources detected',
    detail: `${sources.length} deterministic signal source(s) are ready for geotech signal analyze: ${Object.entries(typeCounts).map(([type, count]) => `${type}=${count}`).join(', ')}.`,
    evidenceIds: sources.flatMap((source) => source.evidenceIds).slice(0, 8),
    recommendation: 'Run the generated geotech signal analyze commands with project-specific thresholds and expected interval assumptions.',
  });

  if (sources.some((source) => source.signalType === 'unknown')) {
    push({
      severity: 'warning',
      title: 'Some signal source types are uncertain',
      detail: 'At least one monitoring file could not be confidently classified as settlement, piezometer, inclinometer, vibration, or load-test data from filename/schema evidence alone.',
      evidenceIds: sources.filter((source) => source.signalType === 'unknown').flatMap((source) => source.evidenceIds).slice(0, 8),
      recommendation: 'Use --type with geotech signal analyze after confirming the instrument type.',
    });
  }

  push({
    severity: 'warning',
    title: 'Thresholds require project assumptions',
    detail: 'Signal threshold and rate flags are not applied automatically because alarm limits vary by project, instrument, units, and contractual trigger levels.',
    evidenceIds: sources.flatMap((source) => source.evidenceIds).slice(0, 8),
    recommendation: 'Declare project-specific --threshold, --rate-threshold, and --expected-interval-hours values before treating flags as engineering triggers.',
  });

  for (const source of sources.filter((item) => item.warnings.length > 0).slice(0, 6)) {
    push({
      severity: 'warning',
      title: `Signal source warning: ${source.label}`,
      detail: source.warnings.join('; '),
      evidenceIds: source.evidenceIds,
      source: source.file.path,
      recommendation: 'Review this source before relying on trend, rate, or missing-interval output.',
    });
  }
}

function addVisualizationFindings(
  manifest: ProjectManifest,
  push: (finding: Omit<ProjectWorkflowFinding, 'id'>) => void,
): void {
  const model = manifest.groundModel;
  if (!model) {
    push({
      severity: 'blocking',
      title: 'Visualization source model missing',
      detail: 'No GroundModel exists for deterministic project visualization.',
      evidenceIds: [],
      recommendation: 'Add borehole, coordinate, SPT, groundwater, or lab evidence and rerun workspace analysis.',
    });
    return;
  }

  if (!model.map?.points.length) {
    push({
      severity: 'warning',
      title: 'Map visualization gated by coordinates',
      detail: 'GroundModel exists, but no plottable coordinate points were found.',
      evidenceIds: model.boreholes.flatMap((borehole) => borehole.evidenceIds).slice(0, 8),
      recommendation: 'Add borehole coordinate evidence and declare/confirm CRS before map or cross-section output.',
    });
  }
}

function addVerifierFindings(
  findings: GroundModelFinding[],
  push: (finding: Omit<ProjectWorkflowFinding, 'id'>) => void,
  defaultSeverity?: ProjectWorkflowFindingSeverity,
): void {
  for (const finding of findings.slice(0, 12)) {
    push({
      severity: defaultSeverity ?? mapVerifierSeverity(finding.severity),
      title: finding.code.replace(/_/g, ' '),
      detail: finding.message,
      evidenceIds: finding.evidenceIds,
      recommendation: finding.recommendation,
    });
  }
}

function buildActions(manifest: ProjectManifest, task: ProjectWorkflowTask): ProjectWorkflowAction[] {
  const actions: ProjectWorkflowAction[] = [];
  const push = (action: Omit<ProjectWorkflowAction, 'id'>) => {
    actions.push({ id: `action_${String(actions.length + 1).padStart(3, '0')}`, ...action });
  };

  if (task === 'recommendations' || task === 'risk-analysis' || task === 'ground-model' || task === 'calculation-readiness') {
    for (const workflow of manifest.verifier?.calculationReadiness.workflows ?? []) {
      push(actionFromReadiness(workflow));
    }
  }

  if (task === 'data-quality') {
    push({
      label: 'Review workspace manifest and missing data',
      status: manifest.summary.supportedFiles > 0 ? 'ready' : 'blocked',
      missing: manifest.summary.supportedFiles > 0 ? [] : ['supported geotechnical evidence'],
      evidenceIds: manifest.files.map((file) => `file:${file.path}`).slice(0, 8),
      recommendation: manifest.summary.recommendations[0] ?? 'Add recognized project evidence and rerun workspace discovery.',
    });
  }

  if (task === 'anomaly-detection') {
    push({
      label: 'Review rejected observations and verifier findings',
      status: manifest.groundModel?.rejectedObservations.length || manifest.verifier?.findings.length ? 'needs_input' : 'ready',
      missing: manifest.summary.supportedFiles > 1 ? [] : ['multiple comparable evidence sources'],
      evidenceIds: manifest.groundModel?.rejectedObservations.flatMap((item) => item.evidenceIds).slice(0, 8) ?? [],
      recommendation: 'Use source-page/evidence review before promoting anomalies into project decisions.',
    });
  }

  if (task === 'signal-analysis') {
    const sources = signalAnalysisSources(manifest);
    for (const source of sources.slice(0, 12)) {
      push({
        label: `Analyze ${source.label}`,
        status: source.confidence >= 0.6 ? 'ready' : 'needs_input',
        command: source.command,
        missing: source.signalType === 'unknown' ? ['instrument/signal type'] : [],
        evidenceIds: source.evidenceIds,
        recommendation: source.signalType === 'unknown'
          ? 'Confirm instrument type, then rerun with --type before using trend output.'
          : 'Run this deterministic signal analysis command with the generic review profile or replace it with project trigger thresholds before engineering acceptance.',
      });
    }

    if (sources.length === 0) {
      push({
        label: 'Add monitoring or signal data',
        status: 'blocked',
        missing: ['monitoring/signal CSV, TSV, or XLSX evidence'],
        evidenceIds: [],
        recommendation: 'Add settlement, piezometer, inclinometer, vibration, or load-test files before signal analysis.',
      });
    }
  }

  if (task === 'visualization') {
    const charts = buildVisualizationCharts(manifest);
    push({
      label: 'Generate deterministic project visualizations',
      status: charts.length > 0 ? 'ready' : 'blocked',
      missing: charts.length > 0 ? [] : ['GroundModel chart evidence'],
      evidenceIds: manifest.groundModel?.evidence.map((item) => item.id).slice(0, 8) ?? [],
      recommendation: charts.length > 0
        ? 'Render chart specs through the CLI/web visualization layer after CRS and review gates are accepted.'
        : 'Add coordinate, SPT, groundwater, or lab evidence to unlock visualization specs.',
    });
  }

  return actions;
}

function actionFromReadiness(workflow: GroundModelCalculationReadiness): Omit<ProjectWorkflowAction, 'id'> {
  return {
    label: workflow.label,
    status: workflow.status === 'ready' ? 'ready' : workflow.status === 'ready_with_assumptions' ? 'needs_input' : 'blocked',
    command: workflow.commandTemplate,
    missing: workflow.missing,
    evidenceIds: workflow.evidenceIds,
    recommendation: workflow.recommendation,
  };
}

function buildVisualizationCharts(manifest: ProjectManifest): ProjectWorkflowChartSpec[] {
  const model = manifest.groundModel;
  if (!model) return [];

  const charts: ProjectWorkflowChartSpec[] = [];
  if (model.map?.points.length) {
    charts.push({
      id: 'ground-model-map',
      title: 'GroundModel Map',
      kind: 'map',
      xLabel: model.map.coordinateType === 'geographic' ? 'Longitude' : 'Easting / local X',
      yLabel: model.map.coordinateType === 'geographic' ? 'Latitude' : 'Northing / local Y',
      series: [{
        id: 'locations',
        label: 'Investigation locations',
        points: model.map.points.map((point) => ({
          x: point.x,
          y: point.y,
          label: point.label,
          evidenceIds: point.sourceEvidenceIds,
        })),
      }],
      warnings: model.map.warnings,
    });
  }

  const sptSeries = model.boreholes
    .filter((borehole) => borehole.sptTests.length > 0)
    .map((borehole) => ({
      id: `spt-${borehole.id}`,
      label: `${borehole.id} SPT N`,
      points: borehole.sptTests.map((test) => ({
        x: test.nValue,
        y: test.depth,
        label: `${borehole.id} ${test.depth}m`,
        evidenceIds: test.evidenceIds,
      })),
    }));
  if (sptSeries.length > 0) {
    charts.push({
      id: 'spt-depth',
      title: 'SPT N-value by Depth',
      kind: 'xy',
      xLabel: 'SPT N-value',
      yLabel: 'Depth (m)',
      series: sptSeries,
      warnings: [],
    });
  }

  const groundwaterSeries = model.boreholes
    .filter((borehole) => borehole.groundwater.length > 0)
    .map((borehole) => ({
      id: `groundwater-${borehole.id}`,
      label: `${borehole.id} groundwater`,
      points: borehole.groundwater.map((item, index) => ({
        x: index + 1,
        y: item.depth,
        label: `${borehole.id} ${item.depth}m`,
        evidenceIds: item.evidenceIds,
      })),
    }));
  if (groundwaterSeries.length > 0) {
    charts.push({
      id: 'groundwater-depth',
      title: 'Groundwater Observations',
      kind: 'xy',
      xLabel: 'Observation',
      yLabel: 'Depth (m)',
      series: groundwaterSeries,
      warnings: [],
    });
  }

  const labParameters = numericDepthParameters(model).slice(0, 6);
  if (labParameters.length > 0) {
    charts.push({
      id: 'lab-parameters-depth',
      title: 'Lab Parameters by Depth',
      kind: 'xy',
      xLabel: 'Value',
      yLabel: 'Depth (m)',
      series: labParameters.map(([name, parameters]) => ({
        id: `parameter-${slug(name)}`,
        label: name,
        points: parameters.map((parameter) => ({
          x: Number(parameter.value),
          y: parameter.depth ?? 0,
          label: parameter.boreholeId ?? parameter.sampleId,
          evidenceIds: parameter.evidenceIds,
        })),
      })),
      warnings: [],
    });
  }

  return charts;
}

function buildSignalAnalysisCharts(manifest: ProjectManifest): ProjectWorkflowChartSpec[] {
  const sources = signalAnalysisSources(manifest);
  if (sources.length === 0) return [];

  return [{
    id: 'signal-source-coverage',
    title: 'Signal Source Coverage',
    kind: 'table',
    xLabel: 'Source',
    yLabel: 'Sample rows',
    series: [{
      id: 'signal-sources',
      label: 'Monitoring and signal sources',
      points: sources.map((source, index) => ({
        x: index + 1,
        y: source.sampleCount,
        label: `${source.label} (${source.signalType})`,
        evidenceIds: source.evidenceIds,
      })),
    }],
    warnings: sources
      .filter((source) => source.signalType === 'unknown')
      .map((source) => `${source.label}: signal type requires manual confirmation.`),
  }];
}

function numericDepthParameters(model: GroundModel): Array<[string, GroundModelParameter[]]> {
  const grouped = new Map<string, GroundModelParameter[]>();
  for (const parameter of model.parameters) {
    if (typeof parameter.value !== 'number' || parameter.depth == null) continue;
    const group = grouped.get(parameter.name) ?? [];
    group.push(parameter);
    grouped.set(parameter.name, group);
  }
  return [...grouped.entries()].filter(([, parameters]) => parameters.length > 0);
}

function buildSummary(
  manifest: ProjectManifest,
  task: ProjectWorkflowTask,
  status: ProjectWorkflowStatus,
  findings: ProjectWorkflowFinding[],
  actions: ProjectWorkflowAction[],
  charts: ProjectWorkflowChartSpec[],
): string[] {
  const model = manifest.groundModel;
  return [
    `${taskTitle(task)} completed as a deterministic, provider-neutral project workflow with status ${status}.`,
    `Workspace evidence: ${manifest.summary.supportedFiles}/${manifest.summary.totalFiles} supported files, branches ${manifest.summary.branches.join(', ') || 'none'}.`,
    model
      ? `GroundModel evidence: ${model.stats.boreholes} boreholes, ${model.stats.strata} strata, ${model.stats.sptTests} SPT tests, ${model.stats.parameters} parameters, ${model.stats.evidenceRefs} evidence refs.`
      : 'GroundModel evidence is not available in this manifest.',
    `Findings: ${findings.filter((item) => item.severity === 'blocking').length} blocking, ${findings.filter((item) => item.severity === 'risk').length} risk, ${findings.filter((item) => item.severity === 'warning').length} warning, ${findings.filter((item) => item.severity === 'info').length} info.`,
    actions.length > 0 ? `Actions prepared: ${actions.length}.` : 'No downstream action routes were prepared.',
    charts.length > 0 ? `Visualization chart specs prepared: ${charts.length}.` : 'No visualization chart specs were prepared.',
    task === 'signal-analysis'
      ? `Signal sources: ${signalAnalysisSources(manifest).length} monitoring/signal file or sheet source(s) routed to deterministic geotech signal analyze commands.`
      : '',
  ].filter(Boolean);
}

function deriveWorkflowStatus(
  manifest: ProjectManifest,
  findings: ProjectWorkflowFinding[],
  charts: ProjectWorkflowChartSpec[],
  task: ProjectWorkflowTask,
): ProjectWorkflowStatus {
  if (findings.some((finding) => finding.severity === 'blocking')) return 'blocked';
  if (task === 'visualization' && charts.length === 0) return 'blocked';
  if (task === 'signal-analysis' && signalAnalysisSources(manifest).length === 0) return 'blocked';
  if (manifest.verifier?.status === 'blocking') return 'blocked';
  if (findings.some((finding) => finding.severity === 'risk' || finding.severity === 'warning')) return 'review';
  if (manifest.verifier?.status === 'review') return 'review';
  return 'pass';
}

function filesWithWarnings(manifest: ProjectManifest): WorkspaceFileEntry[] {
  return manifest.files.filter((file) => file.classification.warnings.length > 0);
}

function duplicated(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function mapVerifierSeverity(severity: GroundModelFinding['severity']): ProjectWorkflowFindingSeverity {
  if (severity === 'blocking') return 'blocking';
  if (severity === 'review') return 'warning';
  return 'info';
}

function taskTitle(task: ProjectWorkflowTask): string {
  switch (task) {
    case 'data-quality':
      return 'Data quality';
    case 'ground-model':
      return 'Ground-model interpretation';
    case 'calculation-readiness':
      return 'Calculation readiness';
    case 'risk-analysis':
      return 'Risk analysis';
    case 'anomaly-detection':
      return 'Anomaly detection';
    case 'recommendations':
      return 'Recommendations';
    case 'signal-analysis':
      return 'Signal analysis';
    case 'visualization':
      return 'Visualization';
  }
}

interface SignalAnalysisSource {
  file: WorkspaceFileEntry;
  label: string;
  signalType: 'settlement' | 'piezometer' | 'inclinometer' | 'vibration' | 'load-test' | 'unknown';
  sampleCount: number;
  confidence: number;
  evidenceIds: string[];
  warnings: string[];
  command: string;
}

function signalAnalysisSources(manifest: ProjectManifest): SignalAnalysisSource[] {
  const sources: SignalAnalysisSource[] = [];
  const seen = new Set<string>();
  const monitoringBySource = new Map(
    (manifest.groundModel?.monitoringSeries ?? []).map((series) => [
      `${series.sourcePath}#${series.sheetName ?? ''}`,
      series,
    ]),
  );

  for (const file of manifest.files) {
    const schemas = file.schemas ?? [];
    const matchingSchemas = schemas.filter((schema) => isSignalDatasetType(schema.datasetType));

    if (matchingSchemas.length > 0) {
      for (const schema of matchingSchemas) {
        const key = `${file.path}#${schema.sheetName ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const monitoring = monitoringBySource.get(key);
        const type = signalTypeFromSchema(file, schema);
        sources.push({
          file,
          label: schema.sheetName ? `${file.path}#${schema.sheetName}` : file.path,
          signalType: type,
          sampleCount: schema.rowCount,
          confidence: Math.min(file.classification.confidence, schema.confidence),
          evidenceIds: monitoring?.evidenceIds ?? [`file:${file.path}`],
          warnings: [...file.classification.warnings, ...schema.warnings],
          command: buildSignalAnalyzeCommand(file.path, type, schema.sheetName),
        });
      }
      continue;
    }

    if (isSignalDatasetType(file.classification.datasetType)) {
      const key = `${file.path}#`;
      if (seen.has(key)) continue;
      seen.add(key);
      const monitoring = monitoringBySource.get(key);
      const type = signalTypeFromFile(file);
      sources.push({
        file,
        label: file.path,
        signalType: type,
        sampleCount: monitoring?.sampleCount ?? 0,
        confidence: file.classification.confidence,
        evidenceIds: monitoring?.evidenceIds ?? [`file:${file.path}`],
        warnings: file.classification.warnings,
        command: buildSignalAnalyzeCommand(file.path, type),
      });
    }
  }

  return sources;
}

function isSignalDatasetType(datasetType: string): boolean {
  return datasetType === 'monitoring-time-series' || datasetType === 'signal-record' || datasetType === 'pile-load-test';
}

function signalTypeFromSchema(
  file: WorkspaceFileEntry,
  schema: NonNullable<WorkspaceFileEntry['schemas']>[number],
): SignalAnalysisSource['signalType'] {
  if (schema.datasetType === 'pile-load-test' || file.classification.datasetType === 'pile-load-test') return 'load-test';
  const roleSet = new Set(schema.columns.flatMap((column) => column.roles));
  if (roleSet.has('settlement')) return 'settlement';
  if (roleSet.has('pore_pressure')) return 'piezometer';
  if (roleSet.has('inclination')) return 'inclinometer';
  if (roleSet.has('vibration')) return 'vibration';
  return signalTypeFromFile(file);
}

function signalTypeFromFile(file: WorkspaceFileEntry): SignalAnalysisSource['signalType'] {
  const text = [file.path, file.classification.datasetType, ...file.classification.signals].join(' ').toLowerCase();
  if (/\b(load[-_\s]?test|pile[-_\s]?load)\b/.test(text)) return 'load-test';
  if (/\b(settlement|heave|subsidence)\b/.test(text)) return 'settlement';
  if (/\b(piezometer|pore[-_\s]?pressure|groundwater|water[-_\s]?level)\b/.test(text)) return 'piezometer';
  if (/\b(inclinometer|inclination|tilt|deflection)\b/.test(text)) return 'inclinometer';
  if (/\b(vibration|accelerometer|seismic|fft|psd)\b/.test(text)) return 'vibration';
  return 'unknown';
}

function buildSignalAnalyzeCommand(
  path: string,
  type: SignalAnalysisSource['signalType'],
  sheetName?: string,
): string {
  return [
    'geotech signal analyze',
    quoteCommandArg(path),
    sheetName ? `--sheet ${quoteCommandArg(sheetName)}` : '',
    type !== 'unknown' ? `--type ${type}` : '',
    type !== 'unknown' ? '--threshold-profile auto' : '',
  ].filter(Boolean).join(' ');
}

function quoteCommandArg(value: string): string {
  return /^[A-Za-z0-9._/:-]+$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'parameter';
}
