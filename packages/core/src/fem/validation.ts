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

const FEM_WEBGL_UINT16_INDEX_LIMIT = 65_535;
const FEM_MAX_PREVIEW_MESH_NODES = FEM_WEBGL_UINT16_INDEX_LIMIT + 1;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pushFiniteNumberFinding(
  findings: FemValidationFinding[],
  value: unknown,
  code: string,
  label: string,
  options: {
    positive?: boolean;
    nonNegative?: boolean;
  } = {},
): value is number {
  if (!isFiniteNumber(value)) {
    findings.push(finding('blocker', `${code}.non-finite`, `${label} must be a finite number.`));
    return false;
  }
  if (options.positive && value <= 0) {
    findings.push(finding('blocker', `${code}.positive`, `${label} must be positive.`));
    return false;
  }
  if (options.nonNegative && value < 0) {
    findings.push(finding('blocker', `${code}.non-negative`, `${label} must be non-negative.`));
    return false;
  }
  return true;
}

function pushPositiveNumberFindings(
  findings: FemValidationFinding[],
  entries: Array<[unknown, string, string]>,
): void {
  for (const [value, code, label] of entries) {
    pushFiniteNumberFinding(findings, value, code, label, { positive: true });
  }
}

function arraysApproximatelyEqual(left: number[], right: number[], tolerance: number): boolean {
  return left.length === right.length && left.every((value, index) => Math.abs(value - right[index]) <= tolerance);
}

