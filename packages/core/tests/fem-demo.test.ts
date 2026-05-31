import { describe, expect, it } from 'vitest';
import {
  buildExcavationDemoAnalysisCase,
  buildRaftDemoAnalysisCase,
  buildTunnelVolumeLossDemoAnalysisCase,
  renderFemWebglHtml,
  runBuiltinElasticExcavationDemo,
  runBuiltinElasticRaftDemo,
  runBuiltinTunnelVolumeLossDemo,
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

  it('builds a review-gated deterministic tunnel volume-loss analysis case', () => {
    const analysisCase = buildTunnelVolumeLossDemoAnalysisCase();
    const validation = validateFemAnalysisCase(analysisCase);

    expect(analysisCase.schemaVersion).toBe('fem-analysis-case.v0');
    expect(analysisCase.experimental).toBe(true);
    expect(analysisCase.objective).toBe('tunnel_volume_loss_settlement');
    expect(analysisCase.analysisType).toBe('empirical_3d_settlement_surface');
    expect(analysisCase.geometry.tunnel?.diameterM).toBe(6);
    expect(analysisCase.loads).toHaveLength(0);
    expect(validation.status).toBe('review');
    expect(validation.blockers).toBe(0);
    expect(validation.findings.map((finding) => finding.code)).toContain('tunnel.empirical-preview');
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

  it('returns a finite tunnel volume-loss settlement surface manifest', () => {
    const manifest = runBuiltinTunnelVolumeLossDemo();
    const validation = validateFemResultManifest(manifest);

    expect(manifest.schemaVersion).toBe('fem-result-manifest.v0');
    expect(manifest.analysisCase.objective).toBe('tunnel_volume_loss_settlement');
    expect(manifest.backend.id).toBe('builtin-tunnel-volume-loss-demo');
    expect(manifest.mesh.nodes).toBe(19 * 17 * 5);
    expect(manifest.mesh.elements).toBe(18 * 16 * 4);
    expect(manifest.mesh.visualizationNodes).toBe(19 * 17);
    expect(manifest.envelope.maxSurfaceSettlementMm).toBeGreaterThan(0);
    expect(manifest.envelope.volumeLossPercent).toBe(1.2);
    expect(manifest.envelope.tunnelAxisDepthM).toBe(18);
    expect(manifest.envelope.troughWidthM).toBe(9);
    expect(manifest.envelope.settlementVolumeM3).toBeGreaterThan(0);
    expect(manifest.resultFields?.map((field) => field.id)).toEqual(['surface_settlement']);
    expect(manifest.steps?.map((step) => step.id)).toEqual(['final']);
    expect(manifest.datasets?.[0]).toMatchObject({
      fieldId: 'surface_settlement',
      stepId: 'final',
      stride: 3,
      source: 'visualization.disp',
    });
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

  it('blocks partial result metadata instead of silently accepting incomplete traceability', () => {
    const manifest = runBuiltinElasticExcavationDemo();
    const partialMetadata: FemResultManifest = {
      ...manifest,
      datasets: undefined,
    };

    const validation = validateFemResultManifest(partialMetadata);

    expect(validation.status).toBe('blocked');
    expect(validation.findings.map((finding) => finding.code)).toContain('result.metadata.incomplete');
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

  it('blocks invalid tunnel geometry before export', () => {
    const invalidCase = buildTunnelVolumeLossDemoAnalysisCase();
    invalidCase.geometry.tunnel!.axisDepthM = invalidCase.geometry.tunnel!.diameterM / 2;

    const validation = validateFemAnalysisCase(invalidCase);

    expect(validation.status).toBe('blocked');
    expect(validation.findings.map((finding) => finding.code)).toContain('geometry.tunnel-cover-invalid');
  });

  it('blocks malformed FEM case numbers and oversized preview meshes', () => {
    const invalidCase = buildRaftDemoAnalysisCase();
    invalidCase.geometry.domain.depthM = Number.NaN;
    invalidCase.mesh.divisionsX = 500;
    invalidCase.mesh.divisionsY = 500;
    invalidCase.mesh.divisionsZ = 2;
    invalidCase.materials[0].unitWeightKnM3 = Number.NaN;
    invalidCase.groundwater.condition = 'specified';
    invalidCase.groundwater.depthM = undefined;

    const validation = validateFemAnalysisCase(invalidCase);
    const codes = validation.findings.map((finding) => finding.code);

    expect(validation.status).toBe('blocked');
    expect(codes).toContain('geometry.domain.depth.non-finite');
    expect(codes).toContain('mesh.preview-node-limit');
    expect(codes).toContain('material.unit-weight-invalid');
    expect(codes).toContain('groundwater.depth-required');
  });

  it('validates every FEM material, load, and boundary condition before preview execution', () => {
    const invalidCase = buildExcavationDemoAnalysisCase();
    invalidCase.materials[1].elasticModulusKpa = 0;
    invalidCase.loads.push({
      ...invalidCase.loads[0],
      id: 'bad-surcharge',
      pressureKpa: -10,
    });
    invalidCase.boundaryConditions[1].description = '';

    const validation = validateFemAnalysisCase(invalidCase);
    const codes = validation.findings.map((finding) => finding.code);

    expect(validation.status).toBe('blocked');
    expect(codes).toContain('material.1.elastic-modulus-invalid');
    expect(codes).toContain('load.1.pressure-invalid');
    expect(codes).toContain('boundary.1.description.missing');
  });

  it('blocks malformed FEM provenance before preview execution', () => {
    const invalidCase = buildRaftDemoAnalysisCase();
    invalidCase.caseId = '';
    invalidCase.createdBy = '';
    invalidCase.createdAt = 'not-a-date';
    invalidCase.assumptions[0].basis = '';
    invalidCase.assumptions[1].confidence = 'guessed' as never;
    invalidCase.assumptions[2].reviewRequired = 'yes' as never;
    invalidCase.evidenceRefs = [{ id: '', source: '', page: 0, note: '' }];
    invalidCase.limitations = [''];
    invalidCase.materials[0].assumptions = [{ ...invalidCase.materials[0].assumptions[0], value: Number.NaN }];
    invalidCase.loads[0].evidenceRefs = [{ id: 'ev-1', page: -2 }];
    invalidCase.groundwater.note = '';
    invalidCase.groundwater.reviewRequired = 'yes' as never;

    const validation = validateFemAnalysisCase(invalidCase);
    const codes = validation.findings.map((finding) => finding.code);

    expect(validation.status).toBe('blocked');
    expect(codes).toEqual(expect.arrayContaining([
      'case-id.missing',
      'created-by.missing',
      'created-at.invalid',
      'case.assumptions.0.basis.missing',
      'case.assumptions.1.confidence.invalid',
      'case.assumptions.2.review-required.invalid',
      'case.evidenceRefs.0.id.missing',
      'case.evidenceRefs.0.source.invalid',
      'case.evidenceRefs.0.page.invalid',
      'case.evidenceRefs.0.note.invalid',
      'case.limitations.0.missing',
      'material.assumptions.0.value.invalid',
      'load.evidenceRefs.0.page.invalid',
      'groundwater.note.missing',
      'groundwater.review-required.invalid',
    ]));
  });

  it('blocks ambiguous tunnel loads and inconsistent groundwater states', () => {
    const tunnelWithLoad = buildTunnelVolumeLossDemoAnalysisCase();
    tunnelWithLoad.loads.push({
      id: 'external-pressure',
      type: 'uniform_pressure',
      target: 'raft',
      pressureKpa: 20,
      evidenceRefs: [],
      assumptions: [],
    });

    const specifiedOutsideDomain = buildRaftDemoAnalysisCase();
    specifiedOutsideDomain.groundwater.condition = 'specified';
    specifiedOutsideDomain.groundwater.depthM = specifiedOutsideDomain.geometry.domain.depthM + 1;

    const belowDomainInsideModel = buildRaftDemoAnalysisCase();
    belowDomainInsideModel.groundwater.condition = 'below_domain';
    belowDomainInsideModel.groundwater.depthM = belowDomainInsideModel.geometry.domain.depthM;

    const notModelledWithDepth = buildRaftDemoAnalysisCase();
    notModelledWithDepth.groundwater.depthM = 2;

    expect(validateFemAnalysisCase(tunnelWithLoad).findings.map((finding) => finding.code)).toContain('load.unsupported-for-objective');
    expect(validateFemAnalysisCase(specifiedOutsideDomain).findings.map((finding) => finding.code)).toContain('groundwater.depth-outside-domain');
    expect(validateFemAnalysisCase(belowDomainInsideModel).findings.map((finding) => finding.code)).toContain('groundwater.below-domain-depth-invalid');
    expect(validateFemAnalysisCase(notModelledWithDepth).findings.map((finding) => finding.code)).toContain('groundwater.depth-unused');
  });

  it('blocks WebGL index overflow before rendering result artifacts', () => {
    const manifest = runBuiltinElasticRaftDemo();
    const invalidIndex: FemResultManifest = {
      ...manifest,
      visualization: {
        ...manifest.visualization,
        base: Array.from({ length: 65_537 * 3 }, () => 0),
        disp: Array.from({ length: 65_537 * 3 }, () => 0),
        color: Array.from({ length: 65_537 * 3 }, () => 0),
        tri: [65_536, 1, 2],
      },
    };

    const validation = validateFemResultManifest(invalidIndex);

    expect(validation.status).toBe('blocked');
    expect(validation.findings.map((finding) => finding.code)).toContain('result.tri.webgl-index-limit');
  });

  it('blocks stale backend and mesh metadata before publishing result artifacts', () => {
    const manifest = runBuiltinElasticExcavationDemo();
    const invalidManifest: FemResultManifest = {
      ...manifest,
      caseId: 'other-case',
      generatedAt: 'not-a-date',
      backend: {
        ...manifest.backend,
        id: 'unknown-backend' as FemResultManifest['backend']['id'],
        deterministic: false as FemResultManifest['backend']['deterministic'],
        version: '',
      },
      mesh: {
        ...manifest.mesh,
        nodes: manifest.mesh.nodes + 1,
        elements: manifest.mesh.elements + 1,
        divisions: [1, 2, 3],
        visualizationNodes: manifest.mesh.visualizationNodes + 1,
        visualizationTriangles: manifest.mesh.visualizationTriangles + 1,
        visualizationEdges: manifest.mesh.visualizationEdges + 1,
      },
    };

    const validation = validateFemResultManifest(invalidManifest);
    const codes = validation.findings.map((finding) => finding.code);

    expect(validation.status).toBe('blocked');
    expect(codes).toContain('result.case-id.mismatch');
    expect(codes).toContain('result.generated-at.invalid');
    expect(codes).toContain('result.backend.id-invalid');
    expect(codes).toContain('result.backend.deterministic-required');
    expect(codes).toContain('result.backend.version.missing');
    expect(codes).toContain('result.mesh.nodes-mismatch');
    expect(codes).toContain('result.mesh.elements-mismatch');
    expect(codes).toContain('result.mesh.divisions-mismatch');
    expect(codes).toContain('result.mesh.visualization-nodes-mismatch');
    expect(codes).toContain('result.mesh.visualization-triangles-mismatch');
    expect(codes).toContain('result.mesh.visualization-edges-mismatch');
  });

  it('blocks stale embedded validation summaries before publishing result artifacts', () => {
    const manifest = runBuiltinElasticRaftDemo();
    const staleValidation: FemResultManifest = {
      ...manifest,
      validation: {
        status: 'ready',
        blockers: 0,
        reviewItems: 0,
        findings: [],
      },
    };

    const validation = validateFemResultManifest(staleValidation);
    const codes = validation.findings.map((finding) => finding.code);

    expect(validation.status).toBe('blocked');
    expect(codes).toContain('result.validation.status-mismatch');
    expect(codes).toContain('result.validation.review-items-mismatch');
    expect(codes).toContain('result.validation.findings-mismatch');
    expect(() => renderFemWebglHtml(staleValidation)).toThrow(/result.validation.status-mismatch/i);
  });

  it('blocks malformed result assumptions and limitations before WebGL rendering', () => {
    const manifest = runBuiltinElasticRaftDemo();
    const malformedResult: FemResultManifest = {
      ...manifest,
      assumptions: [
        {
          ...manifest.assumptions[0],
          id: '',
          value: '',
        },
      ],
      limitations: [],
    };

    const validation = validateFemResultManifest(malformedResult);
    const codes = validation.findings.map((finding) => finding.code);

    expect(validation.status).toBe('blocked');
    expect(codes).toContain('result.assumptions.0.id.missing');
    expect(codes).toContain('result.assumptions.0.value.invalid');
    expect(codes).toContain('result.limitations-missing');
    expect(() => renderFemWebglHtml(malformedResult)).toThrow(/result.assumptions.0.id.missing/i);
  });

  it('blocks inconsistent foundation envelope values before WebGL rendering', () => {
    const manifest = runBuiltinElasticRaftDemo();
    const inconsistentEnvelope: FemResultManifest = {
      ...manifest,
      envelope: {
        ...manifest.envelope,
        minSettlementMm: manifest.envelope.maxSettlementMm + 1,
        totalLoadKn: manifest.envelope.totalLoadKn + 50,
        reactionKn: manifest.envelope.reactionKn - 50,
      },
    };

    const validation = validateFemResultManifest(inconsistentEnvelope);
    const codes = validation.findings.map((finding) => finding.code);

    expect(validation.status).toBe('blocked');
    expect(codes).toEqual(expect.arrayContaining([
      'result.envelope.settlement-range-invalid',
      'result.envelope.foundation-total-load-mismatch',
      'result.envelope.foundation-reaction-mismatch',
    ]));
    expect(() => renderFemWebglHtml(inconsistentEnvelope)).toThrow(/foundation-total-load-mismatch/i);
  });

  it('blocks inconsistent excavation envelope values before WebGL rendering', () => {
    const manifest = runBuiltinElasticExcavationDemo();
    const inconsistentEnvelope: FemResultManifest = {
      ...manifest,
      envelope: {
        ...manifest.envelope,
        totalLoadKn: manifest.envelope.totalLoadKn + 100,
        reactionKn: manifest.envelope.reactionKn - 100,
        totalExcavatedWeightKn: manifest.envelope.totalExcavatedWeightKn! + 100,
        supportReactionKn: manifest.envelope.supportReactionKn! + 25,
        stageCount: manifest.envelope.stageCount! + 1,
      },
    };

    const validation = validateFemResultManifest(inconsistentEnvelope);
    const codes = validation.findings.map((finding) => finding.code);

    expect(validation.status).toBe('blocked');
    expect(codes).toEqual(expect.arrayContaining([
      'result.envelope.excavation-stage-count-mismatch',
      'result.envelope.excavation-weight-mismatch',
      'result.envelope.excavation-total-load-mismatch',
      'result.envelope.excavation-reaction-mismatch',
      'result.envelope.excavation-reaction-components-mismatch',
    ]));
    expect(() => renderFemWebglHtml(inconsistentEnvelope)).toThrow(/excavation-stage-count-mismatch/i);
  });

  it('blocks inconsistent tunnel envelope values before WebGL rendering', () => {
    const manifest = runBuiltinTunnelVolumeLossDemo();
    const inconsistentEnvelope: FemResultManifest = {
      ...manifest,
      envelope: {
        ...manifest.envelope,
        totalLoadKn: 10,
        reactionKn: 5,
        tunnelDiameterM: manifest.envelope.tunnelDiameterM! + 1,
        troughWidthM: manifest.envelope.troughWidthM! + 1,
        settlementVolumePerM: manifest.envelope.settlementVolumePerM! + 0.1,
      },
    };

    const validation = validateFemResultManifest(inconsistentEnvelope);
    const codes = validation.findings.map((finding) => finding.code);

    expect(validation.status).toBe('blocked');
    expect(codes).toEqual(expect.arrayContaining([
      'result.envelope.tunnel-total-load-invalid',
      'result.envelope.tunnel-reaction-invalid',
      'result.envelope.tunnel-diameter-mismatch',
      'result.envelope.tunnel-trough-width-mismatch',
      'result.envelope.tunnel-settlement-volume-per-m-mismatch',
    ]));
    expect(() => renderFemWebglHtml(inconsistentEnvelope)).toThrow(/tunnel-total-load-invalid/i);
  });

  it('blocks result datasets that disagree with visualization frames or envelope values', () => {
    const raftManifest = runBuiltinElasticRaftDemo();
    const staleDisplacementDataset: FemResultManifest = {
      ...raftManifest,
      datasets: [
        {
          ...raftManifest.datasets![0],
          values: [
            raftManifest.datasets![0].values[0] + 0.001,
            ...raftManifest.datasets![0].values.slice(1),
          ],
        },
      ],
    };

    const excavationManifest = runBuiltinElasticExcavationDemo();
    const staleFrameDataset: FemResultManifest = {
      ...excavationManifest,
      datasets: excavationManifest.datasets!.map((dataset, index) => index === 0
        ? {
            ...dataset,
            values: [
              dataset.values[0] + 0.001,
              ...dataset.values.slice(1),
            ],
          }
        : dataset),
    };
    const staleEnvelopeDataset: FemResultManifest = {
      ...excavationManifest,
      datasets: excavationManifest.datasets!.map((dataset) => dataset.fieldId === 'support_reaction'
        ? {
            ...dataset,
            values: [dataset.values[0] + 10],
          }
        : dataset),
    };

    expect(validateFemResultManifest(staleDisplacementDataset).findings.map((finding) => finding.code)).toContain('result.datasets.0.disp-values-mismatch');
    expect(validateFemResultManifest(staleFrameDataset).findings.map((finding) => finding.code)).toContain('result.datasets.0.frame-values-mismatch');
    expect(validateFemResultManifest(staleEnvelopeDataset).findings.map((finding) => finding.code)).toContain('result.datasets.9.envelope-values-mismatch');
    expect(() => renderFemWebglHtml(staleEnvelopeDataset)).toThrow(/envelope-values-mismatch/i);
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
    const duplicateStepIndex: FemResultManifest = {
      ...manifest,
      steps: [
        ...manifest.steps!,
        {
          ...manifest.steps![0],
          id: 'duplicate-index',
        },
      ],
    };
    const staleStepMetadata: FemResultManifest = {
      ...manifest,
      steps: manifest.steps!.map((step, index) => {
        if (index === 0) {
          return {
            ...step,
            label: 'Stale excavation stage label',
            depthM: step.depthM! + 0.25,
          };
        }
        if (index === 1) {
          return {
            ...step,
            analysisStageId: undefined,
          };
        }
        return {
          ...step,
          index: 99,
        };
      }),
    };
    const visualizationDatasetWithoutStep: FemResultManifest = {
      ...manifest,
      datasets: [
        {
          ...manifest.datasets![0],
          stepId: undefined,
        },
      ],
    };
    const envelopeDatasetForSurfaceField: FemResultManifest = {
      ...manifest,
      datasets: [
        {
          ...manifest.datasets![0],
          source: 'envelope',
          values: [1],
          stride: 1,
        },
      ],
    };
    const displacementDatasetForEnvelopeField: FemResultManifest = {
      ...manifest,
      datasets: [
        {
          ...manifest.datasets![0],
          fieldId: 'support_reaction',
          values: manifest.visualization.disp,
          source: 'visualization.disp',
        },
      ],
    };
    const fieldWithoutDataset: FemResultManifest = {
      ...manifest,
      datasets: manifest.datasets!.filter((dataset) => dataset.fieldId !== 'support_reaction'),
    };
    const stepWithoutDataset: FemResultManifest = {
      ...manifest,
      datasets: manifest.datasets!.filter((dataset) => dataset.stepId !== manifest.steps![0].id),
    };
    const malformedFrameMetadata: FemResultManifest = {
      ...manifest,
      visualization: {
        ...manifest.visualization,
        frames: [
          {
            ...manifest.visualization.frames![0],
            field: '',
            fieldLabel: '',
            stageIndex: -1,
            stageLabel: '',
          },
        ],
      },
    };
    const invalidFieldSemantics: FemResultManifest = {
      ...manifest,
      resultFields: [
        {
          ...manifest.resultFields![0],
          quantity: 'reaction',
          component: 'north' as never,
          unit: 'kPa',
          signConvention: '',
        },
        {
          ...manifest.resultFields!.find((field) => field.id === 'support_reaction')!,
          id: 'unknown_envelope_metric',
          component: 'z',
          unit: 'kPa',
        },
      ],
    };
    const unknownFrameStage: FemResultManifest = {
      ...manifest,
      visualization: {
        ...manifest.visualization,
        frames: [
          {
            ...manifest.visualization.frames![0],
            stageIndex: 99,
            stageLabel: 'Unknown construction stage',
          },
        ],
      },
    };
    const staleFrameLabel: FemResultManifest = {
      ...manifest,
      visualization: {
        ...manifest.visualization,
        frames: [
          {
            ...manifest.visualization.frames![0],
            fieldLabel: 'Stale field label',
          },
        ],
      },
    };
    const staleStageLabel: FemResultManifest = {
      ...manifest,
      visualization: {
        ...manifest.visualization,
        frames: [
          {
            ...manifest.visualization.frames![0],
            stageLabel: 'Stale stage label',
          },
        ],
      },
    };

    expect(validateFemResultManifest(duplicateField).status).toBe('blocked');
    expect(validateFemResultManifest(unknownField).status).toBe('blocked');
    expect(validateFemResultManifest(unknownStep).status).toBe('blocked');
    expect(validateFemResultManifest(nonFiniteDataset).status).toBe('blocked');
    expect(validateFemResultManifest(wrongCount).status).toBe('blocked');
    expect(validateFemResultManifest(duplicateStepIndex).findings.map((finding) => finding.code)).toContain('result.steps.3.index.duplicate');
    expect(validateFemResultManifest(staleStepMetadata).findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'result.steps.0.stage-label-mismatch',
      'result.steps.0.stage-depth-mismatch',
      'result.steps.1.stage-required',
      'result.steps.2.stage-index-mismatch',
    ]));
    expect(validateFemResultManifest(visualizationDatasetWithoutStep).findings.map((finding) => finding.code)).toContain('result.datasets.0.step-required');
    expect(validateFemResultManifest(envelopeDatasetForSurfaceField).findings.map((finding) => finding.code)).toContain('result.datasets.0.envelope-field-invalid');
    expect(validateFemResultManifest(displacementDatasetForEnvelopeField).findings.map((finding) => finding.code)).toContain('result.datasets.0.visualization-field-invalid');
    expect(validateFemResultManifest(fieldWithoutDataset).findings.map((finding) => finding.code)).toContain('result.fields.3.dataset-missing');
    expect(validateFemResultManifest(stepWithoutDataset).findings.map((finding) => finding.code)).toContain('result.steps.0.dataset-missing');
    expect(validateFemResultManifest(malformedFrameMetadata).findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'result.frames.0.field.missing',
      'result.frames.0.field-label.missing',
      'result.frames.0.stage-index.invalid',
      'result.frames.0.stage-label.missing',
    ]));
    expect(validateFemResultManifest(invalidFieldSemantics).findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'result.fields.0.component.invalid',
      'result.fields.0.node-quantity-invalid',
      'result.fields.0.component-unexpected',
      'result.fields.0.unit.force-invalid',
      'result.fields.0.sign-convention.invalid',
      'result.fields.1.component-unexpected',
      'result.fields.1.unit.force-invalid',
      'result.fields.1.envelope-field-unmapped',
    ]));
    expect(validateFemResultManifest(unknownFrameStage).findings.map((finding) => finding.code)).toContain('result.frames.0.stage-unknown');
    expect(validateFemResultManifest(staleFrameLabel).findings.map((finding) => finding.code)).toContain('result.frames.0.field-label-mismatch');
    expect(validateFemResultManifest(staleStageLabel).findings.map((finding) => finding.code)).toContain('result.frames.0.stage-label-mismatch');
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

  it('renders final validation counts from render-time result validation', () => {
    const manifest = runBuiltinElasticRaftDemo();
    const balanceReviewManifest: FemResultManifest = {
      ...manifest,
      envelope: {
        ...manifest.envelope,
        reactionBalanceRatio: 0.9,
      },
    };
    const renderValidation = validateFemResultManifest(balanceReviewManifest);

    expect(renderValidation.status).toBe('review');
    expect(renderValidation.reviewItems).toBeGreaterThan(balanceReviewManifest.validation.reviewItems);

    const html = renderFemWebglHtml(balanceReviewManifest);
    const validationMatch = html.match(/const RENDER_VALIDATION = ([\s\S]*?);\nwindow\.__GEOTECH_FEM_RENDER_VALIDATION__/);
    expect(validationMatch?.[1]).toBeTruthy();
    const embeddedValidation = JSON.parse(validationMatch![1]);

    expect(html).toContain(`${renderValidation.blockers} blockers, ${renderValidation.reviewItems} review items`);
    expect(html).toContain('Reaction balance is outside the 0.95-1.05 review band.');
    expect(html).not.toContain(`${balanceReviewManifest.validation.blockers} blockers, ${balanceReviewManifest.validation.reviewItems} review items`);
    expect(embeddedValidation).toMatchObject({
      status: renderValidation.status,
      blockers: renderValidation.blockers,
      reviewItems: renderValidation.reviewItems,
    });
    expect(embeddedValidation.findings.map((finding: { code: string }) => finding.code)).toContain('result.envelope.balance-review');
    expect(html).toContain('window.__GEOTECH_FEM_RENDER_VALIDATION__ = RENDER_VALIDATION');
    expect(html).toContain('document.body.dataset.validationStatus = RENDER_VALIDATION.status');
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

  it('renders tunnel volume-loss WebGL artifacts without staged controls', () => {
    const manifest = runBuiltinTunnelVolumeLossDemo();
    const html = renderFemWebglHtml(manifest);

    expect(html).toContain('Experimental deterministic FEM preview');
    expect(html).toContain('Experimental 3D tunnel volume-loss settlement preview');
    expect(html).toContain('Tunnel surface settlement color');
    expect(html).toContain('tunnel-volume-loss-settlement-demo');
    expect(html).toContain('Volume loss');
    expect(html).toContain('Trough width i');
    expect(html).not.toContain('id="fieldSelect"');
    expect(html).not.toContain('id="stageSlider"');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link rel=');
  });

  it('refuses to render blocked result manifests into WebGL artifacts', () => {
    const manifest = runBuiltinElasticRaftDemo();
    const blockedManifest: FemResultManifest = {
      ...manifest,
      mesh: {
        ...manifest.mesh,
        visualizationNodes: manifest.mesh.visualizationNodes + 1,
      },
    };

    expect(() => renderFemWebglHtml(blockedManifest)).toThrow(/FEM result manifest failed validation/i);
  });
});
