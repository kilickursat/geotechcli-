export type ParseStatus = 'parsed' | 'partial' | 'failed';

export interface ParseSafety {
  parseStatus: ParseStatus;
  confidence: number;
  warnings: string[];
  canAutoProceed: boolean;
}

export interface ParsedObjectResult {
  value: Record<string, unknown> | null;
  baseStatus: ParseStatus;
  warnings: string[];
}

const MIN_AUTO_PROCEED_CONFIDENCE = 70;

export function parseJsonObject(rawText: string): ParsedObjectResult {
  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

  if (!cleaned) {
    return {
      value: null,
      baseStatus: 'failed',
      warnings: ['Model returned an empty response.'],
    };
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        value: null,
        baseStatus: 'failed',
        warnings: ['Model response was valid JSON but not an object.'],
      };
    }
    return { value: parsed as Record<string, unknown>, baseStatus: 'parsed', warnings: [] };
  } catch {
    const objectStart = cleaned.indexOf('{');
    const objectEnd = cleaned.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        const extracted = cleaned.slice(objectStart, objectEnd + 1);
        const parsed = JSON.parse(extracted);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return {
            value: parsed as Record<string, unknown>,
            baseStatus: 'partial',
            warnings: ['Model response included extra text; extracted the JSON object from the response.'],
          };
        }
      } catch {
        // Fall through to the default invalid-JSON error.
      }
    }

    return {
      value: null,
      baseStatus: 'failed',
      warnings: ['Model response was not valid JSON.'],
    };
  }
}

export function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function clampConfidence(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function deriveParseStatus(
  baseStatus: ParseStatus,
  presentCount: number,
  requiredCount: number,
): ParseStatus {
  if (baseStatus === 'failed') return 'failed';
  if (presentCount <= 0) return 'failed';
  if (presentCount >= requiredCount) return 'parsed';
  return 'partial';
}

export function createParseSafety(
  status: ParseStatus,
  confidence: number,
  warnings: string[],
): ParseSafety {
  return {
    parseStatus: status,
    confidence: clampConfidence(confidence, 0),
    warnings,
    canAutoProceed: status === 'parsed' && confidence >= MIN_AUTO_PROCEED_CONFIDENCE,
  };
}

export function readString(
  source: Record<string, unknown> | null,
  key: string,
  warnings: string[],
): string | null {
  const value = source?.[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  warnings.push(`Missing or invalid string field "${key}".`);
  return null;
}

export function readNumber(
  source: Record<string, unknown> | null,
  key: string,
  warnings: string[],
): number | null {
  const value = source?.[key];
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(num)) return num;
  warnings.push(`Missing or invalid numeric field "${key}".`);
  return null;
}
