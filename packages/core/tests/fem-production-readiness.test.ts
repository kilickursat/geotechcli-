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
      'nonlinear-constitutive-backend-implemented',
      'consolidation-time-stepping-backend-implemented',
      'seepage-solver-implemented',
      'support-design-engine-implemented',
      'workspace-to-run-acceptance-validator-enforced',
      'published-benchmark-corpus-approved',
      'reviewer-approval-record-implemented',
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
    expect(report.blockedFeatures.map((feature) => feature.status)).toEqual(['missing', 'missing']);
  });

  it('exposes a scoped FEM agent tool for production-readiness blockers', async () => {
    const result = await toolRegistry.execute('assess_fem_production_readiness', {
      objective: 'foundation settlement',
      requestedFeatures: ['nonlinear', 'consolidation', 'workspace-to-run'],
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain('FEM production readiness blocked');
    const data = result.data as any;
    expect(data.productionReady).toBe(false);
    expect(data.objective).toBe('foundation-settlement');
    expect(data.requestedFeatures).toEqual([
      'nonlinear-plasticity',
      'consolidation',
      'real-project-workspace-to-run-acceptance',
    ]);
    expect(data.agentEvidenceSummary).toContain('productionReady: no');
  });
});
