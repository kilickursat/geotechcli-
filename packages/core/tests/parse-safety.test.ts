import { describe, it, expect } from 'vitest';

import {
  createParseSafety,
  deriveParseStatus,
  parseJsonObject,
} from '../src/vision/parse.js';
import {
  extractToolSafetyIssue,
  serializeContextForPrompt,
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
});
