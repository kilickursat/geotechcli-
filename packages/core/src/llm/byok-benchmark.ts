import { resolveProviderCapabilityProfile } from './capabilities.js';
import type { LLMConfig, ProviderCapabilityProfile } from './types.js';

export type ByokBenchmarkProfileId =
  | 'hosted-beta'
  | 'direct-zai'
  | 'premium-byok'
  | 'openai-compatible'
  | 'openrouter-free'
  | 'local-hf-compatible';

export type ByokBenchmarkEvidenceInput = 'preprocessed-page-evidence';

export interface ByokBenchmarkEvidenceItem {
  evidenceId: string;
  sourcePage: string;
  method: 'ocr' | 'layout-ocr' | 'page-cache';
  confidence: number;
  snippet: string;
}

export interface ByokBenchmarkEvidenceContract {
  schemaVersion: 'geotech.byok-evidence-contract.v1';
  evidenceInput: ByokBenchmarkEvidenceInput;
  prohibitedInputs: Array<'direct-image' | 'native-pdf'>;
  sourceEvidence: ByokBenchmarkEvidenceItem[];
  requiredResponseKeys: string[];
  reviewGates: string[];
}

export interface ByokProviderBenchmarkProfile {
  id: ByokBenchmarkProfileId;
  provider: LLMConfig['provider'];
  modelId: string | null;
  visionModelId: string | null;
  capabilityProfile: ProviderCapabilityProfile;
  evidenceContract: ByokBenchmarkEvidenceContract;
  jsonModeAllowed: boolean;
  requestContainsImageInput: false;
  requestContainsNativePdfInput: false;
}

export interface ByokBenchmarkResponseValidation {
  ok: boolean;
  parsedJson: boolean;
  citedEvidenceIds: string[];
  failures: string[];
  warnings: string[];
}

export interface ByokBenchmarkRunSummary {
  profile: ByokProviderBenchmarkProfile;
  ok: boolean;
  model: string | null;
  latencyMs: number | null;
  totalTokens: number | null;
  response: ByokBenchmarkResponseValidation;
  error?: string;
}

export interface ByokBenchmarkReport {
  kind: 'geotech-byok-provider-benchmark';
  schemaVersion: 1;
  generatedAt: string;
  runs: ByokBenchmarkRunSummary[];
  summary: {
    runCount: number;
    passedRuns: number;
    failedRuns: number;
    profiles: ByokBenchmarkProfileId[];
    passed: boolean;
  };
  contractValidation?: ByokBenchmarkReportContractValidation;
}

export interface ByokBenchmarkReportContractOptions {
  requiredProfiles?: ByokBenchmarkProfileId[];
}

export interface ByokBenchmarkReportContractValidation {
  ok: boolean;
  profiles: ByokBenchmarkProfileId[];
  failures: string[];
  warnings: string[];
}

export interface ByokBenchmarkArtifactSafety {
  ok: boolean;
  leaks: string[];
}

export interface ByokBenchmarkHistoryEntry {
  kind: 'geotech-byok-provider-benchmark-history-entry';
  schemaVersion: 1;
  generatedAt: string;
  summary: {
    runCount: number;
    passedRuns: number;
    failedRuns: number;
    passed: boolean;
    profiles: ByokBenchmarkProfileId[];
    evidenceInput: ByokBenchmarkEvidenceInput | 'none';
    averageLatencyMs: number | null;
    totalTokens: number | null;
    pathLeakCount: number;
  };
}

export interface ByokBenchmarkTrendReport {
  kind: 'geotech-byok-provider-benchmark-trend';
  schemaVersion: 1;
  generatedAt: string;
  current: ByokBenchmarkHistoryEntry;
  previous: ByokBenchmarkHistoryEntry | null;
  delta: {
    runCount: number;
    passedRuns: number;
    failedRuns: number;
    averageLatencyMs: number | null;
    totalTokens: number | null;
    pathLeakCount: number;
  } | null;
  historyCount: number;
  note: string;
}

