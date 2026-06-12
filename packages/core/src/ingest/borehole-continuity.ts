import type { BoreholeInterpretation, BoreholeLayer } from '../vision/index.js';

/**
 * Deterministic borehole depth-continuity reconstruction.
 *
 * After multi-page borehole logs are merged ({@link mergeBoreholeLogPages}), the stitched layer
 * sequence can still carry page-break artifacts: a boundary interval duplicated across two pages, a
 * sub-millimetre rounding gap, or a small overlap where the same depth row was read twice. This module
 * repairs those *page-break artifacts only* and records an explicit audit trail.
 *
 * Design rules (kept intentionally conservative so deterministic code never invents engineering data):
 * - Never fabricate intervals and never silently hide a genuine anomaly.
 * - Only repair small, page-break-shaped discrepancies (duplicates, micro-gaps, small overlaps).
 * - Leave large/ambiguous overlaps and gaps untouched and flag them, so the authoritative
 *   `validateMergedBorehole` check still surfaces them as blocking/review findings downstream.
 * - Be idempotent: a second pass over repaired layers produces zero further repairs.
 */

export type BoreholeContinuityAction =
  | 'trim-overlap'
  | 'drop-duplicate'
  | 'snap-gap'
  | 'flag-unrepairable';

export interface BoreholeContinuityRepairDepths {
  from: number | null;
  to: number | null;
}

export interface BoreholeContinuityRepair {
  action: BoreholeContinuityAction;
  boreholeId: string;
  /** Index of the affected layer in the borehole's original (pre-repair) `layers` array. */
  layerIndex: number;
  before: BoreholeContinuityRepairDepths;
  /** Repaired depths, or `null` when the layer was dropped or only flagged. */
  after: BoreholeContinuityRepairDepths | null;
  note: string;
}

export interface BoreholeContinuityMetrics {
  overlapCount: number;
  gapCount: number;
  nonMonotonicCount: number;
  duplicateCount: number;
}

export interface ReconstructBoreholeContinuityOptions {
  /** Gaps at or below this size (m) are snapped closed as rounding artifacts. Default 0.05. */
  gapSnapToleranceMeters?: number;
  /** Overlaps at or below this size (m) are trimmed as page-break artifacts; larger overlaps are left intact and flagged. Default 0.5. */
  maxRepairableOverlapMeters?: number;
}

const DEFAULT_GAP_SNAP_TOLERANCE_M = 0.05;
const DEFAULT_MAX_REPAIRABLE_OVERLAP_M = 0.5;
const EPSILON_M = 1e-6;

