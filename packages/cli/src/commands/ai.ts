import { Command } from 'commander';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import {
  buildLLMConfig,
  DEFAULT_LLM_VISION_MODEL,
  analyzeCoreBox,
  classifyRMRFromImage,
  classifySoilFromDescription,
  ingestBoreholeLogDocument,
  inspectPdfDocument,
  queryGBRDocument,
  interpretSensorImage,
  runAgent,
  runSwarm,
  AgentConversation,
  loadProject,
  getProjectAgentContext,
  addAgentSession,
  addArtifact,
  addNote,
  saveNamedDataset,
  saveDerivedParameter,
  setActiveAnalysisContext,
  generateReport,
  generateReportFromCaseFile,
  buildProjectWorkflowReport,
  renderReportAsPdf,
  renderReportAsDocx,
  buildSwarmSessionProjectRecord,
  persistSwarmCaseFile,
  persistCaseFileEvidence,
  analyzeWorkspace,
  buildGroundModelAgentView,
  formatGroundModelAgentDigest,
  resolveWorkspaceRoot,
  buildProjectWorkflowRouterPrompt,
  generateText,
  routeProjectWorkflowRequest,
  runProjectWorkflow,
  analyzeSignalFile,
  type ProjectManifest,
  type ProjectWorkflowRun,
  type ProjectWorkflowRouteModelCall,
  type ProjectWorkflowRoutePlan,
  type ProjectWorkflowTask,
  type SignalAnalysisType,
  type WorkspaceRoot,
  type GeneratedReport,
  type AgentStep,
  type AgentSession,
  type SwarmStep,
  type SwarmSession,
  type BoreholeInterpretation,
  type BoreholeLayer,
} from '@geotechcli/core';
import { heading, keyValue, renderJSON, renderRichText, success, error, warn, renderTable, info } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import {
  estimateHostedBetaVisionBodyBytes,
  formatByteSize,
  HOSTED_BETA_REQUEST_LIMIT_BYTES,
  readVisionInput,
  readVisionPdfPageInputs,
  resolveStructuredOutputTarget,
  HOSTED_BETA_REQUEST_SAFE_BYTES,
  type VisionInput,
  type VisionPdfPageInput,
} from '../util/vision-output.js';

