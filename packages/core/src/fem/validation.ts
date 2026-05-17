import type {
  FemAnalysisCase,
  FemResultManifest,
  FemValidationFinding,
  FemValidationSummary,
} from './types.js';

function finding(
  severity: FemValidationFinding['severity'],
  code: string,
  message: string,
): FemValidationFinding {
  return { severity, code, message };
}

function summary(findings: FemValidationFinding[]): FemValidationSummary {
  const blockers = findings.filter((item) => item.severity === 'blocker').length;
  const reviewItems = findings.filter((item) => item.severity === 'review').length;

  return {
    status: blockers > 0 ? 'blocked' : reviewItems > 0 ? 'review' : 'ready',
    blockers,
    reviewItems,
    findings,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFemAnalysisCaseShape(value: unknown): value is FemAnalysisCase {
  if (!isRecord(value)) return false;
  const geometry = value.geometry;
  const mesh = value.mesh;
  const groundwater = value.groundwater;
  return (
    isRecord(geometry) &&
    isRecord(geometry.domain) &&
    isRecord(geometry.raft) &&
    isRecord(mesh) &&
    isRecord(groundwater) &&
    Array.isArray(value.materials) &&
    Array.isArray(value.loads) &&
    Array.isArray(value.assumptions) &&
    Array.isArray(value.limitations) &&
    Array.isArray(value.evidenceRefs)
  );
}

function isFemResultManifestShape(value: unknown): value is FemResultManifest {
  if (!isRecord(value)) return false;
  const visualization = value.visualization;
  const envelope = value.envelope;
  const mesh = value.mesh;
  return (
    isFemAnalysisCaseShape(value.analysisCase) &&
    isRecord(envelope) &&
    isRecord(mesh) &&
    isRecord(visualization) &&
    Array.isArray(visualization.base) &&
    Array.isArray(visualization.disp) &&
    Array.isArray(visualization.color) &&
    Array.isArray(visualization.tri) &&
    Array.isArray(visualization.edge) &&
    Array.isArray(visualization.outlineBase) &&
    Array.isArray(visualization.outlineDisp) &&
    Array.isArray(visualization.outlineIdx) &&
    Array.isArray(value.assumptions) &&
    Array.isArray(value.limitations)
  );
}

export function validateFemAnalysisCase(caseFile: FemAnalysisCase): FemValidationSummary {
  const findings: FemValidationFinding[] = [];
  if (!isFemAnalysisCaseShape(caseFile)) {
    return summary([
      finding('blocker', 'schema.shape-invalid', 'FEM analysis case is missing required geometry, mesh, groundwater, or array fields.'),
    ]);
  }

  const { domain, raft } = caseFile.geometry;
  const material = caseFile.materials[0];
  const load = caseFile.loads[0];

  if (caseFile.schemaVersion !== 'fem-analysis-case.v0') {
    findings.push(finding('blocker', 'schema.unsupported', 'Only fem-analysis-case.v0 is supported.'));
  }
  if (!caseFile.experimental) {
    findings.push(finding('blocker', 'mode.experimental-required', 'FEM cases must be explicitly marked experimental.'));
  }
  if (caseFile.objective !== 'foundation_settlement') {
    findings.push(finding('blocker', 'objective.unsupported', `Unsupported FEM objective: ${caseFile.objective}.`));
  }
  if (caseFile.analysisType !== 'static_3d_small_strain') {
    findings.push(finding('blocker', 'analysis.unsupported', `Unsupported analysis type: ${caseFile.analysisType}.`));
  }
  if (domain.lengthM <= 0 || domain.widthM <= 0 || domain.depthM <= 0) {
    findings.push(finding('blocker', 'geometry.domain-invalid', 'Domain dimensions must be positive.'));
  }
  if (raft.lengthM <= 0 || raft.widthM <= 0 || raft.thicknessM <= 0) {
    findings.push(finding('blocker', 'geometry.raft-invalid', 'Raft dimensions must be positive.'));
  }
  if (domain.lengthM < raft.lengthM * 3 || domain.widthM < raft.widthM * 3) {
    findings.push(finding(
      'review',
      'geometry.domain-small',
      'Domain is less than three raft widths in plan; boundary influence should be reviewed.',
    ));
  }
  if (domain.depthM < Math.max(raft.lengthM, raft.widthM)) {
    findings.push(finding(
      'review',
      'geometry.depth-shallow',
      'Domain depth is less than the controlling raft dimension; settlement influence depth should be reviewed.',
    ));
  }
  if (!material) {
    findings.push(finding('blocker', 'material.missing', 'At least one material is required.'));
  } else {
    if (material.model !== 'linear_elastic') {
      findings.push(finding('blocker', 'material.unsupported', `Unsupported material model: ${material.model}.`));
    }
    if (!Number.isFinite(material.elasticModulusKpa) || material.elasticModulusKpa <= 0) {
      findings.push(finding('blocker', 'material.elastic-modulus-invalid', 'Elastic modulus must be positive.'));
    }
    if (!Number.isFinite(material.poissonRatio) || material.poissonRatio <= 0 || material.poissonRatio >= 0.5) {
      findings.push(finding('blocker', 'material.poisson-invalid', 'Poisson ratio must be between 0 and 0.5.'));
    }
  }
  if (!load) {
    findings.push(finding('blocker', 'load.missing', 'A raft pressure load is required.'));
  } else if (!Number.isFinite(load.pressureKpa) || load.pressureKpa <= 0) {
    findings.push(finding('blocker', 'load.pressure-invalid', 'Uniform pressure must be positive.'));
  }

  const { divisionsX, divisionsY, divisionsZ } = caseFile.mesh;
  if (divisionsX < 2 || divisionsY < 2 || divisionsZ < 1) {
    findings.push(finding('blocker', 'mesh.too-coarse', 'Mesh divisions must be at least 2 x 2 x 1.'));
  }
  if (caseFile.groundwater.reviewRequired) {
    findings.push(finding('review', 'groundwater.review-required', caseFile.groundwater.note));
  }
  for (const assumption of caseFile.assumptions) {
    if (assumption.reviewRequired || assumption.confidence === 'review') {
      findings.push(finding(
        'review',
        `assumption.${assumption.id}`,
        `${assumption.parameter} is an engineering assumption requiring review.`,
      ));
    }
  }

  return summary(findings);
}

function pushFiniteArrayFindings(
  findings: FemValidationFinding[],
  name: string,
  values: number[],
  multipleOf: number,
): void {
  if (values.length === 0) {
    findings.push(finding('blocker', `result.${name}.empty`, `${name} must not be empty.`));
    return;
  }
  if (values.length % multipleOf !== 0) {
    findings.push(finding(
      'blocker',
      `result.${name}.stride-invalid`,
      `${name} length must be divisible by ${multipleOf}.`,
    ));
  }
  if (values.some((value) => !Number.isFinite(value))) {
    findings.push(finding('blocker', `result.${name}.non-finite`, `${name} contains non-finite values.`));
  }
}

function pushIndexArrayFindings(
  findings: FemValidationFinding[],
  name: string,
  values: number[],
  nodeCount: number,
  multipleOf: number,
): void {
  if (values.length === 0) {
    findings.push(finding('blocker', `result.${name}.empty`, `${name} must not be empty.`));
    return;
  }
  if (values.length % multipleOf !== 0) {
    findings.push(finding(
      'blocker',
      `result.${name}.stride-invalid`,
      `${name} length must be divisible by ${multipleOf}.`,
    ));
  }
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value >= nodeCount) {
      findings.push(finding(
        'blocker',
        `result.${name}.index-invalid`,
        `${name} references node index ${value}, outside the 0-${Math.max(0, nodeCount - 1)} range.`,
      ));
      return;
    }
  }
}

