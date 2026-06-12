import { describe, expect, it } from 'vitest';

import {
  assessBoreholeContinuity,
  reconstructBoreholeContinuity,
} from '../src/ingest/borehole-continuity.js';
import type { BoreholeInterpretation, BoreholeLayer } from '../src/vision/index.js';

function layer(
  depthFrom: number | null,
  depthTo: number | null,
  description: string | null,
  options: { uscsSymbol?: string | null; sptN?: number | null } = {},
): BoreholeLayer {
  return {
    depthFrom,
    depthTo,
    description,
    uscsSymbol: options.uscsSymbol ?? null,
    sptN: options.sptN ?? null,
    waterContent: null,
    notes: null,
  };
}

function borehole(layers: BoreholeLayer[], boreholeId = 'BH-01'): BoreholeInterpretation {
  return {
    boreholeId,
    totalDepth: null,
    waterTableDepth: null,
    layers,
    summary: null,
    location: null,
    groundElevation: null,
    dateDrilled: null,
    drillingMethod: null,
    projectName: null,
    continuationDepth: null,
    pageNumber: null,
    totalPages: null,
    rawLLMText: '',
    latencyMs: 0,
    parseStatus: 'parsed',
    confidence: 90,
    warnings: [],
    canAutoProceed: true,
  };
}