function summarizeWorkspaceManifestForAgent(manifest: ProjectManifest): string {
  const files = manifest.files
    .slice(0, 18)
    .map((file) => `- ${file.path}: ${file.classification.datasetType} (${file.classification.kind}, ${Math.round(file.classification.confidence * 100)}% confidence)`)
    .join('\n');
  const recommendations = manifest.summary.recommendations.map((item) => `- ${item}`).join('\n');
  const groundModel = manifest.groundModel
    ? [
        'Evidence-bound GroundModel:',
        `- Boreholes: ${manifest.groundModel.stats.boreholes}`,
        `- SPT tests: ${manifest.groundModel.stats.sptTests}`,
        `- Lab tests: ${manifest.groundModel.stats.labTests}`,
        `- Parameters: ${manifest.groundModel.stats.parameters}`,
        `- Evidence refs: ${manifest.groundModel.stats.evidenceRefs}`,
        `- Rejected observations: ${manifest.groundModel.stats.rejectedObservations}`,
      ].join('\n')
    : '';
  const groundModelDigest = manifest.groundModel
    ? formatGroundModelAgentDigest(buildGroundModelAgentView(manifest.groundModel, { section: 'summary', limit: 6 }))
    : '';
  const verifier = manifest.verifier
    ? [
        'Calculation/verifier pre-check:',
        `- Status: ${manifest.verifier.status}`,
        `- Findings: ${manifest.verifier.summary.blocking} blocking, ${manifest.verifier.summary.review} review, ${manifest.verifier.summary.info} info`,
        `- Calculation routes: ${manifest.verifier.calculationReadiness.summary.ready} ready, ${manifest.verifier.calculationReadiness.summary.readyWithAssumptions} assumption-bound, ${manifest.verifier.calculationReadiness.summary.blocked} blocked`,
        ...manifest.verifier.calculationReadiness.workflows.slice(0, 8).map((workflow) => `- ${workflow.workflow}: ${workflow.status}; missing=${workflow.missing.join(', ') || 'none'}; command=${workflow.commandTemplate}`),
        ...manifest.verifier.findings.slice(0, 8).map((finding) => `- ${finding.severity}/${finding.code}: ${finding.message}`),
      ].join('\n')
    : '';

  return [
    'Local workspace manifest:',
    `Root: ${manifest.rootPath}`,
    `Files: ${manifest.summary.totalFiles} total, ${manifest.summary.supportedFiles} supported, ${manifest.summary.tabularFiles} tabular, ${manifest.summary.pdfFiles} PDFs`,
    `Detected branches: ${manifest.summary.branches.join(', ') || 'none'}`,
    groundModel,
    groundModelDigest,
    verifier,
    files ? `Files:\n${files}` : 'Files: none',
    recommendations ? `Recommended next steps:\n${recommendations}` : '',
    manifest.warnings.length > 0 ? `Manifest warnings:\n${manifest.warnings.slice(0, 8).map((warning) => `- ${warning}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function buildAgentRuntimeContext(
  projectContext: Record<string, unknown> | undefined,
  workspaceManifest?: ProjectManifest,
): Record<string, unknown> | undefined {
  if (!projectContext && !workspaceManifest) {
    return undefined;
  }

  return {
    ...(projectContext ?? {}),
    ...(workspaceManifest
      ? {
          workspace: {
            rootPath: workspaceManifest.rootPath,
            requestedBranch: workspaceManifest.requestedBranch,
            requestedStandard: workspaceManifest.requestedStandard,
            summary: workspaceManifest.summary,
            groundModel: workspaceManifest.groundModel ? {
              stats: workspaceManifest.groundModel.stats,
              coordinateSystem: workspaceManifest.groundModel.coordinateSystem,
              digest: buildGroundModelAgentView(workspaceManifest.groundModel, { section: 'summary', limit: 6 }),
            } : undefined,
            verifier: workspaceManifest.verifier,
            warnings: workspaceManifest.warnings,
          },
        }
      : {}),
  };
}

type ProjectAgentTask =
  | 'data-quality'
  | 'ground-model'
  | 'calculation-readiness'
  | 'risk-analysis'
  | 'anomaly-detection'
  | 'recommendations'
  | 'signal-analysis'
  | 'visualization'
  | 'custom-question';

interface ProjectAgentIntent {
  schemaVersion: 'geotech.project-agent-intent.v1';
  source: 'task-option' | 'prompt' | 'discovery';
  type: ProjectAgentTask | 'combined' | 'discovery';
  tasks: ProjectAgentTask[];
  prompt?: string;
}

interface ProjectAwarePlan {
  schemaVersion: 'geotech.project-agent-plan.v1';
  runId: string;
  workspace: WorkspaceRoot & { rootPath: string };
  project: {
    name: string;
    generatedAt: string;
  };
  intent: ProjectAgentIntent;
  executionMode: 'deterministic-workflow' | 'discovery-only' | 'workspace-backed-agent';
  summary: ProjectManifest['summary'];
  readiness: Array<{
    task: ProjectAgentTask;
    label: string;
    status: 'ready' | 'partially_ready' | 'blocked';
    reasons: string[];
    missing: string[];
  }>;
  recommendedNextActions: string[];
  artifacts: {
    project: string;
    manifest: string;
    fileIndex: string;
    evidenceIndex: string;
    readiness: string;
    summary: string;
    memory: string;
    runManifest: string;
    intent: string;
    plan: string;
    trace: string;
    toolCalls: string;
    modelCalls: string;
    workflowRoute: string;
  };
  warnings: string[];
}

const PROJECT_AGENT_TASKS: Array<{ task: ProjectAgentTask; label: string; prompt: string }> = [
  {
    task: 'data-quality',
    label: 'Data inventory and quality report',
    prompt: 'Prepare a project data inventory and quality report from the attached workspace manifest. Focus on missing data, conflicts, duplicate sources, and review gates.',
  },
  {
    task: 'ground-model',
    label: 'Ground-model interpretation',
    prompt: 'Interpret the evidence-bound GroundModel from the attached workspace manifest. Summarize strata, groundwater, uncertainty, and what engineering workflows are ready.',
  },
  {
    task: 'calculation-readiness',
    label: 'Calculation readiness and draft routing',
    prompt: 'Summarize calculation readiness from the attached workspace manifest. Separate ready, assumption-bound, and blocked bearing, settlement, pile, liquefaction, slope, and FEM draft workflows. Recommend only validated deterministic GeotechCLI commands and missing user inputs.',
  },
  {
    task: 'risk-analysis',
    label: 'Risk analysis',
    prompt: 'Prepare a geotechnical risk analysis from the attached workspace manifest. Separate evidence-backed risks from missing-data risks and include review actions.',
  },
  {
    task: 'anomaly-detection',
    label: 'Anomaly detection / data conflicts',
    prompt: 'Find likely geotechnical data anomalies and cross-source conflicts from the attached workspace manifest. Prioritize boreholes, depths, coordinates, groundwater, SPT, and lab values.',
  },
  {
    task: 'recommendations',
    label: 'Preliminary recommendations',
    prompt: 'Prepare preliminary geotechnical recommendations from the attached workspace manifest. Clearly mark what is evidence-backed, assumption-bound, or blocked by missing inputs.',
  },
  {
    task: 'signal-analysis',
    label: 'Signal analysis',
    prompt: 'Route monitoring, instrumentation, settlement, piezometer, inclinometer, vibration, and load-test files into deterministic geotech signal analyze commands. Summarize available sources, missing threshold assumptions, and review gates without inventing signal metrics.',
  },
  {
    task: 'visualization',
    label: 'Visualizations and maps',
    prompt: 'Plan deterministic geotechnical visualizations from the attached workspace manifest. Include maps, strip logs, SPT-depth plots, lab charts, groundwater plots, and blocked CRS/data gates.',
  },
  {
    task: 'custom-question',
    label: 'Ask a custom project question',
    prompt: 'Answer the custom project question using the attached workspace manifest, deterministic tools, source evidence, and review gates.',
  },
];

function safeProjectName(rootPath: string): string {
  const parts = rootPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.at(-1) ?? 'geotech-project';
}

function nowRunId(): string {
  return `run_${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}`;
}

function parsePositiveInteger(value: unknown, optionName: string): number | undefined {
  if (value == null) return undefined;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function isWorkspaceSelectorOnly(rawTask: string): boolean {
  const normalized = rawTask.trim().replace(/\\/g, '/');
  return normalized === '.' || normalized === './';
}

function normalizeProjectTask(value: unknown): ProjectAgentTask | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  switch (normalized) {
    case 'data-quality':
    case 'quality':
    case 'inventory':
      return 'data-quality';
    case 'ground-model':
    case 'interpretation':
    case 'ground-model-interpretation':
      return 'ground-model';
    case 'calculation':
    case 'calculations':
    case 'calculation-readiness':
    case 'calculation-routing':
    case 'calc-readiness':
    case 'design-readiness':
    case 'bearing':
    case 'bearing-capacity':
    case 'settlement':
    case 'pile':
    case 'pile-capacity':
    case 'liquefaction':
    case 'slope':
    case 'slope-stability':
    case 'fem-readiness':
    case 'fem-foundation':
    case 'fem-foundation-settlement':
    case 'fem-excavation':
    case 'fem-excavation-deformation':
    case 'fem-tunnel':
    case 'fem-tunnel-settlement':
    case 'fem-tunnel-volume-loss-settlement':
    case 'fem-shaft':
    case 'fem-shaft-deformation':
    case 'fem-pile-group':
    case 'fem-pile-group-elastic-interaction':
    case 'fem-slope':
    case 'fem-slope-embankment':
    case 'fem-slope-embankment-deformation':
    case 'fem-embankment':
    case 'fem-retaining-wall':
    case 'fem-retaining-wall-excavation-support':
    case 'fem-excavation-support':
    case 'fem-seepage':
    case 'fem-seepage-groundwater-coupling':
    case 'fem-groundwater-coupling':
    case 'fem-staged-settlement':
    case 'fem-staged-settlement-consolidation':
    case 'fem-consolidation':
      return 'calculation-readiness';
    case 'risk':
    case 'risk-analysis':
      return 'risk-analysis';
    case 'anomaly':
    case 'anomaly-detection':
    case 'conflict-detection':
      return 'anomaly-detection';
    case 'recommendation':
    case 'recommendations':
    case 'foundation-recommendations':
      return 'recommendations';
    case 'signal':
    case 'signals':
    case 'signal-analysis':
    case 'signal-analytics':
    case 'monitoring':
    case 'monitoring-analysis':
    case 'time-series':
    case 'timeseries':
    case 'instrumentation':
    case 'piezometer':
    case 'piezometers':
    case 'inclinometer':
    case 'inclinometers':
    case 'vibration':
    case 'load-test':
    case 'load-tests':
    case 'pile-load-test':
      return 'signal-analysis';
    case 'viz':
    case 'visualize':
    case 'visualization':
    case 'visualizations':
      return 'visualization';
    case 'custom':
    case 'custom-question':
      return 'custom-question';
    default:
      return undefined;
  }
}

function projectTaskPrompt(task: ProjectAgentTask, customPrompt?: string): string {
  const taskDef = PROJECT_AGENT_TASKS.find((item) => item.task === task)
    ?? PROJECT_AGENT_TASKS.find((item) => item.task === 'custom-question')
    ?? PROJECT_AGENT_TASKS[0];
  if (task === 'custom-question' && customPrompt?.trim()) {
    return `Project-aware custom question: ${customPrompt.trim()}`;
  }
  return taskDef.prompt;
}

function isDeterministicProjectTask(task: ProjectAgentTask | undefined): task is ProjectWorkflowTask {
  return Boolean(task && task !== 'custom-question');
}

function inferProjectIntent(rawPrompt: string, selectedTask?: ProjectAgentTask): ProjectAgentIntent {
  const prompt = isWorkspaceSelectorOnly(rawPrompt) ? '' : rawPrompt.trim();
  if (selectedTask) {
    return {
      schemaVersion: 'geotech.project-agent-intent.v1',
      source: 'task-option',
      type: selectedTask,
      tasks: [selectedTask],
      prompt: prompt || undefined,
    };
  }
  if (!prompt) {
    return {
      schemaVersion: 'geotech.project-agent-intent.v1',
      source: 'discovery',
      type: 'discovery',
      tasks: [],
    };
  }

  const lower = prompt.toLowerCase();
  const tasks: ProjectAgentTask[] = [];
  const add = (task: ProjectAgentTask, pattern: RegExp) => {
    if (pattern.test(lower)) tasks.push(task);
  };
  add('data-quality', /\b(?:data quality|inventory|missing data|quality report|duplicate)\b/);
  add('ground-model', /\b(?:ground model|interpret|strata|stratigraphy|lithology|hydrogeology)\b/);
  add('calculation-readiness', /\b(?:calculation readiness|calculation route|calculation routing|design readiness|design route|bearing(?: capacity| calculation| readiness)?|settlement(?: calculation| readiness| design| route| workflow)|pile(?: capacity| calculation| readiness)?|liquefaction(?: calculation| readiness)?|slope(?: stability| calculation| readiness)?|fem(?: draft| readiness| foundation settlement| excavation deformation)?|ready for calculation|ready for design)\b/);
  add('risk-analysis', /\b(?:risk|hazard|limitation|uncertainty|mitigation)\b/);
  add('anomaly-detection', /\b(?:anomal\w*|conflict|outlier|inconsistent|inconsistency)\b/);
  add('recommendations', /\b(?:recommend|foundation option|advice|next action)\b/);
  add('signal-analysis', /\b(?:signal analysis|signal analytics|monitoring analysis|time[-\s]?series|instrumentation|piezometer|pore pressure|inclinometer|vibration|accelerometer|settlement monitoring|monitoring trend|threshold|trigger level|load[-\s]?test)\b/);
  add('visualization', /\b(?:visual\w*|map|plot|chart|section|profile|strip log)\b/);

  const uniqueTasks = [...new Set(tasks)];
  if (uniqueTasks.length === 0) {
    return {
      schemaVersion: 'geotech.project-agent-intent.v1',
      source: 'prompt',
      type: 'custom-question',
      tasks: ['custom-question'],
      prompt,
    };
  }
  return {
    schemaVersion: 'geotech.project-agent-intent.v1',
    source: 'prompt',
    type: uniqueTasks.length === 1 ? uniqueTasks[0] : 'combined',
    tasks: uniqueTasks,
    prompt,
  };
}

function projectReadinessFromManifest(manifest: ProjectManifest): ProjectAwarePlan['readiness'] {
  const hasGroundModel = Boolean(manifest.groundModel && manifest.groundModel.stats.evidenceRefs > 0);
  const hasCoordinates = Boolean(manifest.groundModel?.map?.points?.length);
  const hasVerifier = Boolean(manifest.verifier);
  const signalSources = (manifest.summary.datasetTypes['monitoring-time-series'] ?? 0)
    + (manifest.summary.datasetTypes['signal-record'] ?? 0)
    + (manifest.summary.datasetTypes['pile-load-test'] ?? 0);
  const calculationWorkflows = manifest.verifier?.calculationReadiness.workflows ?? [];
  const readyWorkflowCount = calculationWorkflows.filter((workflow) => workflow.status !== 'blocked').length;
  const verifierMissing = calculationWorkflows.flatMap((workflow) => workflow.missing).slice(0, 8);
  const supportedFiles = manifest.summary.supportedFiles;

  return [
    {
      task: 'data-quality',
      label: 'Data inventory and quality report',
      status: supportedFiles > 0 ? 'ready' : 'blocked',
      reasons: supportedFiles > 0
        ? [`${supportedFiles} supported project file(s) indexed.`]
        : ['No supported geotechnical files were indexed.'],
      missing: supportedFiles > 0 ? [] : ['supported geotechnical files'],
    },
    {
      task: 'ground-model',
      label: 'Ground-model interpretation',
      status: hasGroundModel ? 'ready' : supportedFiles > 0 ? 'partially_ready' : 'blocked',
      reasons: hasGroundModel
        ? [`GroundModel has ${manifest.groundModel?.stats.boreholes ?? 0} borehole(s), ${manifest.groundModel?.stats.strata ?? 0} strata, and ${manifest.groundModel?.stats.evidenceRefs ?? 0} evidence refs.`]
        : ['GroundModel evidence is not yet sufficient for interpretation.'],
      missing: hasGroundModel ? [] : ['borehole/strata evidence'],
    },
    {
      task: 'risk-analysis',
      label: 'Risk analysis',
      status: hasVerifier ? 'ready' : hasGroundModel ? 'partially_ready' : 'blocked',
      reasons: hasVerifier
        ? [`Verifier status is ${manifest.verifier?.status}; ${manifest.verifier?.summary.review ?? 0} review finding(s), ${manifest.verifier?.summary.blocking ?? 0} blocker(s).`]
        : ['Risk analysis needs GroundModel verification output.'],
      missing: hasVerifier ? verifierMissing : ['GroundModel verifier output'],
    },
    {
      task: 'calculation-readiness',
      label: 'Calculation readiness and draft routing',
      status: readyWorkflowCount > 0 ? 'partially_ready' : hasVerifier ? 'blocked' : 'blocked',
      reasons: hasVerifier
        ? [`${readyWorkflowCount} calculation workflow(s) are ready or assumption-bound; ${calculationWorkflows.filter((workflow) => workflow.status === 'blocked').length} blocked.`]
        : ['Calculation readiness needs GroundModel verifier output.'],
      missing: hasVerifier ? verifierMissing : ['GroundModel verifier output'],
    },
    {
      task: 'anomaly-detection',
      label: 'Anomaly detection / data conflicts',
      status: supportedFiles > 1 ? 'partially_ready' : 'blocked',
      reasons: supportedFiles > 1
        ? [`${supportedFiles} supported file(s) can be compared for cross-source conflicts.`]
        : ['Anomaly detection needs multiple comparable evidence sources.'],
      missing: supportedFiles > 1 ? [] : ['multiple comparable files'],
    },
    {
      task: 'recommendations',
      label: 'Preliminary recommendations',
      status: readyWorkflowCount > 0 ? 'partially_ready' : 'blocked',
      reasons: readyWorkflowCount > 0
        ? [`${readyWorkflowCount} calculation workflow(s) are ready or ready with assumptions.`]
        : ['No downstream calculation workflow is ready yet.'],
      missing: verifierMissing,
    },
    {
      task: 'signal-analysis',
      label: 'Signal analysis',
      status: signalSources > 0 ? 'partially_ready' : 'blocked',
      reasons: signalSources > 0
        ? [`${signalSources} monitoring/signal/load-test source(s) can be routed into deterministic signal analysis.`]
        : ['Signal analysis needs settlement, piezometer, inclinometer, vibration, load-test, or time-series data.'],
      missing: signalSources > 0 ? ['project-specific thresholds / trigger levels'] : ['monitoring/signal CSV, TSV, or XLSX files'],
    },
    {
      task: 'visualization',
      label: 'Visualizations and maps',
      status: hasCoordinates || hasGroundModel ? 'partially_ready' : 'blocked',
      reasons: hasCoordinates
        ? [`${manifest.groundModel?.map?.points?.length ?? 0} mapped GroundModel point(s) available.`]
        : hasGroundModel
          ? ['GroundModel evidence can support strip logs and charts; map output still needs coordinate evidence.']
          : ['Visualization needs GroundModel or coordinate evidence.'],
      missing: hasCoordinates ? [] : ['validated coordinates / CRS evidence'],
    },
  ];
}

function renderProjectSummaryMarkdown(plan: ProjectAwarePlan): string {
  return [
    `# ${plan.project.name} Project Context`,
    '',
    `Generated: ${plan.project.generatedAt}`,
    `Workspace: ${plan.workspace.rootPath}`,
    '',
    '## Inventory',
    '',
    `- Files: ${plan.summary.totalFiles}`,
    `- Supported: ${plan.summary.supportedFiles}`,
    `- PDFs: ${plan.summary.pdfFiles}`,
    `- Images: ${plan.summary.imageFiles}`,
    `- Tabular files: ${plan.summary.tabularFiles}`,
    `- Branches: ${plan.summary.branches.join(', ') || 'none'}`,
    '',
    '## Readiness',
    '',
    ...plan.readiness.map((item) => `- ${item.label}: ${item.status}${item.missing.length ? ` (missing: ${item.missing.join(', ')})` : ''}`),
    '',
    '## Recommended Next Actions',
    '',
    ...plan.recommendedNextActions.map((item) => `- ${item}`),
  ].join('\n');
}

function buildProjectAwarePlan(
  manifest: ProjectManifest,
  options: {
    workspace: WorkspaceRoot;
    executionMode: ProjectAwarePlan['executionMode'];
    intent: ProjectAgentIntent;
    runId?: string;
  },
): ProjectAwarePlan {
  const rootPath = resolve(options.workspace.path);
  const runId = options.runId ?? nowRunId();
  const geotechDir = join(rootPath, '.geotech');
  const readiness = projectReadinessFromManifest(manifest);
  const recommendedNextActions = readiness
    .filter((item) => item.status !== 'blocked')
    .slice(0, 6)
    .map((item) => item.label);

  return {
    schemaVersion: 'geotech.project-agent-plan.v1',
    runId,
    workspace: {
      ...options.workspace,
      rootPath,
    },
    project: {
      name: safeProjectName(rootPath),
      generatedAt: new Date().toISOString(),
    },
    intent: options.intent,
    executionMode: options.executionMode,
    summary: manifest.summary,
    readiness,
    recommendedNextActions,
    artifacts: {
      project: join(geotechDir, 'project.json'),
      manifest: join(geotechDir, 'manifest.json'),
      fileIndex: join(geotechDir, 'evidence', 'file_index.jsonl'),
      evidenceIndex: join(geotechDir, 'evidence', 'evidence_index.jsonl'),
      readiness: join(geotechDir, 'context', 'readiness.json'),
      summary: join(geotechDir, 'context', 'project_summary.md'),
      memory: join(geotechDir, 'context', 'memory.json'),
      runManifest: join(geotechDir, 'runs', runId, 'run_manifest.json'),
      intent: join(geotechDir, 'runs', runId, 'intent.json'),
      plan: join(geotechDir, 'runs', runId, 'plan.json'),
      trace: join(geotechDir, 'runs', runId, 'trace.json'),
      toolCalls: join(geotechDir, 'runs', runId, 'tool_calls.jsonl'),
      modelCalls: join(geotechDir, 'runs', runId, 'model_calls.jsonl'),
      workflowRoute: join(geotechDir, 'runs', runId, 'workflow_route.json'),
    },
    warnings: [
      ...manifest.warnings,
      options.executionMode === 'discovery-only'
        ? 'Project-aware agent plan is deterministic workspace context only; no LLM workflow was executed.'
        : options.executionMode === 'deterministic-workflow'
          ? 'Selected project-aware task will execute through a deterministic provider-neutral workflow before any optional LLM review.'
        : 'Project-aware agent plan was written before the selected workspace-backed LLM task executed.',
    ],
  };
}

function jsonl(rows: unknown[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : '');
}

function buildFileIndexRows(manifest: ProjectManifest): unknown[] {
  return manifest.files.map((file, index) => ({
    schemaVersion: 'geotech.project-file-index.v1',
    id: `file_${String(index + 1).padStart(4, '0')}`,
    path: file.path,
    name: file.name,
    kind: file.classification.kind,
    datasetType: file.classification.datasetType,
    branches: file.classification.branches,
    confidence: file.classification.confidence,
    sizeBytes: file.sizeBytes,
    modifiedAt: file.modifiedAt,
  }));
}

function buildEvidenceIndexRows(manifest: ProjectManifest): unknown[] {
  const fileRows = manifest.files.map((file, index) => ({
    schemaVersion: 'geotech.project-evidence-index.v1',
    id: `ev_file_${String(index + 1).padStart(4, '0')}`,
    type: 'workspace-file',
    source: file.path,
    method: 'workspace.scan',
    confidence: file.classification.confidence,
    summary: `${file.classification.datasetType} (${file.classification.kind})`,
    branches: file.classification.branches,
    warnings: file.classification.warnings,
  }));
  const groundModel = manifest.groundModel
    ? [{
        schemaVersion: 'geotech.project-evidence-index.v1',
        id: 'ev_ground_model_summary',
        type: 'ground-model-summary',
        source: 'manifest.groundModel',
        method: 'groundModel.buildFromManifest',
        confidence: manifest.groundModel.stats.evidenceRefs > 0 ? 0.8 : 0.3,
        summary: `${manifest.groundModel.stats.boreholes} borehole(s), ${manifest.groundModel.stats.strata} strata, ${manifest.groundModel.stats.parameters} parameter(s), ${manifest.groundModel.stats.evidenceRefs} evidence ref(s)`,
        warnings: manifest.groundModel.warnings,
      }]
    : [];
  return [...fileRows, ...groundModel];
}

function writeProjectAwareState(plan: ProjectAwarePlan, manifest: ProjectManifest): void {
  for (const dir of [
    join(plan.workspace.rootPath, '.geotech'),
    join(plan.workspace.rootPath, '.geotech', 'evidence'),
    join(plan.workspace.rootPath, '.geotech', 'context'),
    join(plan.workspace.rootPath, '.geotech', 'runs', plan.runId),
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  const projectJson = {
    schemaVersion: 'geotech.project.v1',
    projectId: plan.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'geotech-project',
    name: plan.project.name,
    root: plan.workspace.rootPath,
    createdAt: plan.project.generatedAt,
    updatedAt: plan.project.generatedAt,
    workspace: plan.workspace,
  };
  const runManifest = {
    schemaVersion: 'geotech.project-agent-run.v1',
    runId: plan.runId,
    createdAt: plan.project.generatedAt,
    workspace: plan.workspace,
    intent: plan.intent,
    executionMode: plan.executionMode,
    artifacts: plan.artifacts,
  };
  const toolCalls = [
    { type: 'tool_call', tool: 'workspace.resolve_root', status: 'pass', output: plan.workspace },
    { type: 'tool_call', tool: 'analyzeWorkspace', status: 'pass', output: plan.artifacts.manifest },
    { type: 'tool_call', tool: 'projectReadinessFromManifest', status: 'pass', output: plan.artifacts.readiness },
    { type: 'tool_call', tool: 'project.write_file_index', status: 'pass', output: plan.artifacts.fileIndex },
    { type: 'tool_call', tool: 'project.write_evidence_index', status: 'pass', output: plan.artifacts.evidenceIndex },
  ];
  const modelCalls = plan.executionMode === 'workspace-backed-agent'
    ? [{ type: 'model_call', status: 'planned', purpose: 'workspace-backed-agent-task', intent: plan.intent.type }]
    : [];
  const trace = {
    schemaVersion: 'geotech.project-agent-trace.v1',
    runId: plan.runId,
    workspace: plan.workspace.rootPath,
    intent: plan.intent,
    steps: [
      ...toolCalls,
      plan.executionMode === 'discovery-only'
        ? { type: 'review_gate', status: 'pending', message: 'User must select a workflow before model-heavy or write-heavy actions execute.' }
        : plan.executionMode === 'deterministic-workflow'
          ? { type: 'tool_call', status: 'planned', message: 'Selected project-aware task will execute through a deterministic provider-neutral workflow.' }
          : { type: 'model_call', status: 'planned', message: 'Selected project-aware task will execute through the existing workspace-backed agent path.' },
    ],
  };
  const memory = {
    schemaVersion: 'geotech.project-memory.v1',
    assumptions: [],
    decisions: [],
    userPreferences: {},
    notes: [
      'Project memory stores only confirmed assumptions, decisions, and preferences. Raw documents and secrets are not stored here.',
    ],
  };

  writeFileSync(plan.artifacts.project, JSON.stringify(projectJson, null, 2), 'utf-8');
  writeFileSync(plan.artifacts.manifest, JSON.stringify(manifest, null, 2), 'utf-8');
  writeFileSync(plan.artifacts.fileIndex, jsonl(buildFileIndexRows(manifest)), 'utf-8');
  writeFileSync(plan.artifacts.evidenceIndex, jsonl(buildEvidenceIndexRows(manifest)), 'utf-8');
  writeFileSync(plan.artifacts.readiness, JSON.stringify({
    schemaVersion: 'geotech.workflow_readiness.v1',
    generatedAt: plan.project.generatedAt,
    workflows: plan.readiness,
  }, null, 2), 'utf-8');
  writeFileSync(plan.artifacts.summary, renderProjectSummaryMarkdown(plan), 'utf-8');
  if (!existsSync(plan.artifacts.memory)) {
    writeFileSync(plan.artifacts.memory, JSON.stringify(memory, null, 2), 'utf-8');
  }
  writeFileSync(plan.artifacts.runManifest, JSON.stringify(runManifest, null, 2), 'utf-8');
  writeFileSync(plan.artifacts.intent, JSON.stringify(plan.intent, null, 2), 'utf-8');
  writeFileSync(plan.artifacts.plan, JSON.stringify(plan, null, 2), 'utf-8');
  writeFileSync(plan.artifacts.trace, JSON.stringify(trace, null, 2), 'utf-8');
  writeFileSync(plan.artifacts.toolCalls, jsonl(toolCalls), 'utf-8');
  writeFileSync(plan.artifacts.modelCalls, jsonl(modelCalls), 'utf-8');
}

function relativeArtifactPath(rootPath: string, filePath: string): string {
  const rel = relative(rootPath, filePath);
  return rel && !rel.startsWith('..') ? rel : filePath;
}

type SignalWorkflowSource = {
  file: ProjectManifest['files'][number];
  label: string;
  signalType: SignalAnalysisType;
  sheetName?: string;
};

const SIGNAL_WORKFLOW_DATASET_TYPES = new Set(['monitoring-time-series', 'signal-record', 'pile-load-test']);

function detectSignalWorkflowSources(manifest: ProjectManifest): SignalWorkflowSource[] {
  const sources: SignalWorkflowSource[] = [];
  const seen = new Set<string>();

  for (const file of manifest.files) {
    const schemas = file.schemas ?? [];
    const matchingSchemas = schemas.filter((schema) => SIGNAL_WORKFLOW_DATASET_TYPES.has(schema.datasetType));
    if (matchingSchemas.length > 0) {
      for (const schema of matchingSchemas) {
        const key = `${file.absolutePath}#${schema.sheetName ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push({
          file,
          label: schema.sheetName ? `${file.path}#${schema.sheetName}` : file.path,
          signalType: inferSignalWorkflowType(file, schema),
          sheetName: schema.sheetName,
        });
      }
      continue;
    }

    if (SIGNAL_WORKFLOW_DATASET_TYPES.has(file.classification.datasetType)) {
      const key = `${file.absolutePath}#`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        file,
        label: file.path,
        signalType: inferSignalWorkflowType(file),
      });
    }
  }

  return sources;
}

