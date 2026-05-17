import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  buildLLMConfig: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock('@geotechcli/core', async () => {
  const fem = await vi.importActual<typeof import('../../core/src/fem/index.js')>('../../core/src/fem/index.js');
  return {
    ...fem,
    buildLLMConfig: coreMocks.buildLLMConfig,
    runAgent: coreMocks.runAgent,
    GEOTECHCLI_VERSION: '0.4.59',
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
    vi.clearAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('runs a scoped FEM agent with only FEM planning tools', async () => {
    coreMocks.buildLLMConfig.mockReturnValue({
      provider: 'hosted-beta',
      apiKey: '',
      timeout: 60000,
      skillsEnabled: true,
    });
    coreMocks.runAgent.mockResolvedValue({
      steps: [{ type: 'answer', content: 'Use excavation-deformation and run the deterministic demo after review.', timestamp: Date.now() }],
      context: {},
      totalTokens: 5,
      totalLatencyMs: 50,
    });
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'agent',
      'draft',
      'a',
      'braced',
      'excavation',
      '--objective',
      'excavation-deformation',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.runAgent).toHaveBeenCalledWith(
      expect.stringContaining('Preferred FEM objective hint: excavation-deformation'),
      expect.objectContaining({ skillsEnabled: false }),
      expect.any(Function),
      undefined,
      expect.objectContaining({
        allowedTools: [
          'list_fem_capabilities',
          'prepare_fem_analysis_case',
          'validate_fem_analysis_case',
        ],
      }),
    );
    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.kind).toBe('geotech-fem-agent-result');
    expect(payload.allowedTools).toEqual([
      'list_fem_capabilities',
      'prepare_fem_analysis_case',
      'validate_fem_analysis_case',
    ]);
    expect(payload.answer).toContain('deterministic demo');
  });

  it('prepares a missing-input FEM draft without running a solver', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'foundation-settlement',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.kind).toBe('geotech-fem-draft-result');
    expect(payload.schemaVersion).toBe('fem-draft-command.v0');
    expect(payload.objective).toBe('foundation-settlement');
    expect(payload.draft.recommendedAction).toBe('collect-inputs');
    expect(payload.draft.canAutoProceed).toBe(false);
    expect(payload.draft.analysisCase).toBeUndefined();
    expect(payload.draft.missingUserInputs).toEqual(['raft length', 'raft width', 'service pressure']);
    expect(payload.warnings.join(' ')).toMatch(/no solver/i);
  });

  it('writes a validated foundation FEM case draft from explicit CLI inputs', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-draft-'));
    tempDirs.push(dir);
    const draftPath = join(dir, 'draft.json');
    const casePath = join(dir, 'analysis_case.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'foundation-settlement',
      '--raft-length',
      '10',
      '--raft-width',
      '8',
      '--pressure',
      '160',
      '--elastic-modulus',
      '30000',
      '--poisson-ratio',
      '0.29',
      '--unit-weight',
      '18.5',
      '--case-output',
      casePath,
      '--output',
      draftPath,
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    const draftEnvelope = JSON.parse(await readFile(draftPath, 'utf-8'));
    const caseFile = JSON.parse(await readFile(casePath, 'utf-8'));

    expect(payload.draft.recommendedAction).toBe('run-experimental-demo');
    expect(payload.draft.canAutoProceed).toBe(false);
    expect(payload.draft.analysisCase.geometry.raft.lengthM).toBe(10);
    expect(payload.draft.analysisCase.loads[0].pressureKpa).toBe(160);
    expect(payload.casePath).toBe(casePath);
    expect(payload.draftPath).toBe(draftPath);
    expect(draftEnvelope.kind).toBe('geotech-fem-draft-result');
    expect(caseFile.schemaVersion).toBe('fem-analysis-case.v0');
    expect(caseFile.objective).toBe('foundation_settlement');
  });

  it('prepares an excavation FEM case draft from an input JSON file', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-draft-'));
    tempDirs.push(dir);
    const inputPath = join(dir, 'input.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);
    await writeFile(inputPath, JSON.stringify({
      geometry: {
        excavationLengthM: 24,
        excavationWidthM: 16,
        excavationFinalDepthM: 9,
        wallToeDepthM: 15,
      },
      excavation: {
        stageDepthsM: [3, 6, 9],
        supportLevelsM: [0, 2, 5],
        wallType: 'secant_pile_wall',
      },
      load: { pressureKpa: 20 },
      material: {
        elasticModulusKpa: 36_000,
        poissonRatio: 0.31,
        unitWeightKnM3: 18.8,
      },
    }), 'utf-8');

    await program.parseAsync([
      'fem',
      'draft',
      'excavation-deformation',
      '--input',
      inputPath,
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.objective).toBe('excavation-deformation');
    expect(payload.draft.recommendedAction).toBe('run-experimental-demo');
    expect(payload.draft.canAutoProceed).toBe(false);
    expect(payload.draft.analysisCase.objective).toBe('excavation_deformation');
    expect(payload.draft.analysisCase.geometry.excavation.finalDepthM).toBe(9);
    expect(payload.draft.validation.status).toBe('review');
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
    expect(manifest.resultFields.map((field: { id: string }) => field.id)).toEqual(['vertical_settlement']);
    expect(manifest.steps.map((step: { id: string }) => step.id)).toEqual(['final']);
    expect(manifest.datasets[0]).toMatchObject({ fieldId: 'vertical_settlement', source: 'visualization.disp' });
    expect(html).toContain('Experimental deterministic FEM preview');
    expect(html).toContain('const MANIFEST = ');
    expect(html).toContain('raft-settlement-demo');
    expect(html).not.toContain('id="fieldSelect"');
    expect(html).not.toContain('id="stageSlider"');
  });

  it('writes a staged excavation WebGL artifact and JSON command envelope', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-cli-'));
    tempDirs.push(dir);
    const htmlPath = join(dir, 'excavation-demo.html');
    const resultPath = join(dir, 'excavation-demo.manifest.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'demo',
      'excavation',
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

    expect(payload.kind).toBe('geotech-fem-demo-result');
    expect(payload.demo).toBe('excavation');
    expect(payload.opened).toBe(false);
    expect(payload.htmlPath).toBe(htmlPath);
    expect(payload.resultPath).toBe(resultPath);
    expect(payload.manifest.analysisCase.objective).toBe('excavation_deformation');
    expect(payload.manifest.envelope.maxWallDeflectionMm).toBeGreaterThan(0);
    expect(manifest.schemaVersion).toBe('fem-result-manifest.v0');
    expect(manifest.resultFields.map((field: { id: string }) => field.id)).toContain('wall_deflection_proxy');
    expect(manifest.steps).toHaveLength(3);
    expect(manifest.datasets.filter((dataset: { source: string }) => dataset.source === 'visualization.frame')).toHaveLength(9);
    expect(html).toContain('Experimental 3D FEM staged excavation deformation demo');
    expect(html).toContain('id="fieldSelect"');
    expect(html).toContain('id="stageSlider"');
    expect(html).toContain('excavation-deformation-demo');
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

  it('requires explicit experimental acknowledgement for the excavation demo', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    program.exitOverride();
    registerFemCommand(program);

    await expect(
      program.parseAsync(['fem', 'demo', 'excavation', '--json'], { from: 'user' }),
    ).rejects.toThrow(/--experimental/i);
  });
});
