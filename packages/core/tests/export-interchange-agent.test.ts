import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { persistScenarioArtifact } from '../src/agents/case-file.js';
import { createProject } from '../src/storage/index.js';

function extractInlineText(data: Record<string, unknown>): string {
  if (typeof data.content === 'string') return data.content;
  if (typeof data.preview === 'string') return data.preview;
  throw new Error('Expected inline text content in tool result.');
}

function seedGroundModel(projectId: string, scenarioId: string): void {
  persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'ground-model',
    payload: {
      summary: 'Made ground over clay over weathered rock.',
      strata: [
        { id: 's1', fromM: 0, toM: 2, material: 'Made ground', description: 'MADE GROUND', evidenceRefs: [], warnings: [] },
        { id: 's2', fromM: 2, toM: 8, material: 'Clay', description: 'Stiff CLAY', uscsSymbol: 'CL', evidenceRefs: [], warnings: [] },
        { id: 's3', fromM: 8, toM: 14, material: 'Mudstone', description: 'Weathered MUDSTONE', evidenceRefs: [], warnings: [] },
      ],
      groundwater: { detected: false },
      missingInputs: [],
      blockedInputs: [],
    },
    source: { agent: 'interpretation', toolName: 'parse_ags' },
  });
}

describe('AGSi/DIGGS agent tools', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-interchange-tools-'));
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

  it('registers export_agsi and export_diggs through the live runtime', async () => {
    await import('../src/agents/brain.js');
    const { toolRegistry } = await import('../src/agents/tools.js');
    const names = toolRegistry.list().map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['export_agsi', 'export_diggs']));
  }, 15_000);

  it('exports AGSi + DIGGS from a stored ground-model artifact', async () => {
    await import('../src/agents/brain.js');
    const { toolRegistry } = await import('../src/agents/tools.js');

    const project = createProject('Interchange Tools Project');
    const scenarioId = 'baseline';
    seedGroundModel(project.meta.id, scenarioId);

    const agsiResult = await toolRegistry.execute('export_agsi', {
      projectId: project.meta.id,
      scenarioId,
      projectName: 'Interchange Tools Project',
      crs: 'EPSG:27700',
    });
    expect(agsiResult.success).toBe(true);
    expect((agsiResult.data as any).format).toBe('agsi');
    expect((agsiResult.data as any).layerCount).toBe(3);
    const agsi = JSON.parse(extractInlineText(agsiResult.data as any));
    expect(agsi.agsSchema.name).toBe('AGSi');
    expect(agsi.agsProject.coordinateSystem).toBe('EPSG:27700');
    expect(agsi.agsiModel[0].element).toHaveLength(3);

    const diggsResult = await toolRegistry.execute('export_diggs', {
      projectId: project.meta.id,
      scenarioId,
      projectName: 'Interchange Tools Project',
      crs: 'EPSG:27700',
      latitude: 51.5,
      longitude: -0.12,
    });
    expect(diggsResult.success).toBe(true);
    expect((diggsResult.data as any).format).toBe('diggs');
    const diggs = extractInlineText(diggsResult.data as any);
    expect(diggs.startsWith('<?xml')).toBe(true);
    expect((diggs.match(/<Borehole\b/g) ?? [])).toHaveLength(1);
    expect(diggs).toContain('51.5 -0.12');
    expect(diggs).toContain('<uscs>CL</uscs>');
  });

  it('fails clearly when no ground-model artifact exists', async () => {
    await import('../src/agents/brain.js');
    const { toolRegistry } = await import('../src/agents/tools.js');
    const project = createProject('Empty Project');

    const result = await toolRegistry.execute('export_agsi', {
      projectId: project.meta.id,
      scenarioId: 'missing',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ground-model/i);
  });
});
