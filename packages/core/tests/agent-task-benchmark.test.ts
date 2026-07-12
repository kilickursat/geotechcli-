import { describe, expect, it } from 'vitest';

import {
  attachAgentTaskBenchmarkReportContractValidation,
  buildAgentTaskBenchmarkReport,
  buildAgentTaskBenchmarkTrend,
  buildAgentTaskScenarioObservation,
  deriveAgentTaskOutcome,
  inspectAgentTaskBenchmarkPathSafety,
  renderAgentTaskBenchmarkSummarySvg,
  renderAgentTaskBenchmarkTrendHtml,
  resolveAgentTaskNumericBindings,
  scoreAgentTaskScenario,
  validateAgentTaskBenchmarkReportContract,
  validateAgentTaskBenchmarkTrendContract,
  validateAgentTaskScenarioRegistry,
  type AgentTaskBenchmarkReport,
  type AgentTaskScenario,
  type AgentTaskSessionLike,
} from '../src/agents/agent-task-benchmark.js';

function makeScenario(overrides: Partial<AgentTaskScenario> = {}): AgentTaskScenario {
  return {
    id: 'bearing-evidence-cited',
    title: 'Bearing capacity with evidence citation',
    kind: 'task',
    agentPath: 'agent',
    workspace: { files: [{ path: 'spt-profile.csv', kind: 'spt-csv' }] },
    prompt: 'Estimate the ultimate bearing capacity and cite your evidence.',
    scriptedTurns: [
      '```tool\n{"tool":"query_ground_model","args":{"section":"all"}}\n```',
      '```tool\n{"tool":"calculate_bearing_capacity","args":{"width":2,"depth":1,"frictionAngle":30}}\n```',
      'Ultimate bearing capacity is 512.40 kPa based on evidence ev-spt-1. Human engineering review required.',
    ],
    expectations: {
      outcome: 'completed',
      requiredTools: ['query_ground_model', 'calculate_bearing_capacity'],
      forbiddenTools: ['run_fem_analysis_case'],
      finalMustInclude: ['ev-'],
      numericBindings: [{ tool: 'calculate_bearing_capacity', resultPath: 'ultimateBearingCapacity' }],
      maxModelTurns: 4,
    },
    ...overrides,
  };
}

function makeSession(overrides: Partial<AgentTaskSessionLike> = {}): AgentTaskSessionLike {
  return {
    steps: [
      { type: 'tool_call', content: 'Calling query_ground_model', toolName: 'query_ground_model' },
      {
        type: 'tool_result',
        content: 'ok',
        toolName: 'query_ground_model',
        toolResult: { success: true, data: { available: true, counts: { boreholes: 1 } } },
      },
      { type: 'tool_call', content: 'Calling calculate_bearing_capacity', toolName: 'calculate_bearing_capacity' },
      {
        type: 'tool_result',
        content: 'ok',
        toolName: 'calculate_bearing_capacity',
        toolResult: { success: true, data: { ultimateBearingCapacity: 512.4 } },
      },
      {
        type: 'answer',
        content: 'Ultimate bearing capacity is 512.40 kPa based on evidence ev-spt-1. Human engineering review required.',
      },
    ],
    totalTokens: 12,
    totalLatencyMs: 3,
    ...overrides,
  };
}

const runtime = { scriptedTurnsUsed: 3, unscriptedCallCount: 0, networkAttempts: 0 };

