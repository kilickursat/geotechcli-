import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toolRegistry } from '../src/agents/tools.js';

import '../src/agents/signal-tools.js';

describe('signal agent tool', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  it('analyzes monitoring data through the sandboxed deterministic tool', async () => {
    const dir = mkdtempSync(join(process.cwd(), '__signal-tool-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'settlement-monitoring.csv');
    writeFileSync(
      filePath,
      [
        'timestamp,instrument_id,settlement_mm',
        '2026-01-01T00:00:00Z,SM-1,0',
        '2026-01-02T00:00:00Z,SM-1,1',
        '2026-01-05T00:00:00Z,SM-1,8',
      ].join('\n'),
      'utf-8',
    );

    const result = await toolRegistry.execute('analyze_signal_file', {
      path: filePath,
      type: 'settlement',
      thresholdProfile: 'auto',
      threshold: 5,
      rateThreshold: 2,
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('Signal analysis (settlement)');
    const data = result.data as any;
    expect(data.schemaVersion).toBe('signal-analysis.v0');
    expect(data.source.path).toBe('settlement-monitoring.csv');
    expect(data.thresholdProfile.id).toBe('settlement-review-mm');
    expect(data.thresholdProfile.reviewGates).toContain('project-trigger-levels-required');
    expect(data.source.rowsAnalyzed).toBe(3);
    expect(data.series).toHaveLength(1);
    expect(data.thresholdFlags.map((flag: any) => flag.kind)).toEqual(['value-threshold', 'rate-threshold']);
    expect(data.missingIntervals).toEqual([
      expect.objectContaining({ seriesId: 'SM-1', missingIntervals: 2 }),
    ]);
  });

  it('blocks signal file paths outside allowed directories', async () => {
    const blockedPath = join(process.cwd(), '..', '__outside-signal.csv');
    const result = await toolRegistry.execute('analyze_signal_file', { path: blockedPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('outside allowed directories');
  });
});
