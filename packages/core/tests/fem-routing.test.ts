import { describe, expect, it } from 'vitest';

import {
  listFemCapabilities,
  prepareFemAnalysisCaseDraft,
} from '../src/fem/index.js';
import { buildProviderOperatingPrompt } from '../src/agents/provider-operating-contract.js';
import { getAllowedToolsForAgent, isToolAllowedForAgent } from '../src/agents/swarm.js';
import { toolRegistry } from '../src/agents/tools.js';

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

  it('keeps non-implemented FEM objectives as contract-only routes', () => {
    const draft = prepareFemAnalysisCaseDraft({ objective: 'shaft-deformation' });

    expect(draft.implemented).toBe(false);
    expect(draft.recommendedAction).toBe('contract-only');
    expect(draft.analysisCase).toBeUndefined();
    expect(draft.missingUserInputs).toContain('shaft diameter/shape');
    expect(draft.reviewGates).toContain('planned-only');
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