export interface ByokBenchmarkTrend {
  history: ByokBenchmarkHistoryEntry[];
  report: ByokBenchmarkTrendReport;
}

export interface ByokBenchmarkTrendContractValidation {
  ok: boolean;
  failures: string[];
  warnings: string[];
}

const BYOK_REQUIRED_RESPONSE_KEYS = [
  'ok',
  'evidence_input',
  'cited_evidence_ids',
  'takeaway',
  'review_gates',
];

const BYOK_TEXT_EVIDENCE_PROFILE_IDS = new Set<ByokBenchmarkProfileId>([
  'openai-compatible',
  'openrouter-free',
  'local-hf-compatible',
]);

export function buildByokProviderBenchmarkProfile(
  id: ByokBenchmarkProfileId,
  config: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>,
): ByokProviderBenchmarkProfile {
  const capabilityProfile = resolveProviderCapabilityProfile(config);
  return {
    id,
    provider: config.provider,
    modelId: capabilityProfile.modelId,
    visionModelId: capabilityProfile.visionModelId,
    capabilityProfile,
    evidenceContract: buildByokBenchmarkEvidenceContract(capabilityProfile),
    jsonModeAllowed: capabilityProfile.capabilities.jsonMode && !capabilityProfile.likelyFreeRoute,
    requestContainsImageInput: false,
    requestContainsNativePdfInput: false,
  };
}

export function buildByokBenchmarkEvidenceContract(
  capabilityProfile: ProviderCapabilityProfile,
): ByokBenchmarkEvidenceContract {
  return {
    schemaVersion: 'geotech.byok-evidence-contract.v1',
    evidenceInput: 'preprocessed-page-evidence',
    prohibitedInputs: ['direct-image', 'native-pdf'],
    sourceEvidence: [
      {
        evidenceId: 'ev-page-3-bh1-spt',
        sourcePage: '3',
        method: 'ocr',
        confidence: 0.92,
        snippet: 'BH-01 SPT N=18 at 2.0 m; source page 3.',
      },
      {
        evidenceId: 'ev-page-4-lab-atterberg',
        sourcePage: '4',
        method: 'layout-ocr',
        confidence: 0.88,
        snippet: 'Atterberg limits: LL=42%, PI=22%; source page 4.',
      },
      {
        evidenceId: 'ev-page-5-groundwater-gap',
        sourcePage: '5',
        method: 'page-cache',
        confidence: 0.74,
        snippet: 'Groundwater level was not extracted; review gate remains open.',
      },
    ],
    requiredResponseKeys: [
      'ok',
      'evidence_input',
      'cited_evidence_ids',
      'takeaway',
      'review_gates',
    ],
    reviewGates: [
      ...capabilityProfile.reviewGates,
      'source-evidence-required',
      'missing-groundwater-review-required',
      'human-engineering-review-required',
    ],
  };
}

export function buildByokBenchmarkPrompt(profile: ByokProviderBenchmarkProfile): string {
  const contract = profile.evidenceContract;
  return [
    'Return ONLY compact JSON. Do not use markdown.',
    'You are being benchmarked as a GeotechCLI BYOK/provider brain.',
    `Provider profile: ${profile.id}. Capability profile: ${profile.capabilityProfile.id}.`,
    `Evidence input: ${contract.evidenceInput}. Do not request or claim direct image/PDF inspection.`,
    `Prohibited inputs: ${contract.prohibitedInputs.join(', ')}.`,
    `Active review gates: ${contract.reviewGates.join(', ')}.`,
    'Use only this OCR/page evidence:',
    ...contract.sourceEvidence.map((item) =>
      `- ${item.evidenceId} | page ${item.sourcePage} | ${item.method} | confidence ${Math.round(item.confidence * 100)}% | ${item.snippet}`,
    ),
    'Required JSON shape:',
    '{"ok":true,"evidence_input":"preprocessed-page-evidence","cited_evidence_ids":["ev-page-3-bh1-spt"],"takeaway":"...","review_gates":["..."]}',
    'The takeaway must be one short geotechnical sentence and must mention source evidence.',
  ].join('\n');
}

