import { describe, expect, it } from 'vitest';
import {
  buildRaftDemoAnalysisCase,
  renderFemWebglHtml,
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
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link rel=');
  });
});
