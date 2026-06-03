import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { persistScenarioArtifact } from '../src/agents/case-file.js';
import { persistCaseFileEvidence } from '../src/agents/evidence.js';
import { createProject } from '../src/storage/index.js';

function extractInlineText(data: Record<string, unknown>): string {
  if (typeof data.content === 'string') {
    return data.content;
  }
  if (typeof data.preview === 'string') {
    return data.preview;
  }
  throw new Error('Expected inline text content in tool result.');
}

function seedScenario(projectId: string, scenarioId: string): void {
  const sharedEvidence = {
    evidenceId: 'bh-1-log',
    class: 'Observed' as const,
    label: 'BH-1 log',
    source: 'Borehole log',
    summary: 'Soft clay observed between 2 m and 8 m.',
  };

  persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'ground-model',
    payload: {
      summary: 'Soft clay over dense sand.',
      strata: [
        {
          id: 's1',
          fromM: 0,
          toM: 8,
          material: 'Soft clay',
          description: 'High plasticity clay',
          evidenceRefs: [sharedEvidence],
          warnings: [],
        },
        {
          id: 's2',
          fromM: 8,
          toM: 18,
          material: 'Dense sand',
          description: 'Dense silty sand',
          evidenceRefs: [],
          warnings: [],
        },
      ],
      groundwater: { detected: true, depthM: 1.5 },
      missingInputs: [],
      blockedInputs: [],
    },
    source: { agent: 'interpretation', toolName: 'parse_ags' },
    evidenceRefs: [sharedEvidence],
  });

  persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'assumptions',
    payload: {
      summary: 'Preliminary assumptions for concept design.',
      assumptions: [
        {
          assumptionId: 'a1',
          category: 'groundwater',
          statement: 'Adopt a groundwater depth of 1.5 m for the concept check.',
          impact: 'moderate',
          basis: 'Observed in borehole logging.',
          evidenceRefs: [sharedEvidence],
        },
      ],
      criticalAssumptions: ['Adopt a groundwater depth of 1.5 m for the concept check.'],
    },
    source: { agent: 'interpretation' },
  });

  persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'results',
    payload: {
      summary: 'Pile option improves settlement margin.',
      analysesRun: ['bearing', 'pile'],
      records: [
        {
          resultId: 'r1',
          label: 'Pile capacity',
          method: 'alpha',
          toolName: 'calculate_pile_capacity',
          interpretation: 'Allowable pile capacity supports the column loads.',
          metrics: [
            { name: 'Qa', value: 2200, units: 'kN', status: 'pass' },
          ],
          warnings: [],
          evidenceRefs: [
            {
              evidenceId: 'pile-analysis-run',
              class: 'Computed',
              label: 'Pile analysis run',
              source: 'GeotechCLI',
              summary: 'Alpha-method capacity check.',
            },
          ],
        },
      ],
    },
    source: { agent: 'simulation', toolName: 'calculate_pile_capacity' },
  });

  persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'option-matrix',
    payload: {
      summary: 'Bored piles rank first.',
      preferredOptionId: 'opt-piles',
      decisionBasis: ['Settlement control governs.'],
      rows: [
        {
          optionId: 'opt-piles',
          label: 'Bored piles',
          category: 'foundation',
          safety: 'strong',
          settlement: 'low',
          constructability: 'moderate',
          cost: 'high',
          scheduleRisk: 'medium',
          rank: 1,
          rationale: 'Best settlement performance.',
        },
      ],
    },
    source: { agent: 'simulation' },
  });

  persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'review-checklist',
    payload: {
      summary: 'Checks completed.',
      items: [
        {
          itemId: 'c1',
          category: 'safety',
          question: 'Are safety margins acceptable?',
          status: 'pass',
          detail: 'Concept-stage review is acceptable.',
        },
      ],
    },
    source: { agent: 'reviewer' },
  });

  persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'acceptance-status',
    payload: {
      summary: 'Conditionally acceptable pending detailed design.',
      verdict: 'CONDITIONAL',
      confidence: 82,
      reasons: ['Detailed settlement confirmation is still required.'],
    },
    source: { agent: 'reviewer' },
    evidenceRefs: [sharedEvidence],
  });

  persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'final-report',
    payload: {
      summary: 'Bored piles are preferred.',
      markdown: '## Final design summary\nBored piles are preferred.',
      recommendation: 'Proceed with bored piles.',
      assumptionTable: [],
      evidenceTable: [
        {
          evidenceId: sharedEvidence.evidenceId,
          class: sharedEvidence.class,
          label: sharedEvidence.label,
          source: sharedEvidence.source,
          summary: sharedEvidence.summary,
        },
      ],
    },
    source: { agent: 'orchestrator' },
    evidenceRefs: [sharedEvidence],
  });

  persistCaseFileEvidence(projectId, scenarioId);
}

