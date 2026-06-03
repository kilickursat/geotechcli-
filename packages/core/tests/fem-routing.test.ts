import { describe, expect, it } from 'vitest';

import {
  buildFemDraftCandidateFromReadiness,
  buildFemDraftCandidatesFromGroundModel,
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
      'slope-embankment-deformation',
      'retaining-wall-excavation-support',
      'seepage-groundwater-coupling',
      'staged-settlement-consolidation',
    ]);
    expect(capabilities.find((capability) => capability.objective === 'foundation-settlement')?.status).toBe('implemented-demo');
    expect(capabilities.find((capability) => capability.objective === 'excavation-deformation')?.status).toBe('implemented-demo');
    expect(capabilities.find((capability) => capability.objective === 'foundation-settlement')?.executionMode).toBe('human-reviewed-preview');
    expect(capabilities.find((capability) => capability.objective === 'foundation-settlement')?.agentRunAllowed).toBe(false);
    expect(capabilities.find((capability) => capability.objective === 'excavation-deformation')?.command).toBe('geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>');
    expect(capabilities.find((capability) => capability.objective === 'excavation-deformation')?.demoCommand).toBe('geotech fem demo excavation --experimental');
    expect(capabilities.find((capability) => capability.objective === 'excavation-deformation')?.runCommandTemplate).toBe('geotech fem run <analysis_case.json> --experimental --reviewed');
    expect(capabilities.find((capability) => capability.objective === 'excavation-deformation')?.requiredEvidence).toContain('support reaction screening check');
    expect(capabilities.find((capability) => capability.objective === 'excavation-deformation')?.reviewGates).toContain('not-jurisdiction-specific-structural-design');
    expect(capabilities.find((capability) => capability.objective === 'tunnel-volume-loss-settlement')?.status).toBe('implemented-demo');
    expect(capabilities.find((capability) => capability.objective === 'tunnel-volume-loss-settlement')?.command).toBe('geotech fem draft tunnel-volume-loss-settlement --input <json> --case-output <analysis_case.json>');
    expect(capabilities.find((capability) => capability.objective === 'tunnel-volume-loss-settlement')?.demoCommand).toBe('geotech fem demo tunnel --experimental');
    expect(capabilities.find((capability) => capability.objective === 'tunnel-volume-loss-settlement')?.reviewGates).toContain('not-fem-solver');
    expect(capabilities.find((capability) => capability.objective === 'shaft-deformation')?.executionMode).toBe('contract-only');
    expect(capabilities.find((capability) => capability.objective === 'shaft-deformation')?.agentRunAllowed).toBe(false);
    expect(capabilities.find((capability) => capability.objective === 'shaft-deformation')?.runCommandTemplate).toBeUndefined();
    expect(capabilities.find((capability) => capability.objective === 'pile-group-elastic-interaction')?.executionMode).toBe('contract-only');
    expect(capabilities.find((capability) => capability.objective === 'pile-group-elastic-interaction')?.agentRunAllowed).toBe(false);
    expect(capabilities.find((capability) => capability.objective === 'pile-group-elastic-interaction')?.runCommandTemplate).toBeUndefined();
    expect(capabilities.find((capability) => capability.objective === 'slope-embankment-deformation')?.executionMode).toBe('contract-only');
    expect(capabilities.find((capability) => capability.objective === 'retaining-wall-excavation-support')?.requiredUserInputs).toContain('prop/anchor levels');
    expect(capabilities.find((capability) => capability.objective === 'seepage-groundwater-coupling')?.status).toBe('implemented-demo');
    expect(capabilities.find((capability) => capability.objective === 'seepage-groundwater-coupling')?.executionMode).toBe('human-reviewed-preview');
    expect(capabilities.find((capability) => capability.objective === 'seepage-groundwater-coupling')?.deterministicBackend).toBe('builtin-biot-up-plane-strain-v0');
    expect(capabilities.find((capability) => capability.objective === 'seepage-groundwater-coupling')?.demoCommand).toBe('geotech fem demo biot --experimental');
    expect(capabilities.find((capability) => capability.objective === 'seepage-groundwater-coupling')?.runCommandTemplate).toBe('geotech fem run <analysis_case.json> --experimental --reviewed --backend biot-up');
    expect(capabilities.find((capability) => capability.objective === 'seepage-groundwater-coupling')?.reviewGates).toContain('not-production-sparse-solver');
    expect(capabilities.find((capability) => capability.objective === 'staged-settlement-consolidation')?.status).toBe('implemented-demo');
    expect(capabilities.find((capability) => capability.objective === 'staged-settlement-consolidation')?.executionMode).toBe('human-reviewed-preview');
    expect(capabilities.find((capability) => capability.objective === 'staged-settlement-consolidation')?.deterministicBackend).toBe('builtin-staged-consolidation-1d');
    expect(capabilities.find((capability) => capability.objective === 'staged-settlement-consolidation')?.requiredEvidence).toContain('compressibility/consolidation parameters');
    expect(capabilities.every((capability) => capability.agentRunAllowed === false)).toBe(true);
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

    expect(draft.recommendedAction).toBe('run-reviewed-case');
    expect(draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed');
    expect(draft.canAutoProceed).toBe(false);
    expect(draft.analysisCase?.geometry.raft.lengthM).toBe(10);
    expect(draft.analysisCase?.loads[0]?.pressureKpa).toBe(180);
    expect(draft.analysisCase?.materials[0]?.elasticModulusKpa).toBe(42_000);
    expect(draft.validation?.status).toBe('review');
    expect(draft.reviewGates).toContain('not-design-calculation');
  });

  it('does not recommend FEM run commands when a prepared draft is blocked by validation', () => {
    const draft = prepareFemAnalysisCaseDraft({
      objective: 'foundation-settlement',
      geometry: {
        raftLengthM: 10,
        raftWidthM: 7,
        domainDepthM: Number.NaN,
      },
      load: {
        pressureKpa: 180,
      },
    });

    expect(draft.validation?.status).toBe('blocked');
    expect(draft.recommendedAction).toBe('collect-inputs');
    expect(draft.recommendedCommand).toBe('geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>');
    expect(draft.recommendedCommand).not.toContain('fem run');
    expect(draft.missingUserInputs).toContain('geometry.domain.depth.non-finite');
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
        frictionAngleDeg: 31,
        cohesionKpa: 8,
        hardeningModulusKpa: 4_500,
      },
      evidenceRefs: [{ id: 'ev-ex-1', source: 'GroundModel', page: 18 }],
    });

    expect(draft.implemented).toBe(true);
    expect(draft.recommendedAction).toBe('run-reviewed-case');
    expect(draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed');
    expect(draft.canAutoProceed).toBe(false);
    expect(draft.analysisCase?.objective).toBe('excavation_deformation');
    expect(draft.analysisCase?.geometry.excavation?.finalDepthM).toBe(9);
    expect(draft.analysisCase?.loads[0]?.target).toBe('excavation_surcharge');
    expect(draft.analysisCase?.materials[0]?.frictionAngleDeg).toBe(31);
    expect(draft.analysisCase?.materials[0]?.cohesionKpa).toBe(8);
    expect(draft.analysisCase?.materials[0]?.hardeningModulusKpa).toBe(4_500);
    expect(draft.validation?.status).toBe('review');
    expect(draft.reviewGates).toContain('not-design-calculation');
    expect(draft.reviewGates).toContain('support-reaction-screening-only');
    expect(draft.reviewGates).toContain('not-jurisdiction-specific-structural-design');
  });

  it('keeps malformed excavation staging inputs as blocked draft inputs instead of throwing', () => {
    const draft = prepareFemAnalysisCaseDraft({
      objective: 'excavation-deformation',
      geometry: {
        excavationLengthM: 22,
        excavationWidthM: 14,
        excavationFinalDepthM: 9,
      },
      excavation: {
        stageDepthsM: ['not-a-depth'] as any,
      },
      load: { pressureKpa: 25 },
    });

    expect(draft.recommendedAction).toBe('collect-inputs');
    expect(draft.analysisCase).toBeUndefined();
    expect(draft.missingUserInputs).toContain('valid excavation stage depths');
    expect(draft.recommendedCommand).toBe('geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>');
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
    expect(draft.recommendedAction).toBe('run-reviewed-case');
    expect(draft.canAutoProceed).toBe(false);
    expect(draft.analysisCase?.objective).toBe('tunnel_volume_loss_settlement');
    expect(draft.analysisCase?.geometry.tunnel?.diameterM).toBe(6.5);
    expect(draft.analysisCase?.geometry.tunnel?.volumeLossPercent).toBe(1.1);
    expect(draft.analysisCase?.materials[0]?.elasticModulusKpa).toBe(52_000);
    expect(draft.validation?.status).toBe('review');
    expect(draft.reviewGates).toContain('not-fem-solver');
    expect(draft.reviewGates).toContain('tunnel.empirical-preview');
    expect(draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed');
  });

  it('keeps non-implemented FEM objectives as contract-only routes', () => {
    const draft = prepareFemAnalysisCaseDraft({ objective: 'shaft-deformation' });

    expect(draft.implemented).toBe(false);
    expect(draft.capability.executionMode).toBe('contract-only');
    expect(draft.capability.agentRunAllowed).toBe(false);
    expect(draft.recommendedAction).toBe('contract-only');
    expect(draft.analysisCase).toBeUndefined();
    expect(draft.recommendedCommand).toBe('geotech fem draft shaft-deformation --input <json>');
    expect(draft.missingUserInputs).toContain('shaft diameter/shape');
    expect(draft.reviewGates).toContain('planned-only');
    expect(draft.reviewGates).toContain('agent-run-disabled');
    expect(draft.reviewGates).toContain('solver-backend-not-implemented');
    expect(draft.contractReadiness).toMatchObject({
      schemaVersion: 'fem-contract-readiness.v1',
      routeState: 'planned-contract-only',
      requiredEvidence: ['shaft geometry', 'stratigraphy', 'groundwater condition', 'support assumptions'],
      requiredUserInputs: ['shaft diameter/shape', 'final depth', 'support sequence', 'groundwater handling'],
      allowedAgentActions: ['list-capability', 'draft-input-contract', 'validate-user-inputs', 'summarize-readiness'],
      disallowedAgentActions: ['run-solver', 'create-analysis-case', 'render-webgl', 'invent-results'],
    });
    expect(draft.contractReadiness?.nonRunnableReason).toMatch(/No deterministic backend/i);
    expect(draft.contractReadiness?.blockedUntil).toContain('solver-or-preview-backend-implemented');

    const pileGroup = prepareFemAnalysisCaseDraft({
      objective: 'pile-group-elastic-interaction',
      useDemoDefaults: true,
    });
    expect(pileGroup.implemented).toBe(false);
    expect(pileGroup.capability.executionMode).toBe('contract-only');
    expect(pileGroup.capability.agentRunAllowed).toBe(false);
    expect(pileGroup.recommendedAction).toBe('contract-only');
    expect(pileGroup.analysisCase).toBeUndefined();
    expect(pileGroup.recommendedCommand).toBe('geotech fem draft pile-group-elastic-interaction --input <json>');
    expect(pileGroup.contractReadiness?.requiredEvidence).toContain('pile layout');
    expect(pileGroup.contractReadiness?.requiredUserInputs).toContain('pile spacing');
    expect(pileGroup.contractReadiness?.reviewGates).toContain('human-review-required');

    for (const [objective, expectedInput] of [
      ['slope-embankment-deformation', 'slope height'],
      ['retaining-wall-excavation-support', 'prop/anchor levels'],
    ] as const) {
      const planned = prepareFemAnalysisCaseDraft({ objective });
      expect(planned.implemented).toBe(false);
      expect(planned.capability.executionMode).toBe('contract-only');
      expect(planned.capability.agentRunAllowed).toBe(false);
      expect(planned.recommendedAction).toBe('contract-only');
      expect(planned.analysisCase).toBeUndefined();
      expect(planned.recommendedCommand).toBe(`geotech fem draft ${objective} --input <json>`);
      expect(planned.missingUserInputs).toContain(expectedInput);
      expect(planned.contractReadiness?.disallowedAgentActions).toEqual([
        'run-solver',
        'create-analysis-case',
        'render-webgl',
        'invent-results',
      ]);
    }
  });

  it('prepares seepage/groundwater Biot drafts as human-reviewed experimental previews only', () => {
    const missing = prepareFemAnalysisCaseDraft({ objective: 'seepage-groundwater-coupling' });

    expect(missing.implemented).toBe(true);
    expect(missing.capability.executionMode).toBe('human-reviewed-preview');
    expect(missing.capability.agentRunAllowed).toBe(false);
    expect(missing.recommendedAction).toBe('collect-inputs');
    expect(missing.analysisCase).toBeUndefined();
    expect(missing.recommendedCommand).toBe('geotech fem draft seepage-groundwater-coupling --input <json> --case-output <analysis_case.json>');
    expect(missing.missingUserInputs).toEqual(expect.arrayContaining([
      'Biot column width',
      'Biot column height',
      'Biot column thickness',
      'initial excess pore pressure',
      'valid Biot time steps',
      'hydraulic conductivity',
      'specific storage',
    ]));

    const draft = prepareFemAnalysisCaseDraft({
      objective: 'seepage-groundwater-coupling',
      biot: {
        widthM: 1,
        heightM: 1,
        thicknessM: 1,
        initialPorePressureKpa: 100,
        timeStepsSeconds: [1, 2, 4, 8],
        topPorePressureKpa: 0,
      },
      material: {
        elasticModulusKpa: 30_000,
        poissonRatio: 0.3,
        unitWeightKnM3: 18.5,
        hydraulicConductivityMPerS: 1e-6,
        specificStorage1PerM: 1e-4,
        biotCoefficient: 0.8,
      },
      evidenceRefs: [{ id: 'ev-biot-1', source: 'GroundModel', page: 14 }],
    });

    expect(draft.recommendedAction).toBe('run-reviewed-case');
    expect(draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed --backend biot-up');
    expect(draft.canAutoProceed).toBe(false);
    expect(draft.analysisCase?.objective).toBe('seepage_groundwater_coupling');
    expect(draft.analysisCase?.analysisType).toBe('time_dependent_2d_biot_consolidation');
    expect(draft.analysisCase?.geometry.biot?.timeStepsSeconds).toEqual([1, 2, 4, 8]);
    expect(draft.analysisCase?.materials[0]?.specificStorage1PerM).toBe(1e-4);
    expect(draft.validation?.status).toBe('review');
    expect(draft.reviewGates).toContain('not-production-sparse-solver');
  });

  it('prepares staged settlement/consolidation drafts as human-reviewed experimental previews only', () => {
    const missing = prepareFemAnalysisCaseDraft({ objective: 'staged-settlement-consolidation' });

    expect(missing.implemented).toBe(true);
    expect(missing.capability.executionMode).toBe('human-reviewed-preview');
    expect(missing.capability.agentRunAllowed).toBe(false);
    expect(missing.recommendedAction).toBe('collect-inputs');
    expect(missing.analysisCase).toBeUndefined();
    expect(missing.missingUserInputs).toEqual(expect.arrayContaining([
      'consolidation layer thickness',
      'consolidation tributary surface area',
      'stage loads',
      'stage durations',
      'drainage condition',
    ]));

    const draft = prepareFemAnalysisCaseDraft({
      objective: 'staged-settlement-consolidation',
      geometry: {
        consolidationLayerThicknessM: 10,
        consolidationSurfaceAreaM2: 200,
      },
      consolidation: {
        stageLoadsKpa: [45, 35, 20],
        stageDurationsYears: [0.5, 1, 2],
        drainage: 'double',
      },
      material: {
        elasticModulusKpa: 30_000,
        poissonRatio: 0.32,
        unitWeightKnM3: 18.5,
        constrainedModulusKpa: 8_000,
        frictionAngleDeg: 28,
        cohesionKpa: 12,
        hardeningModulusKpa: 4_500,
        coefficientOfConsolidationM2PerYear: 0.8,
        hydraulicConductivityMPerS: 1e-9,
      },
      evidenceRefs: [{ id: 'ev-con-1', source: 'GroundModel', page: 8 }],
    });

    expect(draft.implemented).toBe(true);
    expect(draft.recommendedAction).toBe('run-reviewed-case');
    expect(draft.recommendedCommand).toBe('geotech fem run <analysis_case.json> --experimental --reviewed');
    expect(draft.canAutoProceed).toBe(false);
    expect(draft.analysisCase?.objective).toBe('staged_settlement_consolidation');
    expect(draft.analysisCase?.analysisType).toBe('time_dependent_1d_consolidation');
    expect(draft.analysisCase?.geometry.consolidation?.stages).toHaveLength(3);
    expect(draft.analysisCase?.materials[0]?.model).toBe('mohr_coulomb');
    expect(draft.analysisCase?.materials[0]?.hardeningModulusKpa).toBe(4_500);
    expect(draft.analysisCase?.loads.map((load) => load.target)).toEqual([
      'ground_surface',
      'ground_surface',
      'ground_surface',
    ]);
    expect(draft.validation?.status).toBe('review');
    expect(draft.reviewGates).toContain('1d-consolidation-only');
    expect(draft.reviewGates).toContain('consolidation.1d-preview');
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
        sourceRefs: [
          {
            evidenceId: 'ev-es-1',
            sourcePath: 'lab.csv',
            method: 'csv-sample',
            confidence: 0.88,
            rowNumber: 3,
            columnName: 'E',
            warnings: [],
          },
          {
            evidenceId: 'ev-gw-1',
            sourcePath: 'report.pdf',
            method: 'pdf-text',
            confidence: 0.82,
            pageNumber: 12,
            warnings: [],
          },
        ],
        sourcePages: [
          {
            sourcePath: 'report.pdf',
            pageNumber: 12,
            evidenceIds: ['ev-gw-1'],
            confidence: 0.82,
          },
        ],
        confidence: 0.62,
        reviewGates: [
          {
            code: 'missing_user_inputs',
            severity: 'blocking',
            message: 'Excavation length is required before execution.',
            evidenceIds: ['ev-es-1', 'ev-gw-1'],
            recommendation: 'Provide excavation geometry.',
          },
        ],
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

  it('exposes a human run boundary only after explicit GroundModel FEM inputs validate', () => {
    const groundModel: GroundModel = {
      schemaVersion: 'ground-model.v1',
      generatedAt: '2026-05-19T00:00:00.000Z',
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
        sptTests: 0,
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
          normalizedValue: 32000,
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
          normalizedValue: 3.4,
          unit: 'm',
          warnings: [],
        },
      ],
    };
    const workflow: GroundModelCalculationReadiness = {
      workflow: 'fem-foundation-settlement',
      label: 'Experimental FEM foundation settlement draft',
      status: 'ready',
      score: 100,
      toolName: 'prepare_fem_analysis_case',
      commandTemplate: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
      present: ['strata profile', 'elastic modulus', 'unit weight', 'groundwater'],
      missing: [],
      assumptions: ['review raft level and service pressure'],
      evidenceIds: ['ev-es-1', 'ev-gw-1'],
      recommendation: 'Prepare an experimental FEM foundation settlement draft.',
      inputDraft: {
        workflow: 'fem-foundation-settlement',
        toolName: 'prepare_fem_analysis_case',
        command: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
        input: {
          objective: 'foundation-settlement',
          useDemoDefaults: false,
          geometry: {
            raftLengthM: 12,
            raftWidthM: 9,
            raftThicknessM: 0.7,
            domainLengthM: 42,
            domainWidthM: 34,
            domainDepthM: 18,
          },
          load: {
            pressureKpa: 165,
          },
          material: {
            elasticModulusKpa: 32_000,
            unitWeightKnM3: 18.7,
            poissonRatio: 0.29,
          },
          groundwater: {
            condition: 'specified',
            depthM: 3.4,
            note: 'Groundwater from evidence.',
          },
        },
        missingUserInputs: [],
        assumptions: ['review raft level and service pressure'],
        evidenceIds: ['ev-es-1', 'ev-gw-1'],
        sourceRefs: [
          {
            evidenceId: 'ev-es-1',
            sourcePath: 'lab.csv',
            method: 'csv-sample',
            confidence: 0.91,
            rowNumber: 3,
            columnName: 'E',
            warnings: [],
          },
          {
            evidenceId: 'ev-gw-1',
            sourcePath: 'report.pdf',
            method: 'pdf-text',
            confidence: 0.84,
            pageNumber: 12,
            warnings: [],
          },
        ],
        sourcePages: [
          {
            sourcePath: 'report.pdf',
            pageNumber: 12,
            evidenceIds: ['ev-gw-1'],
            confidence: 0.84,
          },
        ],
        confidence: 0.88,
        reviewGates: [],
        readyToRun: false,
      },
    };

    const candidate = buildFemDraftCandidateFromReadiness(workflow, groundModel);

    expect(candidate.canAutoProceed).toBe(false);
    expect(candidate.command).toBe('geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>');
    expect(candidate.draft.recommendedAction).toBe('run-reviewed-case');
    expect(candidate.draft.validation?.status).toBe('review');
    expect(candidate.draft.analysisCase?.geometry.raft?.lengthM).toBe(12);
    expect(candidate.draft.analysisCase?.loads[0]?.pressureKpa).toBe(165);
    expect(candidate.draft.analysisCase?.materials[0]?.evidenceRefs.map((item) => item.id)).toEqual(['ev-es-1', 'ev-gw-1']);
    expect(candidate.executionBoundary).toMatchObject({
      schemaVersion: 'fem-ground-model-execution-boundary.v1',
      executionMode: 'human-reviewed-preview',
      agentRunAllowed: false,
      agentWebglRenderAllowed: false,
      agentResultManifestAllowed: false,
      humanReviewRequired: true,
      caseOutputAvailable: true,
      draftCommand: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
      humanRunCommand: 'geotech fem run <analysis_case.json> --experimental --reviewed',
      blockedReasons: [],
    });
  });

  it('builds review-gated FEM draft candidates directly from a GroundModel', () => {
    const groundModel: GroundModel = {
      schemaVersion: 'ground-model.v1',
      generatedAt: '2026-05-19T00:00:00.000Z',
      project: { rootPath: 'C:/site', requestedStandard: 'eurocode7' },
      coordinateSystem: { kind: 'unknown', warnings: [] },
      boreholes: [{
        id: 'BH-01',
        sptTests: [{
          depth: 2,
          nValue: 18,
          unit: 'blows/300mm',
          evidenceIds: ['ev-spt-1'],
          confidence: 0.92,
          warnings: [],
        }],
        strata: [],
        groundwater: [],
        evidenceIds: ['ev-bh-1'],
        confidence: 0.9,
        warnings: [],
      }],
      strata: [{
        boreholeId: 'BH-01',
        topDepth: 0,
        bottomDepth: 8,
        description: 'medium dense silty sand over stiff clay',
        evidenceIds: ['ev-strata-1'],
        confidence: 0.9,
        warnings: [],
      }],
      groundwater: [{
        boreholeId: 'BH-01',
        depth: 1.8,
        evidenceIds: ['ev-gw-1'],
        confidence: 0.85,
        warnings: [],
      }],
      labTests: [],
      parameters: [
        {
          name: 'unitWeight',
          value: 18.5,
          unit: 'kN/m3',
          boreholeId: 'BH-01',
          evidenceIds: ['ev-gamma-1'],
          confidence: 0.88,
          warnings: [],
        },
        {
          name: 'elasticModulus',
          value: 18000,
          unit: 'kPa',
          boreholeId: 'BH-01',
          evidenceIds: ['ev-es-1'],
          confidence: 0.8,
          warnings: [],
        },
      ],
      monitoringSeries: [],
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
    };

    const candidates = buildFemDraftCandidatesFromGroundModel(groundModel);
    const foundation = candidates.find((candidate) => candidate.workflow === 'fem-foundation-settlement');
    const excavation = candidates.find((candidate) => candidate.workflow === 'fem-excavation-deformation');
    const tunnel = candidates.find((candidate) => candidate.workflow === 'fem-tunnel-volume-loss-settlement');
    const shaft = candidates.find((candidate) => candidate.workflow === 'fem-shaft-deformation');
    const pileGroup = candidates.find((candidate) => candidate.workflow === 'fem-pile-group-elastic-interaction');
    const seepage = candidates.find((candidate) => candidate.workflow === 'fem-seepage-groundwater-coupling');

    expect(candidates).toHaveLength(9);
    expect(candidates.every((candidate) => candidate.schemaVersion === 'fem-ground-model-draft-candidate.v1')).toBe(true);
    expect(foundation?.canAutoProceed).toBe(false);
    expect(foundation?.draft.canAutoProceed).toBe(false);
    expect(foundation?.bridge.input.material?.elasticModulusKpa).toBe(18000);
    expect(foundation?.bridge.input.groundwater?.depthM).toBe(1.8);
    expect(foundation?.missingUserInputs).toEqual(['raft length', 'raft width', 'service pressure']);
    expect(foundation?.draft.analysisCase).toBeUndefined();
    expect(foundation?.executionBoundary).toMatchObject({
      schemaVersion: 'fem-ground-model-execution-boundary.v1',
      executionMode: 'human-reviewed-preview',
      agentRunAllowed: false,
      agentWebglRenderAllowed: false,
      agentResultManifestAllowed: false,
      humanReviewRequired: true,
      caseOutputAvailable: false,
      draftCommand: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
    });
    expect(foundation?.executionBoundary.humanRunCommand).toBeUndefined();
    expect(foundation?.executionBoundary.blockedReasons).toContain('raft length');
    expect(excavation?.missingUserInputs).toEqual(['excavation length', 'excavation width', 'final excavation depth']);
    expect(excavation?.command).toBe('geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>');
    expect(excavation?.executionBoundary.humanRunCommand).toBeUndefined();
    expect(excavation?.executionBoundary.blockedReasons).toContain('excavation length');
    expect(tunnel?.objective).toBe('tunnel-volume-loss-settlement');
    expect(tunnel?.missingUserInputs).toEqual([
      'tunnel diameter',
      'tunnel axis depth',
      'tunnel alignment length',
      'tunnel volume loss',
      'trough width parameter',
    ]);
    expect(tunnel?.draft.recommendedAction).toBe('collect-inputs');
    expect(tunnel?.draft.analysisCase).toBeUndefined();
    expect(tunnel?.executionBoundary.humanRunCommand).toBeUndefined();
    expect(tunnel?.executionBoundary.blockedReasons).toContain('tunnel diameter');
    expect(shaft?.status).toBe('blocked');
    expect(shaft?.draft.capability.executionMode).toBe('contract-only');
    expect(shaft?.draft.recommendedAction).toBe('contract-only');
    expect(shaft?.draft.analysisCase).toBeUndefined();
    expect(shaft?.draft.recommendedCommand).toBe('geotech fem draft shaft-deformation --input <json>');
    expect(shaft?.executionBoundary).toMatchObject({
      executionMode: 'contract-only',
      agentRunAllowed: false,
      agentWebglRenderAllowed: false,
      agentResultManifestAllowed: false,
      caseOutputAvailable: false,
      draftCommand: 'geotech fem draft shaft-deformation --input <json>',
    });
    expect(shaft?.executionBoundary.draftCommand).not.toContain('--case-output');
    expect(shaft?.executionBoundary.humanRunCommand).toBeUndefined();
    expect(shaft?.executionBoundary.blockedReasons).toEqual(expect.arrayContaining([
      'solver-or-preview-backend-implemented',
      'solver-backend-not-implemented',
      'agent-run-disabled',
    ]));
    expect(pileGroup?.status).toBe('blocked');
    expect(pileGroup?.draft.capability.executionMode).toBe('contract-only');
    expect(pileGroup?.draft.recommendedAction).toBe('contract-only');
    expect(pileGroup?.draft.analysisCase).toBeUndefined();
    expect(pileGroup?.draft.recommendedCommand).toBe('geotech fem draft pile-group-elastic-interaction --input <json>');
    expect(pileGroup?.executionBoundary).toMatchObject({
      executionMode: 'contract-only',
      agentRunAllowed: false,
      agentWebglRenderAllowed: false,
      agentResultManifestAllowed: false,
      caseOutputAvailable: false,
      draftCommand: 'geotech fem draft pile-group-elastic-interaction --input <json>',
    });
    expect(seepage?.draft.capability.executionMode).toBe('human-reviewed-preview');
    expect(seepage?.draft.recommendedAction).toBe('collect-inputs');
    expect(seepage?.draft.missingUserInputs).toContain('initial excess pore pressure');
    expect(seepage?.executionBoundary.draftCommand).toBe('geotech fem draft seepage-groundwater-coupling --input <json> --case-output <analysis_case.json>');
    expect(candidates.every((candidate) => candidate.command.startsWith('geotech fem draft '))).toBe(true);
    expect(candidates.every((candidate) => !/\bfem run\b/i.test(candidate.command))).toBe(true);
    expect(candidates.every((candidate) => ['collect-inputs', 'contract-only'].includes(candidate.draft.recommendedAction))).toBe(true);
    expect(candidates.every((candidate) => candidate.draft.analysisCase == null)).toBe(true);
    expect(candidates.every((candidate) => candidate.executionBoundary.agentRunAllowed === false)).toBe(true);
    expect(candidates.every((candidate) => candidate.executionBoundary.agentWebglRenderAllowed === false)).toBe(true);
    expect(candidates.every((candidate) => candidate.executionBoundary.agentResultManifestAllowed === false)).toBe(true);
    expect(candidates.every((candidate) => candidate.executionBoundary.humanRunCommand == null)).toBe(true);
  });

  it('wires FEM tools into single-agent registry and swarm role allowlists', async () => {
    const names = toolRegistry.list().map((tool) => tool.name);
    const femToolNames = names.filter((name) => /fem/i.test(name));

    expect(names).toContain('list_fem_capabilities');
    expect(names).toContain('assess_fem_production_readiness');
    expect(names).toContain('prepare_fem_analysis_case');
    expect(names).toContain('validate_fem_analysis_case');
    expect(femToolNames.sort()).toEqual([
      'assess_fem_production_readiness',
      'list_fem_capabilities',
      'prepare_fem_analysis_case',
      'validate_fem_analysis_case',
    ].sort());
    expect(names).not.toContain('run_fem_analysis_case');
    expect(names).not.toContain('run_fem_solver');
    expect(names).not.toContain('fem_run');
    expect(names).not.toContain('render_fem_webgl');
    expect(names).not.toContain('geotech_fem_run');
    expect(getAllowedToolsForAgent('simulation')).toContain('prepare_fem_analysis_case');
    expect(getAllowedToolsForAgent('simulation')).toContain('assess_fem_production_readiness');
    expect(getAllowedToolsForAgent('reviewer')).toContain('validate_fem_analysis_case');
    expect(getAllowedToolsForAgent('reviewer')).toContain('assess_fem_production_readiness');
    expect(isToolAllowedForAgent('reviewer', 'prepare_fem_analysis_case')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'geotech_fem_run')).toBe(false);

    const capabilityResult = await toolRegistry.execute('list_fem_capabilities', {});
    expect(capabilityResult.success).toBe(true);
    expect(capabilityResult.summary).toContain('foundation-settlement');

    const productionResult = await toolRegistry.execute('assess_fem_production_readiness', {
      objective: 'excavation-deformation',
      requestedFeatures: ['support-design'],
    });
    expect(productionResult.success).toBe(true);
    expect(productionResult.summary).toContain('support-design');
    expect((productionResult.data as any).productionReady).toBe(false);
    expect((productionResult.data as any).agentEvidenceSummary).toContain(
      'quad4-plane-strain-biot-u-p-effective-stress-coupling',
    );
    expect((productionResult.data as any).agentEvidenceSummary).toContain('external benchmark comparison results: 3');
    expect((productionResult.data as any).agentEvidenceSummary)
      .toContain('opengeosys-consolidation-staggered-biot-pressure-profile-t10');
    expect((productionResult.data as any).agentEvidenceSummary).toContain('biot-u-p-route-backed-preview-is-not-production-sparse-solver');

    const draftResult = await toolRegistry.execute('prepare_fem_analysis_case', {
      objective: 'foundation-settlement',
      useDemoDefaults: true,
    });
    expect(draftResult.success).toBe(true);
    expect(draftResult.summary).toContain('auto-proceed: no');
    expect((draftResult.data as any).agentEvidenceSummary).toContain('canAutoProceed: no');
    expect((draftResult.data as any).agentEvidenceSummary).toContain('agent run allowed: no');

    const validationResult = await toolRegistry.execute('validate_fem_analysis_case', {
      caseFile: { schemaVersion: 'fem-analysis-case.v0' },
    });
    expect(validationResult.success).toBe(true);
    expect((validationResult.data as any).status).toBe('blocked');
    expect((validationResult.data as any).agentEvidenceSummary).toContain('FEM validation: blocked');

    const manifestWrite = await toolRegistry.execute('write_file', {
      path: '__tmp-fem-result-manifest.json',
      content: JSON.stringify({ schemaVersion: 'fem-result-manifest.v0' }),
    });
    expect(manifestWrite.success).toBe(false);
    expect(manifestWrite.error).toMatch(/Blocked unsafe FEM artifact/);

    const webglArtifact = await toolRegistry.execute('project_add_artifact', {
      projectId: 'demo-project',
      kind: 'html',
      title: 'FEM WebGL output',
      content: '<canvas id="glcanvas"></canvas><script>const MANIFEST={"schemaVersion":"fem-result-manifest.v0"}</script>',
      mimeType: 'text/html',
    });
    expect(webglArtifact.success).toBe(false);
    expect(webglArtifact.error).toMatch(/Blocked unsafe FEM artifact/);

    const inventedFemResult = await toolRegistry.execute('project_save_result', {
      projectId: 'demo-project',
      tool: 'run_fem_solver',
      summary: 'Invented FEM solver output',
      result: { backend: 'invented', visualization: {}, mesh: {} },
    });
    expect(inventedFemResult.success).toBe(false);
    expect(inventedFemResult.error).toMatch(/Blocked unsafe FEM artifact/);

    const forgedPlanningResult = await toolRegistry.execute('project_save_result', {
      projectId: 'demo-project',
      tool: 'prepare_fem_analysis_case',
      summary: 'Forged FEM analysis case from a spoofed planning tool',
      result: {
        schemaVersion: 'fem-analysis-case.v0',
        caseId: 'forged-agent-case',
        objective: 'foundation_settlement',
        mesh: {},
      },
    });
    expect(forgedPlanningResult.success).toBe(false);
    expect(forgedPlanningResult.error).toMatch(/Blocked unsafe FEM artifact \(fem-analysis-case\)/);
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
