import { describe, expect, it } from 'vitest';

import { normalizeToolArgs } from '../src/agents/tool-normalization.js';

describe('tool normalization', () => {
  it('maps mixed-face language to the supported TBM ground enum', () => {
    expect(
      normalizeToolArgs('select_tbm_type', {
        diameter: 6.5,
        groundType: 'mixed face',
        waterPressure: 3,
      }),
    ).toMatchObject({
      groundType: 'mixed',
    });
  });

  it('normalizes at-rest lateral pressure wording', () => {
    expect(
      normalizeToolArgs('calculate_lateral_earth_pressure', {
        wallHeight: 8,
        soilLayers: [],
        pressureState: 'at rest',
      }),
    ).toMatchObject({
      pressureState: 'at_rest',
    });
  });

  it('normalizes bearing shape aliases without touching unrelated tools', () => {
    expect(
      normalizeToolArgs('calculate_bearing_capacity', {
        depth: 2,
        frictionAngle: 30,
        shape: 'rectangular footing',
      }),
    ).toMatchObject({
      shape: 'rectangular',
    });

    expect(
      normalizeToolArgs('predict_tbm_performance', {
        diameter: 6.5,
        ucs: 60,
        rqd: 70,
      }),
    ).toMatchObject({
      diameter: 6.5,
      ucs: 60,
      rqd: 70,
    });
  });

  it('normalizes FEM production-readiness model aliases', () => {
    expect(
      normalizeToolArgs('assess_fem_production_readiness', {
        requestType: 'production-grade',
        femObjectiveHint: 'excavation-deformation',
        capabilities: [
          'nonlinear_plasticity',
          'consolidation',
          'seepage',
          'pore_pressure_coupling',
          'support_design',
        ],
      }),
    ).toMatchObject({
      objective: 'excavation-deformation',
      requestedFeatures: [
        'nonlinear_plasticity',
        'consolidation',
        'seepage',
        'pore_pressure_coupling',
        'support_design',
      ],
    });
  });

  it('normalizes route-backed Drucker-Prager FEM draft aliases and material strength inputs', () => {
    expect(
      normalizeToolArgs('prepare_fem_analysis_case', {
        objective: 'Drucker Prager excavation',
        excavationLength: 22,
        excavationWidth: 14,
        excavationDepth: 9,
        frictionAngle: 32,
        cohesion: 10,
        hardeningModulus: 5000,
      }),
    ).toMatchObject({
      objective: 'excavation-plane-strain-dp-adaptive',
      material: {
        frictionAngleDeg: 32,
        cohesionKpa: 10,
        hardeningModulusKpa: 5000,
      },
    });
  });

  it('normalizes hosted-model-shaped Biot pressure-replay FEM draft inputs', () => {
    expect(
      normalizeToolArgs('prepare_fem_analysis_case', {
        objective: 'hydro mechanical pressure replay',
        excavation_length_m: 22,
        excavation_width_m: 14,
        final_depth_m: 9,
        stage_depths: [3, 6, 9],
        support_levels: [0, 2, 5],
        phi: 32,
        cohesion_kpa: 10,
        hardening_modulus_kpa: 5000,
        initial_excess_pore_pressure_kpa: 100,
        time_steps: [1, 2, 4, 8],
        drained_top_pressure_kpa: 0,
        kx: 1e-6,
        ky: 8e-7,
        specific_storage: 1e-4,
        biot_alpha: 0.8,
      }),
    ).toMatchObject({
      objective: 'excavation-plane-strain-dp-biot-replay',
      geometry: {
        excavationLengthM: 22,
        excavationWidthM: 14,
        excavationFinalDepthM: 9,
      },
      excavation: {
        stageDepthsM: [3, 6, 9],
        supportLevelsM: [0, 2, 5],
      },
      biot: {
        initialPorePressureKpa: 100,
        timeStepsSeconds: [1, 2, 4, 8],
        topPorePressureKpa: 0,
      },
      material: {
        frictionAngleDeg: 32,
        cohesionKpa: 10,
        hardeningModulusKpa: 5000,
        hydraulicConductivityXMPerS: 1e-6,
        hydraulicConductivityYMPerS: 8e-7,
        specificStorage1PerM: 1e-4,
        biotCoefficient: 0.8,
      },
    });
  });
});
