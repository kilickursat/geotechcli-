import { describe, expect, it } from 'vitest';

import {
  buildBoreholeLocation,
  detectCoordinateReferenceSystem,
  parseCoordinateText,
  transformCoordinatesToWGS84,
} from '../src/geo/index.js';

describe('coordinate utilities', () => {
  it('parses decimal and DMS coordinate text deterministically', () => {
    expect(parseCoordinateText(`51° 30' 26" N`, 'latitude')).toBeCloseTo(51.507222, 5);
    expect(parseCoordinateText(`0° 7' 39" W`, 'longitude')).toBeCloseTo(-0.1275, 4);
    expect(parseCoordinateText('530,028.746', 'easting')).toBeCloseTo(530028.746, 6);
    expect(parseCoordinateText('91', 'latitude')).toBeNull();
  });

  it('detects CRS from explicit and heuristic hints', () => {
    const explicit = detectCoordinateReferenceSystem({ crs: 'EPSG:32631' });
    expect(explicit?.epsg).toBe(32631);
    expect(explicit?.zone).toBe(31);

    const britishNationalGrid = detectCoordinateReferenceSystem({
      easting: 651409.903,
      northing: 313177.27,
    });
    expect(britishNationalGrid?.epsg).toBe(27700);

    const geographic = detectCoordinateReferenceSystem({
      latitude: 35.6895,
      longitude: 139.6917,
    });
    expect(geographic?.epsg).toBe(4326);
  });

  it('transforms projected coordinates to WGS84', () => {
    const britishNationalGrid = transformCoordinatesToWGS84({
      easting: 651409.903,
      northing: 313177.27,
      crs: 'EPSG:27700',
    });
    expect(britishNationalGrid?.latitude).toBeCloseTo(52.65797, 4);
    expect(britishNationalGrid?.longitude).toBeCloseTo(1.71605, 4);

    const utm = transformCoordinatesToWGS84({
      easting: 448251,
      northing: 5411932,
      crs: 'EPSG:32631',
    });
    expect(utm?.latitude).toBeCloseTo(48.8582, 3);
    expect(utm?.longitude).toBeCloseTo(2.2945, 3);
  });

  it('builds BoreholeLocation records with projected and WGS84 fields', () => {
    const location = buildBoreholeLocation({
      boreholeId: 'BH-1',
      easting: '651409.903',
      northing: '313177.270',
      crs: '27700',
      groundLevel: '12.4',
      source: 'unit-test',
    });

    expect(location?.boreholeId).toBe('BH-1');
    expect(location?.crs?.epsg).toBe(27700);
    expect(location?.projected?.easting).toBeCloseTo(651409.903, 6);
    expect(location?.wgs84?.latitude).toBeCloseTo(52.65797, 4);
    expect(location?.groundLevel).toBe(12.4);
  });
});
