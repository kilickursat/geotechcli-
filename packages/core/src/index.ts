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
  toolRegistry,
  type ToolDefinition,
  type ToolResult,
} from './agents/tools.js';

export {
  analyzeCoreBox,
  classifyRMRFromImage,
  classifySoilFromDescription,
  interpretBoreholeLog,
  queryGBRDocument,
  interpretSensorImage,
  type ParseSafety,
  type ParseStatus,
  type CoreBoxAnalysisResult,
  type HybridRMRResult,
  type SoilClassificationFromTextResult,
  type BoreholeInterpretation,
  type BoreholeLayer,
  type SensorInterpretation,
} from './vision/index.js';

// Report generation
export { generateReport, renderReportAsPdf, renderReportAsDocx, type GeneratedReport, type ReportSection } from './report/index.js';

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

// Software bridges
export {
  detectSoftware,
  generatePLAXISScript,
  generateFLACScript,
  generateRocscienceScript,
  type BridgeStatus,
  type ScriptTemplate,
  type SoftwareType,
} from './bridge/index.js';

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

// Database layer (Supabase + Upstash Redis)
export {
  dbQuery, dbInsert, dbUpdate, dbUpsert, dbRpc, dbHealthCheck,
  getUserById, getUserByKey, getUserByEmail, getUserByStripeCustomer,
  createUser, updateSubscription, linkStripeCustomer,
  regenerateKey, generateGeotechKey, deleteUser, resolveEffectiveTier,
  RedisUsageStore, isIPRateLimitedRedis, redisHealthCheck,
  type GeotechUser, type CreateUserInput, type SupabaseConfig,
} from './db/index.js';
