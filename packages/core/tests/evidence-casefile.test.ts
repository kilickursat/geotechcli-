import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createProject, loadProject } from '../src/storage/index.js';
import { persistScenarioArtifact } from '../src/agents/case-file.js';
import {
  listEvidenceRecords,
  loadEvidenceRecord,
  persistCaseFileEvidence,
  persistEvidenceRecord,
} from '../src/agents/evidence.js';

describe('evidence persistence layer', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-evidence-'));
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

  it('backfills and dedupes evidence records from stored artifacts', () => {
    const project = createProject('Evidence Backfill Project');
    const scenarioId = 'baseline';
    const sharedEvidence = {
      evidenceId: 'bh-1-observation',
      class: 'Observed' as const,
      label: 'BH-1 log',
      source: 'Borehole log',
      summary: 'Clay layer recorded between 4 m and 8 m.',
    };

    const acceptanceStatus = persistScenarioArtifact({
      projectId: project.meta.id,
      scenarioId,
      artifactType: 'acceptance-status',
      payload: {
        summary: 'Preliminary design is acceptable.',
        verdict: 'APPROVED',
        confidence: 82,
        reasons: ['Observed borehole data is consistent with the design assumptions.'],
      },
      source: { agent: 'reviewer' },
      evidenceRefs: [sharedEvidence],
    });

    const finalReport = persistScenarioArtifact({
      projectId: project.meta.id,
      scenarioId,
      artifactType: 'final-report',
      payload: {
        summary: 'Final recommendation compiled from the stored case-file artifacts.',
        markdown: '# Recommendation\nUse staged excavation with groundwater control.',
        recommendation: 'Use staged excavation with groundwater control.',
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

    const backfill = persistCaseFileEvidence(project.meta.id, scenarioId);
    expect(backfill).toHaveLength(1);

    const record = backfill[0];
    expect(record.class).toBe('Observed');
    expect(record.label).toBe('BH-1 log');
    expect(record.source).toBe('Borehole log');
    expect(record.linkedArtifactIds).toEqual(
      expect.arrayContaining([acceptanceStatus.artifactId, finalReport.artifactId]),
    );

    const loadedById = loadEvidenceRecord(project.meta.id, scenarioId, record.evidenceId);
    expect(loadedById?.evidenceId).toBe(record.evidenceId);

    const duplicate = persistEvidenceRecord({
      projectId: project.meta.id,
      scenarioId,
      class: 'Observed',
      label: 'BH-1 log',
      source: 'Borehole log',
      summary: 'Clay layer recorded between 4 m and 8 m.',
      detail: 'Field log and downstream artifacts agree on the same borehole observation.',
      tags: ['manual-note'],
      linkedArtifactIds: ['manual-review-note'],
      provenanceSource: { agent: 'orchestrator' },
    });

    expect(duplicate.evidenceId).toBe(record.evidenceId);
    expect(duplicate.linkedArtifactIds).toEqual(
      expect.arrayContaining([acceptanceStatus.artifactId, finalReport.artifactId, 'manual-review-note']),
    );

    const projectAfter = loadProject(project.meta.id);
    const caseFile = projectAfter.namedDatasets[`scenario-case-file:${scenarioId}`]?.data as {
      evidenceDatasetRefs?: string[];
      evidenceIndex?: Record<string, string>;
    };

    expect(caseFile.evidenceDatasetRefs).toEqual([`scenario-evidence:${scenarioId}:${record.evidenceId}`]);
    expect(caseFile.evidenceIndex?.['observed|bh-1 log|borehole log']).toBe(
      `scenario-evidence:${scenarioId}:${record.evidenceId}`,
    );
    expect(listEvidenceRecords(project.meta.id, scenarioId)).toHaveLength(1);
  });
});
