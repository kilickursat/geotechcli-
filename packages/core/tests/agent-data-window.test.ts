import { describe, expect, it } from 'vitest';
import { selectToolResultMaxChars, selectFinalAnswerBudget, type AgentSession } from '../src/agents/brain.js';
import type { LLMConfig } from '../src/llm/types.js';

describe('selectToolResultMaxChars (Gap D)', () => {
  it('gives read-only data tools a wider serialization window', () => {
    expect(selectToolResultMaxChars('query_ground_model')).toBe(8000);
    expect(selectToolResultMaxChars('parse_ags')).toBe(8000);
    expect(selectToolResultMaxChars('parse_cpt')).toBe(8000);
    expect(selectToolResultMaxChars('analyze_signal_file')).toBe(8000);
  });

  it('keeps calculator tools at the default 3 KB window', () => {
    expect(selectToolResultMaxChars('calculate_bearing_capacity')).toBe(3000);
    expect(selectToolResultMaxChars('calculate_liquefaction')).toBe(3000);
  });

  it('honors a custom toolResultMaxChars override for non-data tools', () => {
    expect(selectToolResultMaxChars('calculate_bearing_capacity', { toolResultMaxChars: 5000 })).toBe(5000);
  });

  it('always gives data tools the wide window regardless of the override', () => {
    expect(selectToolResultMaxChars('query_ground_model', { toolResultMaxChars: 1000 })).toBe(8000);
  });
});

describe('selectFinalAnswerBudget (Gap D)', () => {
  const hosted = { provider: 'hosted-beta' } as unknown as LLMConfig;
  const byok = { provider: 'openai' } as unknown as LLMConfig;

  function sessionWith(toolName?: string): AgentSession {
    return {
      steps: toolName
        ? [{ type: 'tool_result', toolName, content: '', timestamp: Date.now() }]
        : [],
      context: {},
      totalTokens: 0,
      totalLatencyMs: 0,
    };
  }

  it('bumps the hosted final-answer budget when a data tool result was read', () => {
    expect(selectFinalAnswerBudget(sessionWith('query_ground_model'), hosted)).toBe(1200);
  });

  it('keeps the hosted final-answer budget at the base for calculator-only sessions', () => {
    expect(selectFinalAnswerBudget(sessionWith('calculate_bearing_capacity'), hosted)).toBe(900);
    expect(selectFinalAnswerBudget(sessionWith(), hosted)).toBe(900);
  });

  it('never shrinks the BYOK base final-answer budget', () => {
    expect(selectFinalAnswerBudget(sessionWith('query_ground_model'), byok)).toBe(1800);
    expect(selectFinalAnswerBudget(sessionWith(), byok)).toBe(1800);
  });
});