export function validateByokBenchmarkResponse(
  text: string,
  contract: ByokBenchmarkEvidenceContract = buildByokBenchmarkEvidenceContract(
    resolveProviderCapabilityProfile({ provider: 'openai-compatible', modelId: 'byok-text', visionModelId: '' }),
  ),
): ByokBenchmarkResponseValidation {
  const trimmed = text.trim();
  const parsed = parseJsonObject(trimmed);
  const failures: string[] = [];
  const warnings: string[] = [];
  const allowedIds = new Set(contract.sourceEvidence.map((item) => item.evidenceId));
  let citedEvidenceIds: string[] = [];

  if (!parsed) {
    failures.push('response_not_json');
  } else {
    const missingKeys = contract.requiredResponseKeys.filter((key) => !(key in parsed));
    failures.push(...missingKeys.map((key) => `missing_key_${key}`));
    if (parsed.ok !== true) {
      failures.push('ok_not_true');
    }
    if (parsed.evidence_input !== contract.evidenceInput) {
      failures.push('wrong_evidence_input');
    }
    citedEvidenceIds = Array.isArray(parsed.cited_evidence_ids)
      ? parsed.cited_evidence_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (citedEvidenceIds.length === 0) {
      failures.push('missing_evidence_citations');
    }
    const unknownIds = citedEvidenceIds.filter((id) => !allowedIds.has(id));
    failures.push(...unknownIds.map((id) => `unknown_evidence_id_${sanitizeFailureToken(id)}`));
    const reviewGates = Array.isArray(parsed.review_gates)
      ? parsed.review_gates.filter((gate): gate is string => typeof gate === 'string')
      : [];
    if (!reviewGates.some((gate) => /groundwater|human|review/i.test(gate))) {
      failures.push('review_gate_not_preserved');
    }
  }

  if (/(?:i inspected|from the image|from the pdf|visual inspection|native pdf)/i.test(trimmed)) {
    failures.push('claimed_prohibited_image_or_pdf_inspection');
  }
  if (!/source evidence/i.test(trimmed)) {
    warnings.push('source_evidence_phrase_missing');
  }

  return {
    ok: failures.length === 0,
    parsedJson: Boolean(parsed),
    citedEvidenceIds,
    failures,
    warnings,
  };
}

export function buildByokBenchmarkReport(
  runs: ByokBenchmarkRunSummary[],
  generatedAt: string | Date = new Date(),
): ByokBenchmarkReport {
  const generated = generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt;
  const safeRuns = runs.map(redactByokBenchmarkRun);
  return {
    kind: 'geotech-byok-provider-benchmark',
    schemaVersion: 1,
    generatedAt: generated,
    runs: safeRuns,
    summary: {
      runCount: safeRuns.length,
      passedRuns: safeRuns.filter((run) => run.ok).length,
      failedRuns: safeRuns.filter((run) => !run.ok).length,
      profiles: [...new Set(safeRuns.map((run) => run.profile.id))].sort(),
      passed: safeRuns.length > 0 && safeRuns.every((run) => run.ok),
    },
  };
}

