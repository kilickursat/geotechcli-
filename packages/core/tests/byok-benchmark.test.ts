import { describe, expect, it } from 'vitest';

import {
  buildByokBenchmarkPrompt,
  buildByokBenchmarkReport,
  buildByokProviderBenchmarkProfile,
  validateByokBenchmarkResponse,
} from '../src/llm/index.js';

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
  });

  it('does not mark an empty skipped benchmark as passed', () => {
    const report = buildByokBenchmarkReport([], '2026-06-01T00:00:00.000Z');

    expect(report.summary).toMatchObject({
      runCount: 0,
      passedRuns: 0,
      failedRuns: 0,
      passed: false,
      profiles: [],
    });
  });
});
