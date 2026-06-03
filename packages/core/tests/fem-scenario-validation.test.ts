import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  prepareFemAnalysisCaseDraft,
  runBuiltinElasticExcavationDemo,
  runBuiltinElasticRaftDemo,
  runBuiltinTunnelVolumeLossDemo,
  validateFemScenarioResult,
  validateFemScenarioSuite,
  type FemAnalysisCase,
  type FemResultManifest,
  type FemRouteObjective,
  type FemScenarioExpectation,
  type FemScenarioRun,
  type FemScenarioTrendExpectation,
  type PrepareFemAnalysisCaseDraftInput,
} from '../src/fem/index.js';

const testDir = dirname(fileURLToPath(import.meta.url));

type FemScenarioFixture = {
  schemaVersion: 'fem-scenario-contract.v1';
  scenarios: Array<{
    id: string;
    input: PrepareFemAnalysisCaseDraftInput & { objective: FemRouteObjective };
    expectation: FemScenarioExpectation;
  }>;
  trends: FemScenarioTrendExpectation[];
};

function loadFixture(): FemScenarioFixture {
  return JSON.parse(readFileSync(join(
    testDir,
    'fixtures',
    'fem-scenario-contract.fixture.json',
  ), 'utf8')) as FemScenarioFixture;
}

function runCase(analysisCase: FemAnalysisCase): FemResultManifest {
  switch (analysisCase.objective) {
    case 'foundation_settlement':
      return runBuiltinElasticRaftDemo(analysisCase);
    case 'excavation_deformation':
      return runBuiltinElasticExcavationDemo(analysisCase);
    case 'tunnel_volume_loss_settlement':
      return runBuiltinTunnelVolumeLossDemo(analysisCase);
    default:
      throw new Error(`Unsupported FEM objective in scenario fixture: ${String(analysisCase.objective)}`);
  }
}

describe('FEM scenario validation contracts', () => {
  it('accepts mock engineering scenarios across raft, excavation, and tunnel preview routes', () => {
    const fixture = loadFixture();
    const runs: FemScenarioRun[] = [];

    for (const scenario of fixture.scenarios) {
      const draft = prepareFemAnalysisCaseDraft(scenario.input);
      expect(draft.analysisCase, scenario.id).toBeDefined();
      expect(draft.canAutoProceed, scenario.id).toBe(false);
      expect(draft.recommendedAction, scenario.id).toBe('run-reviewed-case');
      expect(draft.validation?.status, scenario.id).toBe('review');

      const manifest = runCase(draft.analysisCase!);
      const validation = validateFemScenarioResult(manifest, scenario.expectation);

      expect(validation, scenario.id).toMatchObject({
        schemaVersion: 'fem-scenario-validation.v1',
        scenarioId: scenario.id,
        status: 'accepted',
        blockerCodes: [],
      });
      runs.push({
        scenarioId: scenario.id,
        manifest,
        expectation: scenario.expectation,
      });
    }

    const suiteValidation = validateFemScenarioSuite(runs, fixture.trends);

    expect(suiteValidation).toMatchObject({
      schemaVersion: 'fem-scenario-suite-validation.v1',
      status: 'accepted',
      scenarioCount: fixture.scenarios.length,
      blockerCodes: [],
    });
    expect(suiteValidation.scenarios).toHaveLength(fixture.scenarios.length);
  });

  it('fails closed when a result falls outside the scenario envelope or trend contract', () => {
    const fixture = loadFixture();
    const [stiffScenario, softScenario] = fixture.scenarios;
    const stiffDraft = prepareFemAnalysisCaseDraft(stiffScenario.input);
    const softDraft = prepareFemAnalysisCaseDraft(softScenario.input);
    const stiffManifest = runCase(stiffDraft.analysisCase!);
    const softManifest = runCase(softDraft.analysisCase!);

    const staleManifest: FemResultManifest = {
      ...stiffManifest,
      envelope: {
        ...stiffManifest.envelope,
        maxSettlementMm: 3,
      },
    };

    expect(validateFemScenarioResult(staleManifest, stiffScenario.expectation).blockerCodes)
      .toContain('raft-stiff-service-load.maxSettlementMm.below-min');

    const staleTrend = validateFemScenarioSuite([
      {
        scenarioId: stiffScenario.id,
        manifest: softManifest,
        expectation: stiffScenario.expectation,
      },
      {
        scenarioId: softScenario.id,
        manifest: stiffManifest,
        expectation: softScenario.expectation,
      },
    ], [{
      id: 'stale-softness-trend',
      fromScenarioId: stiffScenario.id,
      toScenarioId: softScenario.id,
      metric: 'maxSettlementMm',
      relation: 'increase',
      minRatio: 2,
    }]);

    expect(staleTrend.status).toBe('blocked');
    expect(staleTrend.blockerCodes).toContain('stale-softness-trend.not-increased');
  });
});
