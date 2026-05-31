import { describe, expect, it } from 'vitest';
import type { ProjectManifest } from '../src/workspace/index.js';
import {
  PROJECT_WORKFLOW_ROUTER_TASKS,
  PROJECT_WORKFLOW_ROUTE_MIN_CONFIDENCE,
  buildProjectWorkflowRouterPrompt,
  parseProjectWorkflowRouterSelection,
  routeProjectWorkflowRequest,
} from '../src/project-workflow/index.js';

function makeManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: 'workspace-manifest.v1',
    generatedAt: '2026-05-24T00:00:00.000Z',
    rootPath: '/project',
    files: [
      {
        path: 'reports/site-investigation.pdf',
        absolutePath: '/project/reports/site-investigation.pdf',
        name: 'site-investigation.pdf',
        extension: '.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-05-24T00:00:00.000Z',
        classification: {
          kind: 'pdf',
          datasetType: 'geotechnical-report',
          branches: ['reports'],
          confidence: 0.92,
          signals: ['site investigation'],
          warnings: [],
        },
      },
    ],
    warnings: [],
    summary: {
      totalFiles: 1,
      supportedFiles: 1,
      tabularFiles: 0,
      pdfFiles: 1,
      imageFiles: 0,
      skippedFiles: 0,
      kinds: { pdf: 1 },
      datasetTypes: { 'geotechnical-report': 1 },
      branches: ['reports', 'ground-model'],
      recommendations: ['PDF reports detected. Use geotech ingest for structured extraction.'],
    },
    groundModel: {
      schemaVersion: 'geotech.ground-model.v1',
      generatedAt: '2026-05-24T00:00:00.000Z',
      source: 'workspace',
      units: { depth: 'm', coordinates: 'm' },
      stats: {
        boreholes: 1,
        strata: 2,
        sptTests: 1,
        labTests: 1,
        parameters: 2,
        evidenceRefs: 3,
        rejectedObservations: 0,
      },
      boreholes: [],
      strata: [],
      sptTests: [],
      labTests: [],
      parameters: [],
      map: { points: [], warnings: ['No coordinates extracted.'] },
      rejectedObservations: [],
      warnings: [],
    },
    verifier: {
      schemaVersion: 'geotech.ground-model-verification.v1',
      generatedAt: '2026-05-24T00:00:00.000Z',
      status: 'review',
      summary: { pass: 1, review: 1, blocking: 0 },
      findings: [],
      calculationReadiness: {
        schemaVersion: 'geotech.calculation-readiness.v1',
        generatedAt: '2026-05-24T00:00:00.000Z',
        workflows: [],
      },
    },
    ...overrides,
  } as ProjectManifest;
}

