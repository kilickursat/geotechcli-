import { describe, expect, it } from 'vitest';

import {
  assessBoreholeCoordinateConsistency,
  validateBoreholeLocationPlausibility,
} from '../src/ingest/coordinate-validation.js';
import type { BoreholeLocation } from '../src/ingest/geotech-schemas.js';

function bngLocation(easting: number, northing: number, wgs84?: { latitude: number; longitude: number }): BoreholeLocation {
  return {
    crs: { kind: 'projected', code: 'EPSG:27700', epsg: 27700, source: 'explicit', confidence: 0.98 },
    projected: { easting, northing },
    ...(wgs84 ? { wgs84 } : {}),
  };
}

function utmLocation(
  zone: number,
  easting: number,
  northing: number,
  wgs84?: { latitude: number; longitude: number },
): BoreholeLocation {
  return {
    crs: {
      kind: 'projected',
      code: `EPSG:${32600 + zone}`,
      epsg: 32600 + zone,
      zone,
      hemisphere: 'north',
      source: 'explicit',
      confidence: 0.95,
    },
    projected: { easting, northing },
    ...(wgs84 ? { wgs84 } : {}),
  };
}

function wgs84Entry(boreholeId: string, latitude: number, longitude: number): {
  boreholeId: string;
  location: BoreholeLocation;
} {
  return {
    boreholeId,
    location: {
      crs: { kind: 'geographic', code: 'EPSG:4326', epsg: 4326, source: 'explicit', confidence: 0.98 },
      wgs84: { latitude, longitude },
    },
  };
}

describe('validateBoreholeLocationPlausibility', () => {
  it('accepts in-range British National Grid coordinates', () => {
    const issues = validateBoreholeLocationPlausibility(
      'BH-01',
      bngLocation(532500, 178300, { latitude: 51.49, longitude: -0.09 }),
    );
    expect(issues).toEqual([]);
  });

  it('flags a suspected easting/northing axis swap for BNG', () => {
    // 800000 exceeds the BNG easting range (max 700000) but fits as a northing; swapped values fit.
    const issues = validateBoreholeLocationPlausibility('BH-02', bngLocation(800000, 400000));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('suspected_axis_swap');
    expect(issues[0]?.severity).toBe('review');
    expect(issues[0]?.boreholeId).toBe('BH-02');
  });

  it('flags BNG coordinates that are out of range even when swapped', () => {
    const issues = validateBoreholeLocationPlausibility('BH-03', bngLocation(2000000, 5000000));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('projected_out_of_crs_range');
  });

  it('flags a WGS84 result outside the BNG geographic region', () => {
    const issues = validateBoreholeLocationPlausibility(
      'BH-04',
      bngLocation(532500, 178300, { latitude: 38.7, longitude: 35.5 }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('wgs84_out_of_crs_region');
  });

  it('flags a UTM zone vs longitude mismatch', () => {
    // Zone 33 central meridian is 15E; longitude 29E is ~14 degrees away.
    const issues = validateBoreholeLocationPlausibility(
      'BH-05',
      utmLocation(33, 542315, 4237761, { latitude: 38.3, longitude: 29.0 }),
    );
    expect(issues.map((issue) => issue.code)).toContain('utm_zone_longitude_mismatch');
  });

  it('accepts a consistent UTM location', () => {
    const issues = validateBoreholeLocationPlausibility(
      'BH-06',
      utmLocation(33, 542315, 4237761, { latitude: 38.3, longitude: 15.48 }),
    );
    expect(issues).toEqual([]);
  });

  it('flags a UTM easting outside the valid band, preferring axis swap when it fits', () => {
    const swapped = validateBoreholeLocationPlausibility('BH-07', utmLocation(33, 4237761, 542315));
    expect(swapped[0]?.code).toBe('suspected_axis_swap');

    const outOfRange = validateBoreholeLocationPlausibility('BH-08', utmLocation(33, 95000000, 4237761));
    expect(outOfRange[0]?.code).toBe('projected_out_of_crs_range');
  });

  it('produces no issues for locations without a recognized CRS envelope', () => {
    expect(validateBoreholeLocationPlausibility('BH-09', null)).toEqual([]);
    expect(
      validateBoreholeLocationPlausibility('BH-10', {
        crs: { kind: 'projected', source: 'heuristic', confidence: 0.25 },
        projected: { easting: 123456, northing: 654321 },
      }),
    ).toEqual([]);
  });
});

describe('assessBoreholeCoordinateConsistency', () => {
  it('reports no issues for a tight borehole cluster', () => {
    const issues = assessBoreholeCoordinateConsistency([
      wgs84Entry('BH1', 41.0, 29.0),
      wgs84Entry('BH2', 41.005, 29.002),
      wgs84Entry('BH3', 41.01, 29.004),
    ]);
    expect(issues).toEqual([]);
  });

  it('flags the outlier when one borehole plots far from a coherent cluster', () => {
    const issues = assessBoreholeCoordinateConsistency([
      wgs84Entry('BH1', 41.0, 29.0),
      wgs84Entry('BH2', 41.005, 29.002),
      wgs84Entry('BH3', 41.01, 29.004),
      wgs84Entry('BH4', 41.5, 29.0), // ~55 km north: classic OCR digit error
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('coordinate_outlier');
    expect(issues[0]?.severity).toBe('review');
    expect(issues[0]?.boreholeId).toBe('BH4');
  });

  it('does not attribute blame with only two scattered boreholes', () => {
    const issues = assessBoreholeCoordinateConsistency([
      wgs84Entry('BH1', 41.0, 29.0),
      wgs84Entry('BH2', 41.5, 29.0),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('coordinate_outlier');
    expect(issues[0]?.severity).toBe('advisory');
    expect(issues[0]?.boreholeId).toBeUndefined();
  });

  it('stays silent when no coherent cluster exists to compare against', () => {
    const issues = assessBoreholeCoordinateConsistency([
      wgs84Entry('BH1', 41.0, 29.0),
      wgs84Entry('BH2', 42.0, 30.0),
      wgs84Entry('BH3', 43.0, 31.0),
    ]);
    expect(issues).toEqual([]);
  });

  it('honours a custom nearest-neighbor threshold for long linear alignments', () => {
    const issues = assessBoreholeCoordinateConsistency(
      [
        wgs84Entry('BH1', 41.0, 29.0),
        wgs84Entry('BH2', 41.005, 29.002),
        wgs84Entry('BH3', 41.01, 29.004),
        wgs84Entry('BH4', 41.5, 29.0),
      ],
      { maxNearestNeighborKm: 80 },
    );
    expect(issues).toEqual([]);
  });

  it('flags mixed coordinate systems across boreholes', () => {
    const issues = assessBoreholeCoordinateConsistency([
      { boreholeId: 'BH1', location: bngLocation(532500, 178300) },
      { boreholeId: 'BH2', location: bngLocation(532700, 178500) },
      { boreholeId: 'BH3', location: utmLocation(33, 542315, 4237761) },
    ]);

    expect(issues.map((issue) => issue.code)).toContain('mixed_coordinate_systems');
    const mixed = issues.find((issue) => issue.code === 'mixed_coordinate_systems');
    expect(mixed?.message).toMatch(/EPSG:27700/);
    expect(mixed?.message).toMatch(/EPSG:32633/);
  });

  it('ignores boreholes without usable coordinates', () => {
    const issues = assessBoreholeCoordinateConsistency([
      wgs84Entry('BH1', 41.0, 29.0),
      { boreholeId: 'BH2', location: null },
      { boreholeId: 'BH3', location: undefined },
    ]);
    expect(issues).toEqual([]);
  });
});
