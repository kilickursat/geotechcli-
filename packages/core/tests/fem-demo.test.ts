import { describe, expect, it } from 'vitest';
import {
  buildExcavationDemoAnalysisCase,
  buildRaftDemoAnalysisCase,
  renderFemWebglHtml,
  runBuiltinElasticExcavationDemo,
  runBuiltinElasticRaftDemo,
  validateFemAnalysisCase,
  validateFemResultManifest,
  type FemResultManifest,
} from '../src/fem/index.js';

describe('experimental FEM raft demo', () => {
  it('builds a review-gated deterministic raft analysis case', () => {
    const analysisCase = buildRaftDemoAnalysisCase();
    const validation = validateFemAnalysisCase(analysisCase);

    expect(analysisCase.schemaVersion).toBe('fem-analysis-case.v0');
    expect(analysisCase.experimental).toBe(true);
    expect(analysisCase.objective).toBe('foundation_settlement');
    expect(analysisCase.analysisType).toBe('static_3d_small_strain');
    expect(validation.status).toBe('review');
    expect(validation.blockers).toBe(0);
    expect(validation.reviewItems).toBeGreaterThan(0);
  });

  it('builds a review-gated deterministic staged excavation analysis case', () => {
    const analysisCase = buildExcavationDemoAnalysisCase();
    const validation = validateFemAnalysisCase(analysisCase);

    expect(analysisCase.schemaVersion).toBe('fem-analysis-case.v0');
    expect(analysisCase.experimental).toBe(true);
    expect(analysisCase.objective).toBe('excavation_deformation');
    expect(analysisCase.analysisType).toBe('static_3d_staged_elastic');
    expect(analysisCase.geometry.excavation?.stages).toHaveLength(3);
    expect(validation.status).toBe('review');
    expect(validation.blockers).toBe(0);
    expect(validation.findings.map((finding) => finding.code)).toContain('excavation.design-excluded');
  });

  it('returns a finite result envelope and self-contained visualization mesh', () => {
    const manifest = runBuiltinElasticRaftDemo();
    const validation = validateFemResultManifest(manifest);

    expect(manifest.schemaVersion).toBe('fem-result-manifest.v0');
    expect(manifest.backend.deterministic).toBe(true);
    expect(manifest.mesh.nodes).toBe(13 * 13 * 7);
    expect(manifest.mesh.elements).toBe(12 * 12 * 6);
    expect(manifest.mesh.visualizationNodes).toBe(13 * 13);
    expect(manifest.envelope.maxSettlementMm).toBeGreaterThan(0);
    expect(manifest.envelope.totalLoadKn).toBe(9600);
    expect(manifest.envelope.reactionKn).toBe(9600);
    expect(manifest.envelope.reactionBalanceRatio).toBe(1);
    expect(manifest.visualization.base.length).toBe(manifest.visualization.disp.length);
    expect(manifest.visualization.base.length).toBe(manifest.visualization.color.length);
    expect(manifest.visualization.tri.length).toBeGreaterThan(0);
    expect(manifest.visualization.edge.length).toBeGreaterThan(0);
    expect(manifest.resultFields?.map((field) => field.id)).toEqual(['vertical_settlement']);
    expect(manifest.steps?.map((step) => step.id)).toEqual(['final']);
    expect(manifest.datasets?.[0]).toMatchObject({
      fieldId: 'vertical_settlement',
      stepId: 'final',
      stride: 3,
      source: 'visualization.disp',
    });
    expect(validation.status).toBe('review');
    expect(validation.blockers).toBe(0);
  });

  it('returns a finite staged excavation result with selectable visualization frames', () => {
    const manifest = runBuiltinElasticExcavationDemo();
    const validation = validateFemResultManifest(manifest);

    expect(manifest.schemaVersion).toBe('fem-result-manifest.v0');
    expect(manifest.analysisCase.objective).toBe('excavation_deformation');
    expect(manifest.backend.id).toBe('builtin-staged-excavation-demo');
    expect(manifest.envelope.maxSurfaceSettlementMm).toBeGreaterThan(0);
    expect(manifest.envelope.maxHorizontalDisplacementMm).toBeGreaterThan(0);
    expect(manifest.envelope.maxWallDeflectionMm).toBeGreaterThan(0);
    expect(manifest.envelope.stageCount).toBe(3);
    expect(manifest.visualization.frames?.map((frame) => frame.field)).toContain('surface_settlement');
    expect(manifest.visualization.frames?.map((frame) => frame.field)).toContain('horizontal_displacement');
    expect(manifest.visualization.frames?.map((frame) => frame.fieldLabel)).toContain('Wall deflection proxy');
    expect(manifest.resultFields?.map((field) => field.id)).toEqual([
      'surface_settlement',
      'horizontal_displacement',
      'wall_deflection_proxy',
      'support_reaction',
    ]);
    expect(manifest.steps?.map((step) => step.id)).toEqual(['stage-1', 'stage-2', 'stage-3']);
    expect(manifest.datasets?.filter((dataset) => dataset.source === 'visualization.frame')).toHaveLength(9);
    expect(manifest.datasets?.some((dataset) => dataset.fieldId === 'support_reaction' && dataset.source === 'envelope')).toBe(true);
    expect(validation.status).toBe('review');
    expect(validation.blockers).toBe(0);
  });

  it('keeps new result metadata optional for older v0 manifests', () => {
    const manifest = runBuiltinElasticExcavationDemo();
    const legacyCompatible: FemResultManifest = {
      ...manifest,
      resultFields: undefined,
      steps: undefined,
      datasets: undefined,
    };

    const validation = validateFemResultManifest(legacyCompatible);

    expect(validation.status).toBe('review');
    expect(validation.blockers).toBe(0);
  });

  it('blocks invalid result references and non-finite values before export', () => {
    const manifest = runBuiltinElasticRaftDemo();
    const invalidIndex: FemResultManifest = {
      ...manifest,
      visualization: {
        ...manifest.visualization,
        tri: [999999, 1, 2],
      },
    };
    const invalidValue: FemResultManifest = {
      ...manifest,
      visualization: {
        ...manifest.visualization,
        disp: [Number.NaN, ...manifest.visualization.disp.slice(1)],
      },
    };

    expect(validateFemResultManifest(invalidIndex).status).toBe('blocked');
    expect(validateFemResultManifest(invalidValue).status).toBe('blocked');
  });

  it('blocks invalid staged excavation geometry and staged visualization frames', () => {
    const invalidCase = buildExcavationDemoAnalysisCase();
    invalidCase.geometry.excavation!.stages[1].depthM = invalidCase.geometry.excavation!.stages[0].depthM;
    expect(validateFemAnalysisCase(invalidCase).status).toBe('blocked');

    const manifest = runBuiltinElasticExcavationDemo();
    const invalidFrameValue: FemResultManifest = {
      ...manifest,
      visualization: {
        ...manifest.visualization,
        frames: [{
          ...manifest.visualization.frames![0],
          disp: [Number.NaN, ...manifest.visualization.frames![0].disp.slice(1)],
        }],
      },
    };
    const invalidFrameLength: FemResultManifest = {
      ...manifest,
      visualization: {
        ...manifest.visualization,
        frames: [{
          ...manifest.visualization.frames![0],
          color: manifest.visualization.frames![0].color.slice(3),
        }],
      },
    };

    expect(validateFemResultManifest(invalidFrameValue).status).toBe('blocked');
    expect(validateFemResultManifest(invalidFrameLength).status).toBe('blocked');
  });

  it('blocks malformed result field, step, and dataset metadata', () => {
    const manifest = runBuiltinElasticExcavationDemo();
    const duplicateField: FemResultManifest = {
      ...manifest,
      resultFields: [
        ...manifest.resultFields!,
        { ...manifest.resultFields![0] },
      ],
    };
    const unknownField: FemResultManifest = {
      ...manifest,
      datasets: [
        {
          ...manifest.datasets![0],
          fieldId: 'unknown-field',
        },
      ],
    };
    const unknownStep: FemResultManifest = {
      ...manifest,
      datasets: [
        {
          ...manifest.datasets![0],
          stepId: 'unknown-step',
        },
      ],
    };
    const nonFiniteDataset: FemResultManifest = {
      ...manifest,
      datasets: [
        {
          ...manifest.datasets![0],
          values: [Number.NaN, ...manifest.datasets![0].values.slice(1)],
        },
      ],
    };
    const wrongCount: FemResultManifest = {
      ...manifest,
      datasets: [
        {
          ...manifest.datasets![0],
          values: manifest.datasets![0].values.slice(3),
        },
      ],
    };

    expect(validateFemResultManifest(duplicateField).status).toBe('blocked');
    expect(validateFemResultManifest(unknownField).status).toBe('blocked');
    expect(validateFemResultManifest(unknownStep).status).toBe('blocked');
    expect(validateFemResultManifest(nonFiniteDataset).status).toBe('blocked');
    expect(validateFemResultManifest(wrongCount).status).toBe('blocked');
  });

  it('returns blocked findings for malformed external FEM payloads', () => {
    expect(validateFemAnalysisCase({} as never).status).toBe('blocked');
    expect(validateFemResultManifest({ visualization: {} } as never).status).toBe('blocked');
  });

  it('renders a self-contained WebGL HTML artifact without external scripts', () => {
    const manifest = runBuiltinElasticRaftDemo();
    const html = renderFemWebglHtml(manifest);

    expect(html).toContain('<canvas id="glcanvas"');
    expect(html).toContain('Experimental deterministic FEM preview');
    expect(html).toContain('const MANIFEST = ');
    expect(html).toContain('raft-settlement-demo');
    expect(html).not.toContain('id="fieldSelect"');
    expect(html).not.toContain('id="stageSlider"');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link rel=');
  });

  it('renders staged field controls for excavation WebGL artifacts', () => {
    const manifest = runBuiltinElasticExcavationDemo();
    const html = renderFemWebglHtml(manifest);

    expect(html).toContain('id="fieldSelect"');
    expect(html).toContain('id="stageSlider"');
    expect(html).toContain('Surface settlement');
    expect(html).toContain('Horizontal displacement');
    expect(html).toContain('Wall deflection proxy');
    expect(html).toContain('id="legendTitle"');
    expect(html).toContain('Stage 1 - excavate to 2.5 m');
    expect(html).toContain('excavation-deformation-demo');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link rel=');
  });
});