function inferSignalWorkflowType(
  file: ProjectManifest['files'][number],
  schema?: NonNullable<ProjectManifest['files'][number]['schemas']>[number],
): SignalAnalysisType {
  if (schema?.datasetType === 'pile-load-test' || file.classification.datasetType === 'pile-load-test') return 'load-test';
  const roles = new Set(schema?.columns.flatMap((column) => column.roles) ?? []);
  if (roles.has('settlement')) return 'settlement';
  if (roles.has('pore_pressure')) return 'piezometer';
  if (roles.has('inclination')) return 'inclinometer';
  if (roles.has('vibration')) return 'vibration';

  const text = [file.path, file.classification.datasetType, ...file.classification.signals].join(' ').toLowerCase();
  if (/\b(load[-_\s]?test|pile[-_\s]?load)\b/.test(text)) return 'load-test';
  if (/\b(settlement|heave|subsidence)\b/.test(text)) return 'settlement';
  if (/\b(piezometer|pore[-_\s]?pressure|groundwater|water[-_\s]?level)\b/.test(text)) return 'piezometer';
  if (/\b(inclinometer|inclination|tilt|deflection)\b/.test(text)) return 'inclinometer';
  if (/\b(vibration|accelerometer|seismic|fft|psd)\b/.test(text)) return 'vibration';
  return 'unknown';
}

function signalArtifactSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'signal';
}

async function persistSignalAnalysisArtifacts(options: {
  plan: ProjectAwarePlan;
  manifest: ProjectManifest;
  workflowRun: ProjectWorkflowRun;
  runDir: string;
}): Promise<void> {
  if (options.workflowRun.task !== 'signal-analysis') return;

  const sources = detectSignalWorkflowSources(options.manifest).slice(0, 12);
  if (sources.length === 0) return;

  const signalDir = join(options.runDir, 'signals');
  mkdirSync(signalDir, { recursive: true });
  const indexEntries: Array<Record<string, unknown>> = [];
  let successCount = 0;
  let failureCount = 0;

  for (const [index, source] of sources.entries()) {
    const artifactPath = join(
      signalDir,
      `${String(index + 1).padStart(2, '0')}-${signalArtifactSlug(source.label)}.analysis.json`,
    );
    const analyzeOptions = {
      ...(source.signalType !== 'unknown' ? { type: source.signalType } : {}),
      ...(source.sheetName ? { sheetName: source.sheetName } : {}),
      sourcePath: source.file.path,
      maxRows: 5000,
    };

    try {
      const result = await analyzeSignalFile(source.file.absolutePath, analyzeOptions);
      writeFileSync(artifactPath, JSON.stringify(result, null, 2), 'utf-8');
      successCount += 1;

      const relativePath = relativeArtifactPath(options.plan.workspace.rootPath, artifactPath);
      const status = result.warnings.length > 0 ? 'review' : 'pass';
      indexEntries.push({
        source: source.file.path,
        sheetName: source.sheetName,
        status,
        signalType: result.signalType,
        rowsAnalyzed: result.source.rowsAnalyzed,
        rowsRejected: result.source.rowsRejected,
        series: result.series.length,
        thresholdFlags: result.thresholdFlags.length,
        missingIntervals: result.missingIntervals.length,
        warnings: result.warnings,
        artifact: relativePath,
      });
      options.workflowRun.artifacts.push({
        kind: 'json',
        path: relativePath,
        description: `Deterministic signal analysis for ${source.label}`,
      });
      options.workflowRun.trace.steps.push({
        type: 'tool_call',
        name: 'signal.analyze_file',
        status,
        detail: `Analyzed ${source.label} into ${relativePath}.`,
      });
      options.workflowRun.toolCalls.push({
        type: 'tool_call',
        tool: 'signal.analyze_file',
        status,
        summary: `Analyzed ${source.label}: ${result.source.rowsAnalyzed} rows, ${result.series.length} series, ${result.thresholdFlags.length} threshold flag(s), ${result.missingIntervals.length} missing interval(s).`,
      });
    } catch (err) {
      failureCount += 1;
      const message = err instanceof Error ? err.message : String(err);
      indexEntries.push({
        source: source.file.path,
        sheetName: source.sheetName,
        status: 'blocked',
        signalType: source.signalType,
        error: message,
      });
      options.workflowRun.trace.steps.push({
        type: 'tool_call',
        name: 'signal.analyze_file',
        status: 'blocked',
        detail: `Could not analyze ${source.label}: ${message}`,
      });
      options.workflowRun.toolCalls.push({
        type: 'tool_call',
        tool: 'signal.analyze_file',
        status: 'blocked',
        summary: `Could not analyze ${source.label}: ${message}`,
      });
    }
  }

  if (failureCount > 0) {
    options.workflowRun.status = successCount > 0 && options.workflowRun.status !== 'blocked' ? 'review' : 'blocked';
  }

  const indexPath = join(signalDir, 'index.json');
  const indexPayload = {
    schemaVersion: 'geotech.signal-analysis-artifact-index.v1',
    generatedAt: options.workflowRun.generatedAt,
    runId: options.workflowRun.runId,
    task: options.workflowRun.task,
    sources: indexEntries,
  };
  writeFileSync(indexPath, JSON.stringify(indexPayload, null, 2), 'utf-8');
  const relativeIndexPath = relativeArtifactPath(options.plan.workspace.rootPath, indexPath);
  options.workflowRun.artifacts.push({
    kind: 'json',
    path: relativeIndexPath,
    description: 'Deterministic signal analysis artifact index',
  });
  options.workflowRun.summary.push(`Signal analyses persisted: ${successCount}/${sources.length} source(s) under ${relativeArtifactPath(options.plan.workspace.rootPath, signalDir)}.`);
  options.workflowRun.toolCalls.push({
    type: 'tool_call',
    tool: 'signal.analysis_artifacts',
    status: failureCount > 0 ? 'review' : 'pass',
    summary: `Persisted ${successCount}/${sources.length} deterministic signal analysis artifact(s).`,
  });
}

