import type { GroundModel } from '../ground-model/index.js';

export type GroundModelFindingSeverity = 'blocking' | 'review' | 'info';

export interface GroundModelFinding {
  severity: GroundModelFindingSeverity;
  code: string;
  message: string;
  evidenceIds: string[];
  recommendation?: string;
}

export interface GroundModelVerification {
  schemaVersion: 'ground-model-verifier.v1';
  generatedAt: string;
  status: 'pass' | 'review' | 'blocking';
  summary: {
    blocking: number;
    review: number;
    info: number;
  };
  findings: GroundModelFinding[];
}

const KNOWN_STANDARDS = new Set(['eurocode7', 'aashto', 'is', 'bs', 'astm']);

function addFinding(findings: GroundModelFinding[], finding: GroundModelFinding): void {
  findings.push(finding);
}

export function verifyGroundModel(model: GroundModel): GroundModelVerification {
  const findings: GroundModelFinding[] = [];

  if (model.stats.evidenceRefs === 0) {
    addFinding(findings, {
      severity: 'review',
      code: 'no_bound_evidence',
      message: 'No evidence-bound geotechnical values were extracted from the workspace.',
      evidenceIds: [],
      recommendation: 'Add CSV/XLSX/AGS inputs with borehole IDs, depths, test values, or run geotech ingest on PDFs first.',
    });
  }

  if (model.project.requestedStandard && !KNOWN_STANDARDS.has(model.project.requestedStandard.toLowerCase())) {
    addFinding(findings, {
      severity: 'review',
      code: 'unknown_standard_profile',
      message: `Requested standard profile "${model.project.requestedStandard}" is not one of eurocode7, aashto, is, bs, or astm.`,
      evidenceIds: [],
      recommendation: 'Use a supported standard profile so downstream factors and verifier checks are explicit.',
    });
  }

  for (const rejected of model.rejectedObservations) {
    addFinding(findings, {
      severity: rejected.kind === 'spt' ? 'review' : 'info',
      code: `rejected_${rejected.kind}_observation`,
      message: rejected.reason,
      evidenceIds: rejected.evidenceIds,
      recommendation: 'Review the source value and confirm whether it is engineering data or a standards/reference number.',
    });
  }

  if (model.boreholes.length > 0 && model.groundwater.length === 0) {
    addFinding(findings, {
      severity: 'review',
      code: 'missing_groundwater',
      message: 'Borehole or in-situ data were detected but no groundwater observation was bound to evidence.',
      evidenceIds: model.boreholes.flatMap((borehole) => borehole.evidenceIds).slice(0, 8),
      recommendation: 'Add groundwater depth, water table notes, or make the dry/unknown groundwater assumption explicit before design.',
    });
  }

  if (model.coordinateSystem.kind === 'local-grid') {
    addFinding(findings, {
      severity: 'info',
      code: 'crs_not_declared',
      message: 'Easting/northing coordinates were detected, but no coordinate reference system was declared.',
      evidenceIds: model.boreholes.flatMap((borehole) => borehole.coordinates?.evidenceIds ?? []).slice(0, 8),
      recommendation: 'Record the CRS or treat map output as a local coordinate plan.',
    });
  }

  for (const borehole of model.boreholes) {
    const depths = borehole.sptTests.map((test) => test.depth);
    if (depths.some((depth) => depth < 0)) {
      addFinding(findings, {
        severity: 'blocking',
        code: 'negative_depth',
        message: `Borehole ${borehole.id} contains a negative depth value.`,
        evidenceIds: borehole.sptTests.filter((test) => test.depth < 0).flatMap((test) => test.evidenceIds),
        recommendation: 'Correct the source table before using this model for calculations.',
      });
    }

    const duplicateDepths = depths.filter((depth, index) => depths.indexOf(depth) !== index);
    if (duplicateDepths.length > 0) {
      addFinding(findings, {
        severity: 'info',
        code: 'duplicate_spt_depth',
        message: `Borehole ${borehole.id} has repeated SPT depths in the sampled data.`,
        evidenceIds: borehole.sptTests.filter((test) => duplicateDepths.includes(test.depth)).flatMap((test) => test.evidenceIds).slice(0, 8),
        recommendation: 'Check whether duplicate depths are repeated tests, merged tables, or OCR/table extraction artifacts.',
      });
    }
  }

  if (model.stats.sptTests > 0 && model.boreholes.every((borehole) => !borehole.coordinates)) {
    addFinding(findings, {
      severity: 'info',
      code: 'missing_borehole_coordinates',
      message: 'SPT/borehole evidence was detected but no borehole coordinates were found.',
      evidenceIds: model.boreholes.flatMap((borehole) => borehole.evidenceIds).slice(0, 8),
      recommendation: 'Add a borehole coordinate table to unlock map and local plan visualizations.',
    });
  }

  const summary = {
    blocking: findings.filter((finding) => finding.severity === 'blocking').length,
    review: findings.filter((finding) => finding.severity === 'review').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
  };

  return {
    schemaVersion: 'ground-model-verifier.v1',
    generatedAt: new Date().toISOString(),
    status: summary.blocking > 0 ? 'blocking' : summary.review > 0 ? 'review' : 'pass',
    summary,
    findings,
  };
}
