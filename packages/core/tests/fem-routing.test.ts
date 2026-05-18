import { describe, expect, it } from 'vitest';

import {
  buildFemDraftInputFromReadiness,
  listFemCapabilities,
  mapGroundModelEvidenceRefs,
  prepareFemAnalysisCaseDraft,
  stripPlaceholderFemValues,
} from '../src/fem/index.js';
import { buildProviderOperatingPrompt } from '../src/agents/provider-operating-contract.js';
import { getAllowedToolsForAgent, isToolAllowedForAgent } from '../src/agents/swarm.js';
import { toolRegistry } from '../src/agents/tools.js';
import type { GroundModel, GroundModelCalculationReadiness } from '../src/index.js';

import '../src/agents/runtime-bootstrap.js';

describe('FEM routing contract', () => {
  it('lists implemented and future FEM routes without pretending all are executable', () => {
    const capabilities = listFemCapabilities();

    expect(capabilities.map((capability) => capability.objective)).toEqual([
      'foundation-settlement',
      'excavation-deformation',
      'shaft-deformation',
      'tunnel-volume-loss-settlement',
      'pile-group-elastic-interaction',
    ]);
    expect(capabilities.find((capability) => capability.objective === 'foundation-settlement')?.status).toBe('implemented-demo');
    expect(capabilities.find((capability) => capability.objective === 'excavation-deformation')?.status).toBe('implemented-demo');
    expect(capabilities.find((capability) => capability.objective === 'excavation-deformation')?.command).toBe('geotech fem demo excavation --experimental');
    expect(capabilities.find((capability) => capability.objective === 'tunnel-volume-loss-settlement')?.status).toBe('implemented-demo');
    expect(capabilities.find((capability) => capability.objective === 'tunnel-volume-loss-settlement')?.command).toBe('geotech fem demo tunnel --experimental');
    expect(capabilities.find((capability) => capability.objective === 'tunnel-volume-loss-settlement')?.reviewGates).toContain('not-fem-solver');
  });

  it('prepares foundation settlement drafts only from explicit inputs or demo defaults', () => {
    const missing = prepareFemAnalysisCaseDraft({ objective: 'foundation-settlement' });

    expect(missing.implemented).toBe(true);
    expect(missing.canAutoProceed).toBe(false);
    expect(missing.recommendedAction).toBe('collect-inputs');
    expect(missing.missingUserInputs).toEqual(['raft length', 'raft width', 'service pressure']);
    expect(missing.analysisCase).toBeUndefined();

    const draft = prepareFemAnalysisCaseDraft({
      objective: 'foundation-settlement',
      geometry: {
        raftLengthM: 10,
        raftWidthM: 7,
        domainLengthM: 32,
        domainWidthM: 24,
        domainDepthM: 14,
      },
      load: {
        pressureKpa: 180,
      },
      material: {
        elasticModulusKpa: 42_000,
        poissonRatio: 0.28,
        unitWeightKnM3: 19,
      },
      evidenceRefs: [{ id: 'ev-es-1', source: 'GroundModel', page: 12 }],
    });

    expect(draft.recommendedAction).toBe('run-experimental-demo');
    expect(draft.canAutoProceed).toBe(false);
    expect(draft.analysisCase?.geometry.raft.lengthM).toBe(10);
    expect(draft.analysisCase?.loads[0]?.pressureKpa).toBe(180);
    expect(draft.analysisCase?.materials[0]?.elasticModulusKpa).toBe(42_000);
    expect(draft.validation?.status).toBe('review');
    expect(draft.reviewGates).toContain('not-design-calculation');
  });

  it('prepares excavation deformation drafts without allowing auto-proceed', () => {
    const missing = prepareFemAnalysisCaseDraft({ objective: 'excavation-deformation' });

    expect(missing.implemented).toBe(true);
    expect(missing.canAutoProceed).toBe(false);
    expect(missing.recommendedAction).toBe('collect-inputs');
    expect(missing.missingUserInputs).toEqual(['excavation length', 'excavation width', 'final excavation depth']);
    expect(missing.analysisCase).toBeUndefined();

    const draft = prepareFemAnalysisCaseDraft({
      objective: 'excavation-deformation',
      geometry: {
        excavationLengthM: 22,
        excavationWidthM: 14,
        excavationFinalDepthM: 9,
        wallToeDepthM: 15,
      },
      excavation: {
        stageDepthsM: [3, 6, 9],
        supportLevelsM: [0, 2, 5],
        wallType: 'secant_pile_wall',
      },
      load: { pressureKpa: 25 },
      material: {
        elasticModulusKpa: 36_000,
        poissonRatio: 0.31,
        unitWeightKnM3: 18.8,
      },
      evidenceRefs: [{ id: 'ev-ex-1', source: 'GroundModel', page: 18 }],
    });

    expect(draft.implemented).toBe(true);
    expect(draft.recommendedAction).toBe('run-experimental-demo');
    expect(draft.canAutoProceed).toBe(false);
    expect(draft.analysisCase?.objective).toBe('excavation_deformation');
    expect(draft.analysisCase?.geometry.excavation?.finalDepthM).toBe(9);
    expect(draft.analysisCase?.loads[0]?.target).toBe('excavation_surcharge');
    expect(draft.validation?.status).toBe('review');
    expect(draft.reviewGates).toContain('not-design-calculation');
  });

  it('prepares tunnel volume-loss settlement drafts without pretending it is production FEM', () => {
    const missing = prepareFemAnalysisCaseDraft({ objective: 'tunnel-volume-loss-settlement' });

    expect(missing.implemented).toBe(true);
    expect(missing.canAutoProceed).toBe(false);
    expect(missing.recommendedAction).toBe('collect-inputs');
    expect(missing.missingUserInputs).toEqual([
      'tunnel diameter',
      'tunnel axis depth',
      'tunnel alignment length',
      'tunnel volume loss',
      'trough width parameter',
    ]);
    expect(missing.analysisCase).toBeUndefined();

    const draft = prepareFemAnalysisCaseDraft({
      objective: 'tunnel-volume-loss-settlement',
      geometry: {
        tunnelDiameterM: 6.5,
        tunnelAxisDepthM: 20,
        tunnelLengthM: 70,
        tunnelVolumeLossPercent: 1.1,
        troughWidthParameterK: 0.48,
      },
      material: {
        elasticModulusKpa: 52_000,
        poissonRatio: 0.29,
        unitWeightKnM3: 19.2,
      },
      evidenceRefs: [{ id: 'ev-tu-1', source: 'GroundModel', page: 22 }],
    });

    expect(draft.implemented).toBe(true);
    expect(draft.recommendedAction).toBe('run-experimental-demo');
    expect(draft.canAutoProceed).toBe(false);
    expect(draft.analysisCase?.objective).toBe('tunnel_volume_loss_settlement');
    expect(draft.analysisCase?.geometry.tunnel?.diameterM).toBe(6.5);
    expect(draft.analysisCase?.geometry.tunnel?.volumeLossPercent).toBe(1.1);
    expect(draft.analysisCase?.materials[0]?.elasticModulusKpa).toBe(52_000);
    expect(draft.validation?.status).toBe('review');
    expect(draft.reviewGates).toContain('not-fem-solver');
    expect(draft.reviewGates).toContain('tunnel.empirical-preview');
    expect(draft.recommendedCommand).toBe('geotech fem demo tunnel --experimental');
  });

  it('keeps non-implemented FEM objectives as contract-only routes', () => {
    const draft = prepareFemAnalysisCaseDraft({ objective: 'shaft-deformation' });

    expect(draft.implemented).toBe(false);
    expect(draft.recommendedAction).toBe('contract-only');
    expect(draft.analysisCase).toBeUndefined();
    expect(draft.missingUserInputs).toContain('shaft diameter/shape');
    expect(draft.reviewGates).toContain('planned-only');
  });

  it('bridges GroundModel readiness into FEM draft inputs without converting placeholders into values', () => {
    const groundModel: GroundModel = {
      schemaVersion: 'ground-model.v1',
      generatedAt: '2026-05-18T00:00:00.000Z',
      project: { rootPath: 'C:/site' },
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
          location: { filePath: 'lab.csv', rowNumber: 3, columnName: 'Es', cellRef: 'C3' },
          method: 'csv-sample',
          confidence: 0.88,
          normalizedValue: 18000,
          unit: 'kPa',
          warnings: [],
        },
        {
          id: 'ev-gw-1',
          sourceType: 'pdf-page',
          sourcePath: 'report.pdf',
          location: { filePath: 'report.pdf', pageNumber: 12 },
          method: 'pdf-text',
          confidence: 0.82,
          normalizedValue: 1.8,
          unit: 'm',
          warnings: [],
        },
      ],
    };
    const workflow: GroundModelCalculationReadiness = {
      workflow: 'fem-excavation-deformation',
      label: 'Experimental FEM staged excavation deformation draft',
      status: 'ready',
      score: 100,
      toolName: 'prepare_fem_analysis_case',
      commandTemplate: 'geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>',
      present: ['strata profile'],
      missing: [],
      assumptions: [],
      evidenceIds: ['ev-es-1', 'ev-gw-1'],
      recommendation: 'Prepare an experimental staged-excavation FEM draft.',
      inputDraft: {
        workflow: 'fem-excavation-deformation',
        toolName: 'prepare_fem_analysis_case',
        command: 'geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>',
        input: {
          objective: 'excavation-deformation',
          useDemoDefaults: false,
          geometry: {
            excavationLengthM: '<m>',
            excavationWidthM: '<m>',
            excavationFinalDepthM: '<m>',
          },
          excavation: {
            stageDepthsM: ['<stage depths m>'],
            supportLevelsM: ['<support level depths m>'],
            wallType: 'diaphragm_wall',
          },
          load: {
            pressureKpa: '<surcharge kPa>',
          },
          material: {
            elasticModulusKpa: 18_000,
            unitWeightKnM3: 18.5,
            poissonRatio: 0.3,
          },
          groundwater: {
            condition: 'specified',
            depthM: 1.8,
            note: 'Groundwater from evidence.',
          },
        },
        missingUserInputs: ['excavation length'],
        assumptions: ['review groundwater'],
        evidenceIds: ['ev-es-1', 'ev-gw-1'],
        readyToRun: false,
      },
    };

    const bridge = buildFemDraftInputFromReadiness(workflow, groundModel);
    expect(bridge.schemaVersion).toBe('fem-ground-model-draft-bridge.v1');
    expect(bridge.input.objective).toBe('excavation-deformation');
    expect(bridge.input.geometry?.excavationLengthM).toBeUndefined();
    expect(bridge.input.excavation?.stageDepthsM).toBeUndefined();
    expect(bridge.input.excavation?.wallType).toBe('diaphragm_wall');
    expect(bridge.input.load?.pressureKpa).toBeUndefined();
    expect(bridge.input.material?.elasticModulusKpa).toBe(18_000);
    expect(bridge.input.groundwater?.depthM).toBe(1.8);
    expect(bridge.input.evidenceRefs).toEqual([
      { id: 'ev-es-1', source: 'lab.csv', note: 'csv-sample; cell C3; unit kPa' },
      { id: 'ev-gw-1', source: 'report.pdf', page: 12, note: 'pdf-text; unit m' },
    ]);

    const draft = prepareFemAnalysisCaseDraft(bridge.input);
    expect(draft.recommendedAction).toBe('collect-inputs');
    expect(draft.missingUserInputs).toEqual(['excavation length', 'excavation width', 'final excavation depth']);
    expect(draft.evidenceRefs.map((item) => item.id)).toEqual(['ev-es-1', 'ev-gw-1']);
  });

  it('maps missing GroundModel evidence ids into traceable FEM placeholders', () => {
    const refs = mapGroundModelEvidenceRefs({
      schemaVersion: 'ground-model.v1',
      generatedAt: '2026-05-18T00:00:00.000Z',
      project: { rootPath: 'C:/site' },
      coordinateSystem: { kind: 'unknown', warnings: [] },
      boreholes: [],
      strata: [],
      groundwater: [],
      labTests: [],
      parameters: [],
      monitoringSeries: [],
      evidence: [],
      rejectedObservations: [],
      warnings: [],
      stats: {
        boreholes: 0,
        sptTests: 0,
        strata: 0,
        groundwaterObservations: 0,
        labTests: 0,
        parameters: 0,
        monitoringSeries: 0,
        evidenceRefs: 0,
        rejectedObservations: 0,
      },
    }, ['ev-missing']);

    expect(refs[0]).toMatchObject({ id: 'ev-missing', source: 'GroundModel' });
    expect(stripPlaceholderFemValues({
      objective: 'foundation-settlement',
      geometry: { raftLengthM: '<m>' as unknown as number, raftWidthM: 8 },
      load: { pressureKpa: '<kPa>' as unknown as number },
    })).toMatchObject({
      objective: 'foundation-settlement',
      geometry: { raftWidthM: 8 },
      load: {},
    });
  });

  it('wires FEM tools into single-agent registry and swarm role allowlists', async () => {
    const names = toolRegistry.list().map((tool) => tool.name);

    expect(names).toContain('list_fem_capabilities');
    expect(names).toContain('prepare_fem_analysis_case');
    expect(names).toContain('validate_fem_analysis_case');
    expect(getAllowedToolsForAgent('simulation')).toContain('prepare_fem_analysis_case');
    expect(getAllowedToolsForAgent('reviewer')).toContain('validate_fem_analysis_case');
    expect(isToolAllowedForAgent('reviewer', 'prepare_fem_analysis_case')).toBe(false);

    const capabilityResult = await toolRegistry.execute('list_fem_capabilities', {});
    expect(capabilityResult.success).toBe(true);
    expect(capabilityResult.summary).toContain('foundation-settlement');

    const draftResult = await toolRegistry.execute('prepare_fem_analysis_case', {
      objective: 'foundation-settlement',
      useDemoDefaults: true,
    });
    expect(draftResult.success).toBe(true);
    expect(draftResult.summary).toContain('auto-proceed: no');
    expect((draftResult.data as any).agentEvidenceSummary).toContain('canAutoProceed: no');

    const validationResult = await toolRegistry.execute('validate_fem_analysis_case', {
      caseFile: { schemaVersion: 'fem-analysis-case.v0' },
    });
    expect(validationResult.success).toBe(true);
    expect((validationResult.data as any).status).toBe('blocked');
    expect((validationResult.data as any).agentEvidenceSummary).toContain('FEM validation: blocked');
  });

  it('keeps provider prompts explicit that LLMs route FEM but do not invent FEM math', () => {
    const prompt = buildProviderOperatingPrompt({
      provider: 'openai-compatible',
      modelId: 'test/free',
      visionModelId: null,
    }, { task: 'swarm-simulation' });

    expect(prompt).toContain('the model may plan, route, and review');
    expect(prompt).toContain('prepare and validate an analysis case');
  });
});