function approxEqual(a: number, b: number, eps = EPSILON_M): boolean {
  return Math.abs(a - b) <= eps;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fmt(value: number | null): string {
  return value == null ? 'n/a' : value.toFixed(2);
}

function normDescription(layer: BoreholeLayer): string {
  return (layer.description ?? '').trim().toLowerCase();
}

function normUscs(layer: BoreholeLayer): string {
  return (layer.uscsSymbol ?? '').trim().toUpperCase();
}

/** Two layers describe the same material when both their description and USCS symbol match. */
function sameMaterial(a: BoreholeLayer, b: BoreholeLayer): boolean {
  return normDescription(a) === normDescription(b) && normUscs(a) === normUscs(b);
}

type NumericBoreholeLayer = BoreholeLayer & { depthFrom: number; depthTo: number };

function isNumericLayer(layer: BoreholeLayer): layer is NumericBoreholeLayer {
  return layer.depthFrom != null && layer.depthTo != null;
}

/** Keep the previous layer with the greatest bottom depth so the running boundary is monotonic. */
function pickDeeperPrev(
  current: NumericBoreholeLayer | null,
  candidate: BoreholeLayer,
): NumericBoreholeLayer | null {
  if (!isNumericLayer(candidate)) return current;
  if (current == null || candidate.depthTo >= current.depthTo) return candidate;
  return current;
}

/**
 * Compute deterministic continuity metrics for an ordered (or unordered) layer list. Used for
 * warnings and benchmark/regression assertions. Layers missing a numeric `depthFrom`/`depthTo` are
 * ignored for the pairwise checks.
 */
export function assessBoreholeContinuity(layers: BoreholeLayer[]): BoreholeContinuityMetrics {
  let overlapCount = 0;
  let gapCount = 0;
  let nonMonotonicCount = 0;
  let duplicateCount = 0;

  for (const layer of layers) {
    if (isNumericLayer(layer) && layer.depthTo < layer.depthFrom - EPSILON_M) {
      nonMonotonicCount += 1;
    }
  }

  const numeric = layers
    .filter(isNumericLayer)
    .slice()
    .sort((a, b) => a.depthFrom - b.depthFrom || a.depthTo - b.depthTo);

  for (let i = 1; i < numeric.length; i += 1) {
    const prev = numeric[i - 1]!;
    const cur = numeric[i]!;
    if (approxEqual(cur.depthFrom, prev.depthFrom) && approxEqual(cur.depthTo, prev.depthTo)) {
      duplicateCount += 1;
    } else if (cur.depthFrom < prev.depthTo - EPSILON_M) {
      overlapCount += 1;
    } else if (cur.depthFrom > prev.depthTo + EPSILON_M) {
      gapCount += 1;
    }
  }

  return { overlapCount, gapCount, nonMonotonicCount, duplicateCount };
}

function makeRepair(
  action: BoreholeContinuityAction,
  boreholeId: string,
  layerIndex: number,
  before: BoreholeContinuityRepairDepths,
  after: BoreholeContinuityRepairDepths | null,
  note: string,
): BoreholeContinuityRepair {
  return { action, boreholeId, layerIndex, before, after, note };
}

/**
 * Repair page-break continuity artifacts in a single merged borehole. Returns the (possibly new)
 * borehole with repaired layers plus continuity warnings appended, and a typed list of the repairs
 * applied. The input borehole is never mutated.
 */
export function reconstructBoreholeContinuity(
  borehole: BoreholeInterpretation,
  options: ReconstructBoreholeContinuityOptions = {},
): { borehole: BoreholeInterpretation; repairs: BoreholeContinuityRepair[] } {
  const gapTolerance = options.gapSnapToleranceMeters ?? DEFAULT_GAP_SNAP_TOLERANCE_M;
  const maxOverlap = options.maxRepairableOverlapMeters ?? DEFAULT_MAX_REPAIRABLE_OVERLAP_M;

  const repairs: BoreholeContinuityRepair[] = [];
  if (borehole.layers.length === 0) {
    return { borehole, repairs };
  }

  const indexed = borehole.layers.map((layer, index) => ({ layer, index }));
  const numeric = indexed.filter((entry) => isNumericLayer(entry.layer));
  const nonNumeric = indexed.filter((entry) => !isNumericLayer(entry.layer));

  // Stable sort numeric layers by (from, to), keeping original order as the tiebreaker.
  numeric.sort((a, b) => {
    const fromDelta = (a.layer.depthFrom as number) - (b.layer.depthFrom as number);
    if (fromDelta !== 0) return fromDelta;
    const toDelta = (a.layer.depthTo as number) - (b.layer.depthTo as number);
    if (toDelta !== 0) return toDelta;
    return a.index - b.index;
  });

  const kept: BoreholeLayer[] = [];
  let prev: NumericBoreholeLayer | null = null;

  for (const { layer, index } of numeric) {
    const from = layer.depthFrom as number;
    const to = layer.depthTo as number;

    if (prev == null) {
      kept.push(layer);
      prev = pickDeeperPrev(prev, layer);
      continue;
    }

    const prevFrom = prev.depthFrom;
    const prevTo = prev.depthTo;

    // Exact duplicate boundary row repeated at a page break (same span + same material) -> drop.
    if (approxEqual(from, prevFrom) && approxEqual(to, prevTo) && sameMaterial(layer, prev)) {
      repairs.push(
        makeRepair('drop-duplicate', borehole.boreholeId, index, { from, to }, null,
          `Dropped duplicate interval ${fmt(from)}–${fmt(to)} m repeated at a page break.`),
      );
      continue;
    }

    const overlap = prevTo - from;
    if (overlap > EPSILON_M) {
      // Interval fully nested inside the previous one.
      if (to <= prevTo + EPSILON_M) {
        if (sameMaterial(layer, prev)) {
          repairs.push(
            makeRepair('drop-duplicate', borehole.boreholeId, index, { from, to }, null,
              `Dropped interval ${fmt(from)}–${fmt(to)} m nested inside ${fmt(prevFrom)}–${fmt(prevTo)} m at a page break.`),
          );
          continue;
        }
        repairs.push(
          makeRepair('flag-unrepairable', borehole.boreholeId, index, { from, to }, { from, to },
            `Interval ${fmt(from)}–${fmt(to)} m is nested inside ${fmt(prevFrom)}–${fmt(prevTo)} m; left unchanged for review.`),
        );
        kept.push(layer);
        // Do not advance prev: the nested layer is shallower than the current bottom.
        continue;
      }

      if (overlap <= maxOverlap) {
        const newFrom = round3(prevTo);
        const trimmed: BoreholeLayer = { ...layer, depthFrom: newFrom };
        repairs.push(
          makeRepair('trim-overlap', borehole.boreholeId, index, { from, to }, { from: newFrom, to },
            `Trimmed ${fmt(overlap)} m page-break overlap at ${fmt(prevTo)} m so ${fmt(newFrom)}–${fmt(to)} m follows ${fmt(prevFrom)}–${fmt(prevTo)} m.`),
        );
        kept.push(trimmed);
        prev = pickDeeperPrev(prev, trimmed);
        continue;
      }

      repairs.push(
        makeRepair('flag-unrepairable', borehole.boreholeId, index, { from, to }, { from, to },
          `Overlap of ${fmt(overlap)} m at ${fmt(prevTo)} m exceeds the repairable threshold (${fmt(maxOverlap)} m) and was left for review.`),
      );
      kept.push(layer);
      prev = pickDeeperPrev(prev, layer);
      continue;
    }

    const gap = from - prevTo;
    if (gap > EPSILON_M && gap <= gapTolerance) {
      const newFrom = round3(prevTo);
      const snapped: BoreholeLayer = { ...layer, depthFrom: newFrom };
      repairs.push(
        makeRepair('snap-gap', borehole.boreholeId, index, { from, to }, { from: newFrom, to },
          `Snapped ${fmt(gap)} m micro-gap closed at ${fmt(prevTo)} m.`),
      );
      kept.push(snapped);
      prev = pickDeeperPrev(prev, snapped);
      continue;
    }

    // Contiguous, or a larger gap left for validateMergedBorehole to surface as a review finding.
    kept.push(layer);
    prev = pickDeeperPrev(prev, layer);
  }

  if (repairs.length === 0) {
    return { borehole, repairs };
  }

  const repairedLayers = [...kept, ...nonNumeric.map((entry) => entry.layer)];
  const newWarnings = repairs.map((repair) => repair.note);
  const warnings = [...new Set([...borehole.warnings, ...newWarnings])];

  return {
    borehole: { ...borehole, layers: repairedLayers, warnings },
    repairs,
  };
}