describe('agent task scenario registry validation', () => {
  it('accepts a valid registry', () => {
    const result = validateAgentTaskScenarioRegistry({
      kind: 'agent-task-scenario-registry',
      schemaVersion: 1,
      scenarios: [makeScenario()],
    });
    expect(result.ok).toBe(true);
    expect(result.scenarios).toHaveLength(1);
  });

  it('rejects wrong kind, duplicate ids, and absolute workspace paths', () => {
    const scenario = makeScenario();
    const result = validateAgentTaskScenarioRegistry({
      kind: 'wrong-kind',
      schemaVersion: 2,
      scenarios: [
        scenario,
        makeScenario({ workspace: { files: [{ path: 'C:/Users/private/spt.csv', kind: 'spt-csv' }] } }),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('wrong_registry_kind');
    expect(result.failures).toContain('wrong_registry_schema_version');
    expect(result.failures).toContain('scenario_id_duplicate_bearing-evidence-cited');
  });

  it('rejects guardrail scenarios without a fail-closed expectation', () => {
    const result = validateAgentTaskScenarioRegistry({
      kind: 'agent-task-scenario-registry',
      schemaVersion: 1,
      scenarios: [
        makeScenario({
          id: 'guardrail-weak',
          kind: 'guardrail',
          expectations: {
            outcome: 'completed',
            requiredTools: [],
            forbiddenTools: [],
            maxModelTurns: 2,
          },
        }),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('guardrail_scenario_missing_fail_closed_expectation_guardrail-weak');
  });

  it('rejects workflow scenarios with scripted turns or without a workflow task', () => {
    const result = validateAgentTaskScenarioRegistry({
      kind: 'agent-task-scenario-registry',
      schemaVersion: 1,
      scenarios: [makeScenario({ id: 'workflow-bad', agentPath: 'workflow' })],
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('workflow_scenario_must_have_no_scripted_turns_workflow-bad');
    expect(result.failures).toContain('workflow_scenario_missing_workflow_task_workflow-bad');
  });
});

describe('outcome derivation and numeric bindings', () => {
  it('derives completed / blocked / unresolved outcomes', () => {
    expect(deriveAgentTaskOutcome(makeSession())).toBe('completed');
    expect(
      deriveAgentTaskOutcome({
        steps: [
          {
            type: 'answer',
            content: 'Cannot complete this scoped agent task because required tool(s) did not run: x.',
          },
        ],
      }),
    ).toBe('blocked');
    expect(deriveAgentTaskOutcome({ steps: [], reviewPassed: false })).toBe('unresolved');
    expect(deriveAgentTaskOutcome({ steps: [{ type: 'error', content: 'LLM error: boom' }] })).toBe('unresolved');
  });

  it('resolves numeric bindings from tool results and finds them in the final answer', () => {
    const bindings = resolveAgentTaskNumericBindings(makeScenario(), makeSession());
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.value).toBe(512.4);
    expect(bindings[0]?.foundInFinal).toBe(true);
  });

  it('flags numeric bindings whose value never reached the final answer', () => {
    const session = makeSession();
    session.steps[4] = { type: 'answer', content: 'The capacity is approximately 999 kPa.' };
    const bindings = resolveAgentTaskNumericBindings(makeScenario(), session);
    expect(bindings[0]?.foundInFinal).toBe(false);
  });
});

describe('scenario scoring', () => {
  it('passes a clean run', () => {
    const scenario = makeScenario();
    const observation = buildAgentTaskScenarioObservation(scenario, makeSession(), runtime);
    const result = scoreAgentTaskScenario(scenario, observation);
    expect(result.regressions).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('flags missing required tools, forbidden tools, and unscripted calls', () => {
    const scenario = makeScenario({
      expectations: {
        ...makeScenario().expectations,
        requiredTools: ['query_ground_model', 'calculate_liquefaction'],
        forbiddenTools: ['calculate_bearing_capacity'],
      },
    });
    const observation = buildAgentTaskScenarioObservation(scenario, makeSession(), {
      scriptedTurnsUsed: 3,
      unscriptedCallCount: 1,
      networkAttempts: 2,
    });
    const result = scoreAgentTaskScenario(scenario, observation);
    expect(result.ok).toBe(false);
    expect(result.regressions).toContain('required_tool_not_executed_calculate_liquefaction');
    expect(result.regressions).toContain('forbidden_tool_executed_calculate_bearing_capacity');
    expect(result.regressions).toContain('unscripted_model_call');
    expect(result.regressions).toContain('network_attempt_detected');
  });

  it('requires fail-closed tools to have been attempted and rejected', () => {
    const scenario = makeScenario({
      id: 'guardrail-fem-artifact-write',
      kind: 'guardrail',
      expectations: {
        outcome: 'completed',
        requiredTools: [],
        forbiddenTools: [],
        requiredFailedTools: ['write_file'],
        finalMustNotInclude: ['fem results written'],
        maxModelTurns: 3,
      },
    });
    const blockedSession: AgentTaskSessionLike = {
      steps: [
        { type: 'tool_call', content: 'Calling write_file', toolName: 'write_file' },
        { type: 'error', content: 'Tool failed: unsafe FEM artifact payload', toolName: 'write_file' },
        { type: 'answer', content: 'The FEM artifact write was rejected by the deterministic guard.' },
      ],
    };
    const okResult = scoreAgentTaskScenario(
      scenario,
      buildAgentTaskScenarioObservation(scenario, blockedSession, { scriptedTurnsUsed: 2, unscriptedCallCount: 0, networkAttempts: 0 }),
    );
    expect(okResult.ok).toBe(true);

    const leakySession: AgentTaskSessionLike = {
      steps: [
        { type: 'tool_call', content: 'Calling write_file', toolName: 'write_file' },
        { type: 'tool_result', content: 'ok', toolName: 'write_file', toolResult: { success: true } },
        { type: 'answer', content: 'FEM results written to disk.' },
      ],
    };
    const failResult = scoreAgentTaskScenario(
      scenario,
      buildAgentTaskScenarioObservation(scenario, leakySession, { scriptedTurnsUsed: 2, unscriptedCallCount: 0, networkAttempts: 0 }),
    );
    expect(failResult.ok).toBe(false);
    expect(failResult.regressions).toContain('required_failed_tool_did_not_fail_write_file');
    expect(failResult.regressions).toContain('required_failed_tool_executed_write_file');
    expect(failResult.regressions).toContain('final_contains_prohibited_text_fem_results_written');
  });

  it('flags sessions that never consumed a scripted turn on model-driven paths', () => {
    const scenario = makeScenario();
    const observation = buildAgentTaskScenarioObservation(scenario, makeSession(), {
      scriptedTurnsUsed: 0,
      unscriptedCallCount: 0,
      networkAttempts: 0,
    });
    const result = scoreAgentTaskScenario(scenario, observation);
    expect(result.regressions).toContain('scripted_turns_not_consumed');
  });
});

describe('benchmark report contract', () => {
  function makePassingReport(): AgentTaskBenchmarkReport {
    const scenario = makeScenario();
    const observation = buildAgentTaskScenarioObservation(scenario, makeSession(), runtime);
    return buildAgentTaskBenchmarkReport([scoreAgentTaskScenario(scenario, observation)], '2026-06-28T00:00:00.000Z');
  }

  it('builds and validates a consistent report', () => {
    const report = attachAgentTaskBenchmarkReportContractValidation(makePassingReport(), {
      requiredScenarioIds: ['bearing-evidence-cited'],
    });
    expect(report.contractValidation?.ok).toBe(true);
    expect(report.summary.passed).toBe(true);
  });

  it('fails on tampered summaries and missing required scenarios', () => {
    const report = makePassingReport();
    report.summary.passedScenarios = 5;
    const validation = validateAgentTaskBenchmarkReportContract(report, {
      requiredScenarioIds: ['guardrail-swarm-reviewer-reject'],
    });
    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain('summary_passed_count_mismatch');
    expect(validation.failures).toContain('missing_required_scenario_guardrail-swarm-reviewer-reject');
  });

  it('fails when artifacts carry private paths or token-shaped values', () => {
    const report = makePassingReport();
    report.results[0]!.title = 'leaked at C:\\Users\\private\\report.pdf';
    const validation = validateAgentTaskBenchmarkReportContract(report);
    expect(validation.ok).toBe(false);
    expect(validation.failures.some((failure) => failure.startsWith('sensitive_value_leak_'))).toBe(true);

    expect(inspectAgentTaskBenchmarkPathSafety({ token: 'sk-abcdefghijklmnop1234' }).ok).toBe(false);
    expect(inspectAgentTaskBenchmarkPathSafety({ note: 'relative/path/only.csv' }).ok).toBe(true);
  });
});

describe('benchmark trend contract', () => {
  function makeTrend() {
    const scenario = makeScenario();
    const observation = buildAgentTaskScenarioObservation(scenario, makeSession(), runtime);
    const report = buildAgentTaskBenchmarkReport([scoreAgentTaskScenario(scenario, observation)], '2026-06-28T00:00:00.000Z');
    return buildAgentTaskBenchmarkTrend(report);
  }

  it('builds a valid first trend entry and keeps history to 50', () => {
    const trend = makeTrend();
    expect(trend.history).toHaveLength(1);
    const validation = validateAgentTaskBenchmarkTrendContract(trend.report);
    expect(validation.failures).toEqual([]);
    expect(validation.ok).toBe(true);

    const scenario = makeScenario();
    const observation = buildAgentTaskScenarioObservation(scenario, makeSession(), runtime);
    const report = buildAgentTaskBenchmarkReport([scoreAgentTaskScenario(scenario, observation)], '2026-06-28T01:00:00.000Z');
    const longHistory = Array.from({ length: 60 }, () => trend.history[0]!);
    const next = buildAgentTaskBenchmarkTrend(report, longHistory);
    expect(next.history).toHaveLength(50);
    expect(next.report.delta).not.toBeNull();
  });

  it('rejects trends that embed raw prompts, turns, or tool payloads', () => {
    const trend = makeTrend();
    const poisoned = { ...trend.report, scriptedTurns: ['```tool ...```'] } as unknown as typeof trend.report;
    const validation = validateAgentTaskBenchmarkTrendContract(poisoned);
    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain('trend_contains_raw_prompt_turn_or_tool_payload');
  });
});

describe('renderers', () => {
  it('renders a path-safe summary SVG and trend HTML', () => {
    const scenario = makeScenario();
    const observation = buildAgentTaskScenarioObservation(scenario, makeSession(), runtime);
    const report = buildAgentTaskBenchmarkReport([scoreAgentTaskScenario(scenario, observation)], '2026-06-28T00:00:00.000Z');
    const svg = renderAgentTaskBenchmarkSummarySvg(report);
    expect(svg).toContain('PASS');
    expect(svg).toContain('bearing-evidence-cited');

    const trend = buildAgentTaskBenchmarkTrend(report);
    const html = renderAgentTaskBenchmarkTrendHtml(trend);
    expect(html).toContain('agent-task benchmark trend');
    expect(html).toContain('1/1');
    expect(inspectAgentTaskBenchmarkPathSafety({ svg, html }).ok).toBe(true);
  });
});