describe('deliverable tools', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-deliverable-tools-'));
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

  it('registers deliverable tools through the live brain runtime import', async () => {
    await import('../src/agents/brain.js');
    const { toolRegistry } = await import('../src/agents/tools.js');

    const names = toolRegistry.list().map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'generate_report',
        'render_pdf',
        'render_docx',
        'export_csv',
        'export_dxf',
        'export_geojson',
      ]),
    );
    expect(names).not.toEqual(
      expect.arrayContaining([
        'vision_borehole_log',
        'vision_rmr',
        'vision_sensor',
      ]),
    );
  }, 15_000);

  it('registers deliverable tools through the live swarm runtime import', async () => {
    await import('../src/agents/swarm.js');
    const { toolRegistry } = await import('../src/agents/tools.js');

    const names = toolRegistry.list().map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'generate_report',
        'render_pdf',
        'render_docx',
        'export_csv',
        'export_dxf',
        'export_geojson',
      ]),
    );
  });

  it('exports artifact-backed deliverables from stored case-file data', async () => {
    await import('../src/agents/brain.js');
    const { toolRegistry } = await import('../src/agents/tools.js');

    const project = createProject('Deliverable Tools Project');
    const scenarioId = 'baseline';
    seedScenario(project.meta.id, scenarioId);

    const reportResult = await toolRegistry.execute('generate_report', {
      projectId: project.meta.id,
      scenarioId,
      projectName: 'Deliverable Tools Project',
      task: 'Compare foundation options.',
    });
    expect(reportResult.success).toBe(true);
    expect((reportResult.data as any).report.title).toContain('baseline');
    expect((reportResult.data as any).report.metadata.source).toBe('case-file');
    expect((reportResult.data as any).report.metadata.projectName).toBe('Deliverable Tools Project');
    expect(extractInlineText((reportResult.data as any).markdown)).toContain('### Evidence records');

    const resultsCsv = await toolRegistry.execute('export_csv', {
      projectId: project.meta.id,
      scenarioId,
      sourceArtifact: 'results',
    });
    expect(resultsCsv.success).toBe(true);
    expect((resultsCsv.data as any).rowCount).toBe(1);
    expect(extractInlineText(resultsCsv.data as any)).toContain('Pile capacity');

    const evidenceCsv = await toolRegistry.execute('export_csv', {
      projectId: project.meta.id,
      scenarioId,
      sourceArtifact: 'evidence',
    });
    expect(evidenceCsv.success).toBe(true);
    expect(extractInlineText(evidenceCsv.data as any)).toContain('BH-1 log');

    const dxfResult = await toolRegistry.execute('export_dxf', {
      projectId: project.meta.id,
      scenarioId,
      boreholeId: 'BH-1',
      spacing: 8,
    });
    expect(dxfResult.success).toBe(true);
    expect(extractInlineText(dxfResult.data as any)).toContain('SECTION');

    const geoJsonResult = await toolRegistry.execute('export_geojson', {
      projectId: project.meta.id,
      scenarioId,
      latitude: 35.68,
      longitude: 139.76,
      name: 'BH-1',
    });
    expect(geoJsonResult.success).toBe(true);

    const geoJson = JSON.parse(extractInlineText(geoJsonResult.data as any)) as {
      type: string;
      features: Array<{
        properties: {
          scenarioId: string;
          preferredOptionLabel: string;
          verdict: string;
          evidenceCount: number;
        };
      }>;
    };

    expect(geoJson.type).toBe('FeatureCollection');
    expect(geoJson.features[0].properties.scenarioId).toBe(scenarioId);
    expect(geoJson.features[0].properties.preferredOptionLabel).toBe('Bored piles');
    expect(geoJson.features[0].properties.verdict).toBe('CONDITIONAL');
    expect(geoJson.features[0].properties.evidenceCount).toBeGreaterThan(0);
  });
});
