import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addAgentSession, addAssumption, createProject, loadProject } from '../src/storage/index.js';
import {
  buildSwarmSessionProjectRecord,
  ensureScenarioCaseFile,
  listScenarioArtifacts,
  loadLatestScenarioArtifact,
  loadLatestScenarioArtifacts,
  loadScenarioCaseFile,
  persistSwarmCaseFile,
  persistScenarioArtifact,
} from '../src/agents/case-file.js';

describe('case-file storage layer', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-case-file-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.GEOTECHCLI_CONFIG_DIR;
    } else {
      process.env.GEOTECHCLI_CONFIG_DIR = previousConfigDir;
    }

    rmSync(configDir, { recursive: true, force: true });
  });

  it('ensures case files and tracks latest scenario artifacts', () => {
    const project = createProject('Tokyo Basement');
    const scenarioId = 'baseline';

    const caseFile = ensureScenarioCaseFile(project.meta.id, scenarioId, 'Baseline scenario');
    expect(caseFile.scenarioId).toBe(scenarioId);
    expect(caseFile.title).toBe('Baseline scenario');

    const firstGroundModel = persistScenarioArtifact({
      projectId: project.meta.id,
      scenarioId,
      artifactType: 'ground-model',
      payload: {
        summary: 'Soft clay under sand.',
        units: 'SI',
        strata: [
          {
            id: 's1',
            fromM: 0,
            toM: 8,
            material: 'Soft clay',
            description: 'High plasticity clay',
            evidenceRefs: [],
            warnings: [],
          },
        ],
        groundwater: { detected: true, depthM: 1.5 },
        derivedParameters: {},
        missingInputs: [],
        blockedInputs: [],
      },
      source: { agent: 'interpretation', toolName: 'parse_ags' },
    });

    const secondGroundModel = persistScenarioArtifact({
      projectId: project.meta.id,
      scenarioId,
      artifactType: 'ground-model',
      payload: {
        summary: 'Soft clay, denser at depth.',
        units: 'SI',
        strata: [
          {
            id: 's1',
            fromM: 0,
            toM: 8,
            material: 'Soft clay',
            evidenceRefs: [],
            warnings: [],
          },
        ],
        groundwater: { detected: true, depthM: 1.2 },
        derivedParameters: {},
        missingInputs: ['oedometer compression index'],
        blockedInputs: [],
      },
      source: { agent: 'interpretation', toolName: 'parse_cpt' },
    });

    const acceptanceStatus = persistScenarioArtifact({
      projectId: project.meta.id,
      scenarioId,
      artifactType: 'acceptance-status',
      payload: {
        summary: 'Preliminary design is acceptable.',
        verdict: 'APPROVED',
        confidence: 84,
        reasons: ['Serviceability margin is acceptable for concept-stage review.'],
      },
      source: { agent: 'reviewer' },
    });

    const loadedCaseFile = loadScenarioCaseFile(project.meta.id, scenarioId);
    expect(loadedCaseFile?.latestVersions['ground-model']).toBe(2);
    expect(loadedCaseFile?.artifactRefs['ground-model']).toBe(
      `scenario-artifact:${scenarioId}:ground-model:v2`,
    );
    expect(loadedCaseFile?.acceptanceStatusRef).toBe(
      `scenario-artifact:${scenarioId}:acceptance-status:v1`,
    );

    expect(listScenarioArtifacts(project.meta.id, scenarioId, 'ground-model')).toHaveLength(2);
    expect(loadLatestScenarioArtifact(project.meta.id, scenarioId, 'ground-model')?.version).toBe(2);
    expect(loadLatestScenarioArtifact(project.meta.id, scenarioId, 'ground-model')?.artifactId).toBe(
      secondGroundModel.artifactId,
    );

    const latestAll = loadLatestScenarioArtifacts(project.meta.id, scenarioId);
    expect(latestAll['ground-model']?.artifactId).toBe(secondGroundModel.artifactId);
    expect(latestAll['acceptance-status']?.artifactId).toBe(acceptanceStatus.artifactId);

    const allArtifacts = listScenarioArtifacts(project.meta.id, scenarioId);
    expect(allArtifacts.length).toBe(3);
    expect(allArtifacts.some((artifact) => artifact.artifactId === firstGroundModel.artifactId)).toBe(true);
  });

  it('builds a swarm-session persistence record compatible with project storage', () => {
    const project = createProject('Shaft Review');
    const record = buildSwarmSessionProjectRecord(
      'Assess a 15 m cut for slope stability.',
      {
        steps: [
          {
            agent: 'interpretation',
            type: 'handoff',
            content: 'Structured soil profile ready.',
            timestamp: 1,
          },
          {
            agent: 'simulation',
            type: 'tool_call',
            content: 'calculate_slope_stability',
            timestamp: 2,
            toolName: 'calculate_slope_stability',
          },
        ],
        context: { scenarioId: 'baseline' },
        totalTokens: 1234,
        totalLatencyMs: 4567,
        reviewPassed: true,
        corrections: ['Recheck groundwater depth before final issue.'],
      },
      {
        summary: 'Swarm session completed',
        answer: 'Use a staged cut with drainage control.',
        metadata: { scenarioId: 'baseline' },
      },
    );

    addAgentSession(project.meta.id, record);

    const loaded = loadProject(project.meta.id);
    expect(loaded.agentSessions).toHaveLength(1);
    expect(loaded.agentSessions[0].mode).toBe('swarm');
    expect(loaded.agentSessions[0].stepCount).toBe(2);

    const swarmContext = loaded.agentSessions[0].context as {
      swarmSession?: {
        stepCount?: number;
        reviewPassed?: boolean;
        corrections?: string[];
      };
    };

    expect(swarmContext.swarmSession?.stepCount).toBe(2);
    expect(swarmContext.swarmSession?.reviewPassed).toBe(true);
    expect(swarmContext.swarmSession?.corrections).toEqual([
      'Recheck groundwater depth before final issue.',
    ]);
    expect(loaded.agentSessions[0].metadata?.reviewPassed).toBe(true);
  });

  it('persists a swarm session into the additive case-file layer', () => {
    const project = createProject('Cut Slope Review');
    addAssumption(project.meta.id, {
      text: 'Adopt preliminary groundwater depth of 2.5 m.',
      source: 'Desk study',
    });

    const result = persistSwarmCaseFile(
      project.meta.id,
      'Assess a 15 m cut for slope stability.',
      {
        steps: [
          {
            agent: 'simulation',
            type: 'tool_call',
            content: 'calculate_slope_stability',
            timestamp: 1,
            toolName: 'calculate_slope_stability',
            toolArgs: { height: 15, slopeAngle: 45 },
          },
          {
            agent: 'reviewer',
            type: 'review',
            content: 'APPROVED (confidence: 82%). Notes: Monitor groundwater.',
            timestamp: 2,
          },
          {
            agent: 'orchestrator',
            type: 'answer',
            content: '# Recommendation\nUse staged excavation with drainage control.',
            timestamp: 3,
          },
        ],
        context: {
          interpretation: { waterTableDepth: 2.5, uscs: 'CL' },
          simulation: {
            calculate_slope_stability: {
              factorOfSafety: 1.48,
              criticalSlipSurface: 'circular',
            },
          },
        },
        totalTokens: 800,
        totalLatencyMs: 1200,
        reviewPassed: true,
        corrections: [],
      },
    );

    expect(result.scenarioId).toBe('assess-a-15-m-cut-for-slope-stability');

    const caseFile = loadScenarioCaseFile(project.meta.id, result.scenarioId);
    expect(caseFile?.artifactRefs['ground-model']).toBeDefined();
    expect(caseFile?.artifactRefs.assumptions).toBeDefined();
    expect(caseFile?.artifactRefs['analysis-plan']).toBeDefined();
    expect(caseFile?.artifactRefs.results).toBeDefined();
    expect(caseFile?.artifactRefs['review-checklist']).toBeDefined();
    expect(caseFile?.artifactRefs['acceptance-status']).toBeDefined();
    expect(caseFile?.artifactRefs['final-report']).toBeDefined();

    expect(loadLatestScenarioArtifact(project.meta.id, result.scenarioId, 'results')?.payload.summary)
      .toContain('simulation result');
    expect(loadLatestScenarioArtifact(project.meta.id, result.scenarioId, 'acceptance-status')?.payload.verdict)
      .toBe('APPROVED');
    expect(loadLatestScenarioArtifact(project.meta.id, result.scenarioId, 'final-report')?.payload.markdown)
      .toContain('Use staged excavation');
  });
});
