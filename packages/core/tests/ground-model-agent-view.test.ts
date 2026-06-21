import { describe, expect, it } from 'vitest';

import { buildGroundModelAgentView, formatGroundModelAgentDigest } from '../src/ground-model/agent-view.js';
import type { GroundModel } from '../src/ground-model/model.js';

function fixtureGroundModel(): GroundModel {
  return {
    schemaVersion: 'ground-model.v1',
    generatedAt: '2026-06-21T00:00:00.000Z',
    project: { rootPath: '/tmp/site' },
    coordinateSystem: { kind: 'geographic', crs: 'EPSG:4326', warnings: [] },
    boreholes: [
      {
        id: 'BH-1',
        coordinates: { latitude: 51.5, longitude: -0.12, evidenceIds: ['ev-loc-1'], confidence: 0.8 },
        sptTests: [{ depth: 3, nValue: 12, evidenceIds: ['ev-spt-1'], confidence: 0.7, warnings: [] }],
        strata: [
          {
            boreholeId: 'BH-1',
            topDepth: 0,
            bottomDepth: 2,
            description: 'MADE GROUND',
            evidenceIds: ['ev-s1'],
            confidence: 0.6,
            warnings: [],
            lithology: { key: 'fill', materialClass: 'fill', uscsSymbol: null, confidence: 0.6 },
          },
          {
            boreholeId: 'BH-1',
            topDepth: 2,
            bottomDepth: 8,
            description: 'Stiff CLAY',
            evidenceIds: ['ev-s2'],
            confidence: 0.74,
            warnings: [],
            lithology: { key: 'clay', materialClass: 'clay', uscsSymbol: 'CL', confidence: 0.74 },
          },
        ],
        groundwater: [{ boreholeId: 'BH-1', depth: 1.5, evidenceIds: ['ev-gw-1'], confidence: 0.7, warnings: [] }],
        evidenceIds: ['ev-bh-1'],
        confidence: 0.72,
        warnings: [],
      },
      {
        id: 'BH-2',
        sptTests: [],
        strata: [
          {
            boreholeId: 'BH-2',
            topDepth: 0,
            bottomDepth: 5,
            description: 'Dense SAND',
            evidenceIds: ['ev-s3'],
            confidence: 0.7,
            warnings: [],
            lithology: { key: 'sand', materialClass: 'sand', uscsSymbol: 'SP', confidence: 0.7 },
          },
        ],
        groundwater: [],
        evidenceIds: ['ev-bh-2'],
        confidence: 0.65,
        warnings: [],
      },
    ],
    strata: [
      {
        boreholeId: 'BH-1',
        topDepth: 0,
        bottomDepth: 2,
        description: 'MADE GROUND',
        evidenceIds: ['ev-s1'],
        confidence: 0.6,
        warnings: [],
        lithology: { key: 'fill', materialClass: 'fill', uscsSymbol: null, confidence: 0.6 },
      },
      {
        boreholeId: 'BH-1',
        topDepth: 2,
        bottomDepth: 8,
        description: 'Stiff CLAY',
        evidenceIds: ['ev-s2'],
        confidence: 0.74,
        warnings: [],
        lithology: { key: 'clay', materialClass: 'clay', uscsSymbol: 'CL', confidence: 0.74 },
      },
      {
        boreholeId: 'BH-2',
        topDepth: 0,
        bottomDepth: 5,
        description: 'Dense SAND',
        evidenceIds: ['ev-s3'],
        confidence: 0.7,
        warnings: [],
        lithology: { key: 'sand', materialClass: 'sand', uscsSymbol: 'SP', confidence: 0.7 },
      },
    ],
    groundwater: [{ boreholeId: 'BH-1', depth: 1.5, evidenceIds: ['ev-gw-1'], confidence: 0.7, warnings: [] }],
    labTests: [],
    parameters: [
      {
        name: 'cu',
        value: 75,
        unit: 'kPa',
        boreholeId: 'BH-1',
        depth: 5,
        evidenceIds: ['ev-p1'],
        confidence: 0.6,
        warnings: [],
      },
    ],
    monitoringSeries: [],
    evidence: [],
    rejectedObservations: [],
    warnings: ['Coordinate CRS assumed WGS84.'],
    stats: {
      boreholes: 2,
      sptTests: 1,
      strata: 3,
      groundwaterObservations: 1,
      labTests: 0,
      parameters: 1,
      monitoringSeries: 0,
      evidenceRefs: 9,
      rejectedObservations: 0,
    },
  };
}

