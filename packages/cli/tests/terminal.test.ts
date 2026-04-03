import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderJSON } from '../src/ui/terminal.js';

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
