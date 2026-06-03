import { describe, expect, it } from 'vitest';

import {
  assessFemProductionReadiness,
  toolRegistry,
} from '../src/index.js';

import '../src/agents/runtime-bootstrap.js';

describe('FEM production readiness contract', () => {
  it('blocks full production-grade FEM claims until advanced solver gates exist', () => {
    const report = assessFemProductionReadiness();

    expect(report).toMatchObject({
      schemaVersion: 'fem-production-readiness.v1',
      productionReady: false,
      status: 'blocked',
      currentMode: 'mixed',
    });
    expect(report.blockedFeatures.map((feature) => feature.feature)).toEqual([
      'nonlinear-plasticity',
      'consolidation',
      'seepage-pore-pressure-coupling',
      'advanced-staged-construction',
      'support-design',
      'real-project-workspace-to-run-acceptance',
      'independent-benchmark-validation',
      'licensed-engineer-review-workflow',
    ]);
    expect(report.blockers).toEqual(expect.arrayContaining([
      'production-nonlinear-global-fem-solver-route-and-consistent-tangent-not-approved',
      '2d-3d-coupled-consolidation-fem-backend-implemented',
      'drainage-boundary-validation-approved-against-project-conditions',
      'settlement-time-benchmark-suite-approved-against-published-or-commercial-references',
      'biot-u-p-route-backed-preview-is-not-production-sparse-solver',
      'seepage-route-needs-independent-benchmark-and-design-check-acceptance',
      'support-design-engine-coupled-to-staged-excavation-route',
      'jurisdiction-specific-wall-strut-anchor-structural-design-not-implemented',
      'workspace-to-run-acceptance-validator-enforced',
      'published-benchmark-corpus-approved',
      'external-benchmark-reference-corpus-missing',
      'external-benchmark-published-source-citation-missing',
      'external-benchmark-reference-solver-citation-missing',
      'production-design-approval-scope-fails-closed-until-production-acceptance',
      'reviewer-approval-record-enforced-by-cli-run',
    ]));
    expect(report.engineeringEvidence).toMatchObject({
      schemaVersion: 'fem-engineering-evidence.v1',
      status: 'kernel-verified',
      productionReady: false,
    });
    expect(report.engineeringEvidence.externalBenchmarkAcceptance).toMatchObject({
      schemaVersion: 'fem-external-benchmark-acceptance-metadata.v1',
      status: 'blocked',
      productionReadinessBlocked: true,
      blockerCodes: expect.arrayContaining([
        'external-benchmark-reference-corpus-missing',
        'external-benchmark-published-source-citation-missing',
        'external-benchmark-reference-solver-citation-missing',
      ]),
    });
    expect(report.engineeringEvidence.verifiedFeatures).toEqual(expect.arrayContaining([
      'global-plane-strain-assembly',
      'coupled-nonlinear-plane-strain',
      'coupled-biot-plane-strain',
      'nonlinear-plasticity',
      'consolidation',
      'seepage-pore-pressure-coupling',
      'support-design',
      'licensed-engineer-review-workflow',
    ]));
    expect(report.engineeringEvidence.benchmarks.map((item) => item.id)).toEqual(expect.arrayContaining([
      'quad4-plane-strain-biot-u-p-effective-stress-coupling',
      'quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract',
      'quad4-plane-strain-biot-u-p-alpha-zero-decoupling',
      'quad4-plane-strain-biot-u-p-terzaghi-pressure-dissipation',
      'excavation-support-staged-reaction-sequence',
    ]));
    expect(report.releasePositioning).toContain('not a full production-grade nonlinear geotechnical FEM solver yet');
  });

  it('scopes production readiness to requested features and objectives', () => {
    const report = assessFemProductionReadiness({
      objective: 'excavation-deformation',
      requestedFeatures: ['support-design', 'seepage-pore-pressure-coupling'],
    });

    expect(report.objective).toBe('excavation-deformation');
    expect(report.requestedFeatures).toEqual(['support-design', 'seepage-pore-pressure-coupling']);
    expect(report.supportedPreviewRoutes).toEqual([
      expect.objectContaining({
        objective: 'excavation-deformation',
        deterministicBackend: 'builtin-staged-excavation-demo',
        executionMode: 'human-reviewed-preview',
        draftCommandTemplate: 'geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>',
        demoCommand: 'geotech fem demo excavation --experimental',
        runCommandTemplate: 'geotech fem run <analysis_case.json> --experimental --reviewed',
      }),
    ]);
    expect(report.safeUserActions).toEqual(expect.arrayContaining([
      'Built-in demo command: geotech fem demo excavation --experimental',
      'Reviewed run command template: geotech fem run <analysis_case.json> --experimental --reviewed',
    ]));
    expect(report.blockedFeatures.map((feature) => feature.status)).toEqual(['kernel-verified', 'kernel-verified']);
    expect(report.blockedFeatures.find((feature) => feature.feature === 'support-design')?.currentCoverage)
      .toContain('staged support reaction demand');
    expect(report.blockers).toContain('jurisdiction-specific-wall-strut-anchor-structural-design-not-implemented');
  });

  it('exposes a scoped FEM agent tool for production-readiness blockers', async () => {
    const result = await toolRegistry.execute('assess_fem_production_readiness', {
      objective: 'foundation settlement',
      requestedFeatures: ['nonlinear', 'consolidation', 'biot-u-p-coupling', 'workspace-to-run'],
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('FEM production readiness blocked');
    const data = result.data as any;
    expect(data.productionReady).toBe(false);
    expect(data.objective).toBe('foundation-settlement');
    expect(data.requestedFeatures).toEqual([
      'nonlinear-plasticity',
      'consolidation',
      'seepage-pore-pressure-coupling',
      'real-project-workspace-to-run-acceptance',
    ]);
    expect(data.agentEvidenceSummary).toContain('productionReady: no');
    expect(data.agentEvidenceSummary).toContain('global-plane-strain-assembly');
    expect(data.agentEvidenceSummary).toContain('coupled-nonlinear-plane-strain');
    expect(data.agentEvidenceSummary).toContain('quad4-plane-strain-biot-u-p-effective-stress-coupling');
    expect(data.agentEvidenceSummary).toContain('quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract');
    expect(data.agentEvidenceSummary).toContain('quad4-plane-strain-biot-u-p-alpha-zero-decoupling');
    expect(data.agentEvidenceSummary).toContain('quad4-plane-strain-biot-u-p-terzaghi-pressure-dissipation');
    expect(data.agentEvidenceSummary).toContain(
      'biot-u-p-route-backed-preview-is-not-production-sparse-solver',
    );
  });
});
