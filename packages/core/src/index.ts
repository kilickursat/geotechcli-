// LLM provider layer
export * from './llm/index.js';

// LLM error utilities
export { sanitizeUpstreamError } from './llm/util.js';

// Geotechnical computation engines
export * from './geo/index.js';

// Configuration
export * from './config/index.js';
export * from './meta/index.js';

// Data ingestion (AGS, CPT)
export * from './ingest/index.js';

// Workspace intelligence
export * from './workspace/index.js';
export * from './tabular/index.js';
export * from './evidence/index.js';
export * from './ground-model/index.js';
export * from './verifier/index.js';

// Standards database
export { queryStandards, listStandards, getStandardById, type StandardProvision, type StandardsQueryResult } from './standards/index.js';

// Persistent project storage
export {
  createProject, loadProject, saveProject, listProjects, deleteProject,
  addSoilProfile, addSimulationResult, addNote, getSimulationHistory,
  saveNamedDataset, saveDerivedParameter, addAssumption, addArtifact,
  addAgentSession, setActiveAnalysisContext, setProjectPreference, getProjectAgentContext,
  type ProjectData, type ProjectMeta, type SoilProfile, type SimulationResult,
  type ProjectAssumption, type ProjectArtifact, type ProjectDataset, type DerivedParameter,
  type ProjectAgentSession, type ActiveAnalysisContext,
} from './storage/index.js';

// AI-powered features — Agentic system
export { runMultiAgentTask, type AgentLog } from './agents/orchestrator.js';
export {
  runAgent,
  AgentConversation,
  type AgentStep,
  type AgentSession,
  type AgentCallback,
} from './agents/brain.js';
export {
  runSwarm,
  type SwarmStep,
  type SwarmSession,
  type SwarmCallback,
} from './agents/swarm.js';
export {
  AGENT_STAGES,
  SCENARIO_ARTIFACT_TYPES,
  type AgentStage,
  type EvidenceClass,
  type EvidenceReference,
  type EvidenceRecord,
  type ScenarioArtifactType,
  type ScenarioArtifact,
  type ScenarioCaseFile,
  type ScenarioArtifactPayloadMap,
} from './agents/contracts.js';
export {
  ensureScenarioCaseFile,
  loadScenarioCaseFile,
  saveScenarioCaseFile,
  persistScenarioArtifact,
  listScenarioArtifacts,
  loadLatestScenarioArtifact,
  loadLatestScenarioArtifacts,
  buildSwarmSessionProjectRecord,
  persistSwarmCaseFile,
} from './agents/case-file.js';
export {
  loadEvidenceRecord,
  listEvidenceRecords,
  persistEvidenceRecord,
  persistArtifactEvidence,
  persistCaseFileEvidence,
} from './agents/evidence.js';
export {
  toolRegistry,
  type ToolDefinition,
  type ToolResult,
} from './agents/tools.js';

export {
  analyzeCoreBox,
  classifyRMRFromImage,
  classifySoilFromDescription,
  interpretBoreholeLog,
  interpretBoreholeLogWithContext,
  mergeBoreholeLogPages,
  queryGBRDocument,
  interpretSensorImage,
  type ParseSafety,
  type ParseStatus,
  type CoreBoxAnalysisResult,
  type HybridRMRResult,
  type SoilClassificationFromTextResult,
  type BoreholeInterpretation,
  type BoreholeLayer,
  type BoreholeLocation,
  type BoreholeLogContext,
  type BoreholeLogPageResult,
  type SensorInterpretation,
} from './vision/index.js';
export {
  extractGeotechDocumentFactsFromText,
  interpretGeotechDocumentPage,
  type GeotechDocumentContext,
  type GeotechDocumentInsight,
  type GeotechDocumentClassification,
  type GeotechMaterialObservation,
  type GeotechParameterObservation,
} from './vision/geotech-document.js';
export {
  parseDocumentLayoutWithGlmOcr,
  supportsGlmOcrLayoutParsing,
  type GlmOcrLayoutElement,
  type GlmOcrLayoutPage,
  type GlmOcrLayoutResult,
} from './vision/layout-ocr.js';

// Report generation
export {
  generateReport,
  buildIngestDossier,
  buildArtifactDrivenReport,
  generateReportFromCaseFile,
  renderIngestDossierAsHtml,
  renderReportAsPdf,
  renderReportAsDocx,
  type GeneratedReport,
  type ReportSection,
  type BuildIngestDossierOptions,
  type CaseFileGeneratedReport,
  type CaseFileReportInput,
  type GenerateStoredCaseFileReportOptions,
  type IngestDossier,
  type IngestDossierApproval,
  type IngestDossierBadge,
  type IngestDossierFindingGroup,
  type IngestDossierMetric,
  type IngestDossierNarrativeSection,
  type IngestDossierPageCard,
  type IngestDossierSourceResult,
  type IngestDossierStoredReview,
  type IngestDossierTable,
  type IngestDossierTone,
} from './report/index.js';

// Export formats
export {
  exportGeoJSON,
  exportBoreholeGeoJSON,
  exportDXF,
  exportBoreholeProfileDXF,
  exportCSV,
  exportJSON,
  type GeoJSONFeatureInput,
  type DXFEntity,
} from './export/index.js';

// Metering & anti-abuse
export {
  InMemoryUsageStore,
  checkUsageAndAbuse,
  generateFingerprint,
  detectSuspiciousActivity,
  type UsageRecord,
  type UsageStore,
  type AbuseCheckResult,
} from './llm/middleware/metering.js';

export { FileUsageStore } from './llm/middleware/persistent-usage.js';

// Filesystem sandbox
export {
  validatePath,
  validateReadPath,
  validateWritePath,
  validateShellCommand,
  ensureWorkspace,
  getWorkspaceDir,
  type SandboxCheck,
} from './agents/sandbox.js';

// Skills
export {
  AGENT_SKILL_TOOL_NAMES,
  areAgentSkillToolsEnabled,
  ensureBundledSkillsInstalled,
  getSkillsRuntimeConfig,
  getSkillsDirectory,
  getStrongBetaSkillApproval,
  listInstalledSkills,
  getInstalledSkill,
  isStrongBetaSkillApproved,
  readInstalledSkillGuide,
  STRONG_BETA_SKILL_APPROVALS,
  validateSkillSource,
  validateInstalledSkill,
  importSkillsFromSource,
  runInstalledSkill,
  isAgentSkillToolName,
  type SkillRuntime,
  type SkillsRuntimeConfig,
  type InstalledSkill,
  type SkillValidationIssue,
  type SkillValidationCandidate,
  type SkillValidationResult,
  type SkillImportResult,
  type SkillRunOptions,
  type SkillRunResult,
  type StrongBetaSkillApproval,
  type StrongBetaSkillApprovalStatus,
} from './skills/index.js';

// Database layer (Supabase + Upstash Redis)
export {
  dbQuery, dbInsert, dbUpdate, dbUpsert, dbRpc, dbHealthCheck,
  getUserById, getUserByKey, getUserByEmail, getUserByStripeCustomer,
  createUser, updateSubscription, linkStripeCustomer,
  regenerateKey, generateGeotechKey, deleteUser, resolveEffectiveTier,
  RedisUsageStore, isIPRateLimitedRedis, redisHealthCheck,
  type GeotechUser, type CreateUserInput, type SupabaseConfig,
} from './db/index.js';
