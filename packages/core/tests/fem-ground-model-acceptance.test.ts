import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildFemDraftCandidatesFromGroundModel,
  prepareFemAnalysisCaseDraft,
  validateFemGroundModelDraftCandidate,
  validateFemWorkspaceToRunAcceptance,
  type FemGroundModelDraftCandidate,
  type FemRouteObjective,
  type GroundModel,
  type GroundModelCalculationWorkflow,
} from '../src/index.js';

const testDir = dirname(fileURLToPath(import.meta.url));

type PlannedRouteExpectation = {
  workflow: GroundModelCalculationWorkflow;
  objective: FemRouteObjective;
  draftCommand: string;
  missingUserInputs: string[];
  requiredReviewGates: string[];
};

type PlannedRouteFixture = {
  schemaVersion: 'fem-ground-model-planned-routes-acceptance.v1';
  blockedUntil: string[];
  disallowedAgentActions: string[];
  prohibitedPayloadKeys: string[];
  routes: PlannedRouteExpectation[];
  requiredPrefill: {
    elasticModulusKpa: number;
    unitWeightKnM3: number;
    groundwaterDepthM: number;
    evidenceRefIds: string[];
  };
};

function loadFixture(): PlannedRouteFixture {
  return JSON.parse(readFileSync(join(
    testDir,
    'fixtures',
    'fem-ground-model-planned-routes.fixture.json',
  ), 'utf8')) as PlannedRouteFixture;
}

