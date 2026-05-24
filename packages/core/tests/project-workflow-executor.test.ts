import { describe, expect, it } from 'vitest';
import {
  buildProjectWorkflowReport,
  runProjectWorkflow,
  type GroundModel,
  type GroundModelVerification,
  type ProjectManifest,
  type ProjectWorkflowTask,
} from '../src/index.js';

function makeGroundModel(): GroundModel {
  return {
    schemaVersion: 'ground-model.v1',
    generatedAt: '2026-05-24T00:00:00.000Z',
    project: { rootPath: 'C:/project', requestedStandard: 'eurocode7' },
    coordinateSystem: { kind: 'local-grid', warnings: ['CRS should be confirmed.'] },
    boreholes: [
      {
        id: 'BH-01',
        coordinates: { easting: 500000, northing: 200000, evidenceIds: ['ev-coord'], confidence: 0.9 },
        sptTests: [{ depth: 2, nValue: 12, unit: 'blows/300mm', evidenceIds: ['ev-spt'], confidence: 0.88, warnings: [] }],
        strata: [{ boreholeId: 'BH-01', topDepth: 0, bottomDepth: 5, description: 'medium dense silty sand', evidenceIds: ['ev-strata'], confidence: 0.86, warnings: [] }],
        groundwater: [{ boreholeId: 'BH-01', depth: 2.5, evidenceIds: ['ev-gw'], confidence: 0.82, warnings: [] }],
        evidenceIds: ['ev-bh'],
        confidence: 0.88,
        warnings: [],
      },
    ],
    strata: [{ boreholeId: 'BH-01', topDepth: 0, bottomDepth: 5, description: 'medium dense silty sand', evidenceIds: ['ev-strata'], confidence: 0.86, warnings: [] }],
    groundwater: [{ boreholeId: 'BH-01', depth: 2.5, evidenceIds: ['ev-gw'], confidence: 0.82, warnings: [] }],
    labTests: [],
    parameters: [
      { name: 'unit weight', value: 18.5, unit: 'kN/m3', boreholeId: 'BH-01', depth: 2, evidenceIds: ['ev-unit'], confidence: 0.84, warnings: [] },
      { name: 'friction angle', value: 31, unit: 'deg', boreholeId: 'BH-01', depth: 2, evidenceIds: ['ev-phi'], confidence: 0.8, warnings: [] },
    ],
    monitoringSeries: [],
    map: {
      schemaVersion: 'ground-model-map.v1',
      coordinateSystem: { kind: 'local-grid', warnings: ['CRS should be confirmed.'] },
      coordinateType: 'projected',
      points: [{
        id: 'pt-1',
        label: 'BH-01',
        kind: 'borehole',
        coordinateType: 'projected',
        x: 500000,
        y: 200000,
        easting: 500000,
        northing: 200000,
        sourceEvidenceIds: ['ev-coord'],
        confidence: 0.9,
        warnings: [],
      }],
      extent: { minX: 500000, maxX: 500000, minY: 200000, maxY: 200000, width: 0, height: 0 },
      summary: { totalPoints: 1, boreholePoints: 1, missingBoreholeCoordinates: 0, averageConfidence: 0.9 },
      warnings: ['Local-grid map points require CRS confirmation.'],
    },
    evidence: [{
      id: 'ev-bh',
      sourceType: 'tabular-cell',
      sourcePath: 'spt.csv',
      location: { filePath: 'spt.csv', rowNumber: 2, columnName: 'borehole' },
      method: 'csv-sample',
      confidence: 0.88,
      rawValue: 'BH-01',
      normalizedValue: 'BH-01',
      warnings: [],
    }],
    rejectedObservations: [{ kind: 'spt', reason: 'Rejected SPT N=999 as implausible.', sourcePath: 'spt.csv', evidenceIds: ['ev-rejected'], rawValue: 999 }],
    warnings: [],
    stats: {
      boreholes: 1,
      sptTests: 1,
      strata: 1,
      groundwaterObservations: 1,
      labTests: 0,
      parameters: 2,
      monitoringSeries: 0,
      evidenceRefs: 5,
      rejectedObservations: 1,
    },
  };
}

function makeVerifier(): GroundModelVerification {
  return {
    schemaVersion: 'ground-model-verifier.v1',
    generatedAt: '2026-05-24T00:00:00.000Z',
    status: 'review',
    summary: { blocking: 0, review: 1, info: 1 },
    findings: [
      {
        severity: 'review',
        code: 'rejected_spt_observation',
        message: 'Rejected SPT N=999 as implausible.',
        evidenceIds: ['ev-rejected'],
        recommendation: 'Review the source value.',
      },
      {
        severity: 'info',
        code: 'crs_not_declared',
        message: 'Local grid coordinates need CRS confirmation.',
        evidenceIds: ['ev-coord'],
        recommendation: 'Declare CRS before map export.',
      },
    ],
    calculationReadiness: {
      schemaVersion: 'ground-model-calculation-readiness.v1',
      summary: { ready: 1, readyWithAssumptions: 1, blocked: 1 },
      workflows: [
        {
          workflow: 'bearing-capacity',
          label: 'Shallow foundation bearing capacity',
          status: 'ready',
          score: 92,
          toolName: 'calculate_bearing_capacity',
          commandTemplate: 'geotech bearing --depth <m> --width <m>',
          standardProfile: 'eurocode7',
          present: ['stratigraphy', 'strength'],
          missing: [],
          assumptions: [],
          evidenceIds: ['ev-strata', 'ev-phi'],
          recommendation: 'Route to bearing after geometry is declared.',
        },
        {
          workflow: 'settlement',
          label: 'Settlement analysis',
          status: 'ready_with_assumptions',
          score: 80,
          toolName: 'calculate_schmertmann_settlement',
          commandTemplate: 'geotech settlement immediate --stress <kPa>',
          standardProfile: 'eurocode7',
          present: ['stratigraphy', 'SPT'],
          missing: ['foundation stress'],
          assumptions: ['foundation stress'],
          evidenceIds: ['ev-spt'],
          recommendation: 'Declare load and foundation width.',
        },
        {
          workflow: 'liquefaction',
          label: 'SPT-based liquefaction triggering',
          status: 'blocked',
          score: 40,
          toolName: 'calculate_liquefaction',
          commandTemplate: 'geotech liquefaction --pga <g>',
          standardProfile: 'eurocode7',
          present: ['SPT'],
          missing: ['PGA'],
          assumptions: [],
          evidenceIds: ['ev-spt'],
          recommendation: 'Add seismic demand.',
        },
      ],
    },
  };
}

function makeManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: 'workspace-manifest.v1',
    generatedAt: '2026-05-24T00:00:00.000Z',
    rootPath: 'C:/project',
    files: [
      {
        path: 'spt.csv',
        absolutePath: 'C:/project/spt.csv',
        name: 'spt.csv',
        extension: '.csv',
        sizeBytes: 256,
        modifiedAt: '2026-05-24T00:00:00.000Z',
        classification: {
          kind: 'csv',
          datasetType: 'spt-profile',
          branches: ['foundation'],
          confidence: 0.9,
          signals: ['SPT'],
          warnings: [],
        },
      },
      {
        path: 'locations.csv',
        absolutePath: 'C:/project/locations.csv',
        name: 'locations.csv',
        extension: '.csv',
        sizeBytes: 128,
        modifiedAt: '2026-05-24T00:00:00.000Z',
        classification: {
          kind: 'csv',
          datasetType: 'coordinate-table',
          branches: ['site'],
          confidence: 0.88,
          signals: ['coordinates'],
          warnings: [],
        },
      },
    ],
    summary: {
      totalFiles: 2,
      supportedFiles: 2,
      tabularFiles: 2,
      pdfFiles: 0,
      imageFiles: 0,
      skippedFiles: 0,
      kinds: { csv: 2 },
      datasetTypes: { 'spt-profile': 1, 'coordinate-table': 1 },
      branches: ['foundation', 'site'],
      recommendations: ['Workspace manifest is ready.'],
    },
    groundModel: makeGroundModel(),
    verifier: makeVerifier(),
    warnings: [],
    ...overrides,
  };
}

describe('runProjectWorkflow', () => {
  it.each<ProjectWorkflowTask>([
    'data-quality',
    'ground-model',
    'risk-analysis',
    'anomaly-detection',
    'recommendations',
    'visualization',
  ])('runs %s without model calls', (task) => {
    const run = runProjectWorkflow({
      manifest: makeManifest(),
      task,
      runId: 'run_001',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(run.schemaVersion).toBe('geotech.project-workflow-run.v1');
    expect(run.task).toBe(task);
    expect(run.providerContract.providerNeutral).toBe(true);
    expect(run.providerContract.llmRole).toBe('none');
    expect(run.modelCalls).toEqual([]);
    expect(run.toolCalls.length).toBeGreaterThan(0);
    expect(run.summary.join(' ')).toMatch(/deterministic/i);
    expect(run.artifacts.map((artifact) => artifact.path).join(' ')).toContain('.geotech/runs/run_001/');
    expect(run.artifacts.map((artifact) => artifact.path).join(' ')).not.toContain('<runId>');
  });

  it('builds map, SPT, groundwater, and lab chart specs from GroundModel evidence', () => {
    const run = runProjectWorkflow({
      manifest: makeManifest(),
      task: 'visualization',
      runId: 'run_viz',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(run.charts.map((chart) => chart.id)).toEqual([
      'ground-model-map',
      'spt-depth',
      'groundwater-depth',
      'lab-parameters-depth',
    ]);
    expect(run.charts[0]?.series[0]?.points[0]).toMatchObject({ label: 'BH-01', evidenceIds: ['ev-coord'] });
  });

  it('blocks GroundModel-dependent workflows when no GroundModel is available', () => {
    const manifest = makeManifest({ groundModel: undefined, verifier: undefined });
    const run = runProjectWorkflow({
      manifest,
      task: 'ground-model',
      runId: 'run_blocked',
      now: '2026-05-24T00:00:00.000Z',
    });

    expect(run.status).toBe('blocked');
    expect(run.findings.some((finding) => finding.title === 'GroundModel evidence not available')).toBe(true);
  });
});

describe('buildProjectWorkflowReport', () => {
  it('renders a deterministic report without provider wording or model calls', () => {
    const run = runProjectWorkflow({
      manifest: makeManifest(),
      task: 'recommendations',
      runId: 'run_report',
      now: '2026-05-24T00:00:00.000Z',
    });
    const report = buildProjectWorkflowReport(run);

    expect(report.fullMarkdown).toContain('Project Workflow Report');
    expect(report.fullMarkdown).toContain('Provider neutral: true');
    expect(report.fullMarkdown).toContain('Model calls: 0');
    expect(report.fullMarkdown).not.toMatch(/GLM|OpenAI|Anthropic|Gemini/i);
  });
});
