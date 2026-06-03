import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  attachByokBenchmarkReportContractValidation,
  buildByokBenchmarkPrompt,
  buildByokBenchmarkReport,
  buildByokBenchmarkTrend,
  buildByokProviderBenchmarkProfile,
  inspectByokBenchmarkArtifactSafety,
  validateByokBenchmarkResponse,
  validateByokBenchmarkReportContract,
  validateByokBenchmarkTrendContract,
  type ByokBenchmarkProfileId,
  type ByokBenchmarkReport,
  type LLMConfig,
  type ProviderCapabilityProfileId,
} from '../src/llm/index.js';

const testDir = dirname(fileURLToPath(import.meta.url));

interface ByokProviderEvidenceFixture {
  schemaVersion: string;
  requiredProfiles: Array<{
    id: ByokBenchmarkProfileId;
    provider: LLMConfig['provider'];
    modelId: string;
    visionModelId: string;
    expectedCapabilityProfile: ProviderCapabilityProfileId;
    likelyFreeRoute: boolean;
    requiredReviewGates: string[];
  }>;
  safeResponse: Record<string, unknown>;
  unsafeReportLeak: {
    model: string;
    error: string;
  };
}

function loadByokProviderEvidenceFixture(): ByokProviderEvidenceFixture {
  return JSON.parse(readFileSync(join(
    testDir,
    'fixtures',
    'byok-provider-evidence-contract.fixture.json',
  ), 'utf8')) as ByokProviderEvidenceFixture;
}

