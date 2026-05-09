import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAnalyzeCommand } from '../src/commands/analyze.js';

describe('analyze command', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('prints JSON workspace manifest for automation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-cli-analyze-'));
    tempDirs.push(dir);
    await writeFile(
      join(dir, 'spt.csv'),
      ['borehole_id,depth_m,sptN', 'BH-01,1.5,12'].join('\n'),
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command();
    registerAnalyzeCommand(program);

    await program.parseAsync(['analyze', dir, '--json'], { from: 'user' });

    const payload = JSON.parse(logSpy.mock.calls.map((call) => String(call[0])).join('\n'));
    expect(payload.schemaVersion).toBe('workspace-manifest.v1');
    expect(payload.summary.datasetTypes['spt-profile']).toBe(1);
    expect(payload.groundModel.schemaVersion).toBe('ground-model.v1');
    expect(payload.groundModel.stats.sptTests).toBe(1);
    expect(payload.verifier.schemaVersion).toBe('ground-model-verifier.v1');
  });

  it('writes a browser report without opening when --no-open is supplied', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-cli-analyze-html-'));
    tempDirs.push(dir);
    const htmlPath = join(dir, 'workspace.html');
    await writeFile(
      join(dir, 'locations.csv'),
      ['borehole_id,easting,northing', 'BH-01,500000,3200000'].join('\n'),
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command();
    registerAnalyzeCommand(program);

    await program.parseAsync(['analyze', dir, '--format', 'html', '--no-open', '--output', htmlPath], { from: 'user' });

    const html = await readFile(htmlPath, 'utf-8');
    expect(html).toContain('Workspace Report');
    expect(html).toContain('GroundModel');
    expect(html).toContain('GroundModel Map');
    expect(html).toContain('Map Points');
    expect(html).toContain('BH-01');
    expect(html).toContain('Local-grid map points');
    expect(html).toContain('Verifier Findings');
    expect(html).toContain('Calculation Readiness');
    expect(html).toContain('locations.csv');
    expect(logSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain('Workspace report saved');
  });
});
