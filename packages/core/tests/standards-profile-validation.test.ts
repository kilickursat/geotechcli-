import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getStandardProfile,
  listStandardProfiles,
  validateStandardProfileValidationContract,
  validateStandardProfileReadiness,
  type StandardProfileEvidenceChecklist,
  type StandardProfileId,
  type StandardProfileValidationWorkflowInput,
} from '../src/index.js';

const testDir = dirname(fileURLToPath(import.meta.url));

interface StandardsReadinessAcceptanceFixture {
  schemaVersion: string;
  supportedProfiles: StandardProfileId[];
  workflows: string[];
  evidence: StandardProfileEvidenceChecklist;
  profiles: Array<{
    id: StandardProfileId;
    designFormat: string;
    expectedStatus: string;
    minimumSafetyFactorContexts: number;
    expectedBlockerCodes: string[];
    expectedSourceReferences: string[];
  }>;
  prohibitedExecutionKeys: string[];
  prohibitedPayloadKeys: string[];
}

function loadStandardsFixture(): StandardsReadinessAcceptanceFixture {
  return JSON.parse(readFileSync(join(
    testDir,
    'fixtures',
    'standards-profile-readiness.fixture.json',
  ), 'utf8')) as StandardsReadinessAcceptanceFixture;
}

function readyWorkflow(workflow: string): StandardProfileValidationWorkflowInput {
  return {
    workflow,
    status: 'ready',
    evidenceIds: [`ev-${workflow}`],
  };
}

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

  it('keeps all supported standards profiles fixture-backed, source-referenced, and readiness-only', () => {
    const fixture = loadStandardsFixture();

    expect(fixture.schemaVersion).toBe('standard-profile-readiness-acceptance.v1');
    expect(fixture.supportedProfiles.sort()).toEqual(['aashto', 'astm', 'bs', 'eurocode7', 'is']);
    expect(listStandardProfiles().map((profile) => profile.id).sort()).toEqual(fixture.supportedProfiles.sort());

    for (const profileFixture of fixture.profiles) {
      const validation = validateStandardProfileReadiness({
        requestedProfile: profileFixture.id,
        evidence: fixture.evidence,
        workflows: fixture.workflows.map(readyWorkflow),
      });
      const contract = validateStandardProfileValidationContract(validation);

      expect(contract.failures, profileFixture.id).toEqual([]);
      expect(contract.ok, profileFixture.id).toBe(true);
      expect(validation.profile?.id, profileFixture.id).toBe(profileFixture.id);
      expect(validation.profile?.designFormat, profileFixture.id).toBe(profileFixture.designFormat);
      expect(validation.status, profileFixture.id).toBe(profileFixture.expectedStatus);
      expect(validation.safetyFactorContext.length, profileFixture.id).toBeGreaterThanOrEqual(
        profileFixture.minimumSafetyFactorContexts,
      );
      expect(validation.blockerCodes, profileFixture.id).toEqual(
        expect.arrayContaining(profileFixture.expectedBlockerCodes),
      );
      expect(validation.sourceReferences, profileFixture.id).toEqual(
        expect.arrayContaining(profileFixture.expectedSourceReferences),
      );
      expect(validation.blockerCodes.every((code) => /^[a-z][a-z0-9_]*$/.test(code)), profileFixture.id).toBe(true);
      expect(validation.requiredAssumptions.every((assumption) => typeof assumption.declared === 'boolean'), profileFixture.id).toBe(true);

      const serialized = JSON.stringify(validation);
      for (const prohibitedKey of fixture.prohibitedExecutionKeys) {
        expect(serialized.includes(`"${prohibitedKey}"`), `${profileFixture.id} should not expose ${prohibitedKey}`).toBe(false);
      }
      for (const prohibitedKey of fixture.prohibitedPayloadKeys) {
        expect(serialized.includes(`"${prohibitedKey}"`), `${profileFixture.id} should not expose ${prohibitedKey}`).toBe(false);
      }
    }
  });

  it('fails closed when standards validation starts carrying execution or private-output metadata', () => {
    const validation = validateStandardProfileReadiness({
      requestedProfile: 'eurocode7',
      evidence: loadStandardsFixture().evidence,
      workflows: ['bearing-capacity', 'settlement'].map(readyWorkflow),
    });
    const unsafe = structuredClone(validation) as Record<string, unknown>;
    unsafe.runCommand = 'geotech fem run --case-output C:/Users/example/private-case.json';
    unsafe.modelId = 'provider/geotech-private-model';
    unsafe.sourceEvidence = { prompt: 'classify the profile', response: 'raw readiness trace' };

    const contract = validateStandardProfileValidationContract(unsafe);

    expect(contract.ok).toBe(false);
    expect(contract.failures).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/prohibited execution key.*runCommand/),
        expect.stringMatching(/raw prompt, response, model, or source-evidence payload key/i),
        expect.stringMatching(/private paths or tokens/),
      ]),
    );
  });
});
