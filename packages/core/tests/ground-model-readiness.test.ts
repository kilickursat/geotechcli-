import { describe, expect, it } from 'vitest';

import { verifyGroundModel, type GroundModel } from '../src/index.js';

function makeGroundModel(overrides: Partial<GroundModel> = {}): GroundModel {
  const model: GroundModel = {
    schemaVersion: 'ground-model.v1',
    generatedAt: '2026-05-04T00:00:00.000Z',
    project: {
      rootPath: 'C:/site',
      requestedBranch: 'foundation',
      requestedStandard: 'eurocode7',
    },
    coordinateSystem: {
      kind: 'unknown',
      warnings: [],
    },
    boreholes: [
      {
        id: 'BH-01',
        sptTests: [
          {
            depth: 2,
            nValue: 18,
            unit: 'blows/300mm',
            evidenceIds: ['ev-spt-1'],
            confidence: 0.92,
            warnings: [],
          },
        ],
        strata: [],
        groundwater: [],
        evidenceIds: ['ev-bh-1'],
        confidence: 0.9,
        warnings: [],
      },
    ],
    strata: [
      {
        boreholeId: 'BH-01',
        topDepth: 0,
        bottomDepth: 8,
        description: 'medium dense silty sand over stiff clay',
        evidenceIds: ['ev-strata-1'],
        confidence: 0.9,
        warnings: [],
      },
    ],
    groundwater: [
      {
        boreholeId: 'BH-01',
        depth: 1.8,
        evidenceIds: ['ev-gw-1'],
        confidence: 0.85,
        warnings: [],
      },
    ],
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
        name: 'frictionAngle',
        value: 32,
        unit: 'deg',
        boreholeId: 'BH-01',
        evidenceIds: ['ev-phi-1'],
        confidence: 0.84,
        warnings: [],
      },
      {
        name: 'cohesion',
        value: 8,
        unit: 'kPa',
        boreholeId: 'BH-01',
        evidenceIds: ['ev-c-1'],
        confidence: 0.84,
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
      {
        name: 'percentPassing',
        value: 35,
        unit: '%',
        boreholeId: 'BH-01',
        evidenceIds: ['ev-fines-1'],
        confidence: 0.78,
        warnings: [],
      },
    ],
    monitoringSeries: [],
    evidence: [],
    rejectedObservations: [],
    warnings: [],
    stats: {
      boreholes: 1,
      sptTests: 1,
      strata: 1,
      groundwaterObservations: 1,
      labTests: 0,
      parameters: 5,
      monitoringSeries: 0,
      evidenceRefs: 8,
      rejectedObservations: 0,
    },
  };

  return {
    ...model,
    ...overrides,
  };
}

describe('GroundModel calculation readiness', () => {
  it('routes evidence-complete ground models into deterministic calculation workflows', () => {
    const verification = verifyGroundModel(makeGroundModel());
    const workflows = Object.fromEntries(
      verification.calculationReadiness.workflows.map((workflow) => [workflow.workflow, workflow]),
    );

    expect(verification.calculationReadiness.summary.ready).toBe(5);
    expect(workflows['bearing-capacity']?.status).toBe('ready');
    expect(workflows['bearing-capacity']?.toolName).toBe('calculate_bearing_capacity');
    expect(workflows['settlement']?.toolName).toBe('calculate_schmertmann_settlement');
    expect(workflows['pile-capacity']?.status).toBe('ready');
    expect(workflows['liquefaction']?.present).toContain('SPT N-values');
    expect(workflows['slope-stability']?.evidenceIds).toContain('ev-phi-1');
    expect(workflows['bearing-capacity']?.standardProfile).toBe('eurocode7');
    expect(workflows['bearing-capacity']?.inputDraft).toBeUndefined();
  });

  it('adds opt-in non-executing calculation input drafts with missing user inputs', () => {
    const verification = verifyGroundModel(makeGroundModel(), { includeCalculationInputDrafts: true });
    const workflows = Object.fromEntries(
      verification.calculationReadiness.workflows.map((workflow) => [workflow.workflow, workflow]),
    );

    expect(verification.calculationReadiness.workflows.every((workflow) => workflow.inputDraft)).toBe(true);
    expect(workflows['bearing-capacity']?.inputDraft?.missingUserInputs).toEqual(['foundation width', 'embedment depth']);
    expect(workflows['settlement']?.inputDraft?.missingUserInputs).toEqual(['applied stress', 'foundation width']);
    expect(workflows['pile-capacity']?.inputDraft?.missingUserInputs).toEqual(['pile diameter', 'pile length']);
    expect(workflows['liquefaction']?.inputDraft?.missingUserInputs).toEqual(['PGA', 'earthquake magnitude']);
    expect(workflows['slope-stability']?.inputDraft?.missingUserInputs).toEqual(['slope height', 'slope angle']);
    expect(workflows['bearing-capacity']?.inputDraft?.readyToRun).toBe(false);
    expect(workflows['bearing-capacity']?.inputDraft?.input).toMatchObject({
      unitWeight: 18.5,
      cohesion: 8,
      frictionAngle: 32,
      method: 'meyerhof',
    });
  });

  it('blocks calculations that lack core evidence and separates review assumptions', () => {
    const verification = verifyGroundModel(makeGroundModel({
      boreholes: [],
      strata: [],
      groundwater: [],
      parameters: [],
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
    }));
    const workflows = Object.fromEntries(
      verification.calculationReadiness.workflows.map((workflow) => [workflow.workflow, workflow]),
    );

    expect(verification.calculationReadiness.summary.blocked).toBe(5);
    expect(workflows['bearing-capacity']?.missing).toContain('stratigraphy / bearing stratum');
    expect(workflows['liquefaction']?.missing).toContain('SPT N-values by depth');
    expect(workflows['settlement']?.recommendation).toMatch(/compressibility/i);
  });
});