export function validateByokBenchmarkReportContract(
  report: ByokBenchmarkReport,
  options: ByokBenchmarkReportContractOptions = {},
): ByokBenchmarkReportContractValidation {
  const failures: string[] = [];
  const warnings: string[] = [];
  const runs = Array.isArray(report.runs) ? report.runs : [];
  const profiles = runs
    .map((run) => run.profile?.id)
    .filter((profile): profile is ByokBenchmarkProfileId => typeof profile === 'string');

  if (report.kind !== 'geotech-byok-provider-benchmark') {
    failures.push('wrong_report_kind');
  }
  if (report.schemaVersion !== 1) {
    failures.push('wrong_report_schema_version');
  }
  if (runs.length === 0) {
    warnings.push('report_has_no_runs');
  }

  const passedRuns = runs.filter((run) => run.ok).length;
  const failedRuns = runs.filter((run) => !run.ok).length;
  const expectedProfiles = [...new Set(profiles)].sort();
  if (report.summary?.runCount !== runs.length) {
    failures.push('summary_run_count_mismatch');
  }
  if (report.summary?.passedRuns !== passedRuns) {
    failures.push('summary_passed_count_mismatch');
  }
  if (report.summary?.failedRuns !== failedRuns) {
    failures.push('summary_failed_count_mismatch');
  }
  if (report.summary?.passed !== (runs.length > 0 && runs.every((run) => run.ok))) {
    failures.push('summary_passed_flag_mismatch');
  }
  if (JSON.stringify(report.summary?.profiles ?? []) !== JSON.stringify(expectedProfiles)) {
    failures.push('summary_profiles_mismatch');
  }

  const observedProfiles = new Set(profiles);
  for (const requiredProfile of options.requiredProfiles ?? []) {
    if (!observedProfiles.has(requiredProfile)) {
      failures.push(`missing_required_profile_${requiredProfile}`);
    }
  }

  let evidenceSignature: string | null = null;
  for (const [index, run] of runs.entries()) {
    const profile = run.profile;
    const profileLabel = profile?.id ?? `run_${index}`;
    if (!profile) {
      failures.push(`missing_profile_${index}`);
      continue;
    }
    if (run.ok !== run.response.ok) {
      failures.push(`run_response_status_mismatch_${profileLabel}`);
    }
    if (run.ok && run.response.failures.length > 0) {
      failures.push(`passed_run_has_failures_${profileLabel}`);
    }
    validateByokBenchmarkProfileForReport(profile, failures);
    const signature = byokEvidenceComparabilitySignature(profile.evidenceContract);
    if (evidenceSignature == null) {
      evidenceSignature = signature;
    } else if (signature !== evidenceSignature) {
      failures.push(`evidence_contract_not_comparable_${profileLabel}`);
    }
  }

  for (const pointer of collectSensitiveReportPointers(report)) {
    failures.push(`sensitive_value_leak_${sanitizeFailureToken(pointer)}`);
  }

  return {
    ok: failures.length === 0,
    profiles: expectedProfiles,
    failures,
    warnings,
  };
}

export function attachByokBenchmarkReportContractValidation(
  report: ByokBenchmarkReport,
  options: ByokBenchmarkReportContractOptions = {},
): ByokBenchmarkReport {
  const { contractValidation: _previousValidation, ...reportWithoutPreviousValidation } = report;
  return {
    ...reportWithoutPreviousValidation,
    contractValidation: validateByokBenchmarkReportContract(reportWithoutPreviousValidation, options),
  };
}

export function inspectByokBenchmarkArtifactSafety(value: unknown): ByokBenchmarkArtifactSafety {
  const leaks = [...new Set(collectSensitiveReportPointers(value))];
  return {
    ok: leaks.length === 0,
    leaks,
  };
}

export function buildByokBenchmarkTrend(
  report: ByokBenchmarkReport,
  previousHistory: ByokBenchmarkHistoryEntry[] = [],
): ByokBenchmarkTrend {
  const current = buildByokBenchmarkHistoryEntry(report);
  const previous = previousHistory.at(-1) ?? null;
  const history = [...previousHistory, current].slice(-50);
  return {
    history,
    report: {
      kind: 'geotech-byok-provider-benchmark-trend',
      schemaVersion: 1,
      generatedAt: current.generatedAt,
      current,
      previous,
      delta: previous ? buildByokBenchmarkTrendDelta(current, previous) : null,
      historyCount: history.length,
      note: 'Local BYOK trend output stores provider benchmark summaries only. Raw prompts, source evidence snippets, responses, private paths, and provider tokens are intentionally excluded.',
    },
  };
}