describe('project workflow router', () => {
  it('routes natural-language project requests to deterministic workflow tasks without model calls', () => {
    const route = routeProjectWorkflowRequest({
      prompt: 'Find anomalies, explain project risks, and create visualizations.',
      manifest: makeManifest(),
      runId: 'run_route',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(route.schemaVersion).toBe('geotech.project-workflow-route-plan.v1');
    expect(route.executionMode).toBe('deterministic-sequence');
    expect(route.tasks).toEqual(['risk-analysis', 'anomaly-detection', 'visualization']);
    expect(route.selectionSource).toBe('deterministic');
    expect(route.providerContract.providerNeutral).toBe(true);
    expect(route.providerContract.llmRole).toBe('planner-reviewer-only');
    expect(route.providerContract.deterministicExecutionRequired).toBe(true);
    expect(route.modelCalls).toEqual([]);
  });

  it('rejects unknown LLM-selected tasks and falls back to deterministic prompt intent', () => {
    const route = routeProjectWorkflowRequest({
      prompt: 'Run a risk review for this project.',
      manifest: makeManifest(),
      llmSelection: {
        tasks: ['invent-fem-result', 'risk-analysis'],
        rationale: ['bad route mixed with valid route'],
      },
      runId: 'run_bad_route',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(route.tasks).toEqual(['risk-analysis']);
    expect(route.selectionSource).toBe('model');
    expect(route.rejectedTasks).toEqual([
      expect.objectContaining({ value: 'invent-fem-result', reason: expect.stringContaining('Allowed tasks') }),
    ]);
  });

  it('falls back to keyword routing when LLM output is invalid JSON', () => {
    const route = routeProjectWorkflowRequest({
      prompt: 'Create strip log plots and a ground model map.',
      manifest: makeManifest(),
      llmSelection: 'not-json',
      runId: 'run_invalid_json',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(route.tasks).toEqual(['ground-model', 'visualization']);
    expect(route.selectionSource).toBe('merged');
    expect(route.executionMode).toBe('deterministic-sequence');
  });

  it('routes calculation-readiness language to deterministic draft routing', () => {
    for (const [index, prompt] of [
      'Check calculation readiness for bearing capacity, settlement, pile, liquefaction, slope, and FEM drafts.',
      'Check pile readiness.',
      'Can we run a bearing calculation?',
      'Which design route is ready?',
      'Review FEM foundation settlement readiness.',
      'Review FEM excavation deformation readiness.',
    ].entries()) {
      const route = routeProjectWorkflowRequest({
        prompt,
        manifest: makeManifest(),
        runId: `run_calculation_readiness_${index}`,
        now: '2026-05-24T00:00:00.000Z',
      });

      expect(route.tasks).toEqual(['calculation-readiness']);
      expect(route.executionMode).toBe('deterministic-sequence');
      expect(route.rationale.join(' ')).toMatch(/calculation-readiness/i);
      expect(route.providerContract.allowedTasks).toContain('calculation-readiness');
    }
  });

  it('normalizes model-selected bearing and settlement routes to calculation-readiness', () => {
    const route = routeProjectWorkflowRequest({
      prompt: 'Which design workflow is next?',
      manifest: makeManifest(),
      llmSelection: '{"tasks":["bearing-capacity","settlement","fem-foundation-settlement","fem-excavation-deformation"],"rationale":["foundation design inputs"]}',
      runId: 'run_model_calc_route',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(route.tasks).toEqual(['calculation-readiness']);
    expect(route.rejectedTasks).toEqual([]);
    expect(route.selectionSource).toBe('model');
  });

  it('routes monitoring and signal requests to deterministic signal-analysis', () => {
    for (const [index, prompt] of [
      'Analyze piezometer and settlement monitoring trends.',
      'Check inclinometer time-series and trigger levels.',
      'Review vibration signal records and load-test readings.',
    ].entries()) {
      const route = routeProjectWorkflowRequest({
        prompt,
        manifest: makeManifest({
          summary: {
            ...makeManifest().summary,
            datasetTypes: { 'monitoring-time-series': 1, 'signal-record': 1 },
            branches: ['monitoring', 'signal-processing'],
          },
        }),
        runId: `run_signal_route_${index}`,
        now: '2026-05-24T00:00:00.000Z',
      });

      expect(route.tasks).toEqual(['signal-analysis']);
      expect(route.executionMode).toBe('deterministic-sequence');
      expect(route.rationale.join(' ')).toMatch(/monitoring|signal|time-series/i);
      expect(route.providerContract.allowedTasks).toContain('signal-analysis');
    }
  });

  it('records validated model route proposal provenance and model-call metadata', () => {
    const route = routeProjectWorkflowRequest({
      prompt: 'Please decide which project workflow should run next.',
      manifest: makeManifest(),
      llmSelection: '{"tasks":["risk-analysis","visualization"],"rationale":["risk review plus visuals"],"confidence":0.78}',
      modelCalls: [{
        type: 'model_call',
        purpose: 'project-workflow-router',
        status: 'pass',
        provider: 'openai-compatible',
        model: 'router/free',
        latencyMs: 42,
        usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
        promptChars: 1200,
        outputChars: 92,
      }],
      runId: 'run_model_route',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(route.tasks).toEqual(['risk-analysis', 'visualization']);
    expect(route.executionMode).toBe('deterministic-sequence');
    expect(route.selectionSource).toBe('model');
    expect(route.modelCalls).toEqual([
      expect.objectContaining({ purpose: 'project-workflow-router', status: 'pass', model: 'router/free' }),
    ]);
  });

  it('rejects all-unknown model proposals without executing invented tasks', () => {
    const route = routeProjectWorkflowRequest({
      prompt: 'Please decide which project workflow should run next.',
      manifest: makeManifest(),
      llmSelection: '{"tasks":["invent-fem-result","rewrite-source-files"],"rationale":["bad route"]}',
      runId: 'run_unknown_model_route',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(route.tasks).toEqual([]);
    expect(route.executionMode).toBe('needs-selection');
    expect(route.selectionSource).toBe('model');
    expect(route.rejectedTasks.map((item) => item.value)).toEqual(['invent-fem-result', 'rewrite-source-files']);
  });

  it('keeps model-suggested no-evidence routes below the execution gate', () => {
    const route = routeProjectWorkflowRequest({
      prompt: 'Please decide which project workflow should run next.',
      manifest: makeManifest({
        files: [],
        summary: {
          totalFiles: 0,
          supportedFiles: 0,
          tabularFiles: 0,
          pdfFiles: 0,
          imageFiles: 0,
          skippedFiles: 0,
          kinds: {},
          datasetTypes: {},
          branches: [],
          recommendations: [],
        },
      }),
      llmSelection: '{"tasks":["visualization"],"rationale":["model proposed visualization"]}',
      runId: 'run_model_no_evidence',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(route.tasks).toEqual(['visualization']);
    expect(route.selectionSource).toBe('model');
    expect(route.confidence).toBeLessThan(PROJECT_WORKFLOW_ROUTE_MIN_CONFIDENCE);
    expect(route.executionMode).toBe('needs-selection');
  });

  it('keeps unrecognized custom questions in selection/review mode', () => {
    const route = routeProjectWorkflowRequest({
      prompt: 'What does the client probably want from this email?',
      manifest: makeManifest(),
      runId: 'run_custom',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(route.tasks).toEqual([]);
    expect(route.executionMode).toBe('needs-selection');
    expect(route.rationale.join(' ')).toMatch(/requires custom question/i);
  });

  it('review-gates low-confidence routes instead of executing deterministic workflows', () => {
    const route = routeProjectWorkflowRequest({
      prompt: 'Create a visualization dashboard from this project.',
      manifest: makeManifest({
        files: [],
        summary: {
          totalFiles: 0,
          supportedFiles: 0,
          tabularFiles: 0,
          pdfFiles: 0,
          imageFiles: 0,
          skippedFiles: 0,
          kinds: {},
          datasetTypes: {},
          branches: [],
          recommendations: [],
        },
      }),
      runId: 'run_low_confidence',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(route.tasks).toEqual(['visualization']);
    expect(route.confidence).toBeLessThan(PROJECT_WORKFLOW_ROUTE_MIN_CONFIDENCE);
    expect(route.executionMode).toBe('needs-selection');
    expect(route.selectionSource).toBe('deterministic');
    expect(route.trace.steps[0]?.detail).toMatch(/below the 0\.60 execution gate/i);
    expect(route.modelCalls).toEqual([]);
  });

  it.each([
    { provider: 'hosted-beta' as const, modelId: 'glm-5.1', expectedProfile: 'hosted-default', freeGate: false },
    { provider: 'zhipu' as const, modelId: 'glm-5.1', expectedProfile: 'direct-zai', freeGate: false },
    { provider: 'openai-compatible' as const, modelId: 'poolside/laguna-m.1:free', expectedProfile: 'open-byok', freeGate: true },
    { provider: 'openai-compatible' as const, modelId: 'local/model', expectedProfile: 'open-byok', freeGate: false },
  ])('builds the same allowed workflow contract for $provider $modelId', ({ provider, modelId, expectedProfile, freeGate }) => {
    const route = routeProjectWorkflowRequest({
      prompt: 'Risk review and recommendations.',
      manifest: makeManifest(),
      providerConfig: { provider, modelId, visionModelId: undefined },
      runId: `run_${provider}`,
      now: '2026-05-24T00:00:00.000Z',
    });
    const prompt = buildProjectWorkflowRouterPrompt({
      prompt: 'Risk review and recommendations.',
      manifest: makeManifest(),
      providerConfig: { provider, modelId, visionModelId: undefined },
    });

    expect(route.providerContract.allowedTasks).toEqual(PROJECT_WORKFLOW_ROUTER_TASKS);
    expect(route.providerContract.providerProfile).toBe(expectedProfile);
    expect(prompt).toContain('PROJECT WORKFLOW ROUTER CONTRACT');
    expect(prompt).toContain('select and sequence only allowed deterministic GeotechCLI workflows');
    expect(prompt).toContain('GroundModel');
    expect(prompt).toContain('Return strict JSON only');
    expect(prompt).not.toMatch(/use GLM/i);
    if (freeGate) {
      expect(route.providerContract.reviewGates).toContain('free-route-capacity-and-feature-variance');
      expect(prompt).toContain('free/open routed model');
    } else {
      expect(route.providerContract.reviewGates).not.toContain('free-route-capacity-and-feature-variance');
    }
  });

  it('parses fenced JSON task selections without executing unknown names', () => {
    const selection = parseProjectWorkflowRouterSelection(`\`\`\`json
{"tasks":["data-quality","bad-task","visualize"],"rationale":["audit and map"],"requiresCustomQuestion":true}
\`\`\``);

    expect(selection.tasks).toEqual(['data-quality', 'visualization']);
    expect(selection.requiresCustomQuestion).toBe(true);
    expect(selection.rejectedTasks).toEqual([
      expect.objectContaining({ value: 'bad-task' }),
    ]);
  });
});