function isFemAnalysisCaseShape(value: unknown): value is FemAnalysisCase {
  if (!isRecord(value)) return false;
  const geometry = value.geometry;
  const mesh = value.mesh;
  const groundwater = value.groundwater;
  return (
    isRecord(geometry) &&
    isRecord(geometry.domain) &&
    (isRecord(geometry.raft) || isRecord(geometry.excavation) || isRecord(geometry.tunnel) || isRecord(geometry.consolidation)) &&
    isRecord(mesh) &&
    isRecord(groundwater) &&
    isRecord(value.units) &&
    Array.isArray(value.materials) &&
    Array.isArray(value.loads) &&
    Array.isArray(value.boundaryConditions) &&
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

function validateEvidenceRefs(
  findings: FemValidationFinding[],
  evidenceRefs: unknown,
  prefix: string,
): void {
  if (!Array.isArray(evidenceRefs)) {
    findings.push(finding('blocker', `${prefix}.evidence-refs-invalid`, 'Evidence refs must be an array.'));
    return;
  }
  const evidenceIds = new Set<string>();
  for (const [index, evidence] of evidenceRefs.entries()) {
    const itemPrefix = `${prefix}.evidenceRefs.${index}`;
    if (!isRecord(evidence)) {
      findings.push(finding('blocker', `${itemPrefix}.shape-invalid`, 'Evidence ref must be an object.'));
      continue;
    }
    pushUniqueStringFinding(findings, evidenceIds, evidence.id, `${itemPrefix}.id`, 'Evidence ref id');
    if (evidence.source != null && !isNonEmptyString(evidence.source)) {
      findings.push(finding('blocker', `${itemPrefix}.source.invalid`, 'Evidence ref source must be a non-empty string when present.'));
    }
    if (evidence.page != null && (typeof evidence.page !== 'number' || !Number.isInteger(evidence.page) || evidence.page < 1)) {
      findings.push(finding('blocker', `${itemPrefix}.page.invalid`, 'Evidence ref page must be an integer greater than or equal to 1 when present.'));
    }
    if (evidence.note != null && !isNonEmptyString(evidence.note)) {
      findings.push(finding('blocker', `${itemPrefix}.note.invalid`, 'Evidence ref note must be a non-empty string when present.'));
    }
  }
}

function validateAssumptions(
  findings: FemValidationFinding[],
  assumptions: unknown,
  prefix: string,
  options: { emitReviewFindings?: boolean } = {},
): void {
  if (!Array.isArray(assumptions)) {
    findings.push(finding('blocker', `${prefix}.assumptions-invalid`, 'Assumptions must be an array.'));
    return;
  }
  const validConfidence = new Set(['measured', 'inferred', 'review']);
  const assumptionIds = new Set<string>();
  for (const [index, assumption] of assumptions.entries()) {
    const itemPrefix = `${prefix}.assumptions.${index}`;
    if (!isRecord(assumption)) {
      findings.push(finding('blocker', `${itemPrefix}.shape-invalid`, 'Assumption must be an object.'));
      continue;
    }
    const id = pushUniqueStringFinding(findings, assumptionIds, assumption.id, `${itemPrefix}.id`, 'Assumption id');
    const parameter = isNonEmptyString(assumption.parameter) ? assumption.parameter : undefined;
    if (!parameter) {
      findings.push(finding('blocker', `${itemPrefix}.parameter.missing`, 'Assumption parameter must be a non-empty string.'));
    }
    if (
      !(typeof assumption.value === 'number' && Number.isFinite(assumption.value)) &&
      !isNonEmptyString(assumption.value)
    ) {
      findings.push(finding('blocker', `${itemPrefix}.value.invalid`, 'Assumption value must be a finite number or non-empty string.'));
    }
    if (assumption.unit != null && !isNonEmptyString(assumption.unit)) {
      findings.push(finding('blocker', `${itemPrefix}.unit.invalid`, 'Assumption unit must be a non-empty string when present.'));
    }
    if (!isNonEmptyString(assumption.basis)) {
      findings.push(finding('blocker', `${itemPrefix}.basis.missing`, 'Assumption basis must be a non-empty string.'));
    }
    if (!validConfidence.has(String(assumption.confidence))) {
      findings.push(finding('blocker', `${itemPrefix}.confidence.invalid`, `Unsupported assumption confidence: ${String(assumption.confidence)}.`));
    }
    if (typeof assumption.reviewRequired !== 'boolean') {
      findings.push(finding('blocker', `${itemPrefix}.review-required.invalid`, 'Assumption reviewRequired must be boolean.'));
    }
    if (options.emitReviewFindings && id && parameter && (assumption.reviewRequired === true || assumption.confidence === 'review')) {
      findings.push(finding(
        'review',
        `assumption.${id}`,
        `${parameter} is an engineering assumption requiring review.`,
      ));
    }
  }
}

function validateLimitations(
  findings: FemValidationFinding[],
  limitations: unknown,
  prefix: string,
): void {
  if (!Array.isArray(limitations)) {
    findings.push(finding('blocker', `${prefix}.limitations-invalid`, 'Limitations must be an array.'));
    return;
  }
  if (limitations.length === 0) {
    findings.push(finding('blocker', `${prefix}.limitations-missing`, 'Experimental FEM artifacts must include at least one limitation.'));
    return;
  }
  for (const [index, limitation] of limitations.entries()) {
    if (!isNonEmptyString(limitation)) {
      findings.push(finding('blocker', `${prefix}.limitations.${index}.missing`, 'Limitation entries must be non-empty strings.'));
    }
  }
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
  if (!Array.isArray(resultFields) || !Array.isArray(steps) || !Array.isArray(datasets)) {
    findings.push(finding(
      'blocker',
      'result.metadata.incomplete',
      'Result metadata must include resultFields, steps, and datasets together, or omit all three for legacy manifests.',
    ));
  }

  const validFieldLocations = new Set(['surface_nodes', 'outline_nodes', 'envelope']);
  const validFieldQuantities = new Set(['displacement', 'reaction', 'load', 'stage_count', 'pore_pressure', 'degree_of_consolidation', 'strength_ratio']);
  const validFieldComponents = new Set(['x', 'y', 'z', 'magnitude']);
  const validDatasetSources = new Set(['visualization.disp', 'visualization.frame', 'envelope']);
  const fieldIds = new Set<string>();
  const stepIds = new Set<string>();
  const stepIndexes = new Set<number>();
  const datasetIds = new Set<string>();
  const excavationStages = manifest.analysisCase.geometry.excavation?.stages ?? [];
  const excavationStageIds = new Set(excavationStages.map((stage) => stage.id));
  const excavationStageById = new Map(excavationStages.map((stage, index) => [stage.id, { stage, index }]));
  const stepIdByIndex = new Map<number, string>();
  const stepLabelByIndex = new Map<number, string>();
  const fieldLocations = new Map<string, string>();
  const fieldInfoById = new Map<string, NonNullable<FemResultManifest['resultFields']>[number]>();
  const frameByKey = new Map<string, NonNullable<FemResultManifest['visualization']['frames']>[number]>();
  const referencedFieldIds = new Set<string>();
  const referencedStepIds = new Set<string>();
  const envelopeValueByFieldId = new Map<string, number>([
    ['max_settlement', manifest.envelope.maxSettlementMm],
    ['min_settlement', manifest.envelope.minSettlementMm],
    ['total_load', manifest.envelope.totalLoadKn],
    ['reaction', manifest.envelope.reactionKn],
    ['reaction_balance_ratio', manifest.envelope.reactionBalanceRatio],
    ['max_surface_settlement', manifest.envelope.maxSurfaceSettlementMm],
    ['max_horizontal_displacement', manifest.envelope.maxHorizontalDisplacementMm],
    ['max_wall_deflection', manifest.envelope.maxWallDeflectionMm],
    ['max_basal_heave', manifest.envelope.maxBasalHeaveMm],
    ['total_excavated_weight', manifest.envelope.totalExcavatedWeightKn],
    ['support_reaction', manifest.envelope.supportReactionKn],
    ['boundary_reaction', manifest.envelope.boundaryReactionKn],
    ['stage_count', manifest.envelope.stageCount],
    ['final_settlement', manifest.envelope.finalSettlementMm],
    ['plastic_settlement', manifest.envelope.plasticSettlementMm],
    ['final_degree_of_consolidation', manifest.envelope.finalDegreeOfConsolidation],
    ['max_excess_pore_pressure', manifest.envelope.maxExcessPorePressureKpa],
    ['max_mobilized_strength_ratio', manifest.envelope.maxMobilizedStrengthRatio],
    ['drainage_path', manifest.envelope.drainagePathM],
    ['consolidation_duration', manifest.envelope.consolidationDurationYears],
    ['tunnel_diameter', manifest.envelope.tunnelDiameterM],
    ['tunnel_axis_depth', manifest.envelope.tunnelAxisDepthM],
    ['volume_loss', manifest.envelope.volumeLossPercent],
    ['trough_width', manifest.envelope.troughWidthM],
    ['influence_width', manifest.envelope.influenceWidthM],
    ['settlement_volume', manifest.envelope.settlementVolumeM3],
    ['settlement_volume_per_m', manifest.envelope.settlementVolumePerM],
  ].filter((entry): entry is [string, number] => isFiniteNumber(entry[1])));

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
      if (fieldInfo.component != null && !validFieldComponents.has(String(fieldInfo.component))) {
        findings.push(finding('blocker', `result.fields.${index}.component.invalid`, `Unsupported result field component: ${String(fieldInfo.component)}.`));
      }
      if (fieldInfo.location !== 'envelope' && fieldInfo.quantity !== 'displacement') {
        findings.push(finding('blocker', `result.fields.${index}.node-quantity-invalid`, 'Surface and outline node result fields must describe displacement quantities.'));
      }
      if (fieldInfo.location !== 'envelope' && fieldInfo.quantity === 'displacement' && fieldInfo.component == null) {
        findings.push(finding('blocker', `result.fields.${index}.component.missing`, 'Node displacement result fields must include a displacement component.'));
      }
      if (fieldInfo.quantity !== 'displacement' && fieldInfo.component != null) {
        findings.push(finding('blocker', `result.fields.${index}.component-unexpected`, 'Only displacement result fields may include a component.'));
      }
      if (fieldInfo.quantity === 'displacement' && fieldInfo.unit !== 'mm') {
        findings.push(finding('blocker', `result.fields.${index}.unit.displacement-invalid`, 'Displacement result fields must use mm units.'));
      }
      if ((fieldInfo.quantity === 'reaction' || fieldInfo.quantity === 'load') && fieldInfo.unit !== 'kN') {
        findings.push(finding('blocker', `result.fields.${index}.unit.force-invalid`, 'Reaction and load result fields must use kN units.'));
      }
      if (fieldInfo.quantity === 'stage_count' && fieldInfo.unit !== 'count') {
        findings.push(finding('blocker', `result.fields.${index}.unit.stage-count-invalid`, 'Stage count result fields must use count units.'));
      }
      if (fieldInfo.quantity === 'pore_pressure' && fieldInfo.unit !== 'kPa') {
        findings.push(finding('blocker', `result.fields.${index}.unit.pore-pressure-invalid`, 'Pore-pressure result fields must use kPa units.'));
      }
      if ((fieldInfo.quantity === 'degree_of_consolidation' || fieldInfo.quantity === 'strength_ratio') && fieldInfo.unit !== 'ratio') {
        findings.push(finding('blocker', `result.fields.${index}.unit.ratio-invalid`, 'Degree-of-consolidation and strength-ratio result fields must use ratio units.'));
      }
      if (fieldInfo.signConvention != null && !isNonEmptyString(fieldInfo.signConvention)) {
        findings.push(finding('blocker', `result.fields.${index}.sign-convention.invalid`, 'Result field sign convention must be a non-empty string when present.'));
      }
      if (id && fieldInfo.location === 'envelope' && !envelopeValueByFieldId.has(id)) {
        findings.push(finding('blocker', `result.fields.${index}.envelope-field-unmapped`, `Envelope result field ${id} must map to a known result envelope value.`));
      }
      if (id) {
        fieldLocations.set(id, fieldInfo.location);
        fieldInfoById.set(id, fieldInfo);
      }
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
        if (stepIndexes.has(step.index)) {
          findings.push(finding('blocker', `result.steps.${index}.index.duplicate`, `Result step index ${step.index} is duplicated.`));
        }
        stepIndexes.add(step.index);
        stepIdByIndex.set(step.index, id);
        stepLabelByIndex.set(step.index, step.label);
      }
      if (step.analysisStageId && !excavationStageIds.has(step.analysisStageId)) {
        findings.push(finding('blocker', `result.steps.${index}.stage-unknown`, `Result step references unknown excavation stage ${step.analysisStageId}.`));
      }
      if (step.depthM != null && (!Number.isFinite(step.depthM) || step.depthM < 0)) {
        findings.push(finding('blocker', `result.steps.${index}.depth-invalid`, 'Result step depth must be finite and non-negative when present.'));
      }
      if (manifest.analysisCase.objective === 'excavation_deformation') {
        if (!step.analysisStageId) {
          findings.push(finding('blocker', `result.steps.${index}.stage-required`, 'Excavation result steps must reference an analysis stage.'));
        } else {
          const stageInfo = excavationStageById.get(step.analysisStageId);
          if (stageInfo) {
            if (step.label !== stageInfo.stage.label) {
              findings.push(finding('blocker', `result.steps.${index}.stage-label-mismatch`, 'Excavation result step label must match the embedded analysis stage label.'));
            }
            if (step.depthM == null) {
              findings.push(finding('blocker', `result.steps.${index}.stage-depth-required`, 'Excavation result steps must carry the analysis stage depth.'));
            } else if (Number.isFinite(step.depthM) && !isApproxEqual(step.depthM, stageInfo.stage.depthM, 1e-6)) {
              findings.push(finding('blocker', `result.steps.${index}.stage-depth-mismatch`, 'Excavation result step depth must match the embedded analysis stage depth.'));
            }
            if (Number.isInteger(step.index) && step.index !== stageInfo.index) {
              findings.push(finding('blocker', `result.steps.${index}.stage-index-mismatch`, 'Excavation result step index must match the embedded analysis stage order.'));
            }
          }
        }
      } else {
        if (step.analysisStageId != null) {
          findings.push(finding('blocker', `result.steps.${index}.stage-unexpected`, 'Non-staged FEM result steps must not reference analysis stages.'));
        }
        if (step.depthM != null) {
          findings.push(finding('blocker', `result.steps.${index}.depth-unexpected`, 'Non-staged FEM result steps must not carry staged excavation depths.'));
        }
      }
    }
  }

  if (Array.isArray(manifest.visualization.frames)) {
    for (const frame of manifest.visualization.frames) {
      const stepId = stepIdByIndex.get(frame.stageIndex ?? 0);
      if (isNonEmptyString(frame.field) && stepId) {
        frameByKey.set(`${frame.field}:${stepId}`, frame);
      }
    }
  }

  if (Array.isArray(datasets)) {
    for (const [index, dataset] of datasets.entries()) {
      pushUniqueStringFinding(findings, datasetIds, dataset.id, `result.datasets.${index}.id`, 'Result dataset id');
      if (!fieldIds.has(dataset.fieldId)) {
        findings.push(finding('blocker', `result.datasets.${index}.field-unknown`, `Result dataset references unknown field ${String(dataset.fieldId)}.`));
      } else {
        referencedFieldIds.add(dataset.fieldId);
      }
      if (dataset.stepId != null && !stepIds.has(dataset.stepId)) {
        findings.push(finding('blocker', `result.datasets.${index}.step-unknown`, `Result dataset references unknown step ${String(dataset.stepId)}.`));
      } else if (dataset.stepId != null) {
        referencedStepIds.add(dataset.stepId);
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
      if ((dataset.source === 'visualization.disp' || dataset.source === 'visualization.frame') && dataset.stepId == null) {
        findings.push(finding('blocker', `result.datasets.${index}.step-required`, 'Visualization datasets must reference a result step.'));
      }
      if ((dataset.source === 'visualization.disp' || dataset.source === 'visualization.frame') && location === 'envelope') {
        findings.push(finding('blocker', `result.datasets.${index}.visualization-field-invalid`, 'Visualization datasets must reference surface or outline node result fields, not envelope fields.'));
      }
      if (dataset.source === 'envelope' && location !== 'envelope') {
        findings.push(finding('blocker', `result.datasets.${index}.envelope-field-invalid`, 'Envelope datasets must reference an envelope result field.'));
      }
      if (dataset.source === 'visualization.disp' && !arraysApproximatelyEqual(dataset.values, manifest.visualization.disp, 1e-12)) {
        findings.push(finding('blocker', `result.datasets.${index}.disp-values-mismatch`, 'Visualization displacement dataset values must match the manifest visualization displacement array.'));
      }
      if (dataset.source === 'visualization.frame' && dataset.stepId != null) {
        const frame = frameByKey.get(`${dataset.fieldId}:${dataset.stepId}`);
        if (!frame) {
          findings.push(finding('blocker', `result.datasets.${index}.frame-missing`, 'Visualization frame dataset has no matching frame payload.'));
        } else if (!arraysApproximatelyEqual(dataset.values, frame.disp, 1e-12)) {
          findings.push(finding('blocker', `result.datasets.${index}.frame-values-mismatch`, 'Visualization frame dataset values must match the referenced frame displacement array.'));
        }
      }
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
      if (dataset.source === 'envelope' && dataset.values.length === 1) {
        const expectedEnvelopeValue = envelopeValueByFieldId.get(dataset.fieldId);
        const fieldInfo = fieldInfoById.get(dataset.fieldId);
        if (!isFiniteNumber(expectedEnvelopeValue)) {
          findings.push(finding('blocker', `result.datasets.${index}.envelope-field-unmapped`, `Envelope dataset field ${dataset.fieldId} must map to a known result envelope value.`));
        } else if (!isApproxEqual(dataset.values[0], expectedEnvelopeValue, 1e-6)) {
          findings.push(finding('blocker', `result.datasets.${index}.envelope-values-mismatch`, `Envelope dataset ${fieldInfo?.label ?? dataset.fieldId} must match the result envelope value.`));
        }
      }
    }
  }

  if (Array.isArray(resultFields) && Array.isArray(datasets)) {
    for (const [index, fieldInfo] of resultFields.entries()) {
      if (isNonEmptyString(fieldInfo.id) && !referencedFieldIds.has(fieldInfo.id)) {
        findings.push(finding('blocker', `result.fields.${index}.dataset-missing`, `Result field ${fieldInfo.id} has no backing dataset metadata.`));
      }
    }
  }

  if (Array.isArray(steps) && Array.isArray(datasets)) {
    for (const [index, step] of steps.entries()) {
      if (isNonEmptyString(step.id) && !referencedStepIds.has(step.id)) {
        findings.push(finding('blocker', `result.steps.${index}.dataset-missing`, `Result step ${step.id} has no backing dataset metadata.`));
      }
    }
  }

  if (Array.isArray(resultFields) && Array.isArray(steps) && Array.isArray(datasets) && Array.isArray(manifest.visualization.frames)) {
    const datasetKeys = new Set(datasets.map((dataset) => `${dataset.fieldId}:${dataset.stepId ?? ''}`));
    for (const [index, frame] of manifest.visualization.frames.entries()) {
      const fieldInfo = fieldInfoById.get(frame.field);
      if (!fieldInfo) {
        findings.push(finding('blocker', `result.frames.${index}.field-metadata-missing`, `Frame field ${frame.field} has no resultFields metadata.`));
      } else if (isNonEmptyString(frame.fieldLabel) && frame.fieldLabel !== fieldInfo.label) {
        findings.push(finding('blocker', `result.frames.${index}.field-label-mismatch`, `Frame field label must match result field metadata for ${frame.field}.`));
      }
      const stepId = stepIdByIndex.get(frame.stageIndex ?? 0);
      if (!stepId) {
        findings.push(finding('blocker', `result.frames.${index}.stage-unknown`, 'Frame stage index must reference a known result step.'));
      } else if (!datasetKeys.has(`${frame.field}:${stepId}`)) {
        findings.push(finding('blocker', `result.frames.${index}.dataset-missing`, `Frame ${frame.field}/${stepId} has no matching dataset metadata.`));
      }
      const stepLabel = stepLabelByIndex.get(frame.stageIndex ?? 0);
      if (stepLabel && isNonEmptyString(frame.stageLabel) && frame.stageLabel !== stepLabel) {
        findings.push(finding('blocker', `result.frames.${index}.stage-label-mismatch`, 'Frame stage label must match result step metadata.'));
      }
    }
  }
}

