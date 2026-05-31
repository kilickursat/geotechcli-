import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/llm/router.js', () => ({
  generateChat: vi.fn(),
  generateText: vi.fn(),
}));

import { generateChat, generateText } from '../src/llm/router.js';
import { toolRegistry } from '../src/agents/tools.js';
import { getAllowedToolsForAgent, isToolAllowedForAgent, runSwarm } from '../src/agents/swarm.js';
import { prepareFemAnalysisCaseDraft } from '../src/fem/index.js';

const mockedGenerateChat = vi.mocked(generateChat);
const mockedGenerateText = vi.mocked(generateText);

function response(text: string) {
  return {
    text,
    usage: { totalTokens: 1 },
    latencyMs: 1,
  } as any;
}

describe('Swarm tool policy', () => {
  beforeEach(() => {
    mockedGenerateChat.mockReset();
    mockedGenerateText.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps each agent inside its allowlist', () => {
    expect(isToolAllowedForAgent('reviewer', 'query_standards')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'list_persisted_ingest_reviews')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'load_persisted_ingest_review')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'list_persisted_ingest_review_approvals')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'load_persisted_ingest_review_approval')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'approve_persisted_ingest_review')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'promote_persisted_ingest_review')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'calculate_bearing_capacity')).toBe(false);
    expect(isToolAllowedForAgent('reviewer', 'prepare_fem_analysis_case')).toBe(false);
    expect(isToolAllowedForAgent('reviewer', 'validate_fem_analysis_case')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'run_skill')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'calculate_bearing_capacity')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'ingest_geotech_document')).toBe(true);
    expect(isToolAllowedForAgent('interpretation', 'analyze_signal_file')).toBe(true);
    expect(isToolAllowedForAgent('interpretation', 'list_persisted_ingest_reviews')).toBe(true);
    expect(isToolAllowedForAgent('interpretation', 'load_persisted_ingest_review')).toBe(true);
    expect(isToolAllowedForAgent('interpretation', 'list_persisted_ingest_review_approvals')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'load_persisted_ingest_review_approval')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'approve_persisted_ingest_review')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'promote_persisted_ingest_review')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'list_skills')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'list_skills', true)).toBe(true);
    expect(isToolAllowedForAgent('simulation', 'calculate_bearing_capacity')).toBe(true);
    expect(isToolAllowedForAgent('simulation', 'prepare_fem_analysis_case')).toBe(true);
    expect(isToolAllowedForAgent('simulation', 'validate_fem_analysis_case')).toBe(true);
    expect(isToolAllowedForAgent('simulation', 'run_command')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'run_fem_analysis_case')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'geotech_fem_run')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'ingest_geotech_document')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'analyze_signal_file')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'list_persisted_ingest_review_approvals')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'load_persisted_ingest_review_approval')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'approve_persisted_ingest_review')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'promote_persisted_ingest_review')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'generate_report')).toBe(true);
    expect(isToolAllowedForAgent('simulation', 'query_standards')).toBe(false);
    expect(isToolAllowedForAgent('reviewer', 'generate_report')).toBe(false);
    expect(isToolAllowedForAgent('reviewer', 'analyze_signal_file')).toBe(false);
    expect(getAllowedToolsForAgent('reviewer')).not.toContain('project_add_assumption');
    expect(getAllowedToolsForAgent('reviewer', true)).not.toContain('run_skill');
  });

  it('blocks reviewer attempts to invoke simulation tools during runSwarm', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```tool\n{"tool":"calculate_bearing_capacity","args":{"width":2,"depth":1,"frictionAngle":30}}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"APPROVED","notes":["policy check"],"confidence":96}\n```'),
      );

    mockedGenerateText.mockResolvedValue(response('final report'));

    const executeSpy = vi.spyOn(toolRegistry, 'execute');

    const session = await runSwarm(
      'review a shallow foundation check',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(true);
    expect(executeSpy).not.toHaveBeenCalled();
    expect(mockedGenerateChat).toHaveBeenCalled();
  });

  it('blocks reviewer attempts to prepare FEM analysis cases during runSwarm', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"task":"prepare FEM case"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"summary":"FEM case needs review"},"summary":"simulation complete"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"foundation-settlement","useDemoDefaults":true}}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"APPROVED","notes":["blocked FEM draft tool was not executed by reviewer"],"confidence":90}\n```'),
      );

    mockedGenerateText.mockResolvedValue(response('final report'));

    const executeSpy = vi.spyOn(toolRegistry, 'execute');
    const session = await runSwarm(
      'review a FEM case without letting reviewer draft it',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(true);
    expect(executeSpy).not.toHaveBeenCalledWith('prepare_fem_analysis_case', expect.anything());
    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: 'reviewer',
        type: 'error',
        content: expect.stringContaining('Blocked by role allowlist: prepare_fem_analysis_case'),
        toolName: 'prepare_fem_analysis_case',
      }),
    ]));
  });

  it('threads prepared FEM tool context into reviewer validation', async () => {
    const femInput = {
      objective: 'excavation-deformation',
      geometry: {
        excavationLengthM: 18,
        excavationWidthM: 12,
        excavationFinalDepthM: 8,
      },
      excavation: {
        stageDepthsM: [3, 6, 8],
        supportLevelsM: [2, 5],
        wallType: 'diaphragm_wall',
      },
      load: { pressureKpa: 20 },
      material: {
        elasticModulusKpa: 18_000,
        poissonRatio: 0.32,
        unitWeightKnM3: 19,
      },
      groundwater: {
        condition: 'specified',
        depthM: 2.4,
        note: 'Workspace evidence indicates groundwater at 2.4 m bgl.',
      },
      evidenceRefs: [
        {
          id: 'gm-stratum-1',
          source: 'GroundModel',
          page: 7,
          note: 'Elastic modulus and unit weight from workspace readiness.',
        },
      ],
    } as const;
    const draft = prepareFemAnalysisCaseDraft(femInput as any);
    expect(draft.analysisCase).toBeDefined();

    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"task":"draft and review FEM excavation case"},"summary":"workspace evidence parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response(`\`\`\`tool\n${JSON.stringify({ tool: 'prepare_fem_analysis_case', args: femInput })}\n\`\`\``),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"summary":"FEM case was prepared by deterministic tool output"},"summary":"prepared FEM draft"}\n```'),
      )
      .mockResolvedValueOnce(
        response(`\`\`\`tool\n${JSON.stringify({ tool: 'validate_fem_analysis_case', args: { caseFile: draft.analysisCase } })}\n\`\`\``),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"APPROVED","notes":["FEM case validated with review gates retained"],"confidence":91}\n```'),
      );

    mockedGenerateText.mockResolvedValue(response('final FEM review report'));

    const executeSpy = vi.spyOn(toolRegistry, 'execute');
    const session = await runSwarm(
      'draft and review an excavation FEM analysis case from workspace evidence',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(executeSpy).toHaveBeenCalledWith('prepare_fem_analysis_case', expect.objectContaining({
      objective: 'excavation-deformation',
    }));
    expect(executeSpy).toHaveBeenCalledWith('validate_fem_analysis_case', expect.objectContaining({
      caseFile: expect.objectContaining({
        caseId: 'excavation-deformation-draft',
        objective: 'excavation_deformation',
      }),
    }));
    expect(isToolAllowedForAgent('reviewer', 'prepare_fem_analysis_case')).toBe(false);
    expect(session.context.simulation).toMatchObject({
      prepare_fem_analysis_case: expect.objectContaining({
        objective: 'excavation-deformation',
        analysisCase: expect.objectContaining({
          caseId: 'excavation-deformation-draft',
        }),
      }),
    });
    expect(session.context.reviewer).toMatchObject({
      validate_fem_analysis_case: expect.objectContaining({
        status: expect.any(String),
        reviewItems: expect.any(Number),
      }),
    });
    expect(session.reviewBlockers).toContain('fem-validation-review-required');
    expect(mockedGenerateText).not.toHaveBeenCalled();
    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: 'reviewer',
        type: 'error',
        toolName: 'validate_fem_analysis_case',
        content: expect.stringContaining('requires human review'),
      }),
    ]));

    const reviewerMessages = mockedGenerateChat.mock.calls[3]?.[0] as Array<{ role: string; content: string }>;
    const reviewerUserPrompt = reviewerMessages.find((message) => message.role === 'user')?.content ?? '';
    expect(reviewerUserPrompt).toContain('Simulation tool context:');
    expect(reviewerUserPrompt).toContain('prepare_fem_analysis_case');
    expect(reviewerUserPrompt).toContain('analysisCase.caseId: excavation-deformation-draft');
    expect(reviewerUserPrompt).toContain('These deterministic tool outputs are the authoritative basis for review');
  });

  it('fails closed when reviewer approves a contract-only FEM draft', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"task":"prepare shaft FEM readiness"},"summary":"workspace evidence parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"shaft-deformation","useDemoDefaults":true}}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"summary":"shaft FEM readiness prepared"},"summary":"contract-only FEM draft"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"APPROVED","notes":["looks acceptable"],"confidence":94}\n```'),
      );

    mockedGenerateText.mockResolvedValue(response('APPROVED WITH NOTES'));

    const session = await runSwarm(
      'review a shaft FEM draft',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(session.reviewBlockers).toContain('fem-contract-only:shaft-deformation');
    expect(session.reviewBlockers).toContain('fem-analysis-case-missing:shaft-deformation');
    expect(mockedGenerateText).not.toHaveBeenCalled();
    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: 'reviewer',
        type: 'correction',
        content: expect.stringContaining('Deterministic tool blockers override reviewer approval'),
      }),
    ]));
    const finalStep = session.steps.at(-1);
    expect(finalStep?.content).toContain('UNRESOLVED - REVIEW REJECTED');
    expect(finalStep?.content).toContain('fem-contract-only:shaft-deformation');
    expect(finalStep?.content).not.toContain('APPROVED WITH NOTES');
  });

  it('fails closed when reviewer approves blocked FEM validation output', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"task":"validate bad FEM case"},"summary":"workspace evidence parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"caseFile":{"schemaVersion":"fem-analysis-case.v0"}},"summary":"bad FEM case provided"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```tool\n{"tool":"validate_fem_analysis_case","args":{"caseFile":{"schemaVersion":"fem-analysis-case.v0"}}}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"APPROVED","notes":["validation reviewed"],"confidence":90}\n```'),
      );

    mockedGenerateText.mockResolvedValue(response('APPROVED WITH NOTES'));

    const session = await runSwarm(
      'review a malformed FEM analysis case',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(session.reviewBlockers).toContain('fem-validation-blocked');
    expect(mockedGenerateText).not.toHaveBeenCalled();
    expect(session.steps.at(-1)?.content).toContain('UNRESOLVED - REVIEW REJECTED');
    expect(session.steps.at(-1)?.content).toContain('fem-validation-blocked');
  });

  it('returns a deterministic final answer when swarm synthesis fails', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"APPROVED","notes":["policy check"],"confidence":96}\n```'),
      );

    mockedGenerateText.mockRejectedValue(new Error('hosted synthesis timed out'));

    const session = await runSwarm(
      'review a shallow foundation check',
      {} as any,
      () => {},
      {},
    );

    const finalStep = session.steps.at(-1);
    expect(finalStep?.type).toBe('answer');
    expect(finalStep?.content).toContain('Swarm analysis completed');
    expect(finalStep?.content).toContain('hosted synthesis timed out');
    expect(finalStep?.content).toContain('Simulation output');
  });

  it('keeps rejected swarm review status unresolved without model-written final approval', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":0.8},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"REJECTED","issues":["factor of safety below acceptance"],"corrections":["request missing load case"],"confidence":72}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":0.8},"summary":"still unresolved"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"REJECTED","issues":["still below acceptance"],"corrections":["do not approve"],"confidence":70}\n```'),
      );
    mockedGenerateText.mockResolvedValue(response('APPROVED WITH NOTES'));

    const session = await runSwarm(
      'review an unsafe slope result',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(mockedGenerateText).not.toHaveBeenCalled();
    const finalStep = session.steps.at(-1);
    expect(finalStep).toMatchObject({
      agent: 'orchestrator',
      type: 'answer',
    });
    expect(finalStep?.content).toContain('UNRESOLVED - REVIEW REJECTED');
    expect(finalStep?.content).toContain('do not approve');
    expect(finalStep?.content).not.toContain('APPROVED WITH NOTES');
  });

  it('fails closed when reviewer output omits the required review block', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(response('Looks fine to me.'));
    mockedGenerateText.mockResolvedValue(response('APPROVED WITH NOTES'));

    const session = await runSwarm(
      'review a shallow foundation result',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(session.reviewBlockers).toContain('review-block-missing');
    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: 'reviewer',
        type: 'correction',
        content: expect.stringContaining('BLOCKED REVIEW'),
      }),
    ]));
    expect(mockedGenerateText).not.toHaveBeenCalled();
    const finalStep = session.steps.at(-1);
    expect(finalStep?.content).toContain('UNRESOLVED - REVIEW REJECTED');
    expect(finalStep?.content).toContain('review-block-missing');
    expect(finalStep?.content).not.toContain('APPROVED WITH NOTES');
  });

  it('fails closed when reviewer JSON is schema-invalid', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(response('```review\n{"verdict":"APPROVED"}\n```'));
    mockedGenerateText.mockResolvedValue(response('APPROVED WITH NOTES'));

    const session = await runSwarm(
      'review a shallow foundation result',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(session.reviewBlockers).toContain('review-schema-invalid');
    expect(mockedGenerateText).not.toHaveBeenCalled();
    expect(session.steps.at(-1)?.content).toContain('UNRESOLVED - REVIEW REJECTED');
    expect(session.steps.at(-1)?.content).toContain('review-schema-invalid');
  });

  it('fails closed when reviewer approval contains contradictory issue fields', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(response('```review\n{"verdict":"APPROVED","notes":["ok"],"issues":["still unsafe"],"corrections":["fix it"],"confidence":88}\n```'));
    mockedGenerateText.mockResolvedValue(response('APPROVED WITH NOTES'));

    const session = await runSwarm(
      'review a shallow foundation result',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(session.reviewBlockers).toContain('review-schema-invalid');
    expect(mockedGenerateText).not.toHaveBeenCalled();
    expect(session.steps.at(-1)?.content).toContain('UNRESOLVED - REVIEW REJECTED');
  });

  it('fails closed when reviewer emits multiple review blocks', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(response('```review\n{"verdict":"REJECTED","issues":["check"],"corrections":["revise"],"confidence":60}\n```\n```review\n{"verdict":"APPROVED","notes":["ok"],"confidence":90}\n```'));
    mockedGenerateText.mockResolvedValue(response('APPROVED WITH NOTES'));

    const session = await runSwarm(
      'review a shallow foundation result',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(session.reviewBlockers).toContain('review-block-multiple');
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('fails closed when reviewer contaminates the review block with final-answer text', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(response('```review\n{"verdict":"APPROVED","notes":["ok"],"confidence":90}\n```\nFINAL ANSWER: approved for design.'));
    mockedGenerateText.mockResolvedValue(response('APPROVED WITH NOTES'));

    const session = await runSwarm(
      'review a shallow foundation result',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(session.reviewBlockers).toContain('review-output-contaminated');
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('fails closed when reviewer JSON is malformed', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(response('```review\n{"verdict":"APPROVED",\n```'));
    mockedGenerateText.mockResolvedValue(response('APPROVED WITH NOTES'));

    const session = await runSwarm(
      'review a shallow foundation result',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(false);
    expect(session.reviewBlockers).toContain('review-json-invalid');
    expect(mockedGenerateText).not.toHaveBeenCalled();
    expect(session.steps.at(-1)?.content).toContain('UNRESOLVED - REVIEW REJECTED');
    expect(session.steps.at(-1)?.content).toContain('review-json-invalid');
  });

  it('threads the role-based execution plan into swarm prompts and session output', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"APPROVED","notes":["policy check"],"confidence":96}\n```'),
      );
    mockedGenerateText.mockResolvedValue(response('final report'));

    const session = await runSwarm(
      'review bearing and settlement readiness',
      {} as any,
      () => {},
      {
        workspace: {
          summary: {
            branches: ['foundation'],
            datasetTypes: { 'borehole-table': 1 },
          },
          verifier: {
            status: 'needs-review',
            calculationReadiness: {
              workflows: [
                {
                  workflow: 'bearing-capacity',
                  status: 'ready-with-assumptions',
                  standardProfile: 'eurocode7',
                  missing: ['foundation width'],
                },
              ],
            },
          },
        },
      },
    );

    const messages = mockedGenerateChat.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
    expect(session.plan?.roles.map((role) => role.role)).toContain('WorkspaceScout');
    expect(session.plan?.workspace.standardProfile).toBe('eurocode7');
    expect(session.steps[0]?.content).toContain('Role-based swarm plan prepared');
    expect(messages[1]?.content).toContain('ROLE-BASED SWARM EXECUTION PLAN');
    expect(messages[1]?.content).toContain('DesignEngineer');
    expect(messages[1]?.content).toContain('readyWorkflows=bearing-capacity');
  });
});
