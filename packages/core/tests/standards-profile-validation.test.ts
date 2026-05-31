import { describe, expect, it } from 'vitest';

import {
  getStandardProfile,
  listStandardProfiles,
  validateStandardProfileReadiness,
} from '../src/index.js';

describe('standards profile validation', () => {
  it('exposes deterministic readiness metadata for all supported profiles', () => {
    const profiles = listStandardProfiles();

    expect(profiles.map((profile) => profile.id).sort()).toEqual(['aashto', 'astm', 'bs', 'eurocode7', 'is']);

    for (const profile of profiles) {
      expect(profile.sourceReferences.length).toBeGreaterThan(0);
      expect(profile.requiredAssumptions.length).toBeGreaterThan(0);
      expect(profile.safetyFactorContext.length).toBeGreaterThan(0);
      expect(profile.requiredAssumptions.every((assumption) => assumption.code.length > 0)).toBe(true);
      expect(profile.safetyFactorContext.every((context) => context.sourceReferences.length > 0)).toBe(true);
    }

    expect(getStandardProfile('ec7')?.requiredAssumptions.map((assumption) => assumption.code)).toContain(
      'ec7_design_approach_required',
    );
  });

  it('blocks Eurocode 7 design readiness until required assumptions are declared', () => {
    const validation = validateStandardProfileReadiness({
      requestedProfile: 'eurocode7',
      evidence: {
        hasBoreholes: true,
        hasStrata: true,
        hasDepthCoverage: true,
        hasSpt: true,
        hasGroundwater: true,
        hasUnitWeight: true,
        hasStrength: true,
        hasCompressibility: true,
        hasFinesOrGradation: true,
        hasCoordinates: true,
      },
      workflows: [
        {
          workflow: 'bearing-capacity',
          status: 'ready',
          evidenceIds: ['ev-bearing'],
        },
        {
          workflow: 'slope-stability',
          status: 'ready',
          evidenceIds: ['ev-slope'],
        },
      ],
    });

    expect(validation.profile?.id).toBe('eurocode7');
    expect(validation.status).toBe('blocked');
    expect(validation.blockerCodes).toEqual(
      expect.arrayContaining(['ec7_design_approach_required', 'ec7_characteristic_values_required']),
    );
    expect(validation.requiredAssumptions.some((assumption) => !assumption.declared)).toBe(true);
    expect(validation.safetyFactorContext.map((context) => context.workflow)).toEqual(
      expect.arrayContaining(['bearing-capacity', 'slope-stability']),
    );
    expect(validation.sourceReferences).toEqual(expect.arrayContaining(['EC7-2.4.7', 'EC7-6.5', 'EC7-11']));
  });

  it('keeps ASTM profile as testing provenance until a companion design standard is declared', () => {
    const validation = validateStandardProfileReadiness({
      requestedProfile: 'astm',
      declaredAssumptionCodes: ['astm_test_method_traceability_required'],
      evidence: {
        hasBoreholes: true,
        hasStrata: true,
        hasDepthCoverage: true,
        hasSpt: true,
        hasGroundwater: true,
        hasUnitWeight: true,
        hasStrength: true,
        hasCompressibility: true,
        hasFinesOrGradation: true,
        hasCoordinates: true,
      },
      workflows: [
        {
          workflow: 'bearing-capacity',
          status: 'ready',
          evidenceIds: ['ev-bearing'],
        },
      ],
    });

    expect(validation.status).toBe('blocked');
    expect(validation.blockerCodes).toContain('astm_companion_design_standard_required');
    expect(validation.blockerCodes).not.toContain('astm_test_method_traceability_required');
    expect(validation.sourceReferences).toEqual(expect.arrayContaining(['ASTM-D2487', 'ASTM-D1586']));
  });

  it('surfaces evidence and workflow blockers with stable blocker codes', () => {
    const validation = validateStandardProfileReadiness({
      requestedProfile: 'aashto',
      declaredAssumptionCodes: ['aashto_limit_state_required', 'aashto_resistance_factor_required'],
      evidence: {
        hasGroundwater: false,
        hasUnitWeight: false,
        hasStrength: true,
        hasSpt: false,
        hasFinesOrGradation: false,
        hasCoordinates: false,
      },
      workflows: [
        {
          workflow: 'liquefaction',
          status: 'blocked',
          missing: ['SPT N-values by depth'],
          evidenceIds: ['ev-liq'],
        },
      ],
    });

    expect(validation.status).toBe('blocked');
    expect(validation.blockerCodes).toEqual(
      expect.arrayContaining([
        'standard_groundwater_review_required',
        'standard_spt_required_for_liquefaction',
        'standard_fines_correction_review_required',
        'workflow_blocked_liquefaction',
      ]),
    );
    expect(validation.blockers.find((blocker) => blocker.code === 'workflow_blocked_liquefaction')?.evidenceIds).toEqual([
      'ev-liq',
    ]);
  });
});
