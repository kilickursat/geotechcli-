import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSignalCommand } from '../src/commands/signal.js';

describe('signal command', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('prints JSON analysis for a CSV signal file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-cli-signal-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'piezometer.csv');
    await writeFile(
      filePath,
      [
        'date,piezometer_id,pore_pressure_kpa',
        '2026-01-01,PZ-1,10',
        '2026-01-02,PZ-1,12',
      ].join('\n'),
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command();
    registerSignalCommand(program);

    await program.parseAsync(['signal', 'analyze', filePath], { from: 'user' });

    const payload = JSON.parse(logSpy.mock.calls.map((call) => String(call[0])).join('\n'));
    expect(payload.schemaVersion).toBe('signal-analysis.v0');
    expect(payload.signalType).toBe('piezometer');
    expect(payload.series[0].id).toBe('PZ-1');
    expect(payload.trendSummary[0].direction).toBe('increasing');
    expect(payload.thresholdFlags).toEqual([]);
  });

  it('writes JSON output without printing when quiet', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-cli-signal-output-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'load-test.csv');
    const outputPath = join(dir, 'signal.json');
    await writeFile(
      filePath,
      [
        'depth,value',
        '0,0',
        '1,50',
      ].join('\n'),
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command();
    registerSignalCommand(program);

    await program.parseAsync(['signal', 'analyze', filePath, '--type', 'load-test', '--output', outputPath, '--quiet'], { from: 'user' });

    const payload = JSON.parse(await readFile(outputPath, 'utf-8'));
    expect(payload.signalType).toBe('load-test');
    expect(payload.source.rowsAnalyzed).toBe(2);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('does not print when quiet is used without an output path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-cli-signal-quiet-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'settlement.csv');
    await writeFile(
      filePath,
      [
        'date,instrument,settlement_mm',
        '2026-01-01,SM-1,0',
        '2026-01-02,SM-1,1',
      ].join('\n'),
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command();
    registerSignalCommand(program);

    await program.parseAsync(['signal', 'analyze', filePath, '--quiet'], { from: 'user' });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('writes an interactive HTML signal plot when save-html is requested', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-cli-signal-html-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'piezometer.tsv');
    const htmlPath = join(dir, 'signal.html');
    const jsonPath = join(dir, 'signal.json');
    await writeFile(
      filePath,
      [
        'date\tinstrument\tpore_pressure_kpa',
        '2026-01-01\tPZ-1\t10',
        '2026-01-02\tPZ-1\t12',
      ].join('\n'),
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command();
    registerSignalCommand(program);

    await program.parseAsync([
      'signal',
      'analyze',
      filePath,
      '--type',
      'piezometer',
      '--save-html',
      htmlPath,
      '--output',
      jsonPath,
      '--no-open',
    ], { from: 'user' });

    const payload = JSON.parse(await readFile(jsonPath, 'utf-8'));
    expect(payload.source.format).toBe('csv');
    const html = await readFile(htmlPath, 'utf-8');
    expect(html).toContain('Signal Analysis');
    expect(html).toContain('piezometer signal values');
    expect(html).toContain('PZ-1');
    expect(logSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain('Interactive signal plot saved');
  });

  it('prints a compact text summary when requested', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-cli-signal-text-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'inclinometer.csv');
    await writeFile(
      filePath,
      [
        'depth_m,instrument,displacement_mm',
        '0,I-1,0',
        '5,I-1,2',
        '10,I-1,5',
      ].join('\n'),
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command();
    registerSignalCommand(program);

    await program.parseAsync(['signal', 'analyze', filePath, '--format', 'text'], { from: 'user' });

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Signal Analysis');
    expect(output).toContain('inclinometer');
    expect(output).toContain('I-1');
    expect(output).toContain('per-meter');
  });
});
