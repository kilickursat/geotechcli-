export interface ToolSafetyIssue {
  parseStatus?: string;
  confidence?: number;
  warnings: string[];
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractFindingCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((finding) => (isRecord(finding) && typeof finding.code === 'string' ? finding.code.trim() : ''))
    .filter(Boolean);
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function extractToolSafetyIssue(data: unknown): ToolSafetyIssue | null {
  if (!isRecord(data)) return null;

  const agentEvidenceSummary = typeof data.agentEvidenceSummary === 'string'
    ? data.agentEvidenceSummary
    : '';
  const looksLikeFemDraft =
    data.schemaVersion === 'fem-analysis-case-draft.v1' ||
    /FEM objective:/i.test(agentEvidenceSummary);
  if (looksLikeFemDraft) {
    const missingUserInputs = extractStringArray(data.missingUserInputs);
    const validation = isRecord(data.validation) ? data.validation : {};
    const validationStatus = typeof validation.status === 'string' ? validation.status : '';
    const validationBlockers =
      typeof validation.blockers === 'number' && Number.isFinite(validation.blockers)
        ? validation.blockers
        : 0;

    if (missingUserInputs.length === 0 && validationStatus !== 'blocked' && validationBlockers === 0) {
      return null;
    }

    return {
      parseStatus: validationStatus || undefined,
      warnings: missingUserInputs.length > 0
        ? missingUserInputs
        : [`validation:${validationStatus || 'blocked'}`],
      message: `FEM draft blocked until required deterministic inputs are resolved (${[
        ...missingUserInputs,
        validationStatus && validationStatus !== 'ok' ? `validation:${validationStatus}` : '',
      ].filter(Boolean).join('; ') || 'blocked'}).`,
    };
  }

  const status = typeof data.status === 'string' ? data.status : '';
  const blockerCount =
    typeof data.blockers === 'number' && Number.isFinite(data.blockers)
      ? data.blockers
      : 0;
  const reviewItemCount =
    typeof data.reviewItems === 'number' && Number.isFinite(data.reviewItems)
      ? data.reviewItems
      : 0;
  const findingCodes = extractFindingCodes(data.findings);
  const looksLikeFemValidation =
    findingCodes.some((code) => code.includes('.')) ||
    /FEM validation/i.test(agentEvidenceSummary);

  if (looksLikeFemValidation && (status === 'blocked' || blockerCount > 0)) {
    const warnings = findingCodes.length > 0
      ? findingCodes
      : [
        status ? `status:${status}` : '',
        blockerCount > 0 ? `blockers:${blockerCount}` : '',
        reviewItemCount > 0 ? `review-items:${reviewItemCount}` : '',
      ].filter(Boolean);

    return {
      parseStatus: status || undefined,
      warnings,
      message: status === 'review' || reviewItemCount > 0
        ? `Deterministic FEM validation requires human review before downstream use (${warnings.join('; ') || 'review required'}).`
        : `Deterministic FEM validation blocked downstream use (${warnings.join('; ') || 'blocked'}).`,
    };
  }

  if (data.canAutoProceed !== false) return null;

  const warnings = Array.isArray(data.warnings)
    ? data.warnings
      .map((warning) => (typeof warning === 'string' ? warning.trim() : ''))
      .filter(Boolean)
    : [];

  const parseStatus = typeof data.parseStatus === 'string' ? data.parseStatus : undefined;
  const confidence =
    typeof data.confidence === 'number' && Number.isFinite(data.confidence)
      ? Math.max(0, Math.min(100, Math.round(data.confidence)))
      : undefined;

  const parts = [
    parseStatus ? `parse status ${parseStatus}` : null,
    confidence != null ? `confidence ${confidence}%` : null,
    warnings.length > 0 ? `warnings: ${warnings.join('; ')}` : null,
  ].filter((part): part is string => Boolean(part));

  return {
    parseStatus,
    confidence,
    warnings,
    message: parts.length > 0
      ? `Tool returned blocked low-confidence output (${parts.join(', ')}).`
      : 'Tool returned blocked low-confidence output.',
  };
}

export function serializeContextForPrompt(
  context: Record<string, unknown> | undefined,
  maxChars = 6000,
): string | null {
  if (!context || Object.keys(context).length === 0) return null;

  const serialized = JSON.stringify(context);
  if (serialized.length <= maxChars) return serialized;
  return `${serialized.slice(0, maxChars)}...(truncated)`;
}

export function serializeToolDataForPrompt(data: unknown, maxChars = 3000): string {
  const serialized = JSON.stringify(data);
  const agentEvidenceSummary = extractAgentEvidenceSummary(data);
  if (!agentEvidenceSummary) {
    return serialized.length > maxChars ? `${serialized.slice(0, maxChars)}...(truncated)` : serialized;
  }

  const prefix = `Agent evidence summary:\n${agentEvidenceSummary}\n\nCompact tool data JSON:\n`;
  const remaining = Math.max(220, maxChars - prefix.length);
  const compactData = serialized.length > remaining
    ? `${serialized.slice(0, remaining)}...(truncated)`
    : serialized;
  return `${prefix}${compactData}`;
}

function extractAgentEvidenceSummary(data: unknown): string | null {
  if (!isRecord(data)) {
    return null;
  }

  if (typeof data.agentEvidenceSummary === 'string' && data.agentEvidenceSummary.trim()) {
    return data.agentEvidenceSummary.trim();
  }

  const result = data.result;
  if (isRecord(result) && typeof result.agentEvidenceSummary === 'string' && result.agentEvidenceSummary.trim()) {
    return result.agentEvidenceSummary.trim();
  }

  return null;
}
