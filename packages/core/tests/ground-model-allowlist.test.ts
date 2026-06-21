import { describe, expect, it } from 'vitest';

import { getAllowedToolsForAgent } from '../src/agents/swarm.js';

describe('query_ground_model role allowlist', () => {
  it('exposes query_ground_model to interpretation and reviewer but not simulation', () => {
    expect(getAllowedToolsForAgent('interpretation')).toContain('query_ground_model');
    expect(getAllowedToolsForAgent('reviewer')).toContain('query_ground_model');
    expect(getAllowedToolsForAgent('simulation')).not.toContain('query_ground_model');
  });
});
