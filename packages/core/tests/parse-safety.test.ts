import { describe, it, expect } from 'vitest';

import {
  createParseSafety,
  deriveParseStatus,
  parseJsonObject,
} from '../src/vision/parse.js';
import {
  buildBlockedFemProductionOverclaimAnswer,
  extractToolSafetyIssue,
  serializeContextForPrompt,
  serializeToolDataForPrompt,
} from '../src/agents/safety.js';

describe('Parse safety helpers', () => {
  it('marks invalid JSON as failed and blocked', () => {
    const parsed = parseJsonObject('not-json');
    const status = deriveParseStatus(parsed.baseStatus, 0, 2);
    const safety = createParseSafety(status, 0, parsed.warnings);

    expect(parsed.baseStatus).toBe('failed');
    expect(safety.canAutoProceed).toBe(false);
    expect(safety.warnings[0]).toContain('not valid JSON');
  });

  it('extracts an embedded JSON object from a narrative response', () => {
    const parsed = parseJsonObject('Here is the result: {"sensorType":"piezometer","confidence":62}');

    expect(parsed.baseStatus).toBe('partial');
    expect(parsed.value?.sensorType).toBe('piezometer');
    expect(parsed.warnings[0]).toContain('extracted the JSON object');
  });

  it('allows complete high-confidence results to auto proceed', () => {
    const safety = createParseSafety('parsed', 82, []);
    expect(safety.parseStatus).toBe('parsed');
    expect(safety.canAutoProceed).toBe(true);
  });

  it('blocks partial results even with confidence', () => {
    const status = deriveParseStatus('parsed', 2, 4);
    const safety = createParseSafety(status, 90, ['missing fields']);
    expect(status).toBe('partial');
    expect(safety.canAutoProceed).toBe(false);
  });
});

describe('Agent safety helpers', () => {
  it('extracts a blocked tool safety issue', () => {
    const issue = extractToolSafetyIssue({
      parseStatus: 'partial',
      confidence: 61,
      warnings: ['Missing RQD'],
      canAutoProceed: false,
    });

    expect(issue).not.toBeNull();
    expect(issue!.parseStatus).toBe('partial');
    expect(issue!.confidence).toBe(61);
    expect(issue!.warnings).toContain('Missing RQD');
  });

  it('does not block a review-gated FEM draft that has no missing inputs', () => {
    const issue = extractToolSafetyIssue({
      schemaVersion: 'fem-analysis-case-draft.v1',
      canAutoProceed: false,
      missingUserInputs: [],
      validation: {
        status: 'review',
        blockers: 0,
        reviewItems: 4,
      },
      agentEvidenceSummary: 'FEM objective: foundation-settlement\ncanAutoProceed: no',
    });

    expect(issue).toBeNull();
  });

  it('blocks FEM drafts that still have missing deterministic inputs', () => {
    const issue = extractToolSafetyIssue({
      schemaVersion: 'fem-analysis-case-draft.v1',
      canAutoProceed: false,
      missingUserInputs: ['raft length'],
      validation: {
        status: 'blocked',
        blockers: 1,
      },
      agentEvidenceSummary: 'FEM objective: foundation-settlement\ncanAutoProceed: no',
    });

    expect(issue).not.toBeNull();
    expect(issue!.message).toContain('FEM draft blocked');
    expect(issue!.warnings).toContain('raft length');
  });

  it('serializes and truncates large contexts', () => {
    const text = serializeContextForPrompt({
      veryLarge: 'x'.repeat(200),
    }, 80);

    expect(text).toContain('truncated');
    expect(text!.length).toBeGreaterThan(80);
  });

  it('keeps agent evidence summaries ahead of truncated tool data', () => {
    const text = serializeToolDataForPrompt({
      agentEvidenceSummary: [
        'DocumentEvidencePacket v2 provider-neutral agent context.',
        'source pages 2',
        'Review gates: direct-visual-verification-required',
        'Missing parameters: Groundwater level',
        'Boreholes: BH1; max depth 10 m',
      ].join('\n'),
      pageAudits: Array.from({ length: 50 }, (_value, index) => ({
        pageNumber: index + 1,
        raw: 'x'.repeat(80),
      })),
    }, 700);

    expect(text).toContain('Agent evidence summary');
    expect(text).toContain('source pages 2');
    expect(text).toContain('Missing parameters: Groundwater level');
    expect(text).toContain('Boreholes: BH1; max depth 10 m');
    expect(text.indexOf('Agent evidence summary')).toBeLessThan(text.indexOf('Compact tool data JSON'));
    expect(text).toContain('truncated');
  });

  it('blocks FEM production overclaim paraphrases after readiness says productionReady no', () => {
    const context = {
      assess_fem_production_readiness: {
        productionReady: false,
        blockers: ['published-commercial-cross-solver-benchmark-corpus-not-approved'],
        safeUserActions: ['Use implemented routes only as experimental, human-reviewed previews.'],
        engineeringEvidence: {
          externalBenchmarkAcceptance: {
            blockerCodes: ['external-benchmark-comparison-results-missing'],
          },
        },
      },
    };

    for (const phrase of [
      'The FEM path is production design ready.',
      'This is design-approved.',
      'The workflow is ready to use on production projects.',
      'Verified kernels prove production approval.',
    ]) {
      const blocked = buildBlockedFemProductionOverclaimAnswer(phrase, context);
      expect(blocked).toContain('Blocked FEM production overclaim');
      expect(blocked).toContain('productionReady: no');
      expect(blocked).toContain('external-benchmark-comparison-results-missing');
    }
  });

  it('allows negated FEM production wording after blocked readiness', () => {
    const context = {
      assess_fem_production_readiness: {
        productionReady: false,
        blockers: ['published-commercial-cross-solver-benchmark-corpus-not-approved'],
      },
    };

    expect(buildBlockedFemProductionOverclaimAnswer(
      'The FEM path is not design-approved and is not ready for production design.',
      context,
    )).toBeNull();
  });
});
