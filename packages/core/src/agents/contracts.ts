export const AGENT_STAGES = ['interpretation', 'simulation', 'reviewer', 'orchestrator'] as const;
export type AgentStage = (typeof AGENT_STAGES)[number];

export const SCENARIO_ARTIFACT_TYPES = [
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
] as const;
export type ScenarioArtifactType = (typeof SCENARIO_ARTIFACT_TYPES)[number];

export type EvidenceClass = 'Observed' | 'Derived' | 'Assumed' | 'Computed' | 'Normative';

export interface EvidenceReference {
  evidenceId: string;
  class: EvidenceClass;
  label: string;
  source: string;
  summary?: string;
}

export interface EvidenceRecord {
  evidenceId: string;
  projectId: string;
  scenarioId: string;
  class: EvidenceClass;
  label: string;
  source: string;
  summary?: string;
  detail?: string;
  tags: string[];
  linkedArtifactIds: string[];
  provenance: ArtifactProvenance;
  metadata?: Record<string, unknown>;
}

export interface ArtifactSource {
  agent: AgentStage;
  toolName?: string;
  stepId?: string;
  model?: string;
}

export interface ArtifactProvenance {
  createdAt: string;
  derivedFrom: string[];
  source: ArtifactSource;
}

export interface ScenarioArtifactBase {
  artifactId: string;
  projectId: string;
  scenarioId: string;
  artifactType: ScenarioArtifactType;
  version: number;
  title: string;
  confidence?: number;
  warnings: string[];
  assumptionsUsed: string[];
  evidenceRefs: EvidenceReference[];
  provenance: ArtifactProvenance;
}

export interface GroundwaterCondition {
  detected: boolean;
  depthM?: number;
  note?: string;
}

export interface GroundStratum {
  id: string;
  fromM: number;
  toM: number;
  material: string;
  uscsSymbol?: string;
  description?: string;
  derivedParameters?: Record<string, string | number | boolean | null>;
  evidenceRefs: EvidenceReference[];
  warnings: string[];
}

export interface GroundModelPayload {
  summary: string;
  units: 'SI';
  strata: GroundStratum[];
  groundwater: GroundwaterCondition;
  derivedParameters: Record<string, string | number | boolean | null>;
  missingInputs: string[];
  blockedInputs: string[];
}

export interface AssumptionRecord {
  assumptionId: string;
  category: 'geometry' | 'soil-parameter' | 'load' | 'groundwater' | 'method' | 'constructability' | 'other';
  statement: string;
  basis?: string;
  impact: 'low' | 'medium' | 'high';
  evidenceRefs: EvidenceReference[];
}

export interface AssumptionsPayload {
  summary: string;
  assumptions: AssumptionRecord[];
  criticalAssumptions: string[];
}

export interface DataQualityCheck {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
}

export interface DataQualityPayload {
  summary: string;
  parseStatus: 'clean' | 'partial' | 'blocked';
  confidence: number;
  missingInputs: string[];
  blockedInputs: string[];
  checks: DataQualityCheck[];
}

export interface AnalysisStepPlan {
  analysisId: string;
  method: string;
  purpose: string;
  toolName: string;
  requiredInputs: string[];
  outputArtifactTypes: Array<'results' | 'option-matrix'>;
}

export interface AnalysisPlanPayload {
  summary: string;
  scenarioObjective: string;
  analyses: AnalysisStepPlan[];
  acceptanceCriteria: string[];
}

export interface ResultMetric {
  name: string;
  value: number | string | boolean | null;
  units?: string;
  threshold?: string;
  status?: 'pass' | 'warning' | 'fail';
}

export interface AnalysisResultRecord {
  resultId: string;
  label: string;
  method: string;
  toolName: string;
  metrics: ResultMetric[];
  interpretation: string;
  evidenceRefs: EvidenceReference[];
  warnings: string[];
}

export interface ResultsPayload {
  summary: string;
  scenarioLabel: string;
  analysesRun: string[];
  records: AnalysisResultRecord[];
}

export interface OptionMatrixRow {
  optionId: string;
  label: string;
  category: 'foundation' | 'excavation' | 'retaining' | 'tunnel' | 'ground-improvement' | 'other';
  safety: 'strong' | 'acceptable' | 'weak' | 'unknown';
  settlement: 'low' | 'medium' | 'high' | 'unknown';
  constructability: 'easy' | 'moderate' | 'difficult' | 'unknown';
  cost: 'low' | 'medium' | 'high' | 'unknown';
  scheduleRisk: 'low' | 'medium' | 'high' | 'unknown';
  rank: number;
  rationale: string;
  supportingResultIds: string[];
}

export interface OptionMatrixPayload {
  summary: string;
  decisionBasis: string[];
  preferredOptionId?: string;
  rows: OptionMatrixRow[];
}

export interface ReviewChecklistItem {
  itemId: string;
  category: 'inputs' | 'method' | 'sanity' | 'safety' | 'standards' | 'traceability';
  question: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
}

export interface ReviewChecklistPayload {
  summary: string;
  items: ReviewChecklistItem[];
}

export interface AcceptanceStatusPayload {
  summary: string;
  verdict: 'APPROVED' | 'REJECTED' | 'CONDITIONAL';
  confidence: number;
  reasons: string[];
}

export interface IssueCorrectionRecord {
  issueId: string;
  severity: 'critical' | 'major' | 'minor';
  issue: string;
  correction: string;
  affectedArtifacts: ScenarioArtifactType[];
}

export interface IssuesAndCorrectionsPayload {
  summary: string;
  issues: IssueCorrectionRecord[];
}

export interface FinalReportPayload {
  summary: string;
  markdown: string;
  recommendation: string;
  assumptionTable: Array<{ assumption: string; impact: string; basis?: string }>;
  evidenceTable: Array<{ evidenceId?: string; class: EvidenceClass; label: string; source: string; summary?: string }>;
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

export type ScenarioArtifact<T extends ScenarioArtifactType = ScenarioArtifactType> = ScenarioArtifactBase & {
  payload: ScenarioArtifactPayloadMap[T];
};

export interface ScenarioCaseFile {
  caseFileId: string;
  projectId: string;
  scenarioId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  artifactRefs: Partial<Record<ScenarioArtifactType, string>>;
  latestVersions: Partial<Record<ScenarioArtifactType, number>>;
  evidenceDatasetRefs: string[];
  evidenceIndex: Record<string, string>;
  finalRecommendationRef?: string;
  acceptanceStatusRef?: string;
}
