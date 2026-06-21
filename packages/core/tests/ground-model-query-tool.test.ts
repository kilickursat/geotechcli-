import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import '../src/agents/runtime-bootstrap.js';
import { toolRegistry } from '../src/agents/tools.js';

const tempDirs: string[] = [];

function makePopulatedWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'geotech-gm-query-'));
  tempDirs.push(dir);

  writeFileSync(
    join(dir, 'spt-profile.csv'),
    [
      'borehole_id,description,depth_m,sptN',
      'BH-01,"silty sand, dense",1.5,12',
      'BH-01,"silty sand, dense",3.0,18',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(dir, 'site.ags'),
    [
      '"GROUP","LOCA"',
      '"HEADING","LOCA_ID","LOCA_NATE","LOCA_NATN"',
      '"DATA","BH-01","500000","3200000"',
    ].join('\n'),
    'utf-8',
  );

  return dir;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).sort();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('query_ground_model tool', () => {
  it('returns the deterministic GroundModel detail for a populated workspace', async () => {
    const dir = makePopulatedWorkspace();

    const result = await toolRegistry.execute('query_ground_model', {
      workspace: dir,
      section: 'all',
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, any>;
    expect(data.source).toBe('workspace-scan');
    expect(data.available).toBe(true);
    expect(data.counts.boreholes).toBe(1);
    expect(data.counts.strata).toBeGreaterThan(0);
    expect(data.counts.sptTests).toBe(2);

    // strata detail and evidence ids are surfaced
    expect(Array.isArray(data.strata)).toBe(true);
    expect(data.strata.length).toBeGreaterThan(0);
    const firstStratum = data.strata[0];
    expect(Array.isArray(firstStratum.evidenceIds)).toBe(true);
    expect(firstStratum.evidenceIds[0]).toMatch(/^ev-/);
  });

  it('narrows results to a single borehole via boreholeId filter', async () => {
    const dir = makePopulatedWorkspace();

    const result = await toolRegistry.execute('query_ground_model', {
      workspace: dir,
      section: 'all',
      boreholeId: 'BH-01',
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, any>;
    expect(data.available).toBe(true);
    expect(data.counts.boreholes).toBe(1);
    expect(data.boreholes[0].id).toBe('BH-01');

    // a filter to a non-existent borehole yields no boreholes
    const empty = await toolRegistry.execute('query_ground_model', {
      workspace: dir,
      section: 'all',
      boreholeId: 'BH-NOPE',
    });
    expect(empty.success).toBe(true);
    const emptyData = empty.data as Record<string, any>;
    expect(emptyData.counts.boreholes).toBe(0);
  });

  it('handles an empty workspace gracefully', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'geotech-gm-query-empty-'));
    tempDirs.push(dir);

    const result = await toolRegistry.execute('query_ground_model', { workspace: dir });

    // An empty workspace yields no boreholes/strata; the tool still succeeds and reports
    // an empty deterministic model rather than throwing.
    expect(result.success).toBe(true);
    const data = result.data as Record<string, any>;
    expect(data.source).toBe('workspace-scan');
    expect(data.counts.boreholes).toBe(0);
    expect(data.counts.strata).toBe(0);
  });

  it('is read-only and creates no files in the workspace', async () => {
    const dir = makePopulatedWorkspace();
    const before = listFiles(dir);

    await toolRegistry.execute('query_ground_model', { workspace: dir, section: 'all' });

    const after = listFiles(dir);
    expect(after).toEqual(before);
  });
});
