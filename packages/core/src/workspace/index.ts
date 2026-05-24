export {
  analyzeWorkspace,
} from './scanner.js';

export {
  classifyWorkspaceFile,
} from './classifier.js';

export {
  renderWorkspaceManifestAsHtml,
} from './dossier.js';

export {
  resolveWorkspaceRoot,
  type ResolveWorkspaceRootOptions,
  type WorkspaceRoot,
  type WorkspaceRootDetectedBy,
} from './resolve-root.js';

export {
  runProjectWorkflow,
  type ProjectWorkflowAction,
  type ProjectWorkflowChartPoint,
  type ProjectWorkflowChartSeries,
  type ProjectWorkflowChartSpec,
  type ProjectWorkflowFinding,
  type ProjectWorkflowFindingSeverity,
  type ProjectWorkflowRun,
  type ProjectWorkflowStatus,
  type ProjectWorkflowTask,
  type RunProjectWorkflowOptions,
} from './project-workflow-executor.js';

export {
  DEFAULT_ANALYZE_WORKSPACE_OPTIONS,
  type AnalyzeWorkspaceOptions,
  type ProjectManifest,
  type ProjectManifestSummary,
  type WorkspaceDatasetType,
  type WorkspaceFileClassification,
  type WorkspaceFileEntry,
  type WorkspaceFileKind,
} from './manifest.js';
