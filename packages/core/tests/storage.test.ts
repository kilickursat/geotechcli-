import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addAgentSession,
  addArtifact,
  addAssumption,
  createProject,
  getProjectAgentContext,
  loadProject,
  saveDerivedParameter,
  saveNamedDataset,
  setActiveAnalysisContext,
} from '../src/storage/index.js';

describe('Project storage', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-storage-'));
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

  it('persists enhanced project memory fields', () => {
    const project = createProject('Tokyo Shaft');

    addAssumption(project.meta.id, {
      text: 'Groundwater table assumed at 3 m below grade.',
      source: 'Preliminary desk study',
    });
    saveNamedDataset(project.meta.id, {
      name: 'bh-01',
      kind: 'borehole-log',
      data: { totalDepth: 18.5 },
      source: 'vision-log',
    });
    saveDerivedParameter(project.meta.id, {
      name: 'design-friction-angle',
      value: 32,
      source: 'CPT interpretation',
    });
    addArtifact(project.meta.id, {
      kind: 'report',
      title: 'Initial foundation memo',
      content: 'Bearing and settlement checks pending.',
    });
    addAgentSession(project.meta.id, {
      mode: 'single',
      query: 'Check footing bearing capacity',
      answer: 'Use Meyerhof with settlement follow-up.',
      summary: 'Initial footing check',
      stepCount: 4,
      tokens: 320,
      latencyMs: 1200,
      context: { calculate_bearing_capacity: { qAllowable: 210 } },
    });
    setActiveAnalysisContext(project.meta.id, {
      currentTask: 'Footing concept design',
      lastAgentMode: 'single',
      lastAnswer: 'Use Meyerhof with settlement follow-up.',
      context: { foundationType: 'pad-footing' },
      relatedDatasets: ['bh-01'],
    });

    const loaded = loadProject(project.meta.id);
    expect(loaded.assumptions).toHaveLength(1);
    expect(loaded.artifacts).toHaveLength(1);
    expect(loaded.agentSessions).toHaveLength(1);
    expect(loaded.namedDatasets['bh-01']?.kind).toBe('borehole-log');
    expect(loaded.derivedParameters['design-friction-angle']?.value).toBe(32);
    expect(loaded.activeAnalysisContext.currentTask).toBe('Footing concept design');

    const context = getProjectAgentContext(project.meta.id);
    expect((context.projectMeta as { id: string }).id).toBe(project.meta.id);
    expect((context.namedDatasets as Record<string, unknown>)['bh-01']).toBeDefined();
  });

  it('normalizes legacy project files with missing new fields', () => {
    const projectDir = join(configDir, 'projects', 'legacy-project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, 'project.json'),
      JSON.stringify({
        meta: {
          id: 'legacy-project',
          name: 'Legacy Project',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        soilProfiles: [],
        simulationResults: [],
        notes: [],
        preferences: {},
      }),
      'utf-8',
    );

    const loaded = loadProject('legacy-project');
    expect(loaded.assumptions).toEqual([]);
    expect(loaded.artifacts).toEqual([]);
    expect(loaded.agentSessions).toEqual([]);
    expect(loaded.namedDatasets).toEqual({});
    expect(loaded.derivedParameters).toEqual({});
    expect(loaded.activeAnalysisContext.context).toEqual({});
  });
});