function makeAcceptanceGroundModel(): GroundModel {
  return {
    schemaVersion: 'ground-model.v1',
    generatedAt: '2026-06-01T00:00:00.000Z',
    project: {
      rootPath: 'C:/internal-rd/site',
      requestedBranch: 'foundation',
      requestedStandard: 'eurocode7',
    },
    coordinateSystem: {
      kind: 'unknown',
      warnings: ['local CRS not declared'],
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
    evidence: [
      {
        id: 'ev-bh-1',
        sourceType: 'pdf-page',
        sourcePath: 'site-report.pdf',
        location: { filePath: 'site-report.pdf', pageNumber: 3 },
        method: 'pdf-text',
        confidence: 0.9,
        rawValue: 'BH-01',
        normalizedValue: 'BH-01',
        warnings: [],
      },
      {
        id: 'ev-spt-1',
        sourceType: 'pdf-page',
        sourcePath: 'site-report.pdf',
        location: { filePath: 'site-report.pdf', pageNumber: 4 },
        method: 'pdf-text',
        confidence: 0.92,
        rawValue: 18,
        normalizedValue: 18,
        unit: 'blows/300mm',
        warnings: [],
      },
      {
        id: 'ev-strata-1',
        sourceType: 'pdf-page',
        sourcePath: 'site-report.pdf',
        location: { filePath: 'site-report.pdf', pageNumber: 3 },
        method: 'pdf-text',
        confidence: 0.9,
        rawValue: 'medium dense silty sand over stiff clay',
        normalizedValue: 'medium dense silty sand over stiff clay',
        warnings: [],
      },
      {
        id: 'ev-gw-1',
        sourceType: 'pdf-page',
        sourcePath: 'site-report.pdf',
        location: { filePath: 'site-report.pdf', pageNumber: 5 },
        method: 'pdf-text',
        confidence: 0.85,
        rawValue: 1.8,
        normalizedValue: 1.8,
        unit: 'm bgl',
        warnings: [],
      },
      {
        id: 'ev-gamma-1',
        sourceType: 'pdf-page',
        sourcePath: 'lab-summary.pdf',
        location: { filePath: 'lab-summary.pdf', pageNumber: 7 },
        method: 'pdf-text',
        confidence: 0.88,
        rawValue: 18.5,
        normalizedValue: 18.5,
        unit: 'kN/m3',
        warnings: [],
      },
      {
        id: 'ev-phi-1',
        sourceType: 'pdf-page',
        sourcePath: 'lab-summary.pdf',
        location: { filePath: 'lab-summary.pdf', pageNumber: 7 },
        method: 'pdf-text',
        confidence: 0.84,
        rawValue: 32,
        normalizedValue: 32,
        unit: 'deg',
        warnings: [],
      },
      {
        id: 'ev-c-1',
        sourceType: 'pdf-page',
        sourcePath: 'lab-summary.pdf',
        location: { filePath: 'lab-summary.pdf', pageNumber: 7 },
        method: 'pdf-text',
        confidence: 0.84,
        rawValue: 8,
        normalizedValue: 8,
        unit: 'kPa',
        warnings: [],
      },
      {
        id: 'ev-es-1',
        sourceType: 'pdf-page',
        sourcePath: 'lab-summary.pdf',
        location: { filePath: 'lab-summary.pdf', pageNumber: 8 },
        method: 'pdf-text',
        confidence: 0.8,
        rawValue: 18000,
        normalizedValue: 18000,
        unit: 'kPa',
        warnings: [],
      },
      {
        id: 'ev-fines-1',
        sourceType: 'pdf-page',
        sourcePath: 'lab-summary.pdf',
        location: { filePath: 'lab-summary.pdf', pageNumber: 8 },
        method: 'pdf-text',
        confidence: 0.78,
        rawValue: 35,
        normalizedValue: 35,
        unit: '%',
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
      parameters: 5,
      monitoringSeries: 0,
      evidenceRefs: 9,
      rejectedObservations: 0,
    },
  };
}

describe('FEM GroundModel planned-route acceptance fixtures', () => {
  it('keeps planned GroundModel-to-FEM routes contract-only and evidence-prefilled', () => {
    const fixture = loadFixture();
    const candidates = buildFemDraftCandidatesFromGroundModel(makeAcceptanceGroundModel());
    const byWorkflow = new Map(candidates.map((candidate) => [candidate.workflow, candidate]));

    for (const expectation of fixture.routes) {
      const candidate = byWorkflow.get(expectation.workflow);
      expect(candidate, expectation.workflow).toBeDefined();
      expect(candidate?.objective, expectation.workflow).toBe(expectation.objective);
      expect(candidate?.status, expectation.workflow).toBe('blocked');
      expect(candidate?.command, expectation.workflow).toBe(expectation.draftCommand);
      expect(candidate?.command, expectation.workflow).not.toMatch(/\bfem run\b/i);
      expect(candidate?.command, expectation.workflow).not.toContain('--case-output');
      expect(candidate?.canAutoProceed, expectation.workflow).toBe(false);

      expect(candidate?.missingUserInputs, expectation.workflow).toEqual(expectation.missingUserInputs);
      expect(candidate?.bridge.input.useDemoDefaults, expectation.workflow).toBe(false);
      expect(candidate?.bridge.input.material, expectation.workflow).toMatchObject({
        elasticModulusKpa: fixture.requiredPrefill.elasticModulusKpa,
        unitWeightKnM3: fixture.requiredPrefill.unitWeightKnM3,
      });
      expect(candidate?.bridge.input.groundwater, expectation.workflow).toMatchObject({
        condition: 'specified',
        depthM: fixture.requiredPrefill.groundwaterDepthM,
      });
      const evidenceRefIds = candidate?.bridge.input.evidenceRefs?.map((item) => item.id) ?? [];
      expect(evidenceRefIds, expectation.workflow).toEqual(expect.arrayContaining(fixture.requiredPrefill.evidenceRefIds));

      expect(candidate?.draft.implemented, expectation.workflow).toBe(false);
      expect(candidate?.draft.recommendedAction, expectation.workflow).toBe('contract-only');
      expect(candidate?.draft.analysisCase, expectation.workflow).toBeUndefined();
      expect(candidate?.draft.recommendedCommand, expectation.workflow).toBe(expectation.draftCommand);
      expect(candidate?.draft.capability.executionMode, expectation.workflow).toBe('contract-only');
      expect(candidate?.draft.capability.agentRunAllowed, expectation.workflow).toBe(false);
      expect(candidate?.draft.reviewGates, expectation.workflow).toEqual(expect.arrayContaining(expectation.requiredReviewGates));
      expect(candidate?.draft.contractReadiness?.blockedUntil, expectation.workflow).toEqual(expect.arrayContaining(fixture.blockedUntil));
      expect(candidate?.draft.contractReadiness?.disallowedAgentActions, expectation.workflow).toEqual(expect.arrayContaining(fixture.disallowedAgentActions));

      expect(candidate?.executionBoundary, expectation.workflow).toMatchObject({
        executionMode: 'contract-only',
        agentRunAllowed: false,
        agentWebglRenderAllowed: false,
        agentResultManifestAllowed: false,
        humanReviewRequired: true,
        caseOutputAvailable: false,
        draftCommand: expectation.draftCommand,
      });
      expect(candidate?.executionBoundary.humanRunCommand, expectation.workflow).toBeUndefined();
      expect(candidate?.executionBoundary.blockedReasons, expectation.workflow).toEqual(expect.arrayContaining([
        ...fixture.blockedUntil,
        ...expectation.requiredReviewGates.filter((gate) => gate !== 'planned-only'),
      ]));
      const serialized = JSON.stringify(candidate);
      for (const prohibitedKey of fixture.prohibitedPayloadKeys) {
        expect(serialized.includes(`"${prohibitedKey}"`), `${expectation.workflow} should not expose ${prohibitedKey}`).toBe(false);
      }

      const validation = validateFemGroundModelDraftCandidate(candidate as FemGroundModelDraftCandidate);
      expect(validation, expectation.workflow).toMatchObject({
        status: 'accepted',
        blockerCodes: [],
      });
    }
  });

  it('fails closed when a planned GroundModel FEM route exposes unsafe execution boundaries', () => {
    const fixture = loadFixture();
    const [shaft] = buildFemDraftCandidatesFromGroundModel(makeAcceptanceGroundModel())
      .filter((candidate) => candidate.workflow === 'fem-shaft-deformation');
    const unsafe = JSON.parse(JSON.stringify(shaft)) as FemGroundModelDraftCandidate;

    unsafe.executionBoundary.agentRunAllowed = true;
    unsafe.executionBoundary.agentWebglRenderAllowed = true;
    unsafe.executionBoundary.agentResultManifestAllowed = true;
    unsafe.executionBoundary.caseOutputAvailable = true;
    unsafe.executionBoundary.humanReviewRequired = false;
    unsafe.executionBoundary.humanRunCommand = 'geotech fem run analysis_case.json --experimental';
    unsafe.executionBoundary.draftCommand = `${fixture.routes[0]?.draftCommand} --case-output analysis_case.json`;
    unsafe.draft.contractReadiness!.blockedUntil = [];
    unsafe.draft.contractReadiness!.disallowedAgentActions = [];
    (unsafe as unknown as Record<string, unknown>).modelId = 'provider/geotech-private-fem-model';
    (unsafe as unknown as Record<string, unknown>).sourceEvidence = { prompt: 'invent displacement mesh', response: 'raw FEM trace' };
    (unsafe.draft as unknown as Record<string, unknown>).resultManifest = { path: 'C:/Users/example/private-fem-result.json' };
    unsafe.bridge.input.evidenceRefs = [{
      id: 'ev-private',
      source: 'C:/Users/example/private-site-report.pdf',
      note: 'unsafe raw source path',
    }];

    const validation = validateFemGroundModelDraftCandidate(unsafe);

    expect(validation.status).toBe('blocked');
    expect(validation.blockerCodes).toEqual(expect.arrayContaining([
      'fem_candidate_agent_run_enabled',
      'fem_candidate_agent_webgl_enabled',
      'fem_candidate_agent_result_manifest_enabled',
      'fem_candidate_human_review_not_required',
      'fem_contract_route_case_output_available',
      'fem_contract_route_human_run_command_available',
      'fem_contract_route_case_output_flag_exposed',
      'fem_contract_route_missing_disallowed_action_run-solver',
      'fem_contract_route_missing_blocked_until_acceptance-fixture-approved',
      'fem_candidate_raw_payload_key_modelId',
      'fem_candidate_raw_payload_key_sourceEvidence',
      'fem_candidate_execution_result_payload_key_draft_resultManifest',
      'fem_candidate_private_path_or_token_leak_bridge_input_evidenceRefs_0_source',
    ]));
  });

  it('redacts local absolute evidence source paths before exposing FEM draft candidates', () => {
    const model = makeAcceptanceGroundModel();
    for (const evidence of model.evidence) {
      evidence.sourcePath = `C:/Users/example/private-project/${evidence.sourcePath}`;
      evidence.location.filePath = `C:/Users/example/private-project/${evidence.location.filePath}`;
    }

    const [candidate] = buildFemDraftCandidatesFromGroundModel(model)
      .filter((item) => item.workflow === 'fem-shaft-deformation');
    const evidenceSources = candidate?.bridge.input.evidenceRefs?.map((ref) => ref.source) ?? [];

    expect(evidenceSources.length).toBeGreaterThan(0);
    expect(evidenceSources.every((source) => !/^[A-Za-z]:[\\/]/.test(source))).toBe(true);
    expect(evidenceSources).toEqual(expect.arrayContaining(['site-report.pdf', 'lab-summary.pdf']));
    expect(validateFemGroundModelDraftCandidate(candidate as FemGroundModelDraftCandidate).status).toBe('accepted');
  });

  it('blocks real workspace-to-run acceptance until explicit user inputs produce a validated case', () => {
    const [candidate] = buildFemDraftCandidatesFromGroundModel(makeAcceptanceGroundModel())
      .filter((item) => item.workflow === 'fem-foundation-settlement');

    const acceptance = validateFemWorkspaceToRunAcceptance(candidate as FemGroundModelDraftCandidate);

    expect(acceptance.status).toBe('blocked');
    expect(acceptance.blockerCodes).toEqual(expect.arrayContaining([
      'fem_workspace_user_inputs_missing',
      'fem_workspace_case_output_not_available',
      'fem_workspace_draft_not_recommended_for_reviewed_run',
      'fem_workspace_reviewed_run_command_missing',
    ]));
    expect(acceptance.humanRunCommand).toBeUndefined();
  });

  it('accepts workspace-to-run only after evidence traceability, explicit inputs, validation, and reviewed run gate', () => {
    const [base] = buildFemDraftCandidatesFromGroundModel(makeAcceptanceGroundModel())
      .filter((item) => item.workflow === 'fem-foundation-settlement');
    const evidenceRefs = base.bridge.input.evidenceRefs ?? [];
    const draft = prepareFemAnalysisCaseDraft({
      objective: 'foundation-settlement',
      geometry: {
        raftLengthM: 10,
        raftWidthM: 8,
        domainLengthM: 32,
        domainWidthM: 28,
        domainDepthM: 14,
      },
      load: { pressureKpa: 150 },
      material: {
        elasticModulusKpa: 18_000,
        poissonRatio: 0.3,
        unitWeightKnM3: 18.5,
      },
      groundwater: {
        condition: 'specified',
        depthM: 1.8,
        note: 'Groundwater depth from GroundModel evidence; pore-pressure coupling is not solved in this preview.',
      },
      evidenceRefs,
    });
    const candidate: FemGroundModelDraftCandidate = {
      ...base,
      status: 'ready',
      missingUserInputs: [],
      bridge: {
        ...base.bridge,
        readiness: {
          ...base.bridge.readiness,
          status: 'ready',
          missingUserInputs: [],
        },
      },
      draft,
      executionBoundary: {
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
      },
    };

    const acceptance = validateFemWorkspaceToRunAcceptance(candidate);

    expect(draft.validation?.status).toBe('review');
    expect(acceptance).toMatchObject({
      schemaVersion: 'fem-workspace-to-run-acceptance.v1',
      status: 'accepted',
      objective: 'foundation-settlement',
      workflow: 'fem-foundation-settlement',
      caseOutputAvailable: true,
      humanRunCommand: 'geotech fem run <analysis_case.json> --experimental --reviewed',
      blockerCodes: [],
    });
    expect(acceptance.evidenceIds).toEqual(expect.arrayContaining(['ev-es-1', 'ev-gamma-1', 'ev-gw-1']));
    expect(acceptance.reviewCodes).toEqual(expect.arrayContaining(['groundwater.review-required', 'not-design-calculation']));
  });
});