describe('buildGroundModelAgentView', () => {
  it('returns counts and coordinate system in the summary section', () => {
    const view = buildGroundModelAgentView(fixtureGroundModel(), { section: 'summary' });
    expect(view.available).toBe(true);
    expect(view.counts).toMatchObject({ boreholes: 2, strata: 3, parameters: 1, groundwater: 1, sptTests: 1 });
    expect(view.counts.evidenceRefs).toBe(9);
    expect(view.coordinateSystem).toEqual({ kind: 'geographic', crs: 'EPSG:4326' });
    // summary includes a compact per-borehole view
    expect(view.boreholes).toHaveLength(2);
  });

  it('surfaces strata detail with normalized lithology and evidence IDs', () => {
    const view = buildGroundModelAgentView(fixtureGroundModel(), { section: 'strata' });
    expect(view.strata).toHaveLength(3);
    const clay = view.strata!.find((s) => s.description === 'Stiff CLAY')!;
    expect(clay.lithologyKey).toBe('clay');
    expect(clay.uscsSymbol).toBe('CL');
    expect(clay.topDepth).toBe(2);
    expect(clay.bottomDepth).toBe(8);
    expect(clay.evidenceIds).toContain('ev-s2');
  });

  it('filters by boreholeId across all collections', () => {
    const view = buildGroundModelAgentView(fixtureGroundModel(), { section: 'all', boreholeId: 'BH-1' });
    expect(view.counts.boreholes).toBe(1);
    expect(view.strata!.every((s) => s.boreholeId === 'BH-1')).toBe(true);
    expect(view.parameters!.every((p) => p.boreholeId === 'BH-1')).toBe(true);
    expect(view.sptTests!.every((t) => t.boreholeId === 'BH-1')).toBe(true);
    expect(view.boreholes![0].id).toBe('BH-1');
  });

  it('caps collections at the requested limit and flags truncation', () => {
    const view = buildGroundModelAgentView(fixtureGroundModel(), { section: 'strata', limit: 1 });
    expect(view.strata).toHaveLength(1);
    expect(view.truncated).toBe(true);
  });

  it('returns parameters with values, units, and evidence', () => {
    const view = buildGroundModelAgentView(fixtureGroundModel(), { section: 'parameters' });
    expect(view.parameters).toHaveLength(1);
    expect(view.parameters![0]).toMatchObject({ name: 'cu', value: 75, unit: 'kPa', boreholeId: 'BH-1' });
    expect(view.parameters![0].evidenceIds).toContain('ev-p1');
  });

  it('returns coordinates only for boreholes that have them', () => {
    const view = buildGroundModelAgentView(fixtureGroundModel(), { section: 'coordinates' });
    expect(view.coordinates).toHaveLength(1);
    expect(view.coordinates![0]).toMatchObject({ boreholeId: 'BH-1', latitude: 51.5, longitude: -0.12 });
  });

  it('handles a missing ground model gracefully', () => {
    const view = buildGroundModelAgentView(undefined, { section: 'all' });
    expect(view.available).toBe(false);
    expect(view.counts.boreholes).toBe(0);
    expect(view.strata ?? []).toHaveLength(0);
  });
});

describe('formatGroundModelAgentDigest', () => {
  it('produces a compact per-borehole digest with a tool pointer', () => {
    const view = buildGroundModelAgentView(fixtureGroundModel(), { section: 'summary' });
    const digest = formatGroundModelAgentDigest(view);
    expect(digest).toContain('2 borehole(s)');
    expect(digest).toContain('BH-1');
    expect(digest).toContain('Stiff CLAY');
    expect(digest).toContain('[clay/CL]');
    expect(digest).toContain('GWL 1.5m');
    expect(digest).toContain('query_ground_model');
  });

  it('reports clearly when no ground model is available', () => {
    const digest = formatGroundModelAgentDigest(buildGroundModelAgentView(undefined));
    expect(digest).toContain('no evidence-bound ground model');
  });
});