export function validateByokBenchmarkTrendContract(report: ByokBenchmarkTrendReport): ByokBenchmarkTrendContractValidation {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (report.kind !== 'geotech-byok-provider-benchmark-trend') {
    failures.push('wrong_trend_kind');
  }
  if (report.schemaVersion !== 1) {
    failures.push('wrong_trend_schema_version');
  }
  if (!report.generatedAt) {
    failures.push('trend_missing_generated_at');
  }
  if (!Number.isInteger(report.historyCount) || report.historyCount < 1) {
    failures.push('trend_history_count_invalid');
  }
  if (!/raw prompts|source evidence snippets|provider tokens/i.test(report.note ?? '')) {
    warnings.push('trend_note_should_state_excluded_sensitive_inputs');
  }

  validateByokBenchmarkHistoryEntry(report.current, failures, 'current');
  if (report.previous !== null) {
    validateByokBenchmarkHistoryEntry(report.previous, failures, 'previous');
  }
  if (report.previous && report.delta == null) {
    failures.push('trend_delta_required_when_previous_exists');
  }

  const serialized = JSON.stringify(report);
  if (/"sourceEvidence"|"snippet"|"response"|"prompt"/.test(serialized)) {
    failures.push('trend_contains_raw_prompt_response_or_source_evidence');
  }
  for (const pointer of inspectByokBenchmarkArtifactSafety(report).leaks) {
    failures.push(`trend_sensitive_value_leak_${sanitizeFailureToken(pointer)}`);
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function buildByokBenchmarkHistoryEntry(report: ByokBenchmarkReport): ByokBenchmarkHistoryEntry {
  const safety = inspectByokBenchmarkArtifactSafety(report);
  const latencies = report.runs
    .map((run) => run.latencyMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const tokenCounts = report.runs
    .map((run) => run.totalTokens)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const evidenceInputs = [...new Set(report.runs.map((run) => run.profile.evidenceContract.evidenceInput))];

  return {
    kind: 'geotech-byok-provider-benchmark-history-entry',
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    summary: {
      runCount: report.summary.runCount,
      passedRuns: report.summary.passedRuns,
      failedRuns: report.summary.failedRuns,
      passed: report.summary.passed,
      profiles: [...report.summary.profiles],
      evidenceInput: evidenceInputs.length === 1 ? evidenceInputs[0]! : 'none',
      averageLatencyMs: latencies.length > 0
        ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
        : null,
      totalTokens: tokenCounts.length > 0
        ? tokenCounts.reduce((sum, value) => sum + value, 0)
        : null,
      pathLeakCount: safety.leaks.length,
    },
  };
}

function validateByokBenchmarkHistoryEntry(
  entry: ByokBenchmarkHistoryEntry | null | undefined,
  failures: string[],
  prefix: string,
): void {
  if (!entry || typeof entry !== 'object') {
    failures.push(`${prefix}_history_entry_missing`);
    return;
  }
  if (entry.kind !== 'geotech-byok-provider-benchmark-history-entry') {
    failures.push(`${prefix}_history_wrong_kind`);
  }
  if (entry.schemaVersion !== 1) {
    failures.push(`${prefix}_history_wrong_schema_version`);
  }
  if (!entry.generatedAt) {
    failures.push(`${prefix}_history_missing_generated_at`);
  }

  const summary = entry.summary;
  if (!summary || typeof summary !== 'object') {
    failures.push(`${prefix}_history_summary_missing`);
    return;
  }
  for (const key of ['runCount', 'passedRuns', 'failedRuns', 'pathLeakCount'] as const) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      failures.push(`${prefix}_history_${key}_invalid`);
    }
  }
  if (summary.runCount !== summary.passedRuns + summary.failedRuns) {
    failures.push(`${prefix}_history_run_count_mismatch`);
  }
  if (summary.passed !== (summary.runCount > 0 && summary.failedRuns === 0)) {
    failures.push(`${prefix}_history_passed_flag_mismatch`);
  }
  if (!Array.isArray(summary.profiles)) {
    failures.push(`${prefix}_history_profiles_invalid`);
  }
  if (summary.evidenceInput !== 'preprocessed-page-evidence' && summary.evidenceInput !== 'none') {
    failures.push(`${prefix}_history_wrong_evidence_input`);
  }
  if (summary.pathLeakCount !== 0) {
    failures.push(`${prefix}_history_path_leaks_present`);
  }
}

function buildByokBenchmarkTrendDelta(
  current: ByokBenchmarkHistoryEntry,
  previous: ByokBenchmarkHistoryEntry,
): NonNullable<ByokBenchmarkTrendReport['delta']> {
  return {
    runCount: current.summary.runCount - previous.summary.runCount,
    passedRuns: current.summary.passedRuns - previous.summary.passedRuns,
    failedRuns: current.summary.failedRuns - previous.summary.failedRuns,
    averageLatencyMs: nullableDelta(current.summary.averageLatencyMs, previous.summary.averageLatencyMs),
    totalTokens: nullableDelta(current.summary.totalTokens, previous.summary.totalTokens),
    pathLeakCount: current.summary.pathLeakCount - previous.summary.pathLeakCount,
  };
}

function nullableDelta(current: number | null, previous: number | null): number | null {
  return current == null || previous == null ? null : current - previous;
}

function sanitizeFailureToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
}

