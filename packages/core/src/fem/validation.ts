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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFemAnalysisCaseShape(value: unknown): value is FemAnalysisCase {
  if (!isRecord(value)) return false;
  const geometry = value.geometry;
  const mesh = value.mesh;
  const groundwater = value.groundwater;
  return (
    isRecord(geometry) &&
    isRecord(geometry.domain) &&
    (isRecord(geometry.raft) || isRecord(geometry.excavation)) &&
    isRecord(mesh) &&
    isRecord(groundwater) &&
    Array.isArray(value.materials) &&
    Array.isArray(value.loads) &&
    Array.isArray(value.assumptions) &&
    Array.isArray(value.limitations) &&
    Array.isArray(value.evidenceRefs)
  );
}

function pushUniqueStringFinding(
  findings: FemValidationFinding[],
  seen: Set<string>,
  value: unknown,
  code: string,
  label: string,
): string | undefined {
  if (!isNonEmptyString(value)) {
    findings.push(finding('blocker', `${code}.missing`, `${label} must be a non-empty string.`));
    return undefined;
  }
  if (seen.has(value)) {
    findings.push(finding('blocker', `${code}.duplicate`, `${label} "${value}" is duplicated.`));
  }
  seen.add(value);
  return value;
}

function validateOptionalResultMetadata(
  findings: FemValidationFinding[],
  manifest: FemResultManifest,
  nodeCount: number,
  outlineNodeCount: number,
): void {
  const { resultFields, steps, datasets } = manifest;
  if (resultFields != null && !Array.isArray(resultFields)) {
    findings.push(finding('blocker', 'result.fields.shape-invalid', 'resultFields must be an array when present.'));
  }
  if (steps != null && !Array.isArray(steps)) {
    findings.push(finding('blocker', 'result.steps.shape-invalid', 'steps must be an array when present.'));
  }
  if (datasets != null && !Array.isArray(datasets)) {
    findings.push(finding('blocker', 'result.datasets.shape-invalid', 'datasets must be an array when present.'));
  }
  if (!Array.isArray(resultFields) && !Array.isArray(steps) && !Array.isArray(datasets)) {
    return;
  }

  const validFieldLocations = new Set(['surface_nodes', 'outline_nodes', 'envelope']);
  const validFieldQuantities = new Set(['displacement', 'reaction', 'load', 'stage_count']);
  const validDatasetSources = new Set(['visualization.disp', 'visualization.frame', 'envelope']);
  const fieldIds = new Set<string>();
  const stepIds = new Set<string>();
  const datasetIds = new Set<string>();
  const excavationStageIds = new Set(manifest.analysisCase.geometry.excavation?.stages.map((stage) => stage.id) ?? []);
  const stepIdByIndex = new Map<number, string>();
  const fieldLocations = new Map<string, string>();

  if (Array.isArray(resultFields)) {
    for (const [index, fieldInfo] of resultFields.entries()) {
      const id = pushUniqueStringFinding(findings, fieldIds, fieldInfo.id, `result.fields.${index}.id`, 'Result field id');
      if (!isNonEmptyString(fieldInfo.label)) {
        findings.push(finding('blocker', `result.fields.${index}.label.missing`, 'Result field label must be a non-empty string.'));
      }
      if (!isNonEmptyString(fieldInfo.unit)) {
        findings.push(finding('blocker', `result.fields.${index}.unit.missing`, 'Result field unit must be a non-empty string.'));
      }
      if (!validFieldLocations.has(fieldInfo.location)) {
        findings.push(finding('blocker', `result.fields.${index}.location.invalid`, `Unsupported result field location: ${String(fieldInfo.location)}.`));
      }
      if (!validFieldQuantities.has(fieldInfo.quantity)) {
        findings.push(finding('blocker', `result.fields.${index}.quantity.invalid`, `Unsupported result field quantity: ${String(fieldInfo.quantity)}.`));
      }
      if (id) fieldLocations.set(id, fieldInfo.location);
    }
  }

  if (Array.isArray(steps)) {
    for (const [index, step] of steps.entries()) {
      const id = pushUniqueStringFinding(findings, stepIds, step.id, `result.steps.${index}.id`, 'Result step id');
      if (!isNonEmptyString(step.label)) {
        findings.push(finding('blocker', `result.steps.${index}.label.missing`, 'Result step label must be a non-empty string.'));
      }
      if (!Number.isInteger(step.index) || step.index < 0) {
        findings.push(finding('blocker', `result.steps.${index}.index.invalid`, 'Result step index must be an integer greater than or equal to zero.'));
      } else if (id) {
        stepIdByIndex.set(step.index, id);
      }
      if (step.analysisStageId && !excavationStageIds.has(step.analysisStageId)) {
        findings.push(finding('blocker', `result.steps.${index}.stage-unknown`, `Result step references unknown excavation stage ${step.analysisStageId}.`));
      }
      if (step.depthM != null && (!Number.isFinite(step.depthM) || step.depthM < 0)) {
        findings.push(finding('blocker', `result.steps.${index}.depth-invalid`, 'Result step depth must be finite and non-negative when present.'));
      }
    }
  }

  if (Array.isArray(datasets)) {
    for (const [index, dataset] of datasets.entries()) {
      pushUniqueStringFinding(findings, datasetIds, dataset.id, `result.datasets.${index}.id`, 'Result dataset id');
      if (!fieldIds.has(dataset.fieldId)) {
        findings.push(finding('blocker', `result.datasets.${index}.field-unknown`, `Result dataset references unknown field ${String(dataset.fieldId)}.`));
      }
      if (dataset.stepId != null && !stepIds.has(dataset.stepId)) {
        findings.push(finding('blocker', `result.datasets.${index}.step-unknown`, `Result dataset references unknown step ${String(dataset.stepId)}.`));
      }
      if (!Array.isArray(dataset.values) || dataset.values.length === 0) {
        findings.push(finding('blocker', `result.datasets.${index}.values.empty`, 'Result dataset values must be a non-empty array.'));
        continue;
      }
      if (dataset.values.some((value) => !Number.isFinite(value))) {
        findings.push(finding('blocker', `result.datasets.${index}.values.non-finite`, 'Result dataset contains non-finite values.'));
      }
      if (dataset.stride !== 1 && dataset.stride !== 3) {
        findings.push(finding('blocker', `result.datasets.${index}.stride.invalid`, 'Result dataset stride must be 1 or 3.'));
        continue;
      }
      if (dataset.values.length % dataset.stride !== 0) {
        findings.push(finding('blocker', `result.datasets.${index}.stride-count-invalid`, 'Result dataset value length must be divisible by stride.'));
      }
      if (!validDatasetSources.has(dataset.source)) {
        findings.push(finding('blocker', `result.datasets.${index}.source.invalid`, `Unsupported result dataset source: ${String(dataset.source)}.`));
      }

      const location = fieldLocations.get(dataset.fieldId);
      const valueCount = dataset.values.length / dataset.stride;
      if (location === 'surface_nodes' && valueCount !== nodeCount) {
        findings.push(finding('blocker', `result.datasets.${index}.surface-count-mismatch`, 'Surface-node dataset values must match visualization base node count.'));
      }
      if (location === 'outline_nodes' && valueCount !== outlineNodeCount) {
        findings.push(finding('blocker', `result.datasets.${index}.outline-count-mismatch`, 'Outline-node dataset values must match outline node count.'));
      }
      if (dataset.source === 'envelope' && dataset.values.length !== 1) {
        findings.push(finding('blocker', `result.datasets.${index}.envelope-count-invalid`, 'Envelope datasets must contain exactly one value.'));
      }
    }
  }

  if (Array.isArray(resultFields) && Array.isArray(steps) && Array.isArray(datasets) && Array.isArray(manifest.visualization.frames)) {
    const datasetKeys = new Set(datasets.map((dataset) => `${dataset.fieldId}:${dataset.stepId ?? ''}`));
    for (const [index, frame] of manifest.visualization.frames.entries()) {
      if (!fieldIds.has(frame.field)) {
        findings.push(finding('blocker', `result.frames.${index}.field-metadata-missing`, `Frame field ${frame.field} has no resultFields metadata.`));
      }
      const stepId = stepIdByIndex.get(frame.stageIndex ?? 0);
      if (stepId && !datasetKeys.has(`${frame.field}:${stepId}`)) {
        findings.push(finding('blocker', `result.frames.${index}.dataset-missing`, `Frame ${frame.field}/${stepId} has no matching dataset metadata.`));
      }
    }
  }
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

  const { domain, raft, excavation } = caseFile.geometry;
  const material = caseFile.materials[0];
  const load = caseFile.loads[0];

  if (caseFile.schemaVersion !== 'fem-analysis-case.v0') {
    findings.push(finding('blocker', 'schema.unsupported', 'Only fem-analysis-case.v0 is supported.'));
  }
  if (!caseFile.experimental) {
    findings.push(finding('blocker', 'mode.experimental-required', 'FEM cases must be explicitly marked experimental.'));
  }
  if (!['foundation_settlement', 'excavation_deformation'].includes(caseFile.objective)) {
    findings.push(finding('blocker', 'objective.unsupported', `Unsupported FEM objective: ${caseFile.objective}.`));
  }
  if (caseFile.objective === 'foundation_settlement' && caseFile.analysisType !== 'static_3d_small_strain') {
    findings.push(finding('blocker', 'analysis.unsupported', `Unsupported analysis type: ${caseFile.analysisType}.`));
  }
  if (caseFile.objective === 'excavation_deformation' && caseFile.analysisType !== 'static_3d_staged_elastic') {
    findings.push(finding('blocker', 'analysis.unsupported', `Unsupported analysis type: ${caseFile.analysisType}.`));
  }
  if (domain.lengthM <= 0 || domain.widthM <= 0 || domain.depthM <= 0) {
    findings.push(finding('blocker', 'geometry.domain-invalid', 'Domain dimensions must be positive.'));
  }
  if (caseFile.objective === 'foundation_settlement') {
    if (!raft) {
      findings.push(finding('blocker', 'geometry.raft-missing', 'Foundation-settlement cases require raft geometry.'));
    } else {
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
    }
  }
  if (caseFile.objective === 'excavation_deformation') {
    if (!excavation) {
      findings.push(finding('blocker', 'geometry.excavation-missing', 'Excavation-deformation cases require excavation geometry.'));
    } else {
      if (
        excavation.lengthM <= 0 ||
        excavation.widthM <= 0 ||
        excavation.finalDepthM <= 0 ||
        excavation.wallToeDepthM <= excavation.finalDepthM
      ) {
        findings.push(finding('blocker', 'geometry.excavation-invalid', 'Excavation dimensions and wall toe depth must be positive and physically ordered.'));
      }
      if (domain.lengthM < excavation.lengthM * 2.5 || domain.widthM < excavation.widthM * 2.5) {
        findings.push(finding(
          'review',
          'geometry.excavation-domain-small',
          'Domain is less than 2.5 excavation widths in plan; boundary influence should be reviewed.',
        ));
      }
      if (domain.depthM < excavation.wallToeDepthM * 1.35) {
        findings.push(finding(
          'review',
          'geometry.excavation-depth-shallow',
          'Domain depth is close to the wall toe; excavation influence depth should be reviewed.',
        ));
      }
      if (excavation.stages.length === 0) {
        findings.push(finding('blocker', 'stages.missing', 'Excavation cases require at least one construction stage.'));
      }
      let previousDepth = 0;
      for (const stage of excavation.stages) {
        if (!Number.isFinite(stage.depthM) || stage.depthM <= previousDepth || stage.depthM > excavation.finalDepthM) {
          findings.push(finding('blocker', 'stages.depth-invalid', 'Excavation stage depths must increase and stay within the final excavation depth.'));
          break;
        }
        if (stage.supportLevelM != null && (!Number.isFinite(stage.supportLevelM) || stage.supportLevelM < 0 || stage.supportLevelM > stage.depthM)) {
          findings.push(finding('blocker', 'stages.support-invalid', 'Support levels must be finite and no deeper than the active excavation stage.'));
          break;
        }
        previousDepth = stage.depthM;
      }
      if (previousDepth !== excavation.finalDepthM) {
        findings.push(finding('review', 'stages.final-depth-review', 'Last excavation stage does not exactly match the final depth; staging requires review.'));
      }
      findings.push(finding(
        'review',
        'excavation.design-excluded',
        'Excavation preview excludes retaining wall design, basal heave, seepage, consolidation, and nonlinear soil response.',
      ));
    }
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
    findings.push(finding('blocker', 'load.missing', caseFile.objective === 'foundation_settlement' ? 'A raft pressure load is required.' : 'An excavation surcharge/load assumption is required.'));
  } else if (!Number.isFinite(load.pressureKpa) || load.pressureKpa <= 0) {
    findings.push(finding('blocker', 'load.pressure-invalid', 'Uniform pressure must be positive.'));
  } else if (caseFile.objective === 'foundation_settlement' && load.target !== 'raft') {
    findings.push(finding('blocker', 'load.target-invalid', 'Foundation-settlement load must target the raft.'));
  } else if (caseFile.objective === 'excavation_deformation' && load.target !== 'excavation_surcharge') {
    findings.push(finding('blocker', 'load.target-invalid', 'Excavation-deformation load must target excavation_surcharge.'));
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

  if (Array.isArray(visualization.frames)) {
    for (const [index, frame] of visualization.frames.entries()) {
      pushFiniteArrayFindings(findings, `frames.${index}.disp`, frame.disp, 3);
      pushFiniteArrayFindings(findings, `frames.${index}.color`, frame.color, 3);
      if (frame.disp.length / 3 !== nodeCount) {
        findings.push(finding('blocker', `result.frames.${index}.disp.node-count-mismatch`, 'Frame displacement vectors must match base nodes.'));
      }
      if (frame.color.length / 3 !== nodeCount) {
        findings.push(finding('blocker', `result.frames.${index}.color.node-count-mismatch`, 'Frame color vectors must match base nodes.'));
      }
    }
  }

  validateOptionalResultMetadata(findings, manifest, nodeCount, outlineNodeCount);

  const caseValidation = validateFemAnalysisCase(manifest.analysisCase);
  findings.push(...caseValidation.findings);

  return summary(findings);
}
