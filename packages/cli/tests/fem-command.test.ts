import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  analyzeWorkspace: vi.fn(),
  buildLLMConfig: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock('@geotechcli/core', async () => {
  const fem = await vi.importActual<typeof import('../../core/src/fem/index.js')>('../../core/src/fem/index.js');
  return {
    ...fem,
    analyzeWorkspace: coreMocks.analyzeWorkspace,
    buildLLMConfig: coreMocks.buildLLMConfig,
    runAgent: coreMocks.runAgent,
    GEOTECHCLI_VERSION: '0.4.60',
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

function femApprovalArgs(approvalPath: string): string[] {
  return [
    '--approval-output',
    approvalPath,
    '--reviewer-name',
    'Jane Engineer',
    '--reviewer-license',
    'PE-98765',
    '--reviewer-jurisdiction',
    'US-CA',
    '--approval-assumptions',
    'geometry loads staging and limitations reviewed',
  ];
}

function makeFemWorkspaceManifest() {
  return {
    schemaVersion: 'workspace-manifest.v1',
    generatedAt: '2026-05-18T00:00:00.000Z',
    rootPath: 'C:/site-data',
    files: [],
    summary: {
      totalFiles: 1,
      supportedFiles: 1,
      tabularFiles: 1,
      pdfFiles: 0,
      imageFiles: 0,
      skippedFiles: 0,
      kinds: { csv: 1 },
      datasetTypes: { 'lab-test-summary': 1 },
      branches: ['foundation'],
      recommendations: [],
    },
    groundModel: {
      schemaVersion: 'ground-model.v1',
      generatedAt: '2026-05-18T00:00:00.000Z',
      project: { rootPath: 'C:/site-data' },
      coordinateSystem: { kind: 'unknown', warnings: [] },
      boreholes: [],
      strata: [],
      groundwater: [],
      labTests: [],
      parameters: [],
      monitoringSeries: [],
      rejectedObservations: [],
      warnings: [],
      stats: {
        boreholes: 1,
        sptTests: 1,
        strata: 1,
        groundwaterObservations: 1,
        labTests: 0,
        parameters: 2,
        monitoringSeries: 0,
        evidenceRefs: 2,
        rejectedObservations: 0,
      },
      evidence: [
        {
          id: 'ev-es-1',
          sourceType: 'tabular-cell',
          sourcePath: 'lab.csv',
          location: { filePath: 'lab.csv', cellRef: 'C3' },
          method: 'csv-sample',
          confidence: 0.88,
          normalizedValue: 25000,
          unit: 'kPa',
          warnings: [],
        },
        {
          id: 'ev-gw-1',
          sourceType: 'pdf-page',
          sourcePath: 'report.pdf',
          location: { filePath: 'report.pdf', pageNumber: 9 },
          method: 'pdf-text',
          confidence: 0.82,
          normalizedValue: 2.1,
          unit: 'm',
          warnings: [],
        },
      ],
    },
    verifier: {
      schemaVersion: 'ground-model-verifier.v1',
      generatedAt: '2026-05-18T00:00:00.000Z',
      status: 'pass',
      summary: { blocking: 0, review: 0, info: 0 },
      findings: [],
      calculationReadiness: {
        schemaVersion: 'ground-model-calculation-readiness.v1',
        summary: { ready: 2, readyWithAssumptions: 0, blocked: 0 },
        workflows: [
          {
            workflow: 'fem-foundation-settlement',
            label: 'Experimental FEM foundation settlement draft',
            status: 'ready',
            score: 100,
            toolName: 'prepare_fem_analysis_case',
            commandTemplate: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
            present: ['strata profile'],
            missing: [],
            assumptions: [],
            evidenceIds: ['ev-es-1', 'ev-gw-1'],
            recommendation: 'Prepare an experimental FEM draft.',
            inputDraft: {
              workflow: 'fem-foundation-settlement',
              toolName: 'prepare_fem_analysis_case',
              command: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
              input: {
                objective: 'foundation-settlement',
                useDemoDefaults: false,
                material: {
                  elasticModulusKpa: 25_000,
                  unitWeightKnM3: 18.7,
                  poissonRatio: 0.3,
                },
                groundwater: {
                  condition: 'specified',
                  depthM: 2.1,
                  note: 'Groundwater from GroundModel evidence.',
                },
              },
              missingUserInputs: ['raft length', 'raft width', 'service pressure'],
              assumptions: [],
              evidenceIds: ['ev-es-1', 'ev-gw-1'],
              readyToRun: false,
            },
          },
        ],
      },
    },
    warnings: [],
  };
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
      '2D',
      'u-p',
      'Biot',
      'coupling',
      'readiness',
      'for',
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
          'assess_fem_production_readiness',
          'prepare_fem_analysis_case',
          'validate_fem_analysis_case',
        ],
        requiredToolsBeforeFinal: [
          'assess_fem_production_readiness',
          'prepare_fem_analysis_case',
        ],
      }),
    );
    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.kind).toBe('geotech-fem-agent-result');
    expect(payload.allowedTools).toEqual([
      'list_fem_capabilities',
      'assess_fem_production_readiness',
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

  it('keeps planned FEM routes contract-only and refuses case-output artifacts', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-planned-route-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'planned_analysis_case.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'shaft-deformation',
      '--demo-defaults',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.kind).toBe('geotech-fem-draft-result');
    expect(payload.objective).toBe('shaft-deformation');
    expect(payload.draft.implemented).toBe(false);
    expect(payload.draft.capability.executionMode).toBe('contract-only');
    expect(payload.draft.capability.agentRunAllowed).toBe(false);
    expect(payload.draft.recommendedAction).toBe('contract-only');
    expect(payload.draft.recommendedCommand).toBe('geotech fem draft shaft-deformation --input <json>');
    expect(payload.draft.analysisCase).toBeUndefined();
    expect(payload.draft.contractReadiness.nonRunnableReason).toMatch(/No deterministic backend/i);
    expect(payload.draft.contractReadiness.disallowedAgentActions).toContain('run-solver');
    expect(payload.warnings.join(' ')).toMatch(/planned-only/i);

    await expect(
      program.parseAsync([
        'fem',
        'draft',
        'pile-group-elastic-interaction',
        '--demo-defaults',
        '--case-output',
        casePath,
        '--json',
      ], { from: 'user' }),
    ).rejects.toThrow(/Cannot write --case-output.*no analysisCase/i);
    expect(existsSync(casePath)).toBe(false);

    const shaftCasePath = join(dir, 'shaft_planned_analysis_case.json');
    await expect(
      program.parseAsync([
        'fem',
        'draft',
        'pit-deformation',
        '--demo-defaults',
        '--case-output',
        shaftCasePath,
        '--json',
      ], { from: 'user' }),
    ).rejects.toThrow(/Cannot write --case-output.*no analysisCase/i);
    expect(existsSync(shaftCasePath)).toBe(false);
  });

  it('keeps pile-group aliases contract-only without run commands', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'pile-group',
      '--demo-defaults',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.kind).toBe('geotech-fem-draft-result');
    expect(payload.objective).toBe('pile-group-elastic-interaction');
    expect(payload.draft.implemented).toBe(false);
    expect(payload.draft.recommendedAction).toBe('contract-only');
    expect(payload.draft.recommendedCommand).toBe('geotech fem draft pile-group-elastic-interaction --input <json>');
    expect(payload.draft.analysisCase).toBeUndefined();
    expect(payload.draft.contractReadiness.requiredUserInputs).toContain('pile spacing');
    expect(payload.draft.contractReadiness.disallowedAgentActions).toContain('invent-results');
  });

  it('keeps expanded planned FEM aliases contract-only without analysis cases', async () => {
    const registerFemCommand = await loadRegisterFemCommand();

    for (const [alias, objective, expectedInput] of [
      ['slope-embankment', 'slope-embankment-deformation', 'slope height'],
      ['retaining-wall', 'retaining-wall-excavation-support', 'prop/anchor levels'],
    ] as const) {
      const program = new Command();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      program.exitOverride();
      registerFemCommand(program);

      await program.parseAsync([
        'fem',
        'draft',
        alias,
        '--json',
      ], { from: 'user' });

      const payload = JSON.parse(collectLogText(logSpy).trim());
      expect(payload.objective).toBe(objective);
      expect(payload.draft.implemented).toBe(false);
      expect(payload.draft.recommendedAction).toBe('contract-only');
      expect(payload.draft.recommendedCommand).toBe(`geotech fem draft ${objective} --input <json>`);
      expect(payload.draft.analysisCase).toBeUndefined();
      expect(payload.draft.contractReadiness.requiredUserInputs).toContain(expectedInput);
      expect(payload.draft.contractReadiness.disallowedAgentActions).toContain('render-webgl');
      logSpy.mockRestore();
    }
  });

  it('prepares and runs reviewed seepage Biot cases through the biot-up backend', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-biot-run-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'seepage.analysis_case.json');
    const draftProgram = new Command();
    const draftLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    draftProgram.exitOverride();
    registerFemCommand(draftProgram);

    await draftProgram.parseAsync([
      'fem',
      'draft',
      'groundwater-sensitive',
      '--biot-width',
      '1',
      '--biot-height',
      '1',
      '--biot-thickness',
      '1',
      '--initial-pore-pressure',
      '100',
      '--top-pore-pressure',
      '0',
      '--time-steps',
      '1,2,4,8',
      '--hydraulic-conductivity',
      '0.000001',
      '--specific-storage',
      '0.0001',
      '--biot-alpha',
      '0.8',
      '--case-output',
      casePath,
      '--json',
    ], { from: 'user' });

    const draftPayload = JSON.parse(collectLogText(draftLogSpy).trim());
    expect(draftPayload.objective).toBe('seepage-groundwater-coupling');
    expect(draftPayload.draft.implemented).toBe(true);
    expect(draftPayload.draft.recommendedAction).toBe('run-reviewed-case');
    expect(draftPayload.draft.analysisCase.objective).toBe('seepage_groundwater_coupling');
    expect(draftPayload.casePath).toBeTruthy();
    expect(existsSync(casePath)).toBe(true);
    draftLogSpy.mockRestore();

    const runProgram = new Command();
    const runLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    runProgram.exitOverride();
    registerFemCommand(runProgram);
    await runProgram.parseAsync([
      'fem',
      'run',
      casePath,
      '--experimental',
      '--reviewed',
      ...femApprovalArgs(join(dir, 'seepage-approval.json')),
      '--backend',
      'biot-up',
      '--no-open',
      '--json',
    ], { from: 'user' });

    const runPayload = JSON.parse(collectLogText(runLogSpy).trim());
    expect(runPayload.kind).toBe('geotech-fem-run-result');
    expect(runPayload.manifest.backend.id).toBe('builtin-biot-up-plane-strain-v0');
    expect(runPayload.manifest.analysisCase.objective).toBe('seepage_groundwater_coupling');
    expect(runPayload.manifest.envelope.porePressureMassBalanceErrorRatio).toBeLessThanOrEqual(1e-6);
    expect(runPayload.manifest.biotTransientAcceptance).toMatchObject({
      schemaVersion: 'fem-plane-strain-biot-transient-acceptance.v1',
      accepted: true,
      dissipationCheckMode: 'drained-dissipation',
      acceptedStepCount: runPayload.manifest.envelope.timeStepCount,
      monotonicMaxPressureEnvelope: true,
      blockerCodes: [],
    });
    expect(runPayload.manifest.biotTransientAcceptance.finalPorePressureDissipationRatio)
      .toBe(runPayload.manifest.envelope.porePressureDissipationRatio);
    expect(runPayload.warnings.join(' ')).toMatch(/Experimental deterministic FEM run/i);
    runLogSpy.mockRestore();
  });

  it('prefills FEM draft inputs from workspace GroundModel readiness without auto-running', async () => {
    coreMocks.analyzeWorkspace.mockResolvedValue(makeFemWorkspaceManifest());
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'foundation-settlement',
      '--workspace',
      'C:/site-data',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith('C:/site-data', { includeCalculationInputDrafts: true });
    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.workspace.rootPath).toBe('C:/site-data');
    expect(payload.workspace.bridge.schemaVersion).toBe('fem-ground-model-draft-bridge.v1');
    expect(payload.draft.recommendedAction).toBe('collect-inputs');
    expect(payload.draft.canAutoProceed).toBe(false);
    expect(payload.draft.missingUserInputs).toEqual(['raft length', 'raft width', 'service pressure']);
    expect(payload.draft.evidenceRefs.map((item: { id: string }) => item.id)).toEqual(['ev-es-1', 'ev-gw-1']);
    expect(payload.workspace.bridge.input.material.elasticModulusKpa).toBe(25_000);
    expect(payload.workspace.bridge.input.groundwater.depthM).toBe(2.1);
    expect(payload.warnings.join(' ')).toMatch(/GroundModel prefilled material/i);
  });

  it('prefills contract-only shaft FEM readiness from workspace evidence without creating a case', async () => {
    const manifest = makeFemWorkspaceManifest();
    manifest.verifier.calculationReadiness.workflows.push({
      workflow: 'fem-shaft-deformation',
      label: 'Planned shaft deformation contract draft',
      status: 'blocked',
      score: 55,
      toolName: 'prepare_fem_analysis_case',
      commandTemplate: 'geotech fem draft shaft-deformation --input <json>',
      present: ['strata profile', 'groundwater condition'],
      missing: ['implemented shaft deformation preview backend'],
      assumptions: ['contract-only route'],
      evidenceIds: ['ev-es-1', 'ev-gw-1'],
      recommendation: 'Shaft deformation is a planned contract-only FEM route.',
      inputDraft: {
        workflow: 'fem-shaft-deformation',
        toolName: 'prepare_fem_analysis_case',
        command: 'geotech fem draft shaft-deformation --input <json>',
        input: {
          objective: 'shaft-deformation',
          useDemoDefaults: false,
          material: {
            elasticModulusKpa: 25_000,
            unitWeightKnM3: 18.7,
            poissonRatio: 0.3,
          },
          groundwater: {
            condition: 'specified',
            depthM: 2.1,
            note: 'Groundwater from GroundModel evidence; shaft route remains contract-only.',
          },
        },
        missingUserInputs: ['shaft diameter/shape', 'final depth', 'support sequence', 'groundwater handling'],
        assumptions: ['contract-only route'],
        evidenceIds: ['ev-es-1', 'ev-gw-1'],
        readyToRun: false,
      },
    });
    coreMocks.analyzeWorkspace.mockResolvedValue(manifest);
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'shaft',
      '--workspace',
      'C:/site-data',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.objective).toBe('shaft-deformation');
    expect(payload.workspace.bridge.objective).toBe('shaft-deformation');
    expect(payload.workspace.bridge.input.material.elasticModulusKpa).toBe(25_000);
    expect(payload.workspace.bridge.input.groundwater.depthM).toBe(2.1);
    expect(payload.draft.recommendedAction).toBe('contract-only');
    expect(payload.draft.analysisCase).toBeUndefined();
    expect(payload.draft.recommendedCommand).toBe('geotech fem draft shaft-deformation --input <json>');
    expect(payload.draft.evidenceRefs.map((item: { id: string }) => item.id)).toEqual(['ev-es-1', 'ev-gw-1']);
    expect(payload.draft.contractReadiness.blockedUntil).toContain('solver-or-preview-backend-implemented');
    expect(payload.warnings.join(' ')).toMatch(/Workspace GroundModel prefilled material/i);
  });

  it('outputs blocked workspace acceptance instead of throwing when workspace inputs are incomplete', async () => {
    coreMocks.analyzeWorkspace.mockResolvedValue(makeFemWorkspaceManifest());
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-workspace-draft-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'analysis_case.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'foundation-settlement',
      '--workspace',
      'C:/site-data',
      '--case-output',
      casePath,
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(existsSync(casePath)).toBe(false);
    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith('C:/site-data', { includeCalculationInputDrafts: true });
    expect(payload.casePath).toBeUndefined();
    expect(payload.workspaceAcceptance).toMatchObject({
      schemaVersion: 'fem-workspace-to-run-acceptance.v1',
      status: 'blocked',
      objective: 'foundation-settlement',
      caseOutputAvailable: false,
    });
    expect(payload.workspaceAcceptance.blockerCodes).toEqual(expect.arrayContaining([
      'fem_workspace_user_inputs_missing',
      'fem_workspace_case_output_not_available',
      'fem_workspace_draft_not_recommended_for_reviewed_run',
      'fem_workspace_reviewed_run_command_missing',
    ]));
  });

  it('lets explicit FEM draft flags override workspace prefill and write the analysis case', async () => {
    coreMocks.analyzeWorkspace.mockResolvedValue(makeFemWorkspaceManifest());
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-workspace-draft-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'analysis case.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'foundation-settlement',
      '--workspace',
      'C:/site-data',
      '--raft-length',
      '11',
      '--raft-width',
      '9',
      '--pressure',
      '175',
      '--case-output',
      casePath,
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    const caseFile = JSON.parse(await readFile(casePath, 'utf-8'));
    expect(payload.draft.recommendedAction).toBe('run-reviewed-case');
    expect(payload.draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed --approval-output <fem-approval.json> --reviewer-name <name> --reviewer-license <id> --reviewer-jurisdiction <jurisdiction>');
    expect(payload.draft.analysisCase.geometry.raft.lengthM).toBe(11);
    expect(payload.draft.analysisCase.materials[0].elasticModulusKpa).toBe(25_000);
    expect(payload.draft.analysisCase.groundwater.depthM).toBe(2.1);
    expect(payload.workspaceAcceptance).toMatchObject({
      schemaVersion: 'fem-workspace-to-run-acceptance.v1',
      status: 'accepted',
      objective: 'foundation-settlement',
      caseOutputAvailable: true,
      humanRunCommand:
        `geotech fem run "${casePath}" --experimental --reviewed --approval-output <fem-approval.json> --reviewer-name <name> --reviewer-license <id> --reviewer-jurisdiction <jurisdiction>`,
      approvalRecordSchema: 'fem-reviewer-approval.v1',
      approvalRecordRequiredForProductionAcceptance: true,
      strictApprovalRunCommand:
        `geotech fem run "${casePath}" --experimental --reviewed --approval-output <fem-approval.json> --reviewer-name <name> --reviewer-license <id> --reviewer-jurisdiction <jurisdiction>`,
      blockerCodes: [],
      evidenceIds: ['ev-es-1', 'ev-gw-1'],
    });
    expect(caseFile.evidenceRefs.map((item: { id: string }) => item.id)).toEqual(['ev-es-1', 'ev-gw-1']);
  });

  it('uses workspace readiness to prefill tunnel FEM draft evidence before explicit tunnel inputs', async () => {
    const manifest = makeFemWorkspaceManifest();
    manifest.verifier.calculationReadiness.workflows.push({
      workflow: 'fem-tunnel-volume-loss-settlement',
      label: 'Experimental FEM tunnel volume-loss settlement draft',
      status: 'ready',
      score: 100,
      toolName: 'prepare_fem_analysis_case',
      commandTemplate: 'geotech fem draft tunnel-volume-loss-settlement --input <json> --case-output <analysis_case.json>',
      present: ['ground profile'],
      missing: [],
      assumptions: [],
      evidenceIds: ['ev-es-1', 'ev-gw-1'],
      recommendation: 'Prepare an experimental tunnel settlement draft.',
      inputDraft: {
        workflow: 'fem-tunnel-volume-loss-settlement',
        toolName: 'prepare_fem_analysis_case',
        command: 'geotech fem draft tunnel-volume-loss-settlement --input <json> --case-output <analysis_case.json>',
        input: {
          objective: 'tunnel-volume-loss-settlement',
          useDemoDefaults: false,
          material: {
            elasticModulusKpa: 25_000,
            unitWeightKnM3: 18.7,
            poissonRatio: 0.3,
          },
          groundwater: {
            condition: 'specified',
            depthM: 2.1,
            note: 'Groundwater from GroundModel evidence.',
          },
        },
        missingUserInputs: [
          'tunnel diameter',
          'tunnel axis depth',
          'tunnel alignment length',
          'tunnel volume loss',
          'trough width parameter',
        ],
        assumptions: [],
        evidenceIds: ['ev-es-1', 'ev-gw-1'],
        readyToRun: false,
      },
    });
    coreMocks.analyzeWorkspace.mockResolvedValue(manifest);
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-workspace-tunnel-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'tunnel.analysis_case.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'tunnel-volume-loss-settlement',
      '--workspace',
      'C:/site-data',
      '--tunnel-diameter',
      '6',
      '--tunnel-depth',
      '18',
      '--tunnel-length',
      '60',
      '--volume-loss',
      '1.2',
      '--trough-width',
      '0.5',
      '--case-output',
      casePath,
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    const caseFile = JSON.parse(await readFile(casePath, 'utf-8'));
    expect(payload.workspace.bridge.objective).toBe('tunnel-volume-loss-settlement');
    expect(payload.draft.recommendedAction).toBe('run-reviewed-case');
    expect(payload.draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed --approval-output <fem-approval.json> --reviewer-name <name> --reviewer-license <id> --reviewer-jurisdiction <jurisdiction>');
    expect(payload.draft.analysisCase.geometry.tunnel.diameterM).toBe(6);
    expect(payload.draft.analysisCase.materials[0].elasticModulusKpa).toBe(25_000);
    expect(payload.draft.analysisCase.groundwater.depthM).toBe(2.1);
    expect(caseFile.evidenceRefs.map((item: { id: string }) => item.id)).toEqual(['ev-es-1', 'ev-gw-1']);
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

    expect(payload.draft.recommendedAction).toBe('run-reviewed-case');
    expect(payload.draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed --approval-output <fem-approval.json> --reviewer-name <name> --reviewer-license <id> --reviewer-jurisdiction <jurisdiction>');
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
    expect(payload.draft.recommendedAction).toBe('run-reviewed-case');
    expect(payload.draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed --approval-output <fem-approval.json> --reviewer-name <name> --reviewer-license <id> --reviewer-jurisdiction <jurisdiction>');
    expect(payload.draft.canAutoProceed).toBe(false);
    expect(payload.draft.analysisCase.objective).toBe('excavation_deformation');
    expect(payload.draft.analysisCase.geometry.excavation.finalDepthM).toBe(9);
    expect(payload.draft.validation.status).toBe('review');
  });

  it('prepares a tunnel volume-loss FEM case draft from explicit CLI inputs', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'tunnel-volume-loss-settlement',
      '--tunnel-diameter',
      '6.5',
      '--tunnel-depth',
      '20',
      '--tunnel-length',
      '70',
      '--volume-loss',
      '1.1',
      '--trough-width',
      '0.48',
      '--elastic-modulus',
      '52000',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.objective).toBe('tunnel-volume-loss-settlement');
    expect(payload.draft.recommendedAction).toBe('run-reviewed-case');
    expect(payload.draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed --approval-output <fem-approval.json> --reviewer-name <name> --reviewer-license <id> --reviewer-jurisdiction <jurisdiction>');
    expect(payload.draft.canAutoProceed).toBe(false);
    expect(payload.draft.analysisCase.objective).toBe('tunnel_volume_loss_settlement');
    expect(payload.draft.analysisCase.geometry.tunnel.diameterM).toBe(6.5);
    expect(payload.draft.analysisCase.geometry.tunnel.volumeLossPercent).toBe(1.1);
    expect(payload.draft.reviewGates).toContain('not-fem-solver');
  });

  it('prepares a staged settlement consolidation FEM case draft from explicit CLI inputs', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-consolidation-draft-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'consolidation.analysis_case.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'draft',
      'staged-settlement',
      '--layer-thickness',
      '10',
      '--surface-area',
      '200',
      '--stage-loads',
      '45,35,20',
      '--stage-durations',
      '0.5,1,2',
      '--drainage',
      'double',
      '--elastic-modulus',
      '30000',
      '--poisson-ratio',
      '0.32',
      '--unit-weight',
      '18.5',
      '--constrained-modulus',
      '8000',
      '--cv',
      '0.8',
      '--friction-angle',
      '28',
      '--cohesion',
      '12',
      '--hydraulic-conductivity',
      '1e-9',
      '--case-output',
      casePath,
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    const caseFile = JSON.parse(await readFile(casePath, 'utf-8'));

    expect(payload.objective).toBe('staged-settlement-consolidation');
    expect(payload.draft.recommendedAction).toBe('run-reviewed-case');
    expect(payload.draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed --approval-output <fem-approval.json> --reviewer-name <name> --reviewer-license <id> --reviewer-jurisdiction <jurisdiction>');
    expect(payload.draft.canAutoProceed).toBe(false);
    expect(payload.draft.analysisCase.objective).toBe('staged_settlement_consolidation');
    expect(payload.draft.analysisCase.geometry.consolidation.stages).toHaveLength(3);
    expect(payload.draft.analysisCase.materials[0].model).toBe('mohr_coulomb');
    expect(payload.draft.reviewGates).toContain('1d-consolidation-only');
    expect(payload.draft.reviewGates).toContain('consolidation.1d-preview');
    expect(caseFile.loads.map((load: { target: string }) => load.target)).toEqual([
      'ground_surface',
      'ground_surface',
      'ground_surface',
    ]);
  });

  it('requires explicit experimental acknowledgement for running FEM case files', async () => {
    const { buildRaftDemoAnalysisCase } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-run-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'analysis_case.json');
    await writeFile(casePath, JSON.stringify(buildRaftDemoAnalysisCase(), null, 2), 'utf-8');
    program.exitOverride();
    registerFemCommand(program);

    await expect(
      program.parseAsync(['fem', 'run', casePath, '--json'], { from: 'user' }),
    ).rejects.toThrow(/--experimental/i);
  });

  it('requires reviewed acknowledgement before dispatching the plane-strain DP adaptive backend', async () => {
    const { buildExcavationDemoAnalysisCase } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-dp-review-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'analysis_case.json');
    await writeFile(casePath, JSON.stringify(buildExcavationDemoAnalysisCase(), null, 2), 'utf-8');
    program.exitOverride();
    registerFemCommand(program);

    await expect(
      program.parseAsync([
        'fem',
        'run',
        casePath,
        '--experimental',
        '--backend',
        'plane-strain-dp-adaptive',
        '--json',
      ], { from: 'user' }),
    ).rejects.toThrow(/--reviewed/i);
  });

  it('runs a reviewed foundation FEM analysis case and writes WebGL artifacts', async () => {
    const { buildRaftDemoAnalysisCase } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-run-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'analysis_case.json');
    const htmlPath = join(dir, 'raft-run.html');
    const resultPath = join(dir, 'raft-run.manifest.json');
    await writeFile(casePath, JSON.stringify(buildRaftDemoAnalysisCase(), null, 2), 'utf-8');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'run',
      casePath,
      '--experimental',
      '--reviewed',
      ...femApprovalArgs(join(dir, 'raft-approval.json')),
      '--save-html',
      htmlPath,
      '--output',
      resultPath,
      '--no-open',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    const html = await readFile(htmlPath, 'utf-8');
    const manifest = JSON.parse(await readFile(resultPath, 'utf-8'));

    expect(payload.kind).toBe('geotech-fem-run-result');
    expect(payload.schemaVersion).toBe('fem-run-command.v0');
    expect(payload.casePath).toBe(casePath);
    expect(payload.objective).toBe('foundation_settlement');
    expect(payload.opened).toBe(false);
    expect(payload.manifest.backend.id).toBe('builtin-elastic3d-demo');
    expect(payload.warnings.join(' ')).toMatch(/LLM agents can plan and validate/i);
    expect(manifest.analysisCase.caseId).toBe('raft-settlement-demo');
    expect(html).toContain('raft-settlement-demo');
  });

  it('enforces a persisted FEM approval record for every reviewed FEM run', async () => {
    const { buildRaftDemoAnalysisCase } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-strict-approval-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'analysis_case.json');
    const approvalPath = join(dir, 'fem-strict-approval.json');
    await writeFile(casePath, JSON.stringify(buildRaftDemoAnalysisCase(), null, 2), 'utf-8');

    const missingRecordProgram = new Command();
    missingRecordProgram.exitOverride();
    registerFemCommand(missingRecordProgram);
    await expect(
      missingRecordProgram.parseAsync([
        'fem',
        'run',
        casePath,
        '--experimental',
        '--reviewed',
        '--no-open',
        '--json',
      ], { from: 'user' }),
    ).rejects.toThrow(/requires a persisted reviewer approval record/i);

    const approvedProgram = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    approvedProgram.exitOverride();
    registerFemCommand(approvedProgram);
    await approvedProgram.parseAsync([
      'fem',
      'run',
      casePath,
      '--experimental',
      '--reviewed',
      '--approval-output',
      approvalPath,
      '--reviewer-name',
      'Jane Engineer',
      '--reviewer-license',
      'PE-98765',
      '--reviewer-jurisdiction',
      'US-CA',
      '--approval-assumptions',
      'geometry and loading reviewed',
      '--no-open',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    const approvalRecord = JSON.parse(await readFile(approvalPath, 'utf-8'));
    expect(payload.approvalPath).toBe(approvalPath);
    expect(payload.approvalRecord.schemaVersion).toBe('fem-reviewer-approval.v1');
    expect(payload.approvalRecord.caseHashSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(approvalRecord.reviewer.licenseId).toBe('PE-98765');
    expect(approvalRecord.assumptions.join(' ')).toMatch(/geometry and loading reviewed/i);
    logSpy.mockRestore();
  });

  it('persists FEM reviewer approval metadata and rejects stale approval records', async () => {
    const { buildRaftDemoAnalysisCase } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-approval-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'analysis_case.json');
    const approvalPath = join(dir, 'fem-approval.json');
    await writeFile(casePath, JSON.stringify(buildRaftDemoAnalysisCase(), null, 2), 'utf-8');

    {
      const program = new Command();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      program.exitOverride();
      registerFemCommand(program);

      await program.parseAsync([
        'fem',
        'run',
        casePath,
        '--experimental',
        '--reviewed',
        '--approval-output',
        approvalPath,
        '--reviewer-name',
        'Jane Engineer',
        '--reviewer-license',
        'PE-98765',
        '--reviewer-jurisdiction',
        'US-CA',
        '--approval-assumptions',
        'project geometry checked',
        '--no-open',
        '--json',
      ], { from: 'user' });

      const payload = JSON.parse(collectLogText(logSpy).trim());
      const approvalRecord = JSON.parse(await readFile(approvalPath, 'utf-8'));

      expect(payload.approvalPath).toBe(approvalPath);
      expect(payload.approvalRecord.schemaVersion).toBe('fem-reviewer-approval.v1');
      expect(payload.approvalRecord.scope).toBe('experimental-preview');
      expect(payload.approvalRecord.reviewer.licenseId).toBe('PE-98765');
      expect(payload.approvalRecord.caseHashSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(approvalRecord.validationSummary.blockers).toBe(0);
      expect(approvalRecord.assumptions.join(' ')).toMatch(/project geometry checked/i);
      logSpy.mockRestore();
    }

    {
      const program = new Command();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      program.exitOverride();
      registerFemCommand(program);

      await program.parseAsync([
        'fem',
        'run',
        casePath,
        '--experimental',
        '--reviewed',
        '--approval-record',
        approvalPath,
        '--no-open',
        '--json',
      ], { from: 'user' });

      const payload = JSON.parse(collectLogText(logSpy).trim());
      expect(payload.approvalRecord.caseId).toBe('raft-settlement-demo');
      expect(payload.warnings.join(' ')).toMatch(/approval record.*case hash/i);
      logSpy.mockRestore();
    }

    const changedCase = buildRaftDemoAnalysisCase();
    changedCase.loads[0].pressureKpa += 1;
    await writeFile(casePath, JSON.stringify(changedCase, null, 2), 'utf-8');
    const staleProgram = new Command();
    staleProgram.exitOverride();
    registerFemCommand(staleProgram);

    await expect(
      staleProgram.parseAsync([
        'fem',
        'run',
        casePath,
        '--experimental',
        '--reviewed',
        '--approval-record',
        approvalPath,
        '--json',
      ], { from: 'user' }),
    ).rejects.toThrow(/approval record is stale/i);
  });

  it('fails closed when a FEM run requests production-design approval scope', async () => {
    const { buildRaftDemoAnalysisCase } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-production-scope-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'analysis_case.json');
    const approvalPath = join(dir, 'fem-production-approval.json');
    await writeFile(casePath, JSON.stringify(buildRaftDemoAnalysisCase(), null, 2), 'utf-8');
    const program = new Command();
    program.exitOverride();
    registerFemCommand(program);

    await expect(
      program.parseAsync([
        'fem',
        'run',
        casePath,
        '--experimental',
        '--reviewed',
        '--approval-scope',
        'production-design',
        '--approval-output',
        approvalPath,
        '--reviewer-name',
        'Jane Engineer',
        '--reviewer-license',
        'PE-98765',
        '--reviewer-jurisdiction',
        'US-CA',
        '--no-open',
        '--json',
      ], { from: 'user' }),
    ).rejects.toThrow(/production-design approval scope is blocked/i);
    expect(existsSync(approvalPath)).toBe(false);
  });

  it('dispatches reviewed excavation, tunnel, and consolidation FEM analysis cases through deterministic run backends', async () => {
    const {
      buildExcavationDemoAnalysisCase,
      buildStagedSettlementConsolidationDemoAnalysisCase,
      buildTunnelVolumeLossDemoAnalysisCase,
    } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-run-'));
    tempDirs.push(dir);

    for (const [name, caseFile, expectedBackend] of [
      ['excavation', buildExcavationDemoAnalysisCase(), 'builtin-staged-excavation-demo'],
      ['tunnel', buildTunnelVolumeLossDemoAnalysisCase(), 'builtin-tunnel-volume-loss-demo'],
      ['consolidation', buildStagedSettlementConsolidationDemoAnalysisCase(), 'builtin-staged-consolidation-1d'],
    ] as const) {
      const program = new Command();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const casePath = join(dir, `${name}.analysis_case.json`);
      await writeFile(casePath, JSON.stringify(caseFile, null, 2), 'utf-8');
      program.exitOverride();
      registerFemCommand(program);

      await program.parseAsync([
        'fem',
        'run',
        casePath,
        '--experimental',
        '--reviewed',
        ...femApprovalArgs(join(dir, `${name}-approval.json`)),
        '--no-open',
        '--json',
      ], { from: 'user' });

      const payload = JSON.parse(collectLogText(logSpy).trim());
      expect(payload.kind).toBe('geotech-fem-run-result');
      expect(payload.manifest.backend.id).toBe(expectedBackend);
      expect(payload.manifest.analysisCase.objective).toBe(caseFile.objective);
      logSpy.mockRestore();
    }
  });

  it('runs reviewed staged consolidation cases through the nonlinear-column backend when requested', async () => {
    const { buildStagedSettlementConsolidationDemoAnalysisCase } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-nonlinear-run-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'consolidation.analysis_case.json');
    await writeFile(casePath, JSON.stringify(buildStagedSettlementConsolidationDemoAnalysisCase(), null, 2), 'utf-8');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'run',
      casePath,
      '--experimental',
      '--reviewed',
      ...femApprovalArgs(join(dir, 'nonlinear-column-approval.json')),
      '--backend',
      'nonlinear-column',
      '--no-open',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.manifest.backend.id).toBe('builtin-nonlinear-column-v0');
    expect(payload.manifest.envelope.solverLoadSteps).toBe(3);
    expect(payload.manifest.envelope.maxSolverResidualRatio).toBeLessThanOrEqual(1e-3);
    expect(payload.warnings.join(' ')).toMatch(/nonlinear-column backend/i);
    logSpy.mockRestore();
  });

  it('dispatches reviewed cases through the plane-strain DP adaptive backend alias with experimental warnings', async () => {
    const {
      buildExcavationDemoAnalysisCase,
      buildPlaneStrainDruckerPragerAdaptiveExcavationDemoAnalysisCase,
      validateFemResultManifest,
    } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-dp-adaptive-run-'));
    tempDirs.push(dir);
    const analysisCase = buildPlaneStrainDruckerPragerAdaptiveExcavationDemoAnalysisCase(
      buildExcavationDemoAnalysisCase(),
    );
    analysisCase.materials[0].hardeningModulusKpa = 5_000;
    const casePath = join(dir, 'excavation.analysis_case.json');
    const resultPath = join(dir, 'dp-adaptive.manifest.json');
    await writeFile(casePath, JSON.stringify(analysisCase, null, 2), 'utf-8');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'run',
      casePath,
      '--experimental',
      '--reviewed',
      ...femApprovalArgs(join(dir, 'dp-adaptive-approval.json')),
      '--backend',
      'plane-strain-dp-adaptive',
      '--output',
      resultPath,
      '--no-open',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    const writtenManifestText = await readFile(resultPath, 'utf-8');
    const writtenManifest = JSON.parse(writtenManifestText);
    expect(payload.manifest.backend.id).toBe('builtin-plane-strain-dp-adaptive-v0');
    expect(writtenManifest.backend.id).toBe('builtin-plane-strain-dp-adaptive-v0');
    expect(payload.manifest.analysisCase.analysisType).toBe('static_2d_plane_strain_drucker_prager');
    expect(payload.manifest.adaptiveLoadStepping.enabled).toBe(true);
    expect(payload.manifest.adaptiveLoadStepping.acceptedLoadFactors.at(-1)).toBe(1);
    expect(payload.manifest.envelope.plasticGaussPointCount).toBeGreaterThan(0);
    expect(payload.manifest.envelope.maxHardeningStressKpa).toBeGreaterThan(0);
    expect(writtenManifest.envelope.maxHardeningStressKpa).toBe(payload.manifest.envelope.maxHardeningStressKpa);
    expect(payload.manifest.assumptions.map((assumption: { id: string }) => assumption.id))
      .toContain('dp-isotropic-hardening-route');
    expect(payload.manifest.envelope.adaptiveAttemptCount)
      .toBeGreaterThanOrEqual(payload.manifest.envelope.adaptiveAcceptedStepCount);
    expect(payload.manifest.envelope.adaptiveRejectedAttemptCount).toBeGreaterThanOrEqual(0);
    expect(payload.manifest.solverConvergence.status).toBe('converged');
    expect(validateFemResultManifest(writtenManifest).blockers).toBe(0);
    expect(payload.manifest.productionReady).toBeUndefined();
    expect(writtenManifest.productionReady).toBeUndefined();
    expect(payload.manifest.backend.productionReady).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('"productionReady":true');
    expect(writtenManifestText).not.toContain('"productionReady": true');
    expect(payload.warnings.join(' ')).toMatch(/plane-strain-dp-adaptive backend/i);
    expect(payload.warnings.join(' ')).toMatch(/builtin-plane-strain-dp-adaptive-v0/i);
    expect(payload.warnings.join(' ')).toMatch(/not production-ready/i);
    logSpy.mockRestore();
  });

  it('rejects blocked FEM analysis cases before writing run artifacts', async () => {
    const { buildRaftDemoAnalysisCase } = await import('../../core/src/fem/index.js');
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-run-'));
    tempDirs.push(dir);
    const casePath = join(dir, 'blocked.analysis_case.json');
    const htmlPath = join(dir, 'blocked.html');
    const blockedCase = buildRaftDemoAnalysisCase();
    blockedCase.geometry.raft!.lengthM = -1;
    await writeFile(casePath, JSON.stringify(blockedCase, null, 2), 'utf-8');
    program.exitOverride();
    registerFemCommand(program);

    await expect(
      program.parseAsync([
        'fem',
        'run',
        casePath,
        '--experimental',
        '--reviewed',
        '--save-html',
        htmlPath,
        '--no-open',
        '--json',
      ], { from: 'user' }),
    ).rejects.toThrow(/failed validation/i);
    expect(existsSync(htmlPath)).toBe(false);
  });

  it('attaches FEM workspace readiness context to the scoped FEM agent without widening tools', async () => {
    coreMocks.analyzeWorkspace.mockResolvedValue(makeFemWorkspaceManifest());
    coreMocks.buildLLMConfig.mockReturnValue({
      provider: 'hosted-beta',
      apiKey: '',
      timeout: 60000,
      skillsEnabled: true,
    });
    coreMocks.runAgent.mockResolvedValue({
      steps: [{ type: 'answer', content: 'Collect raft geometry, pressure, and review the prefilled evidence.', timestamp: Date.now() }],
      context: {},
      totalTokens: 7,
      totalLatencyMs: 60,
    });
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'agent',
      'review',
      'FEM',
      'readiness',
      '--workspace',
      'C:/site-data',
      '--objective',
      'foundation-settlement',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.runAgent).toHaveBeenCalledWith(
      expect.stringContaining('FEM workspace evidence context:'),
      expect.objectContaining({ skillsEnabled: false }),
      expect.any(Function),
      undefined,
      expect.objectContaining({
        allowedTools: [
          'list_fem_capabilities',
          'assess_fem_production_readiness',
          'prepare_fem_analysis_case',
          'validate_fem_analysis_case',
        ],
        systemPromptSuffix: expect.stringContaining('Workspace evidence may prefill material'),
      }),
    );
    const scopedTask = coreMocks.runAgent.mock.calls[0][0] as string;
    expect(scopedTask).toContain('Prepared deterministic FEM draft prefill');
    expect(scopedTask).toContain('"elasticModulusKpa":25000');
    const payload = JSON.parse(collectLogText(logSpy).trim());
    expect(payload.allowedTools).toEqual([
      'list_fem_capabilities',
      'assess_fem_production_readiness',
      'prepare_fem_analysis_case',
      'validate_fem_analysis_case',
    ]);
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

  it('writes a tunnel volume-loss WebGL artifact and JSON command envelope', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-cli-'));
    tempDirs.push(dir);
    const htmlPath = join(dir, 'tunnel-demo.html');
    const resultPath = join(dir, 'tunnel-demo.manifest.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'demo',
      'tunnel',
      '--experimental',
      '--save-html',
      htmlPath,
      '--output',
      resultPath,
      '--no-open',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    const html = await readFile(htmlPath, 'utf-8');
    const manifest = JSON.parse(await readFile(resultPath, 'utf-8'));

    expect(payload.kind).toBe('geotech-fem-demo-result');
    expect(payload.demo).toBe('tunnel');
    expect(payload.opened).toBe(false);
    expect(payload.manifest.analysisCase.objective).toBe('tunnel_volume_loss_settlement');
    expect(payload.manifest.envelope.volumeLossPercent).toBe(1.2);
    expect(manifest.backend.id).toBe('builtin-tunnel-volume-loss-demo');
    expect(manifest.resultFields.map((field: { id: string }) => field.id)).toEqual(['surface_settlement']);
    expect(html).toContain('Experimental 3D tunnel volume-loss settlement preview');
    expect(html).toContain('tunnel-volume-loss-settlement-demo');
    expect(html).not.toContain('id="fieldSelect"');
    expect(html).not.toContain('id="stageSlider"');
  });

  it('writes a staged consolidation WebGL artifact and JSON command envelope', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    const dir = await mkdtemp(join(tmpdir(), 'geotech-fem-cli-'));
    tempDirs.push(dir);
    const htmlPath = join(dir, 'consolidation-demo.html');
    const resultPath = join(dir, 'consolidation-demo.manifest.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program.exitOverride();
    registerFemCommand(program);

    await program.parseAsync([
      'fem',
      'demo',
      'consolidation',
      '--experimental',
      '--save-html',
      htmlPath,
      '--output',
      resultPath,
      '--no-open',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(collectLogText(logSpy).trim());
    const html = await readFile(htmlPath, 'utf-8');
    const manifest = JSON.parse(await readFile(resultPath, 'utf-8'));

    expect(payload.kind).toBe('geotech-fem-demo-result');
    expect(payload.demo).toBe('consolidation');
    expect(payload.opened).toBe(false);
    expect(payload.manifest.analysisCase.objective).toBe('staged_settlement_consolidation');
    expect(payload.manifest.envelope.finalDegreeOfConsolidation).toBeGreaterThan(0);
    expect(manifest.backend.id).toBe('builtin-staged-consolidation-1d');
    expect(manifest.resultFields.map((field: { id: string }) => field.id)).toContain('final_degree_of_consolidation');
    expect(html).toContain('Experimental 1D staged settlement consolidation preview');
    expect(html).toContain('id="stageSlider"');
    expect(html).not.toContain('<script src=');
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

  it('requires explicit experimental acknowledgement for the tunnel demo', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    program.exitOverride();
    registerFemCommand(program);

    await expect(
      program.parseAsync(['fem', 'demo', 'tunnel', '--json'], { from: 'user' }),
    ).rejects.toThrow(/--experimental/i);
  });

  it('requires explicit experimental acknowledgement for the consolidation demo', async () => {
    const registerFemCommand = await loadRegisterFemCommand();
    const program = new Command();
    program.exitOverride();
    registerFemCommand(program);

    await expect(
      program.parseAsync(['fem', 'demo', 'consolidation', '--json'], { from: 'user' }),
    ).rejects.toThrow(/--experimental/i);
  });
});
