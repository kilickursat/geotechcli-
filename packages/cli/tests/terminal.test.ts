import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderJSON, renderRichText } from '../src/ui/terminal.js';

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('renderJSON', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves boolean status fields while redacting secret strings', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    renderJSON({
      apiKeySet: true,
      requiresUserApiKey: false,
      nested: {
        token: 'secret-token',
      },
    });

    expect(logSpy).toHaveBeenCalledTimes(1);

    const output = JSON.parse(String(logSpy.mock.calls[0]?.[0] ?? '{}')) as {
      apiKeySet: boolean;
      requiresUserApiKey: boolean;
      nested: { token: string };
    };

    expect(output.apiKeySet).toBe(true);
    expect(output.requiresUserApiKey).toBe(false);
    expect(output.nested.token).toBe('***REDACTED***');
  });
});

describe('renderRichText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats markdown-like sections, bullets, and code spans for terminal output', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    renderRichText([
      '**Required Information:**',
      '- `RMR` value',
      '- `Q-system` value',
      '',
      'If available, attach an `.ags` or `.csv` file.',
    ].join('\n'));

    const output = logSpy.mock.calls
      .map((call) => stripAnsi(call.map((entry) => String(entry)).join(' ')))
      .join('\n');

    expect(output).toContain('Required Information');
    expect(output).toContain('• RMR value');
    expect(output).toContain('• Q-system value');
    expect(output).toContain('attach an .ags or .csv file');
    expect(output).not.toContain('**Required Information:**');
  });

  it('renders markdown tables with the shared terminal table renderer', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    renderRichText([
      '| Analysis | Tool |',
      '| --- | --- |',
      '| Rock mass classification | `classify_rmr89` |',
      '| TBM performance prediction | `predict_tbm_performance` |',
    ].join('\n'));

    const output = logSpy.mock.calls
      .map((call) => stripAnsi(call.map((entry) => String(entry)).join(' ')))
      .join('\n');

    expect(output).toContain('+');
    expect(output).toContain('Analysis');
    expect(output).toContain('Tool');
    expect(output).toContain('classify_rmr89');
    expect(output).toContain('predict_tbm_performance');
  });
});
