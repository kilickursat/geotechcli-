export interface ToolSafetyIssue {
  parseStatus?: string;
  confidence?: number;
  warnings: string[];
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractToolSafetyIssue(data: unknown): ToolSafetyIssue | null {
  if (!isRecord(data)) return null;

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
