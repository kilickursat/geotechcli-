import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@geotechcli/core', async () => {
  const fem = await vi.importActual<typeof import('../../core/src/fem/index.js')>('../../core/src/fem/index.js');
  return {
    ...fem,
    GEOTECHCLI_VERSION: '0.4.55',
    GLOBAL_FLAG_DEFINITIONS: [
      { key: 'json', option: '--json', description: 'json' },
      { key: 'plot', option: '--plot', description: 'plot' },
      { key: 'saveHtml', option: '--save-html <file>', description: 'save html' },
      { key: 'noOpen', option: '--no-open', description: 'no open' },
      { key: 'verbose', option: '--verbose', description: 'verbose' },
      { key: 'quiet', option: '--quiet', description: 'quiet' },
      { key: 'dryRun', option: '--dry-run', description: 'dry run' },
      { key: 'output', option: '--output <file>', description: 'output' },
      { key: 'noColor', option: '--no-color', description: 'no color' },
    ],
  };
});

async function loadRegisterFemCommand(): Promise<(program: Command) => void> {
  const module = await import('../src/commands/fem.js');
  return module.registerFemCommand;
}

function collectLogText(logSpy: ReturnType<typeof vi.spyOn>): string {
  return logSpy.mock.calls.map((call) => call.map((item) => String(item)).join(' ')).join('\n');
}

describe('registerFemCommand', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('requires explicit experimental acknowledgement', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    program.exitOverride();
    registerFemCommand(program);

    await expect(
      program.parseAsync(['fem', 'demo', 'raft', '--json'], { from: 'user' }),
    ).rejects.toThrow(/--experimental/i);
  });

  it('writes a WebGL artifact and pure JSON command envelope', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-cli-'));
    tempDirs.push(dir);
    const htmlPath = join(dir, 'raft-demo.html');
    const resultPath = join(dir, 'raft-demo.manifest.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'demo',
      'raft',
      '--experimental',
      '--save-html',
      htmlPath,
      '--output',
      resultPath,
      '--no-open',
      '--json',
    ], { from: 'user' });

    const output = collectLogText(logSpy).trim();
    const payload = JSON.parse(output);
    const html = await readFile(htmlPath, 'utf-8');
    const manifest = JSON.parse(await readFile(resultPath, 'utf-8'));

    expect(output.startsWith('{')).toBe(true);
    expect(payload.kind).toBe('geotech-fem-demo-result');
    expect(payload.schemaVersion).toBe('fem-demo-command.v0');
    expect(payload.experimental).toBe(true);
    expect(payload.demo).toBe('raft');
    expect(payload.opened).toBe(false);
    expect(payload.htmlPath).toBe(htmlPath);
    expect(payload.resultPath).toBe(resultPath);
    expect(payload.manifest.envelope.maxSettlementMm).toBeGreaterThan(0);
    expect(manifest.schemaVersion).toBe('fem-result-manifest.v0');
    expect(html).toContain('Experimental deterministic FEM preview');
    expect(html).toContain('const MANIFEST = ');
    expect(html).toContain('raft-settlement-demo');
  });

  it('prints a quiet settlement value without creating the default HTML artifact', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'demo',
      'raft',
      '--experimental',
      '--quiet',
      '--no-open',
    ], { from: 'user' });

    const output = collectLogText(logSpy).trim();
    expect(output).toMatch(/^\d+\.\d{2} mm$/);
    expect(existsSync('geotech-fem-raft-demo.html')).toBe(false);
  });
});