function isFemResultManifestShape(value: unknown): value is FemResultManifest {
  if (!isRecord(value)) return false;
  const visualization = value.visualization;
  const envelope = value.envelope;
  const mesh = value.mesh;
  const backend = value.backend;
  const validation = value.validation;
  return (
    isFemAnalysisCaseShape(value.analysisCase) &&
    isRecord(backend) &&
    isRecord(validation) &&
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

  const { domain, raft, excavation, tunnel, consolidation } = caseFile.geometry;

  if (caseFile.schemaVersion !== 'fem-analysis-case.v0') {
    findings.push(finding('blocker', 'schema.unsupported', 'Only fem-analysis-case.v0 is supported.'));
  }
  if (!isNonEmptyString(caseFile.caseId)) {
    findings.push(finding('blocker', 'case-id.missing', 'FEM analysis case id must be a non-empty string.'));
  }
  if (!isNonEmptyString(caseFile.title)) {
    findings.push(finding('blocker', 'title.missing', 'FEM analysis case title must be a non-empty string.'));
  }
  if (!isNonEmptyString(caseFile.createdBy)) {
    findings.push(finding('blocker', 'created-by.missing', 'FEM analysis case creator must be a non-empty string.'));
  }
  if (!isNonEmptyString(caseFile.createdAt) || Number.isNaN(Date.parse(caseFile.createdAt))) {
    findings.push(finding('blocker', 'created-at.invalid', 'FEM analysis case createdAt must be an ISO-compatible timestamp.'));
  }
  if (!caseFile.experimental) {
    findings.push(finding('blocker', 'mode.experimental-required', 'FEM cases must be explicitly marked experimental.'));
  }
  if (!['foundation_settlement', 'excavation_deformation', 'tunnel_volume_loss_settlement', 'staged_settlement_consolidation'].includes(caseFile.objective)) {
    findings.push(finding('blocker', 'objective.unsupported', `Unsupported FEM objective: ${caseFile.objective}.`));
  }
  if (caseFile.objective === 'foundation_settlement' && caseFile.analysisType !== 'static_3d_small_strain') {
    findings.push(finding('blocker', 'analysis.unsupported', `Unsupported analysis type: ${caseFile.analysisType}.`));
  }
  if (caseFile.objective === 'excavation_deformation' && caseFile.analysisType !== 'static_3d_staged_elastic') {
    findings.push(finding('blocker', 'analysis.unsupported', `Unsupported analysis type: ${caseFile.analysisType}.`));
  }
  if (caseFile.objective === 'tunnel_volume_loss_settlement' && caseFile.analysisType !== 'empirical_3d_settlement_surface') {
    findings.push(finding('blocker', 'analysis.unsupported', `Unsupported analysis type: ${caseFile.analysisType}.`));
  }
  if (caseFile.objective === 'staged_settlement_consolidation' && caseFile.analysisType !== 'time_dependent_1d_consolidation') {
    findings.push(finding('blocker', 'analysis.unsupported', `Unsupported analysis type: ${caseFile.analysisType}.`));
  }
  if (caseFile.geometry.domain.type !== 'box') {
    findings.push(finding('blocker', 'geometry.domain.type-invalid', `Unsupported domain type: ${String(caseFile.geometry.domain.type)}.`));
  }
  if (
    caseFile.units.length !== 'm' ||
    caseFile.units.force !== 'kN' ||
    caseFile.units.stress !== 'kPa' ||
    caseFile.units.density !== 'kN/m3' ||
    caseFile.units.displacement !== 'mm'
  ) {
    findings.push(finding('blocker', 'units.unsupported', 'FEM cases must use m, kN, kPa, kN/m3, and mm units. Values must be converted before preview execution.'));
  }
  pushPositiveNumberFindings(findings, [
    [domain.lengthM, 'geometry.domain.length', 'Domain length'],
    [domain.widthM, 'geometry.domain.width', 'Domain width'],
    [domain.depthM, 'geometry.domain.depth', 'Domain depth'],
  ]);
  if (domain.lengthM <= 0 || domain.widthM <= 0 || domain.depthM <= 0) {
    findings.push(finding('blocker', 'geometry.domain-invalid', 'Domain dimensions must be positive.'));
  }
  if (caseFile.objective === 'foundation_settlement') {
    if (!raft) {
      findings.push(finding('blocker', 'geometry.raft-missing', 'Foundation-settlement cases require raft geometry.'));
    } else {
      if (raft.type !== 'raft') {
        findings.push(finding('blocker', 'geometry.raft.type-invalid', `Unsupported raft geometry type: ${String(raft.type)}.`));
      }
      pushPositiveNumberFindings(findings, [
        [raft.lengthM, 'geometry.raft.length', 'Raft length'],
        [raft.widthM, 'geometry.raft.width', 'Raft width'],
        [raft.thicknessM, 'geometry.raft.thickness', 'Raft thickness'],
      ]);
      pushFiniteNumberFinding(findings, raft.centerXM, 'geometry.raft.center-x', 'Raft center X');
      pushFiniteNumberFinding(findings, raft.centerYM, 'geometry.raft.center-y', 'Raft center Y');
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
      if (excavation.type !== 'braced_excavation') {
        findings.push(finding('blocker', 'geometry.excavation.type-invalid', `Unsupported excavation geometry type: ${String(excavation.type)}.`));
      }
      pushPositiveNumberFindings(findings, [
        [excavation.lengthM, 'geometry.excavation.length', 'Excavation length'],
        [excavation.widthM, 'geometry.excavation.width', 'Excavation width'],
        [excavation.finalDepthM, 'geometry.excavation.final-depth', 'Excavation final depth'],
        [excavation.wallToeDepthM, 'geometry.excavation.wall-toe-depth', 'Excavation wall toe depth'],
      ]);
      pushFiniteNumberFinding(findings, excavation.centerXM, 'geometry.excavation.center-x', 'Excavation center X');
      pushFiniteNumberFinding(findings, excavation.centerYM, 'geometry.excavation.center-y', 'Excavation center Y');
      if (!['diaphragm_wall', 'secant_pile_wall', 'soldier_pile_lagging', 'unsupported_screening'].includes(excavation.wallType)) {
        findings.push(finding('blocker', 'geometry.excavation.wall-type-invalid', `Unsupported excavation wall type: ${String(excavation.wallType)}.`));
      }
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
      const stageIds = new Set<string>();
      for (const [index, stage] of excavation.stages.entries()) {
        pushUniqueStringFinding(findings, stageIds, stage.id, `stages.${index}.id`, 'Excavation stage id');
        if (!isNonEmptyString(stage.label)) {
          findings.push(finding('blocker', `stages.${index}.label.missing`, 'Excavation stage label must be a non-empty string.'));
        }
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
  if (caseFile.objective === 'tunnel_volume_loss_settlement') {
    if (!tunnel) {
      findings.push(finding('blocker', 'geometry.tunnel-missing', 'Tunnel volume-loss settlement cases require tunnel geometry.'));
    } else {
      if (tunnel.type !== 'tunnel') {
        findings.push(finding('blocker', 'geometry.tunnel.type-invalid', `Unsupported tunnel geometry type: ${String(tunnel.type)}.`));
      }
      pushPositiveNumberFindings(findings, [
        [tunnel.diameterM, 'geometry.tunnel.diameter', 'Tunnel diameter'],
        [tunnel.axisDepthM, 'geometry.tunnel.axis-depth', 'Tunnel axis depth'],
        [tunnel.lengthM, 'geometry.tunnel.length', 'Tunnel length'],
        [tunnel.volumeLossPercent, 'geometry.tunnel.volume-loss', 'Tunnel volume loss'],
        [tunnel.troughWidthParameterK, 'geometry.tunnel.trough-width-factor', 'Tunnel trough-width factor'],
      ]);
      pushFiniteNumberFinding(findings, tunnel.centerXM, 'geometry.tunnel.center-x', 'Tunnel center X');
      pushFiniteNumberFinding(findings, tunnel.centerYM, 'geometry.tunnel.center-y', 'Tunnel center Y');
      if (
        tunnel.diameterM <= 0 ||
        tunnel.axisDepthM <= 0 ||
        tunnel.lengthM <= 0 ||
        tunnel.volumeLossPercent <= 0 ||
        tunnel.troughWidthParameterK <= 0
      ) {
        findings.push(finding('blocker', 'geometry.tunnel-invalid', 'Tunnel diameter, depth, length, volume loss, and trough-width factor must be positive.'));
      }
      if (tunnel.axisDepthM <= tunnel.diameterM / 2) {
        findings.push(finding('blocker', 'geometry.tunnel-cover-invalid', 'Tunnel axis depth must exceed the tunnel radius.'));
      }
      const troughWidthM = tunnel.axisDepthM * tunnel.troughWidthParameterK;
      if (domain.widthM < Math.max(tunnel.diameterM * 5, troughWidthM * 5)) {
        findings.push(finding(
          'review',
          'geometry.tunnel-domain-narrow',
          'Domain width may truncate the tunnel settlement trough; influence width should be reviewed.',
        ));
      }
      if (domain.lengthM < tunnel.lengthM * 1.15) {
        findings.push(finding(
          'review',
          'geometry.tunnel-domain-short',
          'Domain length is close to the modelled tunnel length; end effects and alignment extents should be reviewed.',
        ));
      }
      if (domain.depthM < tunnel.axisDepthM + tunnel.diameterM) {
        findings.push(finding(
          'review',
          'geometry.tunnel-depth-shallow',
          'Domain depth is close to the tunnel invert; subsurface influence depth should be reviewed.',
        ));
      }
      if (tunnel.volumeLossPercent > 3) {
        findings.push(finding(
          'review',
          'tunnel.volume-loss-high',
          'Tunnel volume loss exceeds 3%; this assumption should be justified from project evidence or sensitivity checks.',
        ));
      }
      findings.push(finding(
        'review',
        'tunnel.empirical-preview',
        'Tunnel preview uses an empirical Gaussian settlement surface from prescribed volume loss; it is not a tunnel lining, face-stability, or coupled FEM solver.',
      ));
    }
  }
  if (caseFile.objective === 'staged_settlement_consolidation') {
    if (!consolidation) {
      findings.push(finding('blocker', 'geometry.consolidation-missing', 'Staged settlement/consolidation cases require soil-column consolidation geometry.'));
    } else {
      if (consolidation.type !== 'soil_column') {
        findings.push(finding('blocker', 'geometry.consolidation.type-invalid', `Unsupported consolidation geometry type: ${String(consolidation.type)}.`));
      }
      pushPositiveNumberFindings(findings, [
        [consolidation.layerThicknessM, 'geometry.consolidation.layer-thickness', 'Consolidation layer thickness'],
        [consolidation.surfaceAreaM2, 'geometry.consolidation.surface-area', 'Consolidation tributary surface area'],
      ]);
      if (consolidation.drainage !== 'single' && consolidation.drainage !== 'double') {
        findings.push(finding('blocker', 'geometry.consolidation.drainage-invalid', `Unsupported consolidation drainage condition: ${String(consolidation.drainage)}.`));
      }
      if (domain.depthM < consolidation.layerThicknessM) {
        findings.push(finding('review', 'geometry.consolidation-depth-review', 'Domain depth is shallower than the consolidation layer thickness; 1D column extent requires review.'));
      }
      if (consolidation.stages.length === 0) {
        findings.push(finding('blocker', 'consolidation.stages.missing', 'Staged consolidation cases require at least one load-duration stage.'));
      }
      const stageIds = new Set<string>();
      for (const [index, stage] of consolidation.stages.entries()) {
        pushUniqueStringFinding(findings, stageIds, stage.id, `consolidation.stages.${index}.id`, 'Consolidation stage id');
        if (!isNonEmptyString(stage.label)) {
          findings.push(finding('blocker', `consolidation.stages.${index}.label.missing`, 'Consolidation stage label must be a non-empty string.'));
        }
        pushFiniteNumberFinding(findings, stage.loadKpa, `consolidation.stages.${index}.load`, 'Consolidation stage load', { positive: true });
        pushFiniteNumberFinding(findings, stage.durationYears, `consolidation.stages.${index}.duration`, 'Consolidation stage duration', { positive: true });
      }
      findings.push(finding(
        'review',
        'consolidation.1d-preview',
        'Staged consolidation preview uses a 1D Terzaghi column and Mohr-Coulomb material-point review gate; it is not a full 2D/3D coupled FEM consolidation solver.',
      ));
    }
  }
  if (caseFile.materials.length === 0) {
    findings.push(finding('blocker', 'material.missing', 'At least one material is required.'));
  } else {
    const materialIds = new Set<string>();
    for (const [index, material] of caseFile.materials.entries()) {
      const prefix = index === 0 ? 'material' : `material.${index}`;
      if (!isRecord(material)) {
        findings.push(finding('blocker', `${prefix}.shape-invalid`, 'Material must be an object.'));
        continue;
      }
      pushUniqueStringFinding(findings, materialIds, material.id, `${prefix}.id`, 'Material id');
      if (!isNonEmptyString(material.name)) {
        findings.push(finding('blocker', `${prefix}.name.missing`, 'Material name must be a non-empty string.'));
      }
      if (material.model !== 'linear_elastic' && material.model !== 'mohr_coulomb') {
        findings.push(finding('blocker', `${prefix}.unsupported`, `Unsupported material model: ${String(material.model)}.`));
      }
      if (!Number.isFinite(material.elasticModulusKpa) || material.elasticModulusKpa <= 0) {
        findings.push(finding('blocker', `${prefix}.elastic-modulus-invalid`, 'Elastic modulus must be positive.'));
      }
      if (!Number.isFinite(material.poissonRatio) || material.poissonRatio <= 0 || material.poissonRatio >= 0.5) {
        findings.push(finding('blocker', `${prefix}.poisson-invalid`, 'Poisson ratio must be between 0 and 0.5.'));
      }
      if (!Number.isFinite(material.unitWeightKnM3) || material.unitWeightKnM3 <= 0) {
        findings.push(finding('blocker', `${prefix}.unit-weight-invalid`, 'Unit weight must be positive.'));
      }
      if (caseFile.objective === 'staged_settlement_consolidation') {
        if (material.model !== 'mohr_coulomb') {
          findings.push(finding('blocker', `${prefix}.consolidation-model-required`, 'Staged consolidation preview requires a mohr_coulomb material with consolidation parameters.'));
        }
        pushFiniteNumberFinding(findings, material.constrainedModulusKpa, `${prefix}.constrained-modulus`, 'Constrained modulus', { positive: true });
        pushFiniteNumberFinding(findings, material.coefficientOfConsolidationM2PerYear, `${prefix}.cv`, 'Coefficient of consolidation', { positive: true });
        const frictionAngleDeg = material.frictionAngleDeg;
        if (!Number.isFinite(frictionAngleDeg) || frictionAngleDeg == null || frictionAngleDeg <= 0 || frictionAngleDeg >= 50) {
          findings.push(finding('blocker', `${prefix}.friction-angle-invalid`, 'Mohr-Coulomb friction angle must be finite and between 0 and 50 degrees.'));
        }
        pushFiniteNumberFinding(findings, material.cohesionKpa, `${prefix}.cohesion`, 'Mohr-Coulomb cohesion', { nonNegative: true });
        if (material.hydraulicConductivityMPerS != null) {
          pushFiniteNumberFinding(findings, material.hydraulicConductivityMPerS, `${prefix}.hydraulic-conductivity`, 'Hydraulic conductivity', { positive: true });
        }
      }
      validateEvidenceRefs(findings, material.evidenceRefs, prefix);
      validateAssumptions(findings, material.assumptions, prefix);
    }
  }
  if (caseFile.objective === 'tunnel_volume_loss_settlement' && caseFile.loads.length > 0) {
    findings.push(finding('blocker', 'load.unsupported-for-objective', 'Tunnel volume-loss settlement previews use explicit volume loss and must not include pressure loads.'));
  }
  if (caseFile.loads.length === 0) {
    if (caseFile.objective === 'foundation_settlement') {
      findings.push(finding('blocker', 'load.missing', 'A raft pressure load is required.'));
    } else if (caseFile.objective === 'excavation_deformation') {
      findings.push(finding('blocker', 'load.missing', 'An excavation surcharge/load assumption is required.'));
    } else if (caseFile.objective === 'staged_settlement_consolidation') {
      findings.push(finding('blocker', 'load.missing', 'Staged consolidation previews require ground-surface pressure loads matching the staged load history.'));
    }
  } else {
    const loadIds = new Set<string>();
    for (const [index, load] of caseFile.loads.entries()) {
      const prefix = index === 0 ? 'load' : `load.${index}`;
      if (!isRecord(load)) {
        findings.push(finding('blocker', `${prefix}.shape-invalid`, 'Load must be an object.'));
        continue;
      }
      pushUniqueStringFinding(findings, loadIds, load.id, `${prefix}.id`, 'Load id');
      if (load.type !== 'uniform_pressure') {
        findings.push(finding('blocker', `${prefix}.type-invalid`, `Unsupported load type: ${String(load.type)}.`));
      }
      if (!Number.isFinite(load.pressureKpa) || load.pressureKpa <= 0) {
        findings.push(finding('blocker', `${prefix}.pressure-invalid`, 'Uniform pressure must be positive.'));
      }
      if (caseFile.objective === 'foundation_settlement' && load.target !== 'raft') {
        findings.push(finding('blocker', `${prefix}.target-invalid`, 'Foundation-settlement load must target the raft.'));
      }
      if (caseFile.objective === 'excavation_deformation' && load.target !== 'excavation_surcharge') {
        findings.push(finding('blocker', `${prefix}.target-invalid`, 'Excavation-deformation load must target excavation_surcharge.'));
      }
      if (caseFile.objective === 'staged_settlement_consolidation' && load.target !== 'ground_surface') {
        findings.push(finding('blocker', `${prefix}.target-invalid`, 'Staged consolidation loads must target ground_surface.'));
      }
      if (caseFile.objective === 'staged_settlement_consolidation' && consolidation) {
        if (caseFile.loads.length !== consolidation.stages.length) {
          findings.push(finding('blocker', 'load.stage-count-mismatch', 'Staged consolidation load count must match the consolidation stage count.'));
        }
        const stage = consolidation.stages[index];
        if (stage && isFiniteNumber(load.pressureKpa) && !isApproxEqual(load.pressureKpa, stage.loadKpa, 1e-6)) {
          findings.push(finding('blocker', `${prefix}.stage-load-mismatch`, 'Staged consolidation load pressure must match the corresponding consolidation stage load.'));
        }
      }
      validateEvidenceRefs(findings, load.evidenceRefs, prefix);
      validateAssumptions(findings, load.assumptions, prefix);
    }
  }

  const { divisionsX, divisionsY, divisionsZ } = caseFile.mesh;
  if (caseFile.mesh.elementType !== 'hex8') {
    findings.push(finding('blocker', 'mesh.element-type-invalid', `Unsupported mesh element type: ${String(caseFile.mesh.elementType)}.`));
  }
  if (
    !Number.isInteger(divisionsX) ||
    !Number.isInteger(divisionsY) ||
    !Number.isInteger(divisionsZ)
  ) {
    findings.push(finding('blocker', 'mesh.divisions-integer', 'Mesh divisions must be finite integers.'));
  }
  if (divisionsX < 2 || divisionsY < 2 || divisionsZ < 1) {
    findings.push(finding('blocker', 'mesh.too-coarse', 'Mesh divisions must be at least 2 x 2 x 1.'));
  }
  if (Number.isInteger(divisionsX) && Number.isInteger(divisionsY) && Number.isInteger(divisionsZ)) {
    const nodeCount = (divisionsX + 1) * (divisionsY + 1) * (divisionsZ + 1);
    if (!Number.isFinite(nodeCount) || nodeCount > FEM_MAX_PREVIEW_MESH_NODES) {
      findings.push(finding(
        'blocker',
        'mesh.preview-node-limit',
        `Experimental FEM/WebGL previews are capped at ${FEM_MAX_PREVIEW_MESH_NODES} nodes.`,
      ));
    }
  }
  if (caseFile.boundaryConditions.length === 0) {
    findings.push(finding('blocker', 'boundary.missing', 'At least one boundary condition is required.'));
  } else {
    const boundaryIds = new Set<string>();
    let hasFixedBase = false;
    let hasSideRollers = false;
    for (const [index, boundary] of caseFile.boundaryConditions.entries()) {
      const prefix = index === 0 ? 'boundary' : `boundary.${index}`;
      if (!isRecord(boundary)) {
        findings.push(finding('blocker', `${prefix}.shape-invalid`, 'Boundary condition must be an object.'));
        continue;
      }
      pushUniqueStringFinding(findings, boundaryIds, boundary.id, `${prefix}.id`, 'Boundary condition id');
      if (boundary.type === 'fixed_base') hasFixedBase = true;
      if (boundary.type === 'side_rollers') hasSideRollers = true;
      if (boundary.type !== 'fixed_base' && boundary.type !== 'side_rollers') {
        findings.push(finding('blocker', `${prefix}.type-invalid`, `Unsupported boundary condition type: ${String(boundary.type)}.`));
      }
      if (!isNonEmptyString(boundary.description)) {
        findings.push(finding('blocker', `${prefix}.description.missing`, 'Boundary condition description must be a non-empty string.'));
      }
    }
    if (!hasFixedBase) {
      findings.push(finding('blocker', 'boundary.fixed-base-missing', 'FEM preview cases require a fixed-base boundary condition.'));
    }
    if (!hasSideRollers) {
      findings.push(finding('blocker', 'boundary.side-rollers-missing', 'FEM preview cases require side-roller boundary conditions.'));
    }
  }
  if (!['not_modelled', 'below_domain', 'specified'].includes(caseFile.groundwater.condition)) {
    findings.push(finding('blocker', 'groundwater.condition-invalid', `Unsupported groundwater condition: ${String(caseFile.groundwater.condition)}.`));
  }
  if (!isNonEmptyString(caseFile.groundwater.note)) {
    findings.push(finding('blocker', 'groundwater.note.missing', 'Groundwater note must be a non-empty string.'));
  }
  if (typeof caseFile.groundwater.reviewRequired !== 'boolean') {
    findings.push(finding('blocker', 'groundwater.review-required.invalid', 'Groundwater reviewRequired must be boolean.'));
  }
  if (caseFile.groundwater.depthM != null) {
    pushFiniteNumberFinding(findings, caseFile.groundwater.depthM, 'groundwater.depth', 'Groundwater depth', { nonNegative: true });
  }
  if (caseFile.groundwater.condition === 'specified' && caseFile.groundwater.depthM == null) {
    findings.push(finding('blocker', 'groundwater.depth-required', 'Specified groundwater conditions require a groundwater depth.'));
  }
  if (caseFile.groundwater.condition === 'specified' && caseFile.groundwater.depthM != null && caseFile.groundwater.depthM > domain.depthM) {
    findings.push(finding('blocker', 'groundwater.depth-outside-domain', 'Specified groundwater depth must fall within the model domain. Use below_domain for deeper groundwater.'));
  }
  if (caseFile.groundwater.condition === 'below_domain' && caseFile.groundwater.depthM != null && caseFile.groundwater.depthM <= domain.depthM) {
    findings.push(finding('blocker', 'groundwater.below-domain-depth-invalid', 'Below-domain groundwater depth must be deeper than the model domain when supplied.'));
  }
  if (caseFile.groundwater.condition === 'not_modelled' && caseFile.groundwater.depthM != null) {
    findings.push(finding('blocker', 'groundwater.depth-unused', 'Do not provide groundwater depth when groundwater is not modelled.'));
  }
  if (caseFile.groundwater.reviewRequired) {
    findings.push(finding('review', 'groundwater.review-required', caseFile.groundwater.note));
  }
  validateAssumptions(findings, caseFile.assumptions, 'case', { emitReviewFindings: true });
  validateEvidenceRefs(findings, caseFile.evidenceRefs, 'case');
  validateLimitations(findings, caseFile.limitations, 'case');

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
    if (value > FEM_WEBGL_UINT16_INDEX_LIMIT) {
      findings.push(finding(
        'blocker',
        `result.${name}.webgl-index-limit`,
        `${name} references node index ${value}, above the WebGL 1 unsigned-short index limit.`,
      ));
      return;
    }
  }
}

function validateEmbeddedValidationSummary(
  findings: FemValidationFinding[],
  manifestValidation: FemResultManifest['validation'],
  caseValidation: FemValidationSummary,
): void {
  if (!isRecord(manifestValidation)) {
    findings.push(finding('blocker', 'result.validation.shape-invalid', 'Embedded validation summary must be an object.'));
    return;
  }
  if (!['ready', 'review', 'blocked'].includes(manifestValidation.status)) {
    findings.push(finding('blocker', 'result.validation.status-invalid', `Unsupported embedded validation status: ${String(manifestValidation.status)}.`));
  }
  if (!Number.isInteger(manifestValidation.blockers) || manifestValidation.blockers < 0) {
    findings.push(finding('blocker', 'result.validation.blockers-invalid', 'Embedded validation blocker count must be a non-negative integer.'));
  }
  if (!Number.isInteger(manifestValidation.reviewItems) || manifestValidation.reviewItems < 0) {
    findings.push(finding('blocker', 'result.validation.review-items-invalid', 'Embedded validation review item count must be a non-negative integer.'));
  }
  if (!Array.isArray(manifestValidation.findings)) {
    findings.push(finding('blocker', 'result.validation.findings-invalid', 'Embedded validation findings must be an array.'));
    return;
  }
  if (manifestValidation.status !== caseValidation.status) {
    findings.push(finding('blocker', 'result.validation.status-mismatch', 'Embedded validation status must match the embedded analysis-case validation.'));
  }
  if (manifestValidation.blockers !== caseValidation.blockers) {
    findings.push(finding('blocker', 'result.validation.blockers-mismatch', 'Embedded validation blocker count must match the embedded analysis-case validation.'));
  }
  if (manifestValidation.reviewItems !== caseValidation.reviewItems) {
    findings.push(finding('blocker', 'result.validation.review-items-mismatch', 'Embedded validation review item count must match the embedded analysis-case validation.'));
  }
  const manifestCodes = manifestValidation.findings.map((item) => isRecord(item) ? String(item.code) : '');
  const caseCodes = caseValidation.findings.map((item) => item.code);
  if (
    manifestCodes.length !== caseCodes.length ||
    manifestCodes.some((code, index) => code !== caseCodes[index])
  ) {
    findings.push(finding('blocker', 'result.validation.findings-mismatch', 'Embedded validation finding codes must match the embedded analysis-case validation.'));
  }
}

function isApproxEqual(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function pushApproximateMatchFinding(
  findings: FemValidationFinding[],
  actual: unknown,
  expected: number,
  code: string,
  label: string,
  tolerance: number,
): void {
  if (!isFiniteNumber(actual) || !Number.isFinite(expected)) return;
  if (!isApproxEqual(actual, expected, tolerance)) {
    findings.push(finding(
      'blocker',
      code,
      `${label} must match the embedded FEM analysis case within ${tolerance}.`,
    ));
  }
}

function validateResultEnvelopeSemantics(
  findings: FemValidationFinding[],
  manifest: FemResultManifest,
): void {
  const { envelope, analysisCase } = manifest;
  const maxSettlementOk = pushFiniteNumberFinding(findings, envelope.maxSettlementMm, 'result.envelope.max-settlement', 'Envelope max settlement', { nonNegative: true });
  const minSettlementOk = pushFiniteNumberFinding(findings, envelope.minSettlementMm, 'result.envelope.min-settlement', 'Envelope min settlement', { nonNegative: true });
  pushFiniteNumberFinding(findings, envelope.totalLoadKn, 'result.envelope.total-load', 'Envelope total load', { nonNegative: true });
  pushFiniteNumberFinding(findings, envelope.reactionKn, 'result.envelope.reaction', 'Envelope reaction', { nonNegative: true });
  pushFiniteNumberFinding(findings, envelope.reactionBalanceRatio, 'result.envelope.reaction-balance-ratio', 'Envelope reaction balance ratio', { positive: true });

  if (maxSettlementOk && minSettlementOk && envelope.minSettlementMm > envelope.maxSettlementMm) {
    findings.push(finding('blocker', 'result.envelope.settlement-range-invalid', 'Envelope minimum settlement cannot exceed maximum settlement.'));
  }

  const expectedBackendByObjective = new Map([
    ['foundation_settlement', ['builtin-elastic3d-demo']],
    ['excavation_deformation', ['builtin-staged-excavation-demo']],
    ['tunnel_volume_loss_settlement', ['builtin-tunnel-volume-loss-demo']],
    ['staged_settlement_consolidation', ['builtin-staged-consolidation-1d', 'builtin-nonlinear-column-v0']],
  ]);
  const expectedBackends = expectedBackendByObjective.get(analysisCase.objective);
  if (expectedBackends && !expectedBackends.includes(manifest.backend.id)) {
    findings.push(finding('blocker', 'result.backend.objective-mismatch', 'Result backend must match the embedded FEM objective.'));
  }

  if (analysisCase.objective === 'foundation_settlement') {
    const raft = analysisCase.geometry.raft;
    if (!raft) return;
    const totalLoadKn = analysisCase.loads
      .filter((load) => load.target === 'raft')
      .reduce((total, load) => total + load.pressureKpa * raft.lengthM * raft.widthM, 0);
    const tolerance = Math.max(0.01, Math.abs(totalLoadKn) * 0.0001);
    pushApproximateMatchFinding(findings, envelope.totalLoadKn, totalLoadKn, 'result.envelope.foundation-total-load-mismatch', 'Foundation total load', tolerance);
    pushApproximateMatchFinding(findings, envelope.reactionKn, totalLoadKn, 'result.envelope.foundation-reaction-mismatch', 'Foundation reaction', tolerance);
    if (envelope.maxSurfaceSettlementMm != null) {
      findings.push(finding('blocker', 'result.envelope.foundation-extra-surface-settlement', 'Foundation result envelopes must not expose excavation/tunnel surface-settlement fields.'));
    }
    if (envelope.stageCount != null) {
      findings.push(finding('blocker', 'result.envelope.foundation-extra-stage-count', 'Foundation result envelopes must not expose staged-excavation fields.'));
    }
    return;
  }

  if (analysisCase.objective === 'excavation_deformation') {
    const excavation = analysisCase.geometry.excavation;
    const upperMaterial = analysisCase.materials[0];
    if (!excavation || !upperMaterial) return;
    const expectedWeightKn = excavation.lengthM * excavation.widthM * excavation.finalDepthM * upperMaterial.unitWeightKnM3;
    const expectedWeightTolerance = Math.max(0.01, Math.abs(expectedWeightKn) * 0.0001);
    const maxSurfaceSettlementMm = envelope.maxSurfaceSettlementMm;
    const maxSurfaceOk = pushFiniteNumberFinding(findings, maxSurfaceSettlementMm, 'result.envelope.max-surface-settlement', 'Envelope max surface settlement', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.maxHorizontalDisplacementMm, 'result.envelope.max-horizontal-displacement', 'Envelope max horizontal displacement', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.maxWallDeflectionMm, 'result.envelope.max-wall-deflection', 'Envelope max wall deflection', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.maxBasalHeaveMm, 'result.envelope.max-basal-heave', 'Envelope max basal heave', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.totalExcavatedWeightKn, 'result.envelope.total-excavated-weight', 'Envelope total excavated weight', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.supportReactionKn, 'result.envelope.support-reaction', 'Envelope support reaction', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.boundaryReactionKn, 'result.envelope.boundary-reaction', 'Envelope boundary reaction', { nonNegative: true });
    const stageCountOk = pushFiniteNumberFinding(findings, envelope.stageCount, 'result.envelope.stage-count', 'Envelope stage count', { positive: true });
    if (stageCountOk && !Number.isInteger(envelope.stageCount)) {
      findings.push(finding('blocker', 'result.envelope.excavation-stage-count-integer', 'Excavation stage count must be an integer.'));
    }
    if (stageCountOk && envelope.stageCount !== excavation.stages.length) {
      findings.push(finding('blocker', 'result.envelope.excavation-stage-count-mismatch', 'Excavation envelope stage count must match the embedded construction stages.'));
    }
    pushApproximateMatchFinding(findings, envelope.totalExcavatedWeightKn, expectedWeightKn, 'result.envelope.excavation-weight-mismatch', 'Excavation total excavated weight', expectedWeightTolerance);
    pushApproximateMatchFinding(findings, envelope.totalLoadKn, expectedWeightKn, 'result.envelope.excavation-total-load-mismatch', 'Excavation total load', expectedWeightTolerance);
    pushApproximateMatchFinding(findings, envelope.reactionKn, expectedWeightKn, 'result.envelope.excavation-reaction-mismatch', 'Excavation reaction', expectedWeightTolerance);
    if (isFiniteNumber(envelope.supportReactionKn) && isFiniteNumber(envelope.boundaryReactionKn)) {
      pushApproximateMatchFinding(
        findings,
        envelope.supportReactionKn + envelope.boundaryReactionKn,
        expectedWeightKn,
        'result.envelope.excavation-reaction-components-mismatch',
        'Excavation support plus boundary reactions',
        expectedWeightTolerance,
      );
    }
    if (maxSettlementOk && maxSurfaceOk) {
      pushApproximateMatchFinding(findings, envelope.maxSettlementMm, maxSurfaceSettlementMm, 'result.envelope.excavation-max-settlement-mismatch', 'Excavation max settlement', 0.001);
    }
    return;
  }

  if (analysisCase.objective === 'tunnel_volume_loss_settlement') {
    const tunnel = analysisCase.geometry.tunnel;
    if (!tunnel) return;
    const troughWidthM = tunnel.axisDepthM * tunnel.troughWidthParameterK;
    const tunnelAreaM2 = Math.PI * (tunnel.diameterM / 2) ** 2;
    const settlementVolumePerM = (tunnel.volumeLossPercent / 100) * tunnelAreaM2;
    const settlementVolumeM3 = settlementVolumePerM * tunnel.lengthM;
    const maxSurfaceSettlementMm = envelope.maxSurfaceSettlementMm;
    const maxSurfaceOk = pushFiniteNumberFinding(findings, maxSurfaceSettlementMm, 'result.envelope.max-surface-settlement', 'Envelope max surface settlement', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.tunnelDiameterM, 'result.envelope.tunnel-diameter', 'Envelope tunnel diameter', { positive: true });
    pushFiniteNumberFinding(findings, envelope.tunnelAxisDepthM, 'result.envelope.tunnel-axis-depth', 'Envelope tunnel axis depth', { positive: true });
    pushFiniteNumberFinding(findings, envelope.volumeLossPercent, 'result.envelope.volume-loss', 'Envelope volume loss', { positive: true });
    pushFiniteNumberFinding(findings, envelope.troughWidthM, 'result.envelope.trough-width', 'Envelope trough width', { positive: true });
    pushFiniteNumberFinding(findings, envelope.influenceWidthM, 'result.envelope.influence-width', 'Envelope influence width', { positive: true });
    pushFiniteNumberFinding(findings, envelope.settlementVolumeM3, 'result.envelope.settlement-volume', 'Envelope settlement volume', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.settlementVolumePerM, 'result.envelope.settlement-volume-per-m', 'Envelope settlement volume per metre', { nonNegative: true });
    pushApproximateMatchFinding(findings, envelope.totalLoadKn, 0, 'result.envelope.tunnel-total-load-invalid', 'Tunnel empirical total load', 0.001);
    pushApproximateMatchFinding(findings, envelope.reactionKn, 0, 'result.envelope.tunnel-reaction-invalid', 'Tunnel empirical reaction', 0.001);
    pushApproximateMatchFinding(findings, envelope.tunnelDiameterM, tunnel.diameterM, 'result.envelope.tunnel-diameter-mismatch', 'Tunnel diameter envelope value', 0.001);
    pushApproximateMatchFinding(findings, envelope.tunnelAxisDepthM, tunnel.axisDepthM, 'result.envelope.tunnel-axis-depth-mismatch', 'Tunnel axis depth envelope value', 0.001);
    pushApproximateMatchFinding(findings, envelope.volumeLossPercent, tunnel.volumeLossPercent, 'result.envelope.tunnel-volume-loss-mismatch', 'Tunnel volume loss envelope value', 0.001);
    pushApproximateMatchFinding(findings, envelope.troughWidthM, troughWidthM, 'result.envelope.tunnel-trough-width-mismatch', 'Tunnel trough width envelope value', 0.001);
    pushApproximateMatchFinding(findings, envelope.influenceWidthM, troughWidthM * 6, 'result.envelope.tunnel-influence-width-mismatch', 'Tunnel influence width envelope value', 0.001);
    pushApproximateMatchFinding(findings, envelope.settlementVolumePerM, settlementVolumePerM, 'result.envelope.tunnel-settlement-volume-per-m-mismatch', 'Tunnel settlement volume per metre', 0.0001);
    pushApproximateMatchFinding(findings, envelope.settlementVolumeM3, settlementVolumeM3, 'result.envelope.tunnel-settlement-volume-mismatch', 'Tunnel settlement volume', Math.max(0.001, Math.abs(settlementVolumeM3) * 0.0001));
    if (maxSettlementOk && maxSurfaceOk) {
      pushApproximateMatchFinding(findings, envelope.maxSettlementMm, maxSurfaceSettlementMm, 'result.envelope.tunnel-max-settlement-mismatch', 'Tunnel max settlement', 0.001);
    }
    return;
  }

  if (analysisCase.objective === 'staged_settlement_consolidation') {
    const consolidation = analysisCase.geometry.consolidation;
    if (!consolidation) return;
    const expectedLoadKn = consolidation.stages.reduce(
      (total, stage) => total + stage.loadKpa * consolidation.surfaceAreaM2,
      0,
    );
    const expectedLoadTolerance = Math.max(0.01, Math.abs(expectedLoadKn) * 0.0001);
    const finalSettlementOk = pushFiniteNumberFinding(findings, envelope.finalSettlementMm, 'result.envelope.final-settlement', 'Envelope final settlement', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.plasticSettlementMm, 'result.envelope.plastic-settlement', 'Envelope plastic settlement', { nonNegative: true });
    const degreeOk = pushFiniteNumberFinding(findings, envelope.finalDegreeOfConsolidation, 'result.envelope.final-degree-of-consolidation', 'Envelope final degree of consolidation', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.maxExcessPorePressureKpa, 'result.envelope.max-excess-pore-pressure', 'Envelope max excess pore pressure', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.maxMobilizedStrengthRatio, 'result.envelope.max-mobilized-strength-ratio', 'Envelope max mobilized strength ratio', { nonNegative: true });
    pushFiniteNumberFinding(findings, envelope.drainagePathM, 'result.envelope.drainage-path', 'Envelope drainage path', { positive: true });
    pushFiniteNumberFinding(findings, envelope.consolidationDurationYears, 'result.envelope.consolidation-duration', 'Envelope consolidation duration', { positive: true });
    const stageCountOk = pushFiniteNumberFinding(findings, envelope.stageCount, 'result.envelope.stage-count', 'Envelope stage count', { positive: true });
    if (stageCountOk && (!Number.isInteger(envelope.stageCount) || envelope.stageCount !== consolidation.stages.length)) {
      findings.push(finding('blocker', 'result.envelope.consolidation-stage-count-mismatch', 'Consolidation envelope stage count must match the embedded load stages.'));
    }
    if (degreeOk && envelope.finalDegreeOfConsolidation! > 1) {
      findings.push(finding('blocker', 'result.envelope.consolidation-degree-invalid', 'Final degree of consolidation must not exceed 1.0.'));
    }
    pushApproximateMatchFinding(findings, envelope.totalLoadKn, expectedLoadKn, 'result.envelope.consolidation-total-load-mismatch', 'Consolidation total load', expectedLoadTolerance);
    pushApproximateMatchFinding(findings, envelope.reactionKn, expectedLoadKn, 'result.envelope.consolidation-reaction-mismatch', 'Consolidation reaction', expectedLoadTolerance);
    if (maxSettlementOk && finalSettlementOk) {
      pushApproximateMatchFinding(findings, envelope.maxSettlementMm, envelope.finalSettlementMm!, 'result.envelope.consolidation-max-settlement-mismatch', 'Consolidation max settlement', 0.001);
    }
    const expectedDrainagePathM = consolidation.drainage === 'double' ? consolidation.layerThicknessM / 2 : consolidation.layerThicknessM;
    const expectedDurationYears = consolidation.stages.reduce((total, stage) => total + stage.durationYears, 0);
    pushApproximateMatchFinding(findings, envelope.drainagePathM, expectedDrainagePathM, 'result.envelope.consolidation-drainage-path-mismatch', 'Consolidation drainage path', 0.001);
    pushApproximateMatchFinding(findings, envelope.consolidationDurationYears, expectedDurationYears, 'result.envelope.consolidation-duration-mismatch', 'Consolidation duration', 0.001);
    if (manifest.backend.id === 'builtin-nonlinear-column-v0') {
      const loadStepsOk = pushFiniteNumberFinding(findings, envelope.solverLoadSteps, 'result.envelope.solver-load-steps', 'Envelope solver load steps', { positive: true });
      const iterationsOk = pushFiniteNumberFinding(findings, envelope.solverIterations, 'result.envelope.solver-iterations', 'Envelope solver iterations', { positive: true });
      const solverResidualOk = pushFiniteNumberFinding(findings, envelope.maxSolverResidualRatio, 'result.envelope.max-solver-residual-ratio', 'Envelope max solver residual ratio', { nonNegative: true });
      const yieldResidualOk = pushFiniteNumberFinding(findings, envelope.maxYieldResidualRatio, 'result.envelope.max-yield-residual-ratio', 'Envelope max yield residual ratio', { nonNegative: true });
      pushFiniteNumberFinding(findings, envelope.nonlinearPlasticStrain, 'result.envelope.nonlinear-plastic-strain', 'Envelope nonlinear plastic strain', { nonNegative: true });
      if (loadStepsOk && (!Number.isInteger(envelope.solverLoadSteps) || envelope.solverLoadSteps !== consolidation.stages.length)) {
        findings.push(finding('blocker', 'result.envelope.solver-load-steps-mismatch', 'Nonlinear column solver load steps must match consolidation stages.'));
      }
      if (iterationsOk && !Number.isInteger(envelope.solverIterations)) {
        findings.push(finding('blocker', 'result.envelope.solver-iterations-integer', 'Nonlinear column solver iterations must be an integer.'));
      }
      if (solverResidualOk && envelope.maxSolverResidualRatio! > 1e-3) {
        findings.push(finding('blocker', 'result.envelope.solver-residual-too-large', 'Nonlinear column solver residual exceeds the force-balance tolerance.'));
      }
      if (yieldResidualOk && envelope.maxYieldResidualRatio! > 1e-6) {
        findings.push(finding('blocker', 'result.envelope.yield-residual-too-large', 'Nonlinear column solver yield residual exceeds the material return-map tolerance.'));
      }
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
  if (!isNonEmptyString(manifest.caseId)) {
    findings.push(finding('blocker', 'result.case-id.missing', 'Result manifest caseId must be a non-empty string.'));
  } else if (manifest.caseId !== manifest.analysisCase.caseId) {
    findings.push(finding('blocker', 'result.case-id.mismatch', 'Result manifest caseId must match the embedded analysis case.'));
  }
  if (!isNonEmptyString(manifest.title)) {
    findings.push(finding('blocker', 'result.title.missing', 'Result manifest title must be a non-empty string.'));
  }
  if (!isNonEmptyString(manifest.generatedAt) || Number.isNaN(Date.parse(manifest.generatedAt))) {
    findings.push(finding('blocker', 'result.generated-at.invalid', 'Result manifest generatedAt must be an ISO-compatible timestamp.'));
  }
  validateAssumptions(findings, manifest.assumptions, 'result');
  validateLimitations(findings, manifest.limitations, 'result');
  if (!manifest.analysisCase.experimental) {
    findings.push(finding('blocker', 'result.experimental-required', 'FEM result manifests must be tied to an experimental case.'));
  }
  const validBackendIds = new Set([
    'builtin-elastic3d-demo',
    'builtin-staged-excavation-demo',
    'builtin-tunnel-volume-loss-demo',
    'builtin-staged-consolidation-1d',
    'builtin-nonlinear-column-v0',
  ]);
  if (!validBackendIds.has(manifest.backend.id)) {
    findings.push(finding('blocker', 'result.backend.id-invalid', `Unsupported FEM result backend: ${String(manifest.backend.id)}.`));
  }
  if (!isNonEmptyString(manifest.backend.label)) {
    findings.push(finding('blocker', 'result.backend.label.missing', 'Result backend label must be a non-empty string.'));
  }
  if (manifest.backend.deterministic !== true) {
    findings.push(finding('blocker', 'result.backend.deterministic-required', 'FEM result backends must be deterministic for strong-beta preview artifacts.'));
  }
  if (!isNonEmptyString(manifest.backend.version)) {
    findings.push(finding('blocker', 'result.backend.version.missing', 'Result backend version must be a non-empty string.'));
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
  validateResultEnvelopeSemantics(findings, manifest);

  const { visualization } = manifest;
  pushFiniteArrayFindings(findings, 'base', visualization.base, 3);
  pushFiniteArrayFindings(findings, 'disp', visualization.disp, 3);
  pushFiniteArrayFindings(findings, 'color', visualization.color, 3);
  pushFiniteArrayFindings(findings, 'outlineBase', visualization.outlineBase, 3);
  pushFiniteArrayFindings(findings, 'outlineDisp', visualization.outlineDisp, 3);

  const nodeCount = visualization.base.length / 3;
  if (nodeCount > FEM_MAX_PREVIEW_MESH_NODES) {
    findings.push(finding(
      'blocker',
      'result.visualization.webgl-node-limit',
      `FEM/WebGL preview visualization is capped at ${FEM_MAX_PREVIEW_MESH_NODES} nodes.`,
    ));
  }
  if (visualization.disp.length / 3 !== nodeCount) {
    findings.push(finding('blocker', 'result.disp.node-count-mismatch', 'Displacement vectors must match base nodes.'));
  }
  if (visualization.color.length / 3 !== nodeCount) {
    findings.push(finding('blocker', 'result.color.node-count-mismatch', 'Color vectors must match base nodes.'));
  }
  pushIndexArrayFindings(findings, 'tri', visualization.tri, nodeCount, 3);
  pushIndexArrayFindings(findings, 'edge', visualization.edge, nodeCount, 2);

  const expectedMeshNodes =
    (manifest.analysisCase.mesh.divisionsX + 1) *
    (manifest.analysisCase.mesh.divisionsY + 1) *
    (manifest.analysisCase.mesh.divisionsZ + 1);
  const expectedMeshElements =
    manifest.analysisCase.mesh.divisionsX *
    manifest.analysisCase.mesh.divisionsY *
    manifest.analysisCase.mesh.divisionsZ;
  const meshDivisions = manifest.mesh.divisions;
  if (!Number.isInteger(manifest.mesh.nodes) || manifest.mesh.nodes !== expectedMeshNodes) {
    findings.push(finding('blocker', 'result.mesh.nodes-mismatch', 'Result mesh node count must match the embedded analysis case mesh divisions.'));
  }
  if (!Number.isInteger(manifest.mesh.elements) || manifest.mesh.elements !== expectedMeshElements) {
    findings.push(finding('blocker', 'result.mesh.elements-mismatch', 'Result mesh element count must match the embedded analysis case mesh divisions.'));
  }
  if (manifest.mesh.elementType !== manifest.analysisCase.mesh.elementType) {
    findings.push(finding('blocker', 'result.mesh.element-type-mismatch', 'Result mesh element type must match the embedded analysis case.'));
  }
  if (
    !Array.isArray(meshDivisions) ||
    meshDivisions.length !== 3 ||
    meshDivisions[0] !== manifest.analysisCase.mesh.divisionsX ||
    meshDivisions[1] !== manifest.analysisCase.mesh.divisionsY ||
    meshDivisions[2] !== manifest.analysisCase.mesh.divisionsZ
  ) {
    findings.push(finding('blocker', 'result.mesh.divisions-mismatch', 'Result mesh divisions must match the embedded analysis case.'));
  }
  if (!Number.isInteger(manifest.mesh.visualizationNodes) || manifest.mesh.visualizationNodes !== nodeCount) {
    findings.push(finding('blocker', 'result.mesh.visualization-nodes-mismatch', 'Result visualization node count must match the visualization base array.'));
  }
  if (!Number.isInteger(manifest.mesh.visualizationTriangles) || manifest.mesh.visualizationTriangles !== visualization.tri.length / 3) {
    findings.push(finding('blocker', 'result.mesh.visualization-triangles-mismatch', 'Result visualization triangle count must match the visualization tri array.'));
  }
  if (!Number.isInteger(manifest.mesh.visualizationEdges) || manifest.mesh.visualizationEdges !== visualization.edge.length / 2) {
    findings.push(finding('blocker', 'result.mesh.visualization-edges-mismatch', 'Result visualization edge count must match the visualization edge array.'));
  }

  const outlineNodeCount = visualization.outlineBase.length / 3;
  if (outlineNodeCount > FEM_MAX_PREVIEW_MESH_NODES) {
    findings.push(finding(
      'blocker',
      'result.outline.webgl-node-limit',
      `FEM/WebGL outline visualization is capped at ${FEM_MAX_PREVIEW_MESH_NODES} nodes.`,
    ));
  }
  if (visualization.outlineDisp.length / 3 !== outlineNodeCount) {
    findings.push(finding('blocker', 'result.outline.node-count-mismatch', 'Outline displacement vectors must match outline nodes.'));
  }
  pushIndexArrayFindings(findings, 'outlineIdx', visualization.outlineIdx, outlineNodeCount, 2);

  if (Array.isArray(visualization.frames)) {
    for (const [index, frame] of visualization.frames.entries()) {
      if (!isNonEmptyString(frame.field)) {
        findings.push(finding('blocker', `result.frames.${index}.field.missing`, 'Frame field must be a non-empty string.'));
      }
      if (!isNonEmptyString(frame.fieldLabel)) {
        findings.push(finding('blocker', `result.frames.${index}.field-label.missing`, 'Frame field label must be a non-empty string.'));
      }
      if (frame.stageIndex != null && (!Number.isInteger(frame.stageIndex) || frame.stageIndex < 0)) {
        findings.push(finding('blocker', `result.frames.${index}.stage-index.invalid`, 'Frame stage index must be an integer greater than or equal to zero when present.'));
      }
      if (frame.stageLabel != null && !isNonEmptyString(frame.stageLabel)) {
        findings.push(finding('blocker', `result.frames.${index}.stage-label.missing`, 'Frame stage label must be a non-empty string when present.'));
      }
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
  validateEmbeddedValidationSummary(findings, manifest.validation, caseValidation);
  findings.push(...caseValidation.findings);

  return summary(findings);
}