function validateByokBenchmarkProfileForReport(
  profile: ByokProviderBenchmarkProfile,
  failures: string[],
): void {
  const label = profile.id;
  const contract = profile.evidenceContract;
  if (profile.requestContainsImageInput !== false) {
    failures.push(`profile_${label}_contains_image_input`);
  }
  if (profile.requestContainsNativePdfInput !== false) {
    failures.push(`profile_${label}_contains_native_pdf_input`);
  }
  if (contract.schemaVersion !== 'geotech.byok-evidence-contract.v1') {
    failures.push(`profile_${label}_wrong_contract_schema`);
  }
  if (contract.evidenceInput !== 'preprocessed-page-evidence') {
    failures.push(`profile_${label}_wrong_evidence_input`);
  }
  if (!contract.prohibitedInputs.includes('direct-image')) {
    failures.push(`profile_${label}_allows_direct_image`);
  }
  if (!contract.prohibitedInputs.includes('native-pdf')) {
    failures.push(`profile_${label}_allows_native_pdf`);
  }
  for (const key of BYOK_REQUIRED_RESPONSE_KEYS) {
    if (!contract.requiredResponseKeys.includes(key)) {
      failures.push(`profile_${label}_missing_required_key_${key}`);
    }
  }
  if (!contract.reviewGates.includes('source-evidence-required')) {
    failures.push(`profile_${label}_missing_source_evidence_gate`);
  }
  if (!contract.reviewGates.includes('human-engineering-review-required')) {
    failures.push(`profile_${label}_missing_human_review_gate`);
  }
  if (BYOK_TEXT_EVIDENCE_PROFILE_IDS.has(profile.id)) {
    if (!profile.capabilityProfile.preprocessingPolicy.requirePreprocessedEvidence) {
      failures.push(`profile_${label}_does_not_require_preprocessed_evidence`);
    }
    if (profile.id === 'openrouter-free' && !contract.reviewGates.includes('free-route-capacity-and-feature-variance')) {
      failures.push(`profile_${label}_missing_free_route_gate`);
    }
  }
  const evidenceIds = new Set<string>();
  for (const item of contract.sourceEvidence) {
    if (evidenceIds.has(item.evidenceId)) {
      failures.push(`profile_${label}_duplicate_evidence_id_${sanitizeFailureToken(item.evidenceId)}`);
    }
    evidenceIds.add(item.evidenceId);
    if (!item.sourcePage.trim()) {
      failures.push(`profile_${label}_missing_source_page_${sanitizeFailureToken(item.evidenceId)}`);
    }
    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
      failures.push(`profile_${label}_invalid_evidence_confidence_${sanitizeFailureToken(item.evidenceId)}`);
    }
    if (!item.snippet.trim()) {
      failures.push(`profile_${label}_empty_evidence_snippet_${sanitizeFailureToken(item.evidenceId)}`);
    }
  }
  if (evidenceIds.size === 0) {
    failures.push(`profile_${label}_missing_source_evidence`);
  }
}