async function requestProjectWorkflowRouteProposal(options: {
  prompt: string;
  manifest: ProjectManifest;
  config: ReturnType<typeof buildLLMConfig> & { skillsEnabled?: boolean };
}): Promise<{ selection?: string; modelCall: ProjectWorkflowRouteModelCall }> {
  const routePrompt = buildProjectWorkflowRouterPrompt({
    prompt: options.prompt,
    manifest: options.manifest,
    providerConfig: {
      provider: options.config.provider,
      modelId: options.config.modelId,
      visionModelId: options.config.visionModelId,
    },
    compact: true,
  });
  const startedAt = Date.now();

  try {
    const response = await generateText(routePrompt, options.config, {
      temperature: 0,
      maxTokens: 500,
      jsonMode: true,
      thinkingMode: 'disabled',
    });
    return {
      selection: response.text,
      modelCall: {
        type: 'model_call',
        purpose: 'project-workflow-router',
        status: 'pass',
        provider: response.provider,
        model: response.model,
        latencyMs: response.latencyMs,
        usage: response.usage,
        promptChars: routePrompt.length,
        outputChars: response.text.length,
      },
    };
  } catch (err) {
    return {
      modelCall: {
        type: 'model_call',
        purpose: 'project-workflow-router',
        status: 'failed',
        provider: options.config.provider,
        model: options.config.modelId,
        latencyMs: Date.now() - startedAt,
        promptChars: routePrompt.length,
        outputChars: 0,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function renderProjectAwarePlan(plan: ProjectAwarePlan, flags: { json?: boolean; quiet?: boolean }): void {
  if (flags.json) {
    renderJSON(plan);
    return;
  }
  if (flags.quiet) {
    console.log(plan.runId);
    return;
  }

  heading('Project-Aware Agent Plan');
  keyValue('Workspace', plan.workspace.rootPath);
  keyValue('Detected by', plan.workspace.detectedBy);
  keyValue('Intent', plan.intent.type);
  keyValue('Files', `${plan.summary.totalFiles} total, ${plan.summary.supportedFiles} supported`);
  keyValue('Branches', plan.summary.branches.join(', ') || 'none');
  console.log('');
  console.log(chalk.bold('Ready workflows'));
  for (const [index, item] of plan.readiness.entries()) {
    const status = item.status === 'ready'
      ? chalk.green(item.status)
      : item.status === 'partially_ready'
        ? chalk.yellow(item.status)
        : chalk.red(item.status);
    console.log(`  ${index + 1}. ${item.label} - ${status}`);
    for (const reason of item.reasons.slice(0, 2)) {
      console.log(chalk.gray(`     ${reason}`));
    }
    if (item.missing.length > 0) {
      console.log(chalk.gray(`     Missing: ${item.missing.join(', ')}`));
    }
  }
  console.log('');
  warn('No model-heavy workflow has run yet. Choose a task with --task, or ask a project question with --workspace.');
  console.log(chalk.gray('  Next actions: geotech agent --task data-quality | --task ground-model | --task calculation-readiness | --task risk-analysis | --task anomaly-detection | --task recommendations | --task signal-analysis | --task visualization'));
  success(`Project state written to ${relativeArtifactPath(plan.workspace.rootPath, join(plan.workspace.rootPath, '.geotech'))}`);
}

async function renderAndPersistProjectWorkflow(
  plan: ProjectAwarePlan,
  manifest: ProjectManifest,
  task: ProjectWorkflowTask,
  flags: ReturnType<typeof getGlobalFlags>,
): Promise<void> {
  const workflowRun = runProjectWorkflow({
    manifest,
    task,
    runId: plan.runId,
    now: plan.project.generatedAt,
  });
  const runDir = join(plan.workspace.rootPath, '.geotech', 'runs', plan.runId);
  const resultPath = join(runDir, 'workflow_result.json');
  const reportPath = join(runDir, 'workflow_report.md');
  const tracePath = join(runDir, 'workflow_trace.json');
  await persistSignalAnalysisArtifacts({ plan, manifest, workflowRun, runDir });
  const report = buildProjectWorkflowReport(workflowRun);

  writeFileSync(resultPath, JSON.stringify(workflowRun, null, 2), 'utf-8');
  writeFileSync(reportPath, report.fullMarkdown, 'utf-8');
  writeFileSync(tracePath, JSON.stringify(workflowRun.trace, null, 2), 'utf-8');
  appendFileSync(plan.artifacts.toolCalls, jsonl(workflowRun.toolCalls), 'utf-8');
  writeFileSync(plan.artifacts.modelCalls, '', 'utf-8');

  if (flags.output) {
    const outputTarget = resolveStructuredOutputTarget({
      outputPath: flags.output,
      defaultBaseName: `project-${task}`,
    });

    if (outputTarget.warning && !flags.json && !flags.quiet) {
      warn(outputTarget.warning);
    }

    if (outputTarget.kind === 'pdf' || outputTarget.kind === 'docx') {
      const buffer = outputTarget.kind === 'pdf'
        ? await renderReportAsPdf(report)
        : await renderReportAsDocx(report);
      writeFileSync(outputTarget.outputPath, buffer);
    } else {
      writeFileSync(outputTarget.outputPath, report.fullMarkdown, 'utf-8');
    }

    if (!flags.json && !flags.quiet) {
      success(`Project workflow output saved to ${outputTarget.outputPath}`);
    }
  }

  if (flags.json) {
    renderJSON({
      mode: 'deterministic-project-workflow',
      task,
      workflow: workflowRun,
      artifacts: {
        result: relativeArtifactPath(plan.workspace.rootPath, resultPath),
        report: relativeArtifactPath(plan.workspace.rootPath, reportPath),
        trace: relativeArtifactPath(plan.workspace.rootPath, tracePath),
      },
    });
    return;
  }

  if (flags.quiet) {
    console.log(plan.runId);
    return;
  }

  heading('Project Workflow Report');
  renderRichText(report.fullMarkdown);
  console.log('');
  success(`Deterministic workflow artifacts written to ${relativeArtifactPath(plan.workspace.rootPath, runDir)}`);
  warn('No LLM/provider call was made. Use this output as a traceable review package, not final engineering design.');
}

async function renderAndPersistProjectWorkflowRoute(
  plan: ProjectAwarePlan,
  manifest: ProjectManifest,
  route: ProjectWorkflowRoutePlan,
  flags: ReturnType<typeof getGlobalFlags>,
): Promise<void> {
  const parentRunDir = join(plan.workspace.rootPath, '.geotech', 'runs', plan.runId);
  mkdirSync(parentRunDir, { recursive: true });
  writeFileSync(plan.artifacts.workflowRoute, JSON.stringify(route, null, 2), 'utf-8');

  const routeToolCall = {
    type: 'tool_call',
    tool: 'project.workflow_router',
    status: route.executionMode === 'deterministic-sequence' ? 'pass' : 'review',
    summary: route.executionMode === 'deterministic-sequence'
      ? `Router selected deterministic workflow task(s): ${route.tasks.join(', ')}.`
      : 'Router could not select deterministic workflow tasks; custom question handling required.',
  };
  appendFileSync(plan.artifacts.toolCalls, jsonl([routeToolCall]), 'utf-8');
  writeFileSync(plan.artifacts.modelCalls, route.modelCalls.length > 0 ? jsonl(route.modelCalls) : '', 'utf-8');

  const workflowOutputs: Array<{
    task: ProjectWorkflowTask;
    runId: string;
    resultPath: string;
    reportPath: string;
    tracePath: string;
    report: GeneratedReport;
  }> = [];

  for (const task of route.tasks) {
    const workflowRunId = route.tasks.length === 1 ? plan.runId : `${plan.runId}_${task}`;
    const workflowRun = runProjectWorkflow({
      manifest,
      task,
      runId: workflowRunId,
      now: plan.project.generatedAt,
    });
    const runDir = join(plan.workspace.rootPath, '.geotech', 'runs', workflowRun.runId);
    mkdirSync(runDir, { recursive: true });
    const resultPath = join(runDir, 'workflow_result.json');
    const reportPath = join(runDir, 'workflow_report.md');
    const tracePath = join(runDir, 'workflow_trace.json');
    await persistSignalAnalysisArtifacts({ plan, manifest, workflowRun, runDir });
    const report = buildProjectWorkflowReport(workflowRun);

    writeFileSync(resultPath, JSON.stringify(workflowRun, null, 2), 'utf-8');
    writeFileSync(reportPath, report.fullMarkdown, 'utf-8');
    writeFileSync(tracePath, JSON.stringify(workflowRun.trace, null, 2), 'utf-8');
    appendFileSync(plan.artifacts.toolCalls, jsonl(workflowRun.toolCalls), 'utf-8');

    workflowOutputs.push({
      task,
      runId: workflowRun.runId,
      resultPath,
      reportPath,
      tracePath,
      report,
    });
  }

  const combinedMarkdown = [
    '# Project Workflow Route Report',
    '',
    `Prompt: ${route.prompt || '(none)'}`,
    `Route: ${route.tasks.join(', ') || 'needs selection'}`,
    `Confidence: ${Math.round(route.confidence * 100)}%`,
    `Selection source: ${route.selectionSource}`,
    '',
    '## Router Rationale',
    '',
    ...route.rationale.map((item) => `- ${item}`),
    route.rejectedTasks.length > 0 ? '' : undefined,
    route.rejectedTasks.length > 0 ? '## Rejected Route Items' : undefined,
    ...route.rejectedTasks.map((item) => `- ${item.value}: ${item.reason}`),
    '',
    '## Deterministic Workflow Outputs',
    '',
    ...workflowOutputs.flatMap((output) => [
      `### ${output.task}`,
      '',
      `Run: ${output.runId}`,
      `Artifacts: ${relativeArtifactPath(plan.workspace.rootPath, output.resultPath)}, ${relativeArtifactPath(plan.workspace.rootPath, output.reportPath)}`,
      '',
      output.report.fullMarkdown,
      '',
    ]),
    '## Boundary',
    '',
    'The workflow route contract allows only task selection and review. GeotechCLI deterministic executors own calculations, FEM cases, validation, confidence, and persisted artifacts.',
  ].filter((item): item is string => typeof item === 'string').join('\n');

  const combinedReport: GeneratedReport = {
    title: 'Project Workflow Route Report',
    sections: [
      { title: 'Router Rationale', content: route.rationale.join('\n') },
      { title: 'Deterministic Workflow Outputs', content: workflowOutputs.map((output) => `${output.task}: ${output.report.title}`).join('\n') },
    ],
    fullMarkdown: combinedMarkdown,
    latencyMs: workflowOutputs.reduce((total, output) => total + output.report.latencyMs, 0),
  };
  const combinedReportPath = join(parentRunDir, 'workflow_route_report.md');
  writeFileSync(combinedReportPath, combinedReport.fullMarkdown, 'utf-8');

  if (flags.output) {
    const outputTarget = resolveStructuredOutputTarget({
      outputPath: flags.output,
      defaultBaseName: 'project-workflow-route',
    });

    if (outputTarget.warning && !flags.json && !flags.quiet) {
      warn(outputTarget.warning);
    }

    if (outputTarget.kind === 'pdf' || outputTarget.kind === 'docx') {
      const buffer = outputTarget.kind === 'pdf'
        ? await renderReportAsPdf(combinedReport)
        : await renderReportAsDocx(combinedReport);
      writeFileSync(outputTarget.outputPath, buffer);
    } else {
      writeFileSync(outputTarget.outputPath, combinedReport.fullMarkdown, 'utf-8');
    }

    if (!flags.json && !flags.quiet) {
      success(`Project workflow route output saved to ${outputTarget.outputPath}`);
    }
  }

  if (flags.json) {
    renderJSON({
      mode: 'project-workflow-route',
      route,
      workflows: workflowOutputs.map((output) => ({
        task: output.task,
        runId: output.runId,
        artifacts: {
          result: relativeArtifactPath(plan.workspace.rootPath, output.resultPath),
          report: relativeArtifactPath(plan.workspace.rootPath, output.reportPath),
          trace: relativeArtifactPath(plan.workspace.rootPath, output.tracePath),
        },
      })),
      artifacts: {
        route: relativeArtifactPath(plan.workspace.rootPath, plan.artifacts.workflowRoute),
        report: relativeArtifactPath(plan.workspace.rootPath, combinedReportPath),
      },
    });
    return;
  }

  if (flags.quiet) {
    console.log(plan.runId);
    return;
  }

  heading('Project Workflow Route Report');
  renderRichText(combinedReport.fullMarkdown);
  console.log('');
  success(`Workflow route artifacts written to ${relativeArtifactPath(plan.workspace.rootPath, parentRunDir)}`);
  warn('No engineering result was invented by an LLM. Deterministic GeotechCLI workflows produced the persisted outputs.');
}

async function checkQuota(_callType: 'llmCalls' | 'visionCalls' | 'agentCalls'): Promise<boolean> {
  // Strong-beta hosted limits are enforced server-side by the beta proxy.
  // Keep the CLI permissive here so successful completions, retries, and
  // daily limits are handled by the hosted gateway instead of stale local state.
  return true;
}

function loadImageBase64(filePath: string): { base64: string; mimeType: string } {
  const buffer = readFileSync(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
  };

  // Warn if user provides a PDF - vision works best with PNG/JPG images.
  if (ext === 'pdf') {
    console.log('');
    console.log(chalk.yellow('  WARNING: PDF input detected.'));
    console.log(chalk.gray('    Vision analysis works best with image files (PNG or JPG).'));
    console.log(chalk.gray('    For PDFs: extract a page as PNG first (e.g. with pdf2pic or a screenshot).'));
    console.log(chalk.gray('    Attempting analysis anyway - results may be incomplete.'));
    console.log('');
  }

  return {
    base64: buffer.toString('base64'),
    mimeType: mimeMap[ext] ?? 'image/png',
  };
}

function describeVisionInput(file: VisionInput, flags?: { json?: boolean; quiet?: boolean }): void {
  if (flags?.json || flags?.quiet) {
    return;
  }

  if (file.kind !== 'pdf') {
    return;
  }

  console.log('');
  console.log(chalk.yellow('  PDF input detected.'));
  console.log(chalk.gray('    Vision analysis works best with PNG or JPG images.'));
  console.log(chalk.gray('    For borehole logs, the CLI can split multi-page PDFs into page-level requests automatically.'));
  console.log(chalk.gray('    Scanned/image-only pages will use raster-image recovery when possible, and oversized pages will still be blocked before upload.'));
  console.log('');
}

function ensureHostedBetaVisionPayloadWithinLimit(
  file: VisionInput,
  details: {
    prompt: string;
    systemPrompt: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  },
): void {
  const estimatedBytes = estimateHostedBetaVisionBodyBytes({
    prompt: details.prompt,
    systemPrompt: details.systemPrompt,
    imageBase64: file.base64,
    mimeType: file.mimeType,
    model: details.model,
    temperature: details.temperature,
    maxTokens: details.maxTokens,
    jsonMode: false,
  });

  if (estimatedBytes <= HOSTED_BETA_REQUEST_SAFE_BYTES) {
    return;
  }

  const fileSize = formatByteSize(file.fileBytes);
  const payloadSize = formatByteSize(estimatedBytes);
  const limitSize = formatByteSize(HOSTED_BETA_REQUEST_SAFE_BYTES);
  const capSize = formatByteSize(HOSTED_BETA_REQUEST_LIMIT_BYTES);
  const baseMessage =
    file.kind === 'pdf'
      ? 'PDF vision inputs are uploaded as a single base64 payload and are too large for the hosted beta proxy.'
      : 'Image vision inputs are uploaded as a single base64 payload and are too large for the hosted beta proxy.';
  const mitigation =
    file.kind === 'pdf'
      ? 'Export one page as PNG or JPG, or split the PDF into smaller files, then retry.'
      : 'Resize or crop the image to the relevant region, then retry.';

  throw new Error(
    `${baseMessage} File: ${file.filePath} (${fileSize}). Estimated request body: ${payloadSize}. Safe limit: ${limitSize}. Hosted beta cap: ${capSize}.\n${mitigation}`,
  );
}

function maybeCheckHostedBetaVisionPayload(
  config: ReturnType<typeof buildLLMConfig>,
  file: VisionInput,
  details: {
    prompt: string;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
  },
): void {
  if (config.provider !== 'hosted-beta') {
    return;
  }

  ensureHostedBetaVisionPayloadWithinLimit(file, {
    ...details,
    model: config.visionModelId ?? DEFAULT_LLM_VISION_MODEL,
  });
}

function formatMaybe(value: string | number | null | undefined, suffix = ''): string {
  if (value == null || value === '') return 'Unavailable';
  return `${value}${suffix}`;
}

function startProgress(flags: { json?: boolean; quiet?: boolean }, text: string) {
  if (flags.json || flags.quiet) {
    return null;
  }

  info(text);
  return {
    succeed(message: string) {
      success(message);
    },
    fail(message: string) {
      error(message);
    },
  };
}

const SINGLE_AGENT_STATUS_ROTATION = [
  'Terzaghi is thinking through the request...',
  'Discussing the next engineering step with Terzaghi...',
  'Checking whether deterministic tools are needed...',
  'Preparing the next geotechnical action...',
];

const SWARM_STATUS_ROTATION = [
  'Mohr is coordinating Bieniawski, Terzaghi, and Hoek...',
  'Discussing site interpretation with Bieniawski...',
  'Asking Terzaghi to simulate the engineering response...',
  'Waiting for Hoek to review the engineering judgment...',
];

function summarizeStatusText(text: string, limit = 78): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function createLiveStatusController(options: {
  kind: 'single' | 'swarm';
  enabled: boolean;
  provider?: string;
}) {
  if (!options.enabled || !process.stdout.isTTY) {
    return null;
  }

  const rotation =
    options.kind === 'swarm' ? SWARM_STATUS_ROTATION : SINGLE_AGENT_STATUS_ROTATION;
  const spinner = ora({
    text: rotation[0],
    indent: 2,
    discardStdin: false,
  }).start();

  const hostedBetaWarmupHints =
    options.provider === 'hosted-beta'
      ? [
          {
            afterMs: 20_000,
            text: 'Hosted GLM provider is still responding...',
          },
          {
            afterMs: 95_000,
            text: 'Still waiting on the hosted GLM response. geotechCLI will fall back if the timeout budget is exceeded.',
          },
        ]
      : [];

  let rotationIndex = 0;
  let holdUntil = 0;
  let lastProgressAt = Date.now();
  let warmupHintIndex = 0;
  const interval = setInterval(() => {
    if (warmupHintIndex < hostedBetaWarmupHints.length) {
      const hint = hostedBetaWarmupHints[warmupHintIndex];
      if (Date.now() - lastProgressAt >= hint.afterMs) {
        pin(hint.text, 6_000);
        warmupHintIndex += 1;
        return;
      }
    }

    if (Date.now() < holdUntil) {
      return;
    }
    rotationIndex = (rotationIndex + 1) % rotation.length;
    spinner.text = rotation[rotationIndex];
  }, 1600);

  function stopRotation() {
    clearInterval(interval);
  }

  function pin(text: string, holdMs = 2400) {
    spinner.text = text;
    holdUntil = Date.now() + holdMs;
  }

  function markProgress() {
    lastProgressAt = Date.now();
    warmupHintIndex = 0;
  }

  return {
    onAgentStep(step: AgentStep) {
      markProgress();
      switch (step.type) {
        case 'thought':
          pin(`Terzaghi: ${summarizeStatusText(step.content, 84)}`);
          break;
        case 'tool_call':
          pin(`Asking Terzaghi to run ${step.toolName ?? 'the next tool'}...`);
          break;
        case 'tool_result':
          if (step.toolResult?.success) {
            pin(`Terzaghi is reviewing ${step.toolName ?? 'tool'} results...`);
          } else {
            pin('Terzaghi hit a tool issue and is adjusting the approach...');
          }
          break;
        case 'error':
          if (/modal\.com gpu|warming up|timeout budget|timed out/i.test(step.content)) {
            pin('Hosted GLM provider is busy or slow. Terzaghi is switching paths...');
          } else if (/temporarily unavailable|request failed|fetch failed|retry/i.test(step.content)) {
            pin('Hosted beta hit a bump. Terzaghi is recovering...');
          } else {
            pin('Terzaghi hit an issue and is adjusting the analysis...');
          }
          break;
        case 'answer':
          break;
      }
    },
    onSwarmStep(step: SwarmStep) {
      markProgress();
      const label = SWARM_AGENT_LABELS[step.agent] ?? step.agent;
      switch (step.type) {
        case 'thought':
          pin(`${label} is thinking through the next engineering step...`);
          break;
        case 'tool_call':
          pin(`Asking ${label} to run ${step.toolName ?? 'the next tool'}...`);
          break;
        case 'tool_result':
          if (step.toolResult?.success) {
            pin(`${label} is reviewing ${step.toolName ?? 'tool'} results...`);
          } else {
            pin(`${label} hit a tool issue and is adjusting the analysis...`);
          }
          break;
        case 'handoff':
          pin(`Mohr is coordinating the next specialist handoff...`);
          break;
        case 'review':
          pin(`${label} is reviewing the engineering judgment...`);
          break;
        case 'correction':
          pin(`${label} is correcting the analysis...`);
          break;
        case 'error':
          if (/modal\.com gpu|warming up|timeout budget|timed out/i.test(step.content)) {
            pin(`Hosted GLM provider is busy or slow. ${label} is switching paths...`);
          } else {
            pin(`${label} hit an issue and is recovering...`);
          }
          break;
        case 'answer':
          break;
      }
    },
    succeed(message: string) {
      stopRotation();
      spinner.succeed(message);
    },
    fail(message: string) {
      stopRotation();
      spinner.fail(message);
    },
    stop() {
      stopRotation();
      spinner.stop();
    },
  };
}

const SWARM_AGENT_LABELS: Record<'orchestrator' | 'interpretation' | 'simulation' | 'reviewer', string> = {
  orchestrator: 'Mohr',
  interpretation: 'Bieniawski',
  simulation: 'Terzaghi',
  reviewer: 'Hoek',
};

function formatToolPreview(args: Record<string, unknown> | undefined, limit: number): string {
  if (!args) {
    return '';
  }

  const serialized = JSON.stringify(args);
  return serialized.length > limit ? `${serialized.slice(0, limit)}...` : serialized;
}

function renderWarningsCompact(warnings: string[]): void {
  if (warnings.length === 0) return;

  const uniqueWarnings = [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))];
  const visibleWarnings = uniqueWarnings.slice(0, 5);
  console.log(chalk.yellow('  Warnings:'));
  for (const warning of visibleWarnings) {
    console.log(chalk.yellow(`    - ${warning}`));
  }
  if (uniqueWarnings.length > visibleWarnings.length) {
    console.log(chalk.yellow(`    - ${uniqueWarnings.length - visibleWarnings.length} more warning(s) omitted.`));
  }
}

function renderParseSafetyCompact(result: {
  parseStatus: string;
  confidence: number;
  warnings: string[];
  canAutoProceed: boolean;
}): void {
  keyValue('Parse status', result.parseStatus);
  keyValue('Confidence', `${result.confidence}%`);
  keyValue('Auto proceed', result.canAutoProceed ? 'Yes' : 'No');
  renderWarningsCompact(result.warnings);
}

function handleCommandErrorClean(
  err: unknown,
  flags: { json?: boolean },
  code = 'command_failed',
): void {
  const message = getErrorMessage(err);
  process.exitCode = 1;

  if (flags.json) {
    renderJSON({ error: { code, message } });
    return;
  }

  if (code.includes('vision') || code.includes('corebox') || code.includes('rmr') || code.includes('sensor') || code.includes('borehole')) {
    const lowered = message.toLowerCase();
    if (
      lowered.includes('no content') ||
      lowered.includes('empty') ||
      lowered.includes('upstream') ||
      lowered.includes('hosted beta proxy') ||
      lowered.includes('too large for the hosted beta proxy') ||
      lowered.includes('safe limit')
    ) {
      error(message);
      console.log('');
      console.log(chalk.gray('  Vision troubleshooting tips:'));
      console.log(chalk.gray('    - Use PNG or JPG images (not PDF or BMP)'));
      console.log(chalk.gray('    - Ensure the image is well-lit and clearly shows the subject'));
      console.log(chalk.gray('    - Try a smaller image file (< 5 MB)'));
      console.log(chalk.gray('    - Wait a moment and retry; the AI provider may be busy'));
      console.log(chalk.gray('    - Run with --verbose to see the raw response'));
      return;
    }
  }

  error(message);
}

function renderAgentStepPlain(step: AgentStep, json: boolean, quiet = false): void {
  if (json || quiet) return;

  switch (step.type) {
    case 'thought':
      return;
    case 'tool_call':
      console.log(chalk.cyan(`  [Terzaghi] Tool: ${step.toolName}(${formatToolPreview(step.toolArgs, 120)})`));
      return;
    case 'tool_result':
      if (step.toolResult?.success) {
        console.log(chalk.green(`  [Terzaghi] Result: ${step.content}`));
      } else {
        console.log(chalk.red(`  [Terzaghi] Error: ${step.content}`));
      }
      return;
    case 'answer':
      return;
    case 'error':
      console.log(chalk.red(`  [Terzaghi] Error: ${step.content}`));
      return;
  }
}

function renderSwarmStepPlain(step: SwarmStep, json: boolean, quiet = false): void {
  if (json || quiet) return;

  const label = SWARM_AGENT_LABELS[step.agent] ?? step.agent;
  const tag = `[${label}]`;

  switch (step.type) {
    case 'thought':
      return;
    case 'tool_call':
      console.log(chalk.cyan(`  ${tag} Tool: ${step.toolName}(${formatToolPreview(step.toolArgs, 100)})`));
      return;
    case 'tool_result':
      if (step.toolResult?.success) {
        console.log(chalk.green(`  ${tag} Result: ${step.content.slice(0, 180)}`));
      } else {
        console.log(chalk.red(`  ${tag} Error: ${step.content.slice(0, 180)}`));
      }
      return;
    case 'handoff':
      console.log(chalk.magenta(`  ${tag} Handoff: ${step.content}`));
      return;
    case 'review':
      console.log(chalk.green(`  ${tag} Review: ${step.content}`));
      return;
    case 'correction':
      console.log(chalk.red(`  ${tag} Correction: ${step.content.slice(0, 200)}`));
      return;
    case 'answer':
      return;
    case 'error':
      console.log(chalk.red(`  ${tag} Error: ${step.content}`));
      return;
  }
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(
    /(?:Bearer |sk-|zhipu-|api[_-]?key[=: ]*)[^\s"'\]},]*/gi,
    '***REDACTED***',
  );
}

function getErrorMessage(err: unknown): string {
  return sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
}

function handleCommandError(
  err: unknown,
  flags: { json?: boolean },
  code = 'command_failed',
): void {
  const message = getErrorMessage(err);
  process.exitCode = 1;

  if (flags.json) {
    renderJSON({ error: { code, message } });
    return;
  }

  // Provide specific guidance for common vision errors
  if (code.includes('vision') || code.includes('corebox') || code.includes('rmr') || code.includes('sensor') || code.includes('borehole')) {
    const lowered = message.toLowerCase();
    if (
      lowered.includes('no content') ||
      lowered.includes('empty') ||
      lowered.includes('upstream') ||
      lowered.includes('hosted beta proxy') ||
      lowered.includes('too large for the hosted beta proxy') ||
      lowered.includes('safe limit')
    ) {
      error(message);
      console.log('');
      console.log(chalk.gray('  Vision troubleshooting tips:'));
      console.log(chalk.gray('    - Use PNG or JPG images (not PDF or BMP)'));
      console.log(chalk.gray('    - Ensure the image is well-lit and clearly shows the subject'));
      console.log(chalk.gray('    - Try a smaller image file (< 5 MB)'));
      console.log(chalk.gray('    - Wait a moment and retry - the AI provider may be busy'));
      console.log(chalk.gray('    - Run with --verbose to see the raw response'));
      return;
    }
  }

  error(message);
}

function renderWarnings(warnings: string[]): void {
  if (warnings.length === 0) return;
  const uniqueWarnings = [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))];
  const visibleWarnings = uniqueWarnings.slice(0, 5);
  console.log(chalk.yellow('  Warnings:'));
  for (const warning of visibleWarnings) {
    console.log(chalk.yellow(`    - ${warning}`));
  }
  if (uniqueWarnings.length > visibleWarnings.length) {
    console.log(chalk.yellow(`    - ${uniqueWarnings.length - visibleWarnings.length} more warning(s) omitted.`));
  }
}

function renderParseSafety(result: {
  parseStatus: string;
  confidence: number;
  warnings: string[];
  canAutoProceed: boolean;
}): void {
  keyValue('Parse status', result.parseStatus);
  keyValue('Confidence', `${result.confidence}%`);
  keyValue('Auto proceed', result.canAutoProceed ? 'Yes' : 'No');
  renderWarnings(result.warnings);
}

function loadProjectState(projectId?: string): {
  id: string;
  name: string;
  context: Record<string, unknown>;
} | null {
  if (!projectId) return null;
  const project = loadProject(projectId);
  return {
    id: project.meta.id,
    name: project.meta.name,
    context: getProjectAgentContext(project.meta.id),
  };
}

function persistSessionToProject(
  projectId: string,
  mode: 'single' | 'swarm' | 'chat',
  query: string,
  session: AgentSession | SwarmSession,
): void {
  const answer = session.steps.find((step) => step.type === 'answer')?.content;
  const reviewMetadata = 'reviewPassed' in session
    ? {
      reviewPassed: session.reviewPassed,
      corrections: session.corrections,
    }
    : undefined;

  if (mode === 'swarm') {
    const swarmSession = session as SwarmSession;
    addAgentSession(projectId, buildSwarmSessionProjectRecord(query, swarmSession, {
      mode,
      answer,
      summary: answer?.slice(0, 240) ?? `${mode} session for: ${query.slice(0, 120)}`,
      metadata: reviewMetadata,
    }));

    const caseFileResult = persistSwarmCaseFile(projectId, query, swarmSession);
    const evidenceRecords = persistCaseFileEvidence(projectId, caseFileResult.scenarioId);
    addNote(projectId, `Updated swarm case file "${caseFileResult.scenarioId}" from the latest session.`);
    if (evidenceRecords.length > 0) {
      addNote(projectId, `Captured ${evidenceRecords.length} evidence record${evidenceRecords.length === 1 ? '' : 's'} for scenario "${caseFileResult.scenarioId}".`);
    }
  } else {
    addAgentSession(projectId, {
      mode,
      query,
      answer,
      summary: answer?.slice(0, 240) ?? `${mode} session for: ${query.slice(0, 120)}`,
      stepCount: session.steps.length,
      tokens: session.totalTokens,
      latencyMs: session.totalLatencyMs,
      context: session.context,
      metadata: reviewMetadata,
    });
  }

  saveNamedDataset(projectId, {
    name: 'latest-agent-context',
    kind: 'agent-context',
    data: session.context,
    source: mode,
  });

  saveDerivedParameter(projectId, {
    name: 'last-agent-mode',
    value: mode,
    source: 'cli',
  });

  setActiveAnalysisContext(projectId, {
    currentTask: query,
    lastAgentMode: mode,
    lastAnswer: answer,
    context: session.context,
    relatedDatasets: Object.keys(session.context),
  });

  addNote(projectId, `Persisted ${mode} agent session for "${query.slice(0, 120)}"`);

  if (answer) {
    addArtifact(projectId, {
      kind: mode === 'swarm' ? 'swarm-report' : 'agent-report',
      title: `${mode} analysis`,
      content: answer,
      mimeType: 'text/plain',
      metadata: {
        query,
        tokens: session.totalTokens,
      },
    });
  }
}

function persistOutputArtifact(
  projectId: string | undefined,
  kind: string,
  title: string,
  path: string,
  metadata?: Record<string, unknown>,
): void {
  if (!projectId) return;
  addArtifact(projectId, {
    kind,
    title,
    path,
    metadata,
  });
}

function buildAnalysisDocument(title: string, task: string, answer: string, mode: 'single' | 'swarm'): GeneratedReport {
  const content = [
    `## Task`,
    task,
    '',
    `## ${mode === 'swarm' ? 'Swarm Report' : 'Analysis'}`,
    answer,
  ].join('\n');

  return {
    title,
    sections: [
      {
        title: 'Summary',
        content,
      },
    ],
    fullMarkdown: `# ${title}\n\n${content}\n`,
    latencyMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Vision Commands
// ---------------------------------------------------------------------------

export function registerVisionCommand(program: Command): void {
  const vision = new Command('vision')
    .description('AI vision analysis for geotechnical images');

  // Core box analysis
  const coreboxCmd = new Command('corebox')
    .description('Analyze a core box image for RQD, fracture spacing, and weathering')
    .argument('<image>', 'Path to core box image')
    .action(async (imagePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = startProgress(flags, 'Analyzing core box image...');
      try {
        const file = readVisionInput(imagePath);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        maybeCheckHostedBetaVisionPayload(config, file, {
          prompt: 'Analyze this geotechnical image.',
          systemPrompt: 'You are analyzing a geotechnical image.',
          temperature: 0.1,
          maxTokens: 900,
        });
        const result = await analyzeCoreBox(file.base64, file.mimeType, config);

        spinner?.succeed(`Analysis complete (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading('Core Box Analysis');
        renderParseSafetyCompact(result);
        keyValue('RQD', formatMaybe(result.rqd, '%'));
        keyValue('Fracture spacing', formatMaybe(result.fractureSpacing));
        keyValue('Weathering grade', formatMaybe(result.weatheringGrade));
        keyValue('Rock type', formatMaybe(result.rockType));
        keyValue('Core recovery', formatMaybe(result.coreRecovery, '%'));
        keyValue('Discontinuities', formatMaybe(result.discontinuities));

        if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(result, null, 2));
          success(`Results saved to ${flags.output}`);
        }
        console.log('');
      } catch (err) {
        spinner?.fail('Analysis failed');
        handleCommandErrorClean(err, flags, 'corebox_analysis_failed');
      }
    });
  addGlobalFlags(coreboxCmd);
  vision.addCommand(coreboxCmd);

  // Hybrid RMR from image
  const rmrImageCmd = new Command('rmr')
    .description('Hybrid RMR: vision extracts features, then deterministic RMR scoring')
    .argument('<image>', 'Path to rock face / core image')
    .action(async (imagePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = startProgress(flags, 'Extracting rock mass parameters from image...');
      try {
        const file = readVisionInput(imagePath);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        maybeCheckHostedBetaVisionPayload(config, file, {
          prompt: 'Estimate rock mass parameters from this image.',
          systemPrompt: 'You are analyzing a geotechnical image.',
          temperature: 0.1,
          maxTokens: 700,
        });
        const result = await classifyRMRFromImage(file.base64, file.mimeType, config);

        spinner?.succeed(`RMR classification complete (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading('Hybrid RMR Classification (Vision + Deterministic)');
        renderParseSafetyCompact(result);

        console.log('');
        console.log(chalk.gray('  Vision-extracted parameters:'));
        keyValue('  Estimated UCS', formatMaybe(result.visionExtraction.estimatedUCS, ' MPa'));
        keyValue('  Estimated RQD', formatMaybe(result.visionExtraction.estimatedRQD, '%'));
        keyValue('  Estimated spacing', formatMaybe(result.visionExtraction.estimatedSpacing, ' m'));
        keyValue('  Joint condition', formatMaybe(result.visionExtraction.jointCondition));
        keyValue('  Groundwater', formatMaybe(result.visionExtraction.groundwaterCondition));

        console.log('');
        console.log(chalk.gray('  Deterministic RMR result:'));
        if (result.rmrResult) {
          keyValue('  Total RMR', `${result.rmrResult.totalRating}/100`);
          keyValue('  Rock class', `Class ${result.rmrResult.classNumber}: ${result.rmrResult.rockClass}`);
          keyValue('  Support', result.rmrResult.supportRecommendation);
        } else {
          console.log(chalk.yellow('    Deterministic RMR scoring was skipped because the vision extraction was incomplete or low confidence.'));
        }

        console.log('');
      } catch (err) {
        spinner?.fail('RMR classification failed');
        handleCommandErrorClean(err, flags, 'rmr_classification_failed');
      }
    });
  addGlobalFlags(rmrImageCmd);
  vision.addCommand(rmrImageCmd);

  // Sensor interpretation
  const sensorCmd = new Command('sensor')
    .description('Interpret sensor data image (piezometer, inclinometer, etc.)')
    .argument('<image>', 'Path to sensor data image')
    .action(async (imagePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = startProgress(flags, 'Interpreting sensor data...');
      try {
        const file = readVisionInput(imagePath);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        maybeCheckHostedBetaVisionPayload(config, file, {
          prompt: 'Interpret this sensor data image.',
          systemPrompt: 'You are analyzing a geotechnical image.',
          temperature: 0.1,
          maxTokens: 700,
        });
        const result = await interpretSensorImage(file.base64, file.mimeType, config);

        spinner?.succeed(`Interpretation complete (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading(`Sensor Interpretation - ${result.sensorType ?? 'Unknown'}`);
        renderParseSafetyCompact(result);
        keyValue('Sensor type', formatMaybe(result.sensorType));
        keyValue('Measurements', formatMaybe(result.measurements));
        console.log('');
        console.log(chalk.white('  Interpretation:'));
        console.log(`    ${formatMaybe(result.interpretation)}`);
        console.log('');
        console.log(chalk.white('  Evaluation:'));
        console.log(`    ${formatMaybe(result.evaluation)}`);
        console.log('');
        console.log(chalk.white('  Recommendations:'));
        console.log(`    ${formatMaybe(result.recommendations)}`);
        console.log('');
      } catch (err) {
        spinner?.fail('Sensor interpretation failed');
        handleCommandErrorClean(err, flags, 'sensor_interpretation_failed');
      }
    });
  addGlobalFlags(sensorCmd);
  vision.addCommand(sensorCmd);

  // Borehole log extraction
  const logCmd = new Command('log')
    .description('Extract structured data from borehole log image/PDF')
    .argument('<file>', 'Path to borehole log image or PDF')
    .option('--borehole-id <id>', 'Override borehole ID')
    .action(async (filePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = startProgress(flags, 'Extracting borehole log data...');
      try {
        const file = readVisionInput(filePath);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        const requestDetails = {
          prompt: 'Extract structured borehole log data.',
          systemPrompt: 'You are analyzing a geotechnical image.',
          temperature: 0.1,
          maxTokens: 900,
        };

        let result: BoreholeInterpretation;
        if (file.kind === 'pdf') {
          const pdfInspection = inspectPdfDocument(filePath);
          const effectiveInspection = pdfInspection.totalPages > 0 ? pdfInspection : null;
          const pageInputs = await readVisionPdfPageInputs(filePath, {
            inspection: effectiveInspection,
            forceRasterImages: config.provider === 'hosted-beta',
          });
          if (!flags.json && !flags.quiet && pageInputs.length > 1) {
            info(`PDF contains ${pageInputs.length} pages. Processing borehole log pages sequentially.`);
          }

          for (const pageInput of pageInputs) {
            if (!flags.json && !flags.quiet && pageInputs.length > 1) {
              info(`Processing PDF page ${pageInput.pageNumber}/${pageInput.totalPages}...`);
            }
            maybeCheckHostedBetaVisionPayload(config, pageInput, requestDetails);
          }

          const ingestResult = await ingestBoreholeLogDocument({
            config,
            source: {
              filePath,
              fileName: filePath.split(/[\\/]/).pop(),
              inputKind: 'pdf',
            },
            overrideBoreholeId: opts.boreholeId as string | undefined,
            inspection: effectiveInspection,
            pages: pageInputs,
          });

          const detectedIds = [
            ...new Set(
              ingestResult.boreholes
                .map((borehole) => borehole.boreholeId)
                .filter((value) => value && value !== 'BH-unknown'),
            ),
          ];

          if (ingestResult.boreholes.length > 1 && !opts.boreholeId) {
            throw new Error(
              `Multiple borehole groups were detected across the PDF pages (${detectedIds.join(', ') || 'unresolved IDs'}). Use geotech ingest for multi-borehole PDFs, split the PDF by borehole, or pass --borehole-id if the document is a single continued log.`,
            );
          }

          const selectedResult = ingestResult.boreholes[0];
          if (!selectedResult) {
            throw new Error('No borehole interpretation could be extracted from the supplied file.');
          }

          result = {
            ...selectedResult,
            warnings: [...new Set([...selectedResult.warnings, ...ingestResult.warnings])],
            canAutoProceed: selectedResult.canAutoProceed && !ingestResult.reviewRequired,
          };

          spinner?.succeed(
            `Extraction complete: ${result.layers.length} layers from ${ingestResult.source.successfulPages}/${ingestResult.source.totalPages} page(s) (${result.latencyMs}ms)`,
          );
        } else {
          maybeCheckHostedBetaVisionPayload(config, file, requestDetails);
          const ingestResult = await ingestBoreholeLogDocument({
            config,
            source: {
              filePath,
              fileName: filePath.split(/[\\/]/).pop(),
              inputKind: 'image',
            },
            overrideBoreholeId: opts.boreholeId as string | undefined,
            image: file,
          });
          const selectedResult = ingestResult.boreholes[0];
          if (!selectedResult) {
            throw new Error('No borehole interpretation could be extracted from the supplied file.');
          }
          result = {
            ...selectedResult,
            warnings: [...new Set([...selectedResult.warnings, ...ingestResult.warnings])],
            canAutoProceed: selectedResult.canAutoProceed && !ingestResult.reviewRequired,
          };
          spinner?.succeed(`Extraction complete: ${result.layers.length} layers (${result.latencyMs}ms)`);
        }

        if (flags.json) { renderJSON(result); return; }

        heading(`Borehole Log - ${result.boreholeId}`);
        renderParseSafetyCompact(result);
        if (result.projectName) {
          keyValue('Project', result.projectName);
        }
        keyValue('Total depth', formatMaybe(result.totalDepth, ' m'));
        keyValue('Water table', result.waterTableDepth != null ? `${result.waterTableDepth} m` : 'Not detected');
        if (result.groundElevation != null) {
          keyValue('Ground elevation', `${result.groundElevation} m`);
        }
        if (result.location) {
          const rawCoordinateText =
            typeof result.location.raw?.rawCoordinateText === 'string'
              ? result.location.raw.rawCoordinateText
              : null;
          const coordinateParts = [
            result.location.crs?.code ?? result.location.crs?.name ?? null,
            rawCoordinateText,
            result.location.wgs84
              ? `lat ${result.location.wgs84.latitude}, lon ${result.location.wgs84.longitude}`
              : null,
            result.location.projected
              ? `E ${result.location.projected.easting}, N ${result.location.projected.northing}`
              : null,
          ].filter((value): value is string => Boolean(value));

          if (coordinateParts.length > 0) {
            keyValue('Coordinates', coordinateParts.join(' | '));
          }
        }

        renderTable(
          ['From (m)', 'To (m)', 'Description', 'USCS', 'SPT-N'],
          result.layers.map((l) => [
            l.depthFrom != null ? l.depthFrom : '-',
            l.depthTo != null ? l.depthTo : '-',
            (l.description ?? 'Unavailable').slice(0, 40),
            l.uscsSymbol || '-',
            l.sptN ?? '-',
          ]),
        );

        console.log('');
        console.log(chalk.white('  Summary:'));
        console.log(`    ${formatMaybe(result.summary)}`);

        if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(result, null, 2));
          success(`Results saved to ${flags.output}`);
        }
        console.log('');
      } catch (err) {
        spinner?.fail('Extraction failed');
        handleCommandErrorClean(err, flags, 'borehole_extraction_failed');
      }
    });
  addGlobalFlags(logCmd);
  vision.addCommand(logCmd);

  program.addCommand(vision);
}

// ---------------------------------------------------------------------------
// Soil Classification from Natural Language
// ---------------------------------------------------------------------------

export function registerAIClassifyCommand(program: Command): void {
  const cmd = new Command('ai-classify')
    .description('Classify soil from natural language description (AI-powered)')
    .argument('<description...>', 'Soil description in natural language')
    .action(async (descParts: string[], opts) => {
      const flags = getGlobalFlags(opts);
      const description = descParts.join(' ');

      if (!(await checkQuota('llmCalls'))) return;

      const spinner = startProgress(flags, 'Classifying soil from description...');
      try {
        const config = buildLLMConfig();
        const result = await classifySoilFromDescription(description, config);

        spinner?.succeed('Classification complete');

        if (flags.json) { renderJSON(result); return; }

        heading('AI Soil Classification');
        keyValue('Input', `"${description}"`);
        renderParseSafetyCompact(result);
        keyValue('USCS symbol', formatMaybe(result.uscsSymbol));
        keyValue('USCS name', formatMaybe(result.uscsName));
        keyValue('Friction angle', formatMaybe(result.estimatedProperties.frictionAngle, ' deg'));
        keyValue('Cohesion', formatMaybe(result.estimatedProperties.cohesion, ' kPa'));
        keyValue('Unit weight', formatMaybe(result.estimatedProperties.unitWeight, ' kN/m3'));
        keyValue('Permeability', formatMaybe(result.estimatedProperties.permeability));
        console.log('');
        console.log(chalk.white('  Notes:'));
        console.log(`    ${formatMaybe(result.engineeringNotes)}`);
        console.log('');
      } catch (err) {
        spinner?.fail('Classification failed');
        handleCommandErrorClean(err, flags, 'ai_classification_failed');
      }
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// GBR Document Q&A
// ---------------------------------------------------------------------------

export function registerGBRCommand(program: Command): void {
  const gbr = new Command('gbr')
    .description('Geotechnical Baseline Report Q&A');

  const chatCmd = new Command('chat')
    .description('Ask questions about a GBR document')
    .requiredOption('--doc <file>', 'Path to GBR PDF or image')
    .argument('<question...>', 'Question about the GBR')
    .action(async (questionParts: string[], opts) => {
      const flags = getGlobalFlags(opts);
      const question = questionParts.join(' ');

      if (!(await checkQuota('llmCalls'))) return;

      const spinner = startProgress(flags, `Querying GBR: "${question.slice(0, 50)}..."`);
      try {
        const file = readVisionInput(opts.doc);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        maybeCheckHostedBetaVisionPayload(config, file, {
          prompt: 'Answer questions about this GBR document.',
          systemPrompt: 'You are analyzing a geotechnical document image.',
          temperature: 0.1,
          maxTokens: 700,
        });
        const result = await queryGBRDocument(question, file.base64, file.mimeType, config);

        spinner?.succeed(`Answer ready (${result.latencyMs}ms)`);

        if (flags.json) {
          renderJSON({ question, answer: result.answer, latencyMs: result.latencyMs });
          return;
        }

        heading('GBR Q&A');
        console.log(chalk.cyan(`  Q: ${question}`));
        console.log('');
        console.log(`  ${result.answer}`);
        console.log('');
      } catch (err) {
        spinner?.fail('GBR query failed');
        handleCommandErrorClean(err, flags, 'gbr_query_failed');
      }
    });

  addGlobalFlags(chatCmd);
  gbr.addCommand(chatCmd);
  program.addCommand(gbr);
}

// ---------------------------------------------------------------------------
// Agentic CLI - real tool-calling brain with ReAct loop
// ---------------------------------------------------------------------------

function renderAgentStep(step: AgentStep, json: boolean, quiet: boolean = false): void {
  if (json || quiet) return;

  const icons: Record<string, string> = {
    thought: '*',
    tool_call: '>',
    tool_result: '=',
    answer: 'ok',
    error: '!',
  };

  const icon = icons[step.type] ?? '-';

  switch (step.type) {
    case 'thought':
      console.log(chalk.gray(`  ${icon} [Thinking] ${step.content.slice(0, 200)}`));
      break;
    case 'tool_call':
      console.log(chalk.cyan(`  ${icon} [Tool] ${step.toolName}(${JSON.stringify(step.toolArgs).slice(0, 100)})`));
      break;
    case 'tool_result':
      if (step.toolResult?.success) {
        console.log(chalk.green(`  ${icon} [Result] ${step.content}`));
      } else {
        console.log(chalk.red(`  ${icon} [Error] ${step.content}`));
      }
      break;
    case 'answer':
      // Final answer rendered separately
      break;
    case 'error':
      console.log(chalk.red(`  ${icon} ${step.content}`));
      break;
  }
}

function withSessionSkillOptIn<T extends { skillsEnabled?: boolean }>(
  config: T,
  enabled: boolean,
): T & { skillsEnabled: boolean } {
  return {
    ...config,
    skillsEnabled: enabled === true,
  };
}

function renderSwarmStep(step: SwarmStep, json: boolean, quiet: boolean = false): void {
  if (json || quiet) return;

  const agentColors: Record<string, (s: string) => string> = {
    orchestrator: chalk.white,
    interpretation: chalk.blue,
    simulation: chalk.cyan,
    reviewer: chalk.yellow,
  };

  const icons: Record<string, string> = {
    thought: '*',
    tool_call: '>',
    tool_result: '=',
    handoff: '->',
    review: 'ok',
    correction: 'fix',
    answer: 'report',
    error: '!',
  };

  const color = agentColors[step.agent] ?? chalk.gray;
  const icon = icons[step.type] ?? '-';
  const tag = color(`[${step.agent}]`);

  switch (step.type) {
    case 'thought':
      console.log(chalk.gray(`  ${icon} ${tag} ${step.content.slice(0, 180)}`));
      break;
    case 'tool_call':
      console.log(chalk.cyan(`  ${icon} ${tag} ${step.toolName}(${JSON.stringify(step.toolArgs).slice(0, 80)})`));
      break;
    case 'tool_result':
      if (step.toolResult?.success) {
        console.log(chalk.green(`  ${icon} ${tag} ${step.content.slice(0, 150)}`));
      } else {
        console.log(chalk.red(`  ${icon} ${tag} ${step.content.slice(0, 150)}`));
      }
      break;
    case 'handoff':
      console.log(chalk.magenta(`  ${icon} ${tag} ${step.content}`));
      break;
    case 'review':
      console.log(chalk.green(`  ${icon} ${tag} ${step.content}`));
      break;
    case 'correction':
      console.log(chalk.red(`  ${icon} ${tag} ${step.content.slice(0, 200)}`));
      break;
    case 'answer':
      break;
    case 'error':
      console.log(chalk.red(`  ${icon} ${tag} ${step.content}`));
      break;
  }
}

export function registerAgentCommand(program: Command): void {
  const cmd = new Command('agent')
    .description('Agentic AI - routes evidence into deterministic tools; FEM execution remains human-invoked and experimental')
    .argument('[task...]', 'Engineering task in natural language')
    .option('--swarm', 'Use the role-based multi-agent swarm planner and specialist review loop')
    .option('--skills', 'Enable installed skill tools for this session')
    .option('--project <id>', 'Load and persist context to a stored project')
    .option('--workspace <dir>', 'Scan a local workspace and attach its manifest summary to the agent task')
    .option('--no-workspace', 'Disable automatic project-aware workspace discovery')
    .option('--task <task>', 'Run a project-aware task: data-quality, ground-model, calculation-readiness, risk-analysis, anomaly-detection, recommendations, signal-analysis, visualization')
    .option('--route-with-model', 'Let the configured LLM propose a validated workflow route when deterministic routing needs selection')
    .option('--plan-only', 'Scan the workspace, write .geotech project state, and show workflow readiness without calling an LLM')
    .option('--refresh', 'Refresh the deterministic workspace manifest and .geotech project state')
    .option('--trace', 'Write project-agent trace artifacts (enabled by default in project-aware mode)')
    .option('--max-files <n>', 'Maximum files to scan in project-aware workspace discovery')
    .option('--max-depth <n>', 'Maximum directory depth to scan in project-aware workspace discovery')
    .action(async (taskParts: string[], opts) => {
      const flags = getGlobalFlags(opts);
      const rawTask = Array.isArray(taskParts) ? taskParts.join(' ').trim() : '';
      const workspaceSelectorOnly = isWorkspaceSelectorOnly(rawTask);
      const promptTask = workspaceSelectorOnly ? '' : rawTask;
      const selectedProjectTask = normalizeProjectTask(opts.task);
      if (typeof opts.task === 'string' && !selectedProjectTask) {
        throw new Error(`Unsupported project-aware task: ${opts.task}`);
      }
      const projectIntent = inferProjectIntent(rawTask, selectedProjectTask);
      const task = selectedProjectTask ? projectTaskPrompt(selectedProjectTask, promptTask) : promptTask;
      let agentTask = task;
      const useSwarm = opts.swarm === true;
      const showLiveStatus = !flags.json && !flags.quiet && !flags.verbose;
      const shouldAutoDiscoverWorkspace = opts.workspace !== false;
      const maxFiles = parsePositiveInteger(opts.maxFiles, '--max-files');
      const maxDepth = parsePositiveInteger(opts.maxDepth, '--max-depth');

      let workspaceManifest: ProjectManifest | undefined;
      if (shouldAutoDiscoverWorkspace) {
        const workspace = resolveWorkspaceRoot({
          workspacePath: typeof opts.workspace === 'string' && opts.workspace.trim() ? opts.workspace : undefined,
        });
        const runId = nowRunId();
        workspaceManifest = await analyzeWorkspace(workspace.path, {
          includeCalculationInputDrafts: true,
          ...(maxFiles ? { maxFiles } : {}),
          ...(maxDepth ? { maxDepth } : {}),
        });
        let projectWorkflowRoute = !selectedProjectTask && promptTask
          ? routeProjectWorkflowRequest({
              prompt: promptTask,
              manifest: workspaceManifest,
              runId,
            })
          : undefined;
        if (
          projectWorkflowRoute?.executionMode === 'needs-selection'
          && opts.routeWithModel === true
          && opts.planOnly !== true
          && !selectedProjectTask
          && promptTask
        ) {
          if (!(await checkQuota('agentCalls'))) return;
          const routeConfig = withSessionSkillOptIn(buildLLMConfig(), false);
          const proposal = await requestProjectWorkflowRouteProposal({
            prompt: promptTask,
            manifest: workspaceManifest,
            config: routeConfig,
          });
          projectWorkflowRoute = routeProjectWorkflowRequest({
            prompt: promptTask,
            manifest: workspaceManifest,
            runId,
            providerConfig: {
              provider: routeConfig.provider,
              modelId: routeConfig.modelId,
              visionModelId: routeConfig.visionModelId,
            },
            llmSelection: proposal.selection,
            modelCalls: [proposal.modelCall],
          });
        }
        const routedIntent: ProjectAgentIntent = projectWorkflowRoute?.executionMode === 'deterministic-sequence'
          ? {
              schemaVersion: 'geotech.project-agent-intent.v1',
              source: 'prompt',
              type: projectWorkflowRoute.tasks.length === 1 ? projectWorkflowRoute.tasks[0] : 'combined',
              tasks: projectWorkflowRoute.tasks,
              prompt: promptTask,
            }
          : projectIntent;
        const plan = buildProjectAwarePlan(workspaceManifest, {
          workspace,
          intent: routedIntent,
          runId,
          executionMode: opts.planOnly === true || (!promptTask && !selectedProjectTask)
            ? 'discovery-only'
            : isDeterministicProjectTask(selectedProjectTask) || projectWorkflowRoute?.executionMode === 'deterministic-sequence'
              ? 'deterministic-workflow'
            : 'workspace-backed-agent',
        });
        writeProjectAwareState(plan, workspaceManifest);
        if (projectWorkflowRoute) {
          writeFileSync(plan.artifacts.workflowRoute, JSON.stringify(projectWorkflowRoute, null, 2), 'utf-8');
          if (projectWorkflowRoute.modelCalls.length > 0) {
            const modelRows: unknown[] = [...projectWorkflowRoute.modelCalls];
            if (plan.executionMode === 'workspace-backed-agent') {
              modelRows.push({
                type: 'model_call',
                status: 'planned',
                purpose: 'workspace-backed-agent-task',
                intent: plan.intent.type,
              });
            }
            writeFileSync(plan.artifacts.modelCalls, jsonl(modelRows), 'utf-8');
          }
        }

        if (opts.planOnly === true || (!promptTask && !selectedProjectTask)) {
          renderProjectAwarePlan(plan, flags);
          return;
        }

        if (isDeterministicProjectTask(selectedProjectTask)) {
          if ((opts.swarm === true || opts.skills === true) && !flags.json && !flags.quiet) {
            warn('--swarm and --skills do not change deterministic project workflow execution. Optional LLM review can be run separately.');
          }
          await renderAndPersistProjectWorkflow(plan, workspaceManifest, selectedProjectTask, flags);
          return;
        }

        if (projectWorkflowRoute?.executionMode === 'deterministic-sequence') {
          if ((opts.swarm === true || opts.skills === true) && !flags.json && !flags.quiet) {
            warn('--swarm and --skills do not change deterministic project workflow routing. Optional LLM review can be run separately.');
          }
          await renderAndPersistProjectWorkflowRoute(plan, workspaceManifest, projectWorkflowRoute, flags);
          return;
        }

        agentTask = [
          task,
          'Project-aware task context:',
          `Selected intent: ${routedIntent.type}`,
          routedIntent.tasks.length > 0 ? `Intent tasks: ${routedIntent.tasks.join(', ')}` : '',
          `Project state: ${relativeArtifactPath(plan.workspace.rootPath, plan.artifacts.plan)}`,
          projectWorkflowRoute ? `Workflow router: ${relativeArtifactPath(plan.workspace.rootPath, plan.artifacts.workflowRoute)} (${projectWorkflowRoute.executionMode})` : '',
          summarizeWorkspaceManifestForAgent(workspaceManifest),
        ].filter(Boolean).join('\n\n');
      }

      if (!task) {
        throw new Error('Provide an agent task, use --task <task>, or run geotech agent --plan-only for project discovery.');
      }

      if (!(await checkQuota('agentCalls'))) return;

      if (!workspaceManifest && typeof opts.workspace === 'string' && opts.workspace.trim()) {
        workspaceManifest = await analyzeWorkspace(opts.workspace, {
          includeCalculationInputDrafts: useSwarm || opts.skills === true,
        });
        agentTask = `${task}\n\n${summarizeWorkspaceManifestForAgent(workspaceManifest)}`;
      }

      if (!flags.json) {
        console.log('');
      if (useSwarm) {
        console.log(chalk.gray('  Swarm activated - role-based planner with specialist execution and review'));
      } else {
        console.log(chalk.gray('  Agent activated - Terzaghi is planning and executing'));
      }
        console.log('');
      }

      let liveStatus: ReturnType<typeof createLiveStatusController> = null;
      try {
        const config = withSessionSkillOptIn(buildLLMConfig(), opts.skills === true);
        const projectState = loadProjectState(opts.project);

        if (projectState && !flags.json) {
          console.log(chalk.gray(`  Project context loaded: ${projectState.name} (${projectState.id})`));
          console.log('');
        }

        if (opts.skills === true && !flags.json) {
          console.log(chalk.gray('  Installed skill tools enabled for this session.'));
          console.log('');
        }

        if (workspaceManifest && !flags.json) {
          console.log(chalk.gray(`  Workspace manifest attached: ${workspaceManifest.summary.totalFiles} files, branches: ${workspaceManifest.summary.branches.join(', ') || 'none'}, verifier: ${workspaceManifest.verifier?.status ?? 'not-run'}`));
          console.log('');
        }

        liveStatus = createLiveStatusController({
          kind: useSwarm ? 'swarm' : 'single',
          enabled: showLiveStatus,
          provider: config.provider,
        });
        const runtimeContext = buildAgentRuntimeContext(projectState?.context, workspaceManifest);

        if (useSwarm) {
          // Multi-agent swarm mode
          const session = await runSwarm(agentTask, config, (step) => {
            liveStatus?.onSwarmStep(step);
            if (flags.verbose) {
              renderSwarmStepPlain(step, flags.json, flags.quiet);
            }
          }, runtimeContext);

          const answer = session.steps.find((s) => s.type === 'answer');
          if (projectState) {
            persistSessionToProject(projectState.id, 'swarm', task, session);
          }

          if (flags.json) {
            renderJSON({
              task,
              workspace: workspaceManifest ? {
                rootPath: workspaceManifest.rootPath,
                summary: workspaceManifest.summary,
                groundModel: workspaceManifest.groundModel ? {
                  stats: workspaceManifest.groundModel.stats,
                  coordinateSystem: workspaceManifest.groundModel.coordinateSystem,
                } : undefined,
                verifier: workspaceManifest.verifier,
              } : undefined,
              mode: 'swarm',
              plan: session.plan,
              answer: answer?.content ?? '',
              reviewPassed: session.reviewPassed,
              corrections: session.corrections,
              steps: session.steps.map((s) => ({
                agent: s.agent,
                type: s.type,
                content: s.content,
                toolName: s.toolName,
                toolArgs: s.toolArgs,
                toolResult: s.toolResult ? { success: s.toolResult.success, summary: s.toolResult.summary } : undefined,
              })),
              context: session.context,
              tokens: session.totalTokens,
              latencyMs: session.totalLatencyMs,
            });
            return;
          }

          if (answer) {
            liveStatus?.succeed('Mohr and the specialists finished the analysis.');
            console.log('');
            heading('Swarm Report');
            renderRichText(answer.content);
            console.log('');
            const toolCalls = session.steps.filter((s) => s.type === 'tool_call').length;
            const agents = [...new Set(session.steps.map((s) => s.agent))];
            console.log(chalk.gray(`  (${agents.length} agents, ${toolCalls} tools executed, review: ${session.reviewPassed ? 'PASSED' : 'ISSUES NOTED'}, ${session.totalTokens} tokens)`));
            if (session.plan) {
              const activeRoles = session.plan.roles.filter((role) => role.status === 'active').length;
              console.log(chalk.gray(`  (${activeRoles} active planning roles, ${session.plan.skillCatalog.executableApproved} approved executable skills available)`));
            }
            console.log(chalk.cyan('\n  Continue interactively with: ') + chalk.white(`geotech chat${opts.project ? ` --project ${opts.project}` : ''}${opts.skills ? ' --skills' : ''}`));
          } else {
            liveStatus?.stop();
          }

          if (flags.output && answer) {
            const outputTarget = resolveStructuredOutputTarget({
              outputPath: flags.output,
              defaultBaseName: 'swarm-report',
            });

            if (outputTarget.warning) {
              warn(outputTarget.warning);
            }

            if (outputTarget.kind === 'pdf' || outputTarget.kind === 'docx') {
              const document = buildAnalysisDocument('Swarm Report', task, answer.content, 'swarm');
              const buffer = outputTarget.kind === 'pdf'
                ? await renderReportAsPdf(document)
                : await renderReportAsDocx(document);
              writeFileSync(outputTarget.outputPath, buffer);
            } else {
              writeFileSync(outputTarget.outputPath, answer.content);
            }

            persistOutputArtifact(projectState?.id, 'swarm-report-file', 'swarm report output', outputTarget.outputPath, { task });
            success(`Report saved to ${outputTarget.outputPath}`);
          }

        } else {
          // Single-agent ReAct mode (default)
          const session = await runAgent(agentTask, config, (step) => {
            liveStatus?.onAgentStep(step);
            if (flags.verbose) {
              renderAgentStepPlain(step, flags.json, flags.quiet);
            }
          }, runtimeContext);

          const answer = session.steps.find((s) => s.type === 'answer');
          if (projectState) {
            persistSessionToProject(projectState.id, 'single', task, session);
          }

          if (flags.json) {
            renderJSON({
              task,
              workspace: workspaceManifest ? {
                rootPath: workspaceManifest.rootPath,
                summary: workspaceManifest.summary,
                groundModel: workspaceManifest.groundModel ? {
                  stats: workspaceManifest.groundModel.stats,
                  coordinateSystem: workspaceManifest.groundModel.coordinateSystem,
                } : undefined,
                verifier: workspaceManifest.verifier,
              } : undefined,
              mode: 'single',
              answer: answer?.content ?? '',
              steps: session.steps.map((s) => ({
                type: s.type,
                content: s.content,
                toolName: s.toolName,
                toolArgs: s.toolArgs,
                toolResult: s.toolResult ? { success: s.toolResult.success, summary: s.toolResult.summary } : undefined,
              })),
              context: session.context,
              tokens: session.totalTokens,
              latencyMs: session.totalLatencyMs,
            });
            return;
          }

          if (answer) {
            liveStatus?.succeed('Terzaghi finished the analysis.');
            console.log('');
            heading('Agent Analysis');
            renderRichText(answer.content);
            console.log('');
            console.log(chalk.gray(`  (${session.steps.filter((s) => s.type === 'tool_call').length} tools executed, ${session.totalTokens} tokens, ${session.totalLatencyMs}ms)`));
            console.log(chalk.cyan('\n  Continue interactively with: ') + chalk.white(`geotech chat${opts.project ? ` --project ${opts.project}` : ''}${opts.skills ? ' --skills' : ''}`));
          } else {
            liveStatus?.stop();
          }

          if (flags.output && answer) {
            const outputTarget = resolveStructuredOutputTarget({
              outputPath: flags.output,
              defaultBaseName: 'agent-analysis',
            });

            if (outputTarget.warning) {
              warn(outputTarget.warning);
            }

            if (outputTarget.kind === 'pdf' || outputTarget.kind === 'docx') {
              const document = buildAnalysisDocument('Agent Analysis', task, answer.content, 'single');
              const buffer = outputTarget.kind === 'pdf'
                ? await renderReportAsPdf(document)
                : await renderReportAsDocx(document);
              writeFileSync(outputTarget.outputPath, buffer);
            } else {
              writeFileSync(outputTarget.outputPath, answer.content);
            }

            persistOutputArtifact(projectState?.id, 'agent-report-file', 'agent analysis output', outputTarget.outputPath, { task });
            success(`Report saved to ${outputTarget.outputPath}`);
          }
        }

        if (!flags.json) {
          console.log('');
        }
      } catch (err) {
        liveStatus?.fail(useSwarm ? 'Swarm analysis failed.' : 'Terzaghi could not complete the request.');
        handleCommandErrorClean(err, flags, useSwarm ? 'swarm_failed' : 'agent_failed');
      }
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// Interactive REPL Chat - conversational agentic session with memory
// ---------------------------------------------------------------------------

export function registerChatCommand(program: Command): void {
  const cmd = new Command('chat')
    .description('Interactive agentic session - type natural language, agent executes tools with memory')
    .option('--skills', 'Enable installed skill tools for this session')
    .option('--project <id>', 'Load and persist context to a stored project')
    .action(async (opts) => {
      const { createInterface } = await import('node:readline');

      console.log('');
      console.log(chalk.bold.cyan('  geotech') + chalk.bold.white('CLI') + chalk.gray(' Agent - Interactive Mode'));
      console.log(chalk.gray('  Type engineering questions. The agent will reason and execute calculations.'));
      console.log(chalk.gray('  Live status updates will appear while Terzaghi is thinking and calling tools.'));
      console.log(chalk.gray('  Commands: /context (show memory), /clear (reset), /exit (quit)'));
      console.log('');

      let config;
      try {
        config = withSessionSkillOptIn(buildLLMConfig(), opts.skills === true);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        return;
      }

      if (config.provider !== 'hosted-beta' && !config.apiKey) {
        warn('No provider API key set. Run: geotech config set llm.api_key <key>');
        warn('Or switch back to hosted beta with: geotech config set llm.provider hosted-beta');
        return;
      }

      const projectState = loadProjectState(opts.project);
      if (projectState) {
        console.log(chalk.gray(`  Project context loaded: ${projectState.name} (${projectState.id})`));
        console.log('');
      }

      if (opts.skills === true) {
        console.log(chalk.gray('  Installed skill tools enabled for this session.'));
        console.log('');
      }

      const conversation = new AgentConversation({
        context: projectState?.context,
      });
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.cyan('  geotech') + chalk.white(' > '),
      });

      rl.prompt();

      rl.on('line', async (line: string) => {
        const input = line.trim();

        if (!input) {
          rl.prompt();
          return;
        }

        // REPL commands
        if (input === '/exit' || input === '/quit') {
          console.log(chalk.gray('  Goodbye.'));
          rl.close();
          return;
        }

        if (input === '/context') {
          const ctx = conversation.getContext();
          if (Object.keys(ctx).length === 0) {
            console.log(chalk.gray('  No context yet. Run some analyses first.'));
          } else {
            console.log(chalk.gray('  Session context (accumulated results):'));
            for (const [key, value] of Object.entries(ctx)) {
              const summary = typeof value === 'object' && value !== null && 'steps' in (value as any)
                ? (value as any).steps?.slice(-1)[0] ?? key
                : key;
              console.log(chalk.gray(`    - ${key}: `) + chalk.white(String(typeof summary === 'string' ? summary : key)));
            }
          }
          console.log('');
          rl.prompt();
          return;
        }

        if (input === '/clear') {
          conversation.clearContext();
          if (projectState) {
            setActiveAnalysisContext(projectState.id, {
              currentTask: 'interactive-chat',
              lastAgentMode: 'chat',
              lastAnswer: undefined,
              context: {},
              relatedDatasets: [],
            });
            saveNamedDataset(projectState.id, {
              name: 'latest-agent-context',
              kind: 'agent-context',
              data: {},
              source: 'chat-clear',
            });
          }
          console.log(chalk.gray('  Context cleared.'));
          console.log('');
          rl.prompt();
          return;
        }

        // Check quota
        if (!(await checkQuota('agentCalls'))) {
          rl.prompt();
          return;
        }

        console.log('');
        const liveStatus = createLiveStatusController({
          kind: 'single',
          enabled: true,
          provider: config.provider,
        });

        try {
          const session = await conversation.ask(input, config, (step) => {
            liveStatus?.onAgentStep(step);
          });

          if (projectState) {
            persistSessionToProject(projectState.id, 'chat', input, session);
          }

          const answer = session.steps.find((s) => s.type === 'answer');
          if (answer) {
            liveStatus?.succeed('Terzaghi is ready.');
            console.log('');
            renderRichText(answer.content);
            console.log('');
            console.log(chalk.gray(`  (${session.steps.filter((s) => s.type === 'tool_call').length} tools, ${session.totalTokens} tokens)`));
          } else {
            liveStatus?.stop();
          }
        } catch (err) {
          liveStatus?.fail('Terzaghi could not complete the request.');
          error(err instanceof Error ? err.message : String(err));
        }

        console.log('');
        rl.prompt();
      });

      rl.on('close', () => {
        process.exit(0);
      });
    });

  program.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

export function registerReportCommand(program: Command): void {
  const cmd = new Command('report')
    .description('Generate AI-powered geotechnical report from analysis data')
    .option('--data <file>', 'JSON file with analysis results')
    .option('--from-case-file <scenarioId>', 'Assemble a deterministic report from a stored case file')
    .option('--project-id <id>', 'Stored project id required with --from-case-file')
    .option('--type <type>', 'Report type: borehole|site-investigation|tunnel-design|foundation|slope|custom', 'site-investigation')
    .option('--project <name>', 'Project name')
    .option('--location <loc>', 'Project location')
    .option('--format <ext>', 'Export format: md|pdf|docx', 'md')
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);
      const useCaseFile = typeof opts.fromCaseFile === 'string' && opts.fromCaseFile.trim().length > 0;
      let spinner: ReturnType<typeof startProgress> = null;
      try {
        if (!useCaseFile && !opts.data) {
          throw new Error('Provide either --data <file> or --from-case-file <scenarioId>.');
        }
        if (useCaseFile && !opts.projectId) {
          throw new Error('--project-id is required when using --from-case-file.');
        }
        if (!useCaseFile && !(await checkQuota('llmCalls'))) {
          return;
        }

        spinner = startProgress(flags, useCaseFile ? 'Assembling case-file report...' : 'Generating report...');

        const report = useCaseFile
          ? await generateReportFromCaseFile({
            projectId: opts.projectId,
            scenarioId: opts.fromCaseFile,
            projectName: opts.project,
            location: opts.location,
          })
          : await (async () => {
            const data = JSON.parse(readFileSync(opts.data, 'utf-8'));
            const config = buildLLMConfig();
            return generateReport(data, {
              type: opts.type,
              projectName: opts.project,
              location: opts.location,
            }, config);
          })();

        spinner?.succeed(
          `${useCaseFile ? 'Case-file report assembled' : 'Report generated'}: ${report.sections.length} sections (${report.latencyMs}ms)`,
        );

        if (flags.json) { renderJSON(report); return; }

        const baseName = (
          opts.project
            ? opts.project.replace(/\s+/g, '_')
            : useCaseFile
              ? `${opts.projectId}_${opts.fromCaseFile}`
              : 'report'
        ).toLowerCase();
        const outputTarget = resolveStructuredOutputTarget({
          outputPath: flags.output,
          requestedFormat: opts.format,
          defaultBaseName: baseName,
        });

        if (outputTarget.warning) {
          warn(outputTarget.warning);
        }

        if (outputTarget.kind === 'pdf') {
          const buf = await renderReportAsPdf(report);
          writeFileSync(outputTarget.outputPath, buf);
        } else if (outputTarget.kind === 'docx') {
          const buf = await renderReportAsDocx(report);
          writeFileSync(outputTarget.outputPath, buf);
        } else {
          writeFileSync(outputTarget.outputPath, report.fullMarkdown);
        }

        success(`Report saved to ${outputTarget.outputPath}`);
        console.log('');
      } catch (err) {
        spinner?.fail('Report generation failed');
        handleCommandErrorClean(err, flags, 'report_generation_failed');
      }
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}