describe('BYOK provider benchmark contract', () => {
  it('uses the same preprocessed page-evidence contract for hosted and OpenRouter/free providers', () => {
    const hosted = buildByokProviderBenchmarkProfile('hosted-beta', {
      provider: 'hosted-beta',
      modelId: 'glm-5.1',
      visionModelId: 'glm-5v-turbo',
    });
    const openrouter = buildByokProviderBenchmarkProfile('openrouter-free', {
      provider: 'openai-compatible',
      modelId: 'google/gemma-4-26b-a4b-it:free',
      visionModelId: '',
    });

    expect(hosted.evidenceContract.evidenceInput).toBe('preprocessed-page-evidence');
    expect(openrouter.evidenceContract.evidenceInput).toBe('preprocessed-page-evidence');
    expect(hosted.requestContainsImageInput).toBe(false);
    expect(hosted.requestContainsNativePdfInput).toBe(false);
    expect(openrouter.requestContainsImageInput).toBe(false);
    expect(openrouter.requestContainsNativePdfInput).toBe(false);
    expect(openrouter.capabilityProfile.likelyFreeRoute).toBe(true);
    expect(openrouter.evidenceContract.reviewGates).toEqual(expect.arrayContaining([
      'native-pdf-unavailable-use-preprocessed-evidence',
      'free-route-capacity-and-feature-variance',
      'source-evidence-required',
    ]));

    const hostedPrompt = buildByokBenchmarkPrompt(hosted);
    const openrouterPrompt = buildByokBenchmarkPrompt(openrouter);
    expect(hostedPrompt).toContain('Evidence input: preprocessed-page-evidence');
    expect(openrouterPrompt).toContain('Evidence input: preprocessed-page-evidence');
    expect(hostedPrompt).not.toMatch(/image_url|document_url|base64/i);
    expect(openrouterPrompt).not.toMatch(/image_url|document_url|base64/i);
  });

  it('validates source-evidence citations and review gates instead of model self-score', () => {
    const profile = buildByokProviderBenchmarkProfile('openai-compatible', {
      provider: 'openai-compatible',
      modelId: 'local/model',
      visionModelId: '',
    });
    const valid = validateByokBenchmarkResponse(JSON.stringify({
      ok: true,
      evidence_input: 'preprocessed-page-evidence',
      cited_evidence_ids: ['ev-page-3-bh1-spt', 'ev-page-5-groundwater-gap'],
      takeaway: 'Source evidence supports SPT N=18 at BH-01, while groundwater remains review-gated.',
      review_gates: ['missing-groundwater-review-required', 'human-engineering-review-required'],
    }), profile.evidenceContract);

    expect(valid).toMatchObject({
      ok: true,
      parsedJson: true,
      failures: [],
    });

    const invalid = validateByokBenchmarkResponse(JSON.stringify({
      ok: true,
      evidence_input: 'native-pdf',
      cited_evidence_ids: ['fake-evidence'],
      takeaway: 'I inspected the PDF and the design is ready.',
      review_gates: [],
    }), profile.evidenceContract);

    expect(invalid.ok).toBe(false);
    expect(invalid.failures).toEqual(expect.arrayContaining([
      'wrong_evidence_input',
      'unknown_evidence_id_fake-evidence',
      'review_gate_not_preserved',
      'claimed_prohibited_image_or_pdf_inspection',
    ]));
  });

  it('builds comparable run reports across provider profiles', () => {
    const hosted = buildByokProviderBenchmarkProfile('hosted-beta', {
      provider: 'hosted-beta',
      modelId: 'glm-5.1',
      visionModelId: 'glm-5v-turbo',
    });
    const local = buildByokProviderBenchmarkProfile('local-hf-compatible', {
      provider: 'huggingface',
      modelId: 'local-or-hf-compatible/text-evidence-model',
      visionModelId: '',
    });
    const report = buildByokBenchmarkReport([
      {
        profile: hosted,
        ok: true,
        model: 'glm-5.1',
        latencyMs: 120,
        totalTokens: 42,
        response: {
          ok: true,
          parsedJson: true,
          citedEvidenceIds: ['ev-page-3-bh1-spt'],
          failures: [],
          warnings: [],
        },
      },
      {
        profile: local,
        ok: false,
        model: 'local-model',
        latencyMs: 300,
        totalTokens: 12,
        response: {
          ok: false,
          parsedJson: false,
          citedEvidenceIds: [],
          failures: ['response_not_json'],
          warnings: [],
        },
      },
    ], '2026-06-01T00:00:00.000Z');

    expect(report.kind).toBe('geotech-byok-provider-benchmark');
    expect(report.summary).toMatchObject({
      runCount: 2,
      passedRuns: 1,
      failedRuns: 1,
      passed: false,
      profiles: ['hosted-beta', 'local-hf-compatible'],
    });
    expect(report.runs[1]?.profile.evidenceContract.prohibitedInputs).toEqual(['direct-image', 'native-pdf']);
    const artifact = attachByokBenchmarkReportContractValidation(report);
    expect(artifact.contractValidation).toMatchObject({
      ok: true,
      failures: [],
      profiles: ['hosted-beta', 'local-hf-compatible'],
    });
  });

  it('does not mark an empty skipped benchmark as passed', () => {
    const report = buildByokBenchmarkReport([], '2026-06-01T00:00:00.000Z');
    const artifact = attachByokBenchmarkReportContractValidation(report);

    expect(report.summary).toMatchObject({
      runCount: 0,
      passedRuns: 0,
      failedRuns: 0,
      passed: false,
      profiles: [],
    });
    expect(artifact.contractValidation).toMatchObject({
      ok: true,
      warnings: ['report_has_no_runs'],
    });
  });

  it('fixture-checks the live provider matrix against one comparable evidence contract', () => {
    const fixture = loadByokProviderEvidenceFixture();
    const requiredProfiles = fixture.requiredProfiles.map((entry) => entry.id);
    const runs = fixture.requiredProfiles.map((entry, index) => {
      const profile = buildByokProviderBenchmarkProfile(entry.id, {
        provider: entry.provider,
        modelId: entry.modelId,
        visionModelId: entry.visionModelId,
      });
      const response = validateByokBenchmarkResponse(
        JSON.stringify(fixture.safeResponse),
        profile.evidenceContract,
      );

      expect(profile.capabilityProfile.id).toBe(entry.expectedCapabilityProfile);
      expect(profile.capabilityProfile.likelyFreeRoute).toBe(entry.likelyFreeRoute);
      expect(profile.requestContainsImageInput).toBe(false);
      expect(profile.requestContainsNativePdfInput).toBe(false);
      expect(profile.evidenceContract.evidenceInput).toBe('preprocessed-page-evidence');
      expect(profile.evidenceContract.prohibitedInputs).toEqual(['direct-image', 'native-pdf']);
      expect(profile.evidenceContract.reviewGates).toEqual(expect.arrayContaining(entry.requiredReviewGates));

      return {
        profile,
        ok: response.ok,
        model: profile.modelId,
        latencyMs: 100 + index,
        totalTokens: 50 + index,
        response,
      };
    });

    const report = buildByokBenchmarkReport(runs, '2026-06-01T00:00:00.000Z');
    const validation = validateByokBenchmarkReportContract(report, { requiredProfiles });
    const artifact = attachByokBenchmarkReportContractValidation(report, { requiredProfiles });

    expect(validation).toMatchObject({
      ok: true,
      failures: [],
      profiles: ['hosted-beta', 'local-hf-compatible', 'openai-compatible', 'openrouter-free'],
    });
    expect(report.summary).toMatchObject({
      runCount: 4,
      passedRuns: 4,
      failedRuns: 0,
      passed: true,
    });
    expect(artifact.contractValidation).toMatchObject({
      ok: true,
      failures: [],
      profiles: ['hosted-beta', 'local-hf-compatible', 'openai-compatible', 'openrouter-free'],
    });
    expect(JSON.stringify(artifact)).toContain('"contractValidation"');
    expect(inspectByokBenchmarkArtifactSafety(artifact).ok).toBe(true);
  });

  it('redacts report paths/secrets and fails raw unsafe provider reports', () => {
    const fixture = loadByokProviderEvidenceFixture();
    const profile = buildByokProviderBenchmarkProfile('openrouter-free', {
      provider: 'openai-compatible',
      modelId: 'google/gemma-4-26b-a4b-it:free',
      visionModelId: '',
    });
    const response = validateByokBenchmarkResponse(JSON.stringify(fixture.safeResponse), profile.evidenceContract);
    const safeReport = buildByokBenchmarkReport([
      {
        profile,
        ok: true,
        model: fixture.unsafeReportLeak.model,
        latencyMs: 120,
        totalTokens: 40,
        response,
        error: fixture.unsafeReportLeak.error,
      },
    ], '2026-06-01T00:00:00.000Z');

    const serialized = JSON.stringify(safeReport);
    expect(serialized).not.toContain('C:\\Users\\Databil');
    expect(serialized).not.toContain('sk-or-v1-abcdefghijklmnopqrstuvwxyz');
    expect(serialized).toContain('[redacted-path]');
    expect(serialized).toContain('sk-or-v1-***');
    expect(validateByokBenchmarkReportContract(safeReport).ok).toBe(true);

    const firstRun = safeReport.runs[0]!;
    const rawUnsafeReport = {
      ...safeReport,
      runs: [
        {
          ...firstRun,
          model: fixture.unsafeReportLeak.model,
          error: fixture.unsafeReportLeak.error,
          profile: {
            ...firstRun.profile,
            requestContainsImageInput: true,
            evidenceContract: {
              ...firstRun.profile.evidenceContract,
              evidenceInput: 'native-pdf',
              sourceEvidence: [
                {
                  ...firstRun.profile.evidenceContract.sourceEvidence[0]!,
                  evidenceId: 'model-specific-native-pdf-page',
                  snippet: `I inspected ${fixture.unsafeReportLeak.model} directly.`,
                },
              ],
            },
          },
        },
      ],
      summary: {
        ...safeReport.summary,
        profiles: ['openrouter-free'],
      },
    } as unknown as ByokBenchmarkReport;

    const unsafeValidation = validateByokBenchmarkReportContract(rawUnsafeReport, {
      requiredProfiles: ['hosted-beta', 'openai-compatible', 'openrouter-free', 'local-hf-compatible'],
    });

    expect(unsafeValidation.ok).toBe(false);
    expect(unsafeValidation.failures).toEqual(expect.arrayContaining([
      'missing_required_profile_hosted-beta',
      'missing_required_profile_openai-compatible',
      'missing_required_profile_local-hf-compatible',
      'profile_openrouter-free_contains_image_input',
      'profile_openrouter-free_wrong_evidence_input',
    ]));
    expect(unsafeValidation.failures.some((failure) =>
      failure.startsWith('sensitive_value_leak_report_runs_0_model'),
    )).toBe(true);
    expect(unsafeValidation.failures.some((failure) =>
      failure.startsWith('sensitive_value_leak_report_runs_0_error'),
    )).toBe(true);
  });

  it('builds path-safe BYOK trend artifacts without raw prompts, responses, or source evidence', () => {
    const fixture = loadByokProviderEvidenceFixture();
    const runs = fixture.requiredProfiles.slice(0, 2).map((entry, index) => {
      const profile = buildByokProviderBenchmarkProfile(entry.id, {
        provider: entry.provider,
        modelId: entry.modelId,
        visionModelId: entry.visionModelId,
      });
      const response = validateByokBenchmarkResponse(
        JSON.stringify(fixture.safeResponse),
        profile.evidenceContract,
      );
      return {
        profile,
        ok: response.ok,
        model: profile.modelId,
        latencyMs: 100 + index * 10,
        totalTokens: 40 + index,
        response,
      };
    });
    const first = buildByokBenchmarkReport(runs, '2026-06-01T00:00:00.000Z');
    const second = buildByokBenchmarkReport([
      ...runs,
      {
        ...runs[0]!,
        latencyMs: 150,
        totalTokens: 44,
      },
    ], '2026-06-01T01:00:00.000Z');
    const firstTrend = buildByokBenchmarkTrend(first);
    const secondTrend = buildByokBenchmarkTrend(second, firstTrend.history);

    expect(validateByokBenchmarkTrendContract(firstTrend.report)).toMatchObject({
      ok: true,
      failures: [],
    });
    expect(validateByokBenchmarkTrendContract(secondTrend.report)).toMatchObject({
      ok: true,
      failures: [],
    });
    expect(secondTrend.report.historyCount).toBe(2);
    expect(secondTrend.report.current.summary).toMatchObject({
      runCount: 3,
      passedRuns: 3,
      failedRuns: 0,
      passed: true,
      evidenceInput: 'preprocessed-page-evidence',
      pathLeakCount: 0,
    });
    expect(secondTrend.report.delta).toMatchObject({
      runCount: 1,
      failedRuns: 0,
      pathLeakCount: 0,
    });

    const serialized = JSON.stringify(secondTrend.report);
    expect(serialized).not.toContain('"sourceEvidence"');
    expect(serialized).not.toContain('"snippet"');
    expect(serialized).not.toContain('"citedEvidenceIds"');
    expect(inspectByokBenchmarkArtifactSafety(secondTrend.report).ok).toBe(true);
  });
});