function byokEvidenceComparabilitySignature(contract: ByokBenchmarkEvidenceContract): string {
  return JSON.stringify({
    evidenceInput: contract.evidenceInput,
    prohibitedInputs: [...contract.prohibitedInputs].sort(),
    requiredResponseKeys: contract.requiredResponseKeys,
    sourceEvidence: contract.sourceEvidence.map((item) => ({
      evidenceId: item.evidenceId,
      sourcePage: item.sourcePage,
      method: item.method,
      snippet: item.snippet,
    })),
  });
}

function redactByokBenchmarkRun(run: ByokBenchmarkRunSummary): ByokBenchmarkRunSummary {
  return {
    ...run,
    profile: redactByokProviderBenchmarkProfile(run.profile),
    model: redactNullableString(run.model),
    response: {
      ...run.response,
      citedEvidenceIds: run.response.citedEvidenceIds.map(redactSensitiveReportText),
      failures: run.response.failures.map(redactSensitiveReportText),
      warnings: run.response.warnings.map(redactSensitiveReportText),
    },
    error: run.error == null ? undefined : redactSensitiveReportText(run.error),
  };
}

function redactByokProviderBenchmarkProfile(
  profile: ByokProviderBenchmarkProfile,
): ByokProviderBenchmarkProfile {
  return {
    ...profile,
    modelId: redactNullableString(profile.modelId),
    visionModelId: redactNullableString(profile.visionModelId),
    capabilityProfile: {
      ...profile.capabilityProfile,
      modelId: redactNullableString(profile.capabilityProfile.modelId),
      visionModelId: redactNullableString(profile.capabilityProfile.visionModelId),
      reviewGates: profile.capabilityProfile.reviewGates.map(redactSensitiveReportText),
    },
    evidenceContract: {
      ...profile.evidenceContract,
      sourceEvidence: profile.evidenceContract.sourceEvidence.map((item) => ({
        ...item,
        evidenceId: redactSensitiveReportText(item.evidenceId),
        sourcePage: redactSensitiveReportText(item.sourcePage),
        snippet: redactSensitiveReportText(item.snippet),
      })),
      requiredResponseKeys: profile.evidenceContract.requiredResponseKeys.map(redactSensitiveReportText),
      reviewGates: profile.evidenceContract.reviewGates.map(redactSensitiveReportText),
    },
  };
}

function redactNullableString(value: string | null): string | null {
  return value == null ? null : redactSensitiveReportText(value);
}

function redactSensitiveReportText(value: string): string {
  return value
    .replace(/\b[A-Za-z]:[\\/][^\s"',}<]+/g, '[redacted-path]')
    .replace(/(^|[\s"'=])\/(?:Users|home|var|tmp|private|mnt|Volumes|etc)\/[^\s"',}<]+/gi, '$1[redacted-path]')
    .replace(/sk-or-v1-[A-Za-z0-9_-]{8,}/g, 'sk-or-v1-***')
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-***')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/hf_[A-Za-z0-9_-]{8,}/g, 'hf_***')
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer ***')
    .replace(/((?:api[_-]?key|token|secret)\s*[:=]\s*)[A-Za-z0-9._-]{8,}/gi, '$1***');
}

function collectSensitiveReportPointers(value: unknown, pointer = 'report'): string[] {
  if (typeof value === 'string') {
    return redactSensitiveReportText(value) === value ? [] : [pointer];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectSensitiveReportPointers(item, `${pointer}_${index}`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    collectSensitiveReportPointers(item, `${pointer}_${key}`),
  );
}
