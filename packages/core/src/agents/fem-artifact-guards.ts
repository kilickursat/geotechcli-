export interface FemArtifactGuardInput {
  path?: unknown;
  kind?: unknown;
  title?: unknown;
  mimeType?: unknown;
  content?: unknown;
  metadata?: unknown;
  tool?: unknown;
  summary?: unknown;
  result?: unknown;
}

function compact(value: unknown, maxChars = 20_000): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, maxChars);
  try {
    return JSON.stringify(value).slice(0, maxChars);
  } catch {
    return String(value).slice(0, maxChars);
  }
}

export function detectUnsafeFemArtifactPayload(input: FemArtifactGuardInput): string | null {
  const parts = [
    compact(input.path),
    compact(input.kind),
    compact(input.title),
    compact(input.mimeType),
    compact(input.content),
    compact(input.metadata),
    compact(input.tool),
    compact(input.summary),
    compact(input.result),
  ];
  const text = parts.join('\n').toLowerCase();
  if (!text) return null;

  const hasFemContext = /\bfem\b|finite[-\s]?element|fem-analysis-case|fem-result-manifest|geotech-fem-webgl/.test(text);
  if (!hasFemContext) return null;

  const unsafePatterns: Array<[RegExp, string]> = [
    [/\b(?:run[_-\s]?fem|geotech\s+fem\s+run|render[_-\s]?fem|fem[_-\s]?solver)\b/, 'fem-run-tool'],
    [/fem-result-manifest(?:\.v\d+)?/, 'fem-result-manifest'],
    [/fem-analysis-case(?:\.v\d+)?/, 'fem-analysis-case'],
    [/geotech-fem-webgl|data-fem-webgl|fem webgl|\bwebgl\b|<canvas\b/, 'fem-webgl-artifact'],
    [/\bsolver\s*(result|output|manifest)\b|\banalysis\s*result\b|\bdisplacement\s*(field|contour|result)\b/, 'fem-solver-output'],
  ];

  for (const [pattern, code] of unsafePatterns) {
    if (pattern.test(text)) return code;
  }

  const path = compact(input.path).toLowerCase();
  if (
    /\bfem\b/.test(path) &&
    /(result|manifest|webgl|solver|analysis[-_]?case|run[-_]?output)/.test(path) &&
    /\.(html?|json)$/i.test(path)
  ) {
    return 'fem-artifact-path';
  }

  return null;
}

export function buildUnsafeFemArtifactError(code: string): string {
  return `Blocked unsafe FEM artifact (${code}). Agents may plan and review FEM through deterministic FEM tools, but must not write or persist FEM analysis cases, result manifests, solver outputs, or WebGL claims through generic artifact tools.`;
}
