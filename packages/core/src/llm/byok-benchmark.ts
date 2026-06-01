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
}

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
  return {
    kind: 'geotech-byok-provider-benchmark',
    schemaVersion: 1,
    generatedAt: generated,
    runs,
    summary: {
      runCount: runs.length,
      passedRuns: runs.filter((run) => run.ok).length,
      failedRuns: runs.filter((run) => !run.ok).length,
      profiles: [...new Set(runs.map((run) => run.profile.id))].sort(),
      passed: runs.length > 0 && runs.every((run) => run.ok),
    },
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

function sanitizeFailureToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
}