export function validateFemResultManifest(manifest: FemResultManifest): FemValidationSummary {
  const findings: FemValidationFinding[] = [];
  if (!isFemResultManifestShape(manifest)) {
    return summary([
      finding('blocker', 'result.schema.shape-invalid', 'FEM result manifest is missing required analysis case, envelope, mesh, visualization, or array fields.'),
    ]);
  }

  if (manifest.schemaVersion !== 'fem-result-manifest.v0') {
    findings.push(finding('blocker', 'result.schema.unsupported', 'Only fem-result-manifest.v0 is supported.'));
  }
  if (!manifest.analysisCase.experimental) {
    findings.push(finding('blocker', 'result.experimental-required', 'FEM result manifests must be tied to an experimental case.'));
  }

  for (const [key, value] of Object.entries(manifest.envelope)) {
    if (!Number.isFinite(value)) {
      findings.push(finding('blocker', `result.envelope.${key}.non-finite`, `Envelope value ${key} must be finite.`));
    }
  }
  if (manifest.envelope.reactionBalanceRatio < 0.95 || manifest.envelope.reactionBalanceRatio > 1.05) {
    findings.push(finding(
      'review',
      'result.envelope.balance-review',
      'Reaction balance is outside the 0.95-1.05 review band.',
    ));
  }

  const { visualization } = manifest;
  pushFiniteArrayFindings(findings, 'base', visualization.base, 3);
  pushFiniteArrayFindings(findings, 'disp', visualization.disp, 3);
  pushFiniteArrayFindings(findings, 'color', visualization.color, 3);
  pushFiniteArrayFindings(findings, 'outlineBase', visualization.outlineBase, 3);
  pushFiniteArrayFindings(findings, 'outlineDisp', visualization.outlineDisp, 3);

  const nodeCount = visualization.base.length / 3;
  if (visualization.disp.length / 3 !== nodeCount) {
    findings.push(finding('blocker', 'result.disp.node-count-mismatch', 'Displacement vectors must match base nodes.'));
  }
  if (visualization.color.length / 3 !== nodeCount) {
    findings.push(finding('blocker', 'result.color.node-count-mismatch', 'Color vectors must match base nodes.'));
  }
  pushIndexArrayFindings(findings, 'tri', visualization.tri, nodeCount, 3);
  pushIndexArrayFindings(findings, 'edge', visualization.edge, nodeCount, 2);

  const outlineNodeCount = visualization.outlineBase.length / 3;
  if (visualization.outlineDisp.length / 3 !== outlineNodeCount) {
    findings.push(finding('blocker', 'result.outline.node-count-mismatch', 'Outline displacement vectors must match outline nodes.'));
  }
  pushIndexArrayFindings(findings, 'outlineIdx', visualization.outlineIdx, outlineNodeCount, 2);

  const caseValidation = validateFemAnalysisCase(manifest.analysisCase);
  findings.push(...caseValidation.findings);

  return summary(findings);
}
