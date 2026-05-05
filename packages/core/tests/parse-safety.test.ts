import { describe, it, expect } from 'vitest';

import {
  createParseSafety,
  deriveParseStatus,
  parseJsonObject,
} from '../src/vision/parse.js';
import {
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
});