describe('reconstructBoreholeContinuity', () => {
  it('trims a small page-break overlap to the previous bottom', () => {
    const input = borehole([
      layer(0, 6, 'Made ground'),
      layer(6, 12, 'Sand'),
      layer(12, 18, 'Clay'),
      layer(17.8, 24, 'Clay'),
      layer(24, 31, 'Rock'),
    ]);

    const { borehole: repaired, repairs } = reconstructBoreholeContinuity(input);

    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.action).toBe('trim-overlap');
    expect(repairs[0]?.before).toEqual({ from: 17.8, to: 24 });
    expect(repairs[0]?.after).toEqual({ from: 18, to: 24 });
    expect(repaired.layers.map((l) => [l.depthFrom, l.depthTo])).toEqual([
      [0, 6],
      [6, 12],
      [12, 18],
      [18, 24],
      [24, 31],
    ]);
    // Mirrors the research `bh_multi_page_overlap` fixture: zero continuity violations after repair.
    expect(assessBoreholeContinuity(repaired.layers)).toEqual({
      overlapCount: 0,
      gapCount: 0,
      nonMonotonicCount: 0,
      duplicateCount: 0,
    });
    expect(repaired.warnings).toContain(repairs[0]?.note);
  });

  it('snaps a sub-tolerance micro-gap closed', () => {
    const input = borehole([
      layer(0, 5, 'Sand'),
      layer(5.03, 9, 'Clay'),
    ]);

    const { borehole: repaired, repairs } = reconstructBoreholeContinuity(input);

    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.action).toBe('snap-gap');
    expect(repaired.layers[1]?.depthFrom).toBe(5);
  });

  it('does not snap a real gap larger than the tolerance', () => {
    const input = borehole([
      layer(0, 5, 'Sand'),
      layer(6.5, 9, 'Clay'),
    ]);

    const { borehole: repaired, repairs } = reconstructBoreholeContinuity(input);

    expect(repairs).toHaveLength(0);
    expect(repaired).toBe(input);
    expect(assessBoreholeContinuity(repaired.layers).gapCount).toBe(1);
  });

  it('drops a duplicate boundary row repeated at a page break', () => {
    const input = borehole([
      layer(0, 5, 'Stiff clay', { uscsSymbol: 'CL' }),
      layer(5, 12, 'Dense sand', { uscsSymbol: 'SP' }),
      layer(5, 12, 'Dense sand', { uscsSymbol: 'SP' }),
      layer(12, 18, 'Rock'),
    ]);

    const { borehole: repaired, repairs } = reconstructBoreholeContinuity(input);

    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.action).toBe('drop-duplicate');
    expect(repaired.layers).toHaveLength(3);
    expect(repaired.layers.map((l) => [l.depthFrom, l.depthTo])).toEqual([
      [0, 5],
      [5, 12],
      [12, 18],
    ]);
  });

  it('drops an interval fully nested inside the previous one when the material matches', () => {
    const input = borehole([
      layer(0, 10, 'Sand', { uscsSymbol: 'SP' }),
      layer(2, 8, 'Sand', { uscsSymbol: 'SP' }),
      layer(10, 15, 'Clay'),
    ]);

    const { borehole: repaired, repairs } = reconstructBoreholeContinuity(input);

    expect(repairs.map((r) => r.action)).toEqual(['drop-duplicate']);
    expect(repaired.layers.map((l) => [l.depthFrom, l.depthTo])).toEqual([
      [0, 10],
      [10, 15],
    ]);
  });

  it('leaves a large genuine overlap intact and flags it for review', () => {
    const input = borehole([
      layer(0, 10, 'Sand', { uscsSymbol: 'SP' }),
      layer(4, 12, 'Clay', { uscsSymbol: 'CL' }),
    ]);

    const { borehole: repaired, repairs } = reconstructBoreholeContinuity(input);

    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.action).toBe('flag-unrepairable');
    // Untouched depths so the authoritative validateMergedBorehole check still blocks it downstream.
    expect(repaired.layers.map((l) => [l.depthFrom, l.depthTo])).toEqual([
      [0, 10],
      [4, 12],
    ]);
    expect(assessBoreholeContinuity(repaired.layers).overlapCount).toBe(1);
  });

  it('leaves an already-monotonic log untouched and is idempotent', () => {
    const input = borehole([
      layer(0, 5, 'Sand'),
      layer(5, 10, 'Clay'),
      layer(10, 15, 'Rock'),
    ]);

    const first = reconstructBoreholeContinuity(input);
    expect(first.repairs).toHaveLength(0);
    expect(first.borehole).toBe(input);

    const second = reconstructBoreholeContinuity(first.borehole);
    expect(second.repairs).toHaveLength(0);
  });

  it('repairing twice in sequence produces no further repairs (idempotent on repaired output)', () => {
    const input = borehole([
      layer(0, 6, 'Made ground'),
      layer(6, 12, 'Sand'),
      layer(12, 18, 'Clay'),
      layer(17.8, 24, 'Clay'),
    ]);

    const first = reconstructBoreholeContinuity(input);
    expect(first.repairs.length).toBeGreaterThan(0);

    const second = reconstructBoreholeContinuity(first.borehole);
    expect(second.repairs).toHaveLength(0);
  });

  it('does not mutate the input borehole', () => {
    const input = borehole([
      layer(0, 6, 'Sand'),
      layer(5.8, 12, 'Clay'),
    ]);
    const snapshot = JSON.parse(JSON.stringify(input));

    reconstructBoreholeContinuity(input);

    expect(input).toEqual(snapshot);
  });

  it('preserves layers that lack numeric depths', () => {
    const input = borehole([
      layer(0, 5, 'Sand'),
      layer(null, null, 'Unscaled note'),
      layer(5, 10, 'Clay'),
    ]);

    const { borehole: repaired, repairs } = reconstructBoreholeContinuity(input);

    expect(repairs).toHaveLength(0);
    expect(repaired.layers.some((l) => l.description === 'Unscaled note')).toBe(true);
  });

  it('records a structured repair audit trail', () => {
    const input = borehole([
      layer(0, 6, 'Sand'),
      layer(5.7, 12, 'Clay'),
    ]);

    const { repairs } = reconstructBoreholeContinuity(input);

    expect(repairs[0]).toMatchObject({
      action: 'trim-overlap',
      boreholeId: 'BH-01',
      layerIndex: 1,
      before: { from: 5.7, to: 12 },
      after: { from: 6, to: 12 },
    });
    expect(typeof repairs[0]?.note).toBe('string');
  });
});

describe('assessBoreholeContinuity', () => {
  it('counts overlaps, gaps, duplicates, and non-monotonic layers', () => {
    const metrics = assessBoreholeContinuity([
      layer(0, 5, 'Sand'),
      layer(4, 9, 'Clay'), // overlap
      layer(11, 14, 'Rock'), // gap (9 -> 11)
      layer(11, 14, 'Rock'), // duplicate
      layer(20, 15, 'Reversed'), // non-monotonic
    ]);

    expect(metrics.overlapCount).toBeGreaterThanOrEqual(1);
    expect(metrics.gapCount).toBeGreaterThanOrEqual(1);
    expect(metrics.duplicateCount).toBeGreaterThanOrEqual(1);
    expect(metrics.nonMonotonicCount).toBe(1);
  });

  it('reports a clean profile as zero violations', () => {
    expect(
      assessBoreholeContinuity([
        layer(0, 5, 'Sand'),
        layer(5, 10, 'Clay'),
      ]),
    ).toEqual({ overlapCount: 0, gapCount: 0, nonMonotonicCount: 0, duplicateCount: 0 });
  });
});
