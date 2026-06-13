import { describe, expect, it } from 'vitest';

import { exportBoreholeGeoJSON, exportBoreholeProfileDXF, exportCSV, exportGeoJSON } from '../src/export/index.js';

describe('export formats', () => {
  it('builds valid GeoJSON feature collections', () => {
    const geojson = JSON.parse(
      exportGeoJSON([
        {
          lat: 35.6895,
          lng: 139.6917,
          name: 'BH-01',
          properties: { depth: 18 },
        },
      ]),
    );

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.coordinates).toEqual([139.6917, 35.6895]);
    expect(geojson.features[0].properties.name).toBe('BH-01');
  });

  it('includes normalized lithology in borehole GeoJSON layer properties when present', () => {
    const geojson = JSON.parse(
      exportBoreholeGeoJSON([
        {
          id: 'BH-01',
          lat: 51.5,
          lng: -0.1,
          depth: 8,
          layers: [
            {
              depthFrom: 0,
              depthTo: 4,
              description: 'Stiff CLAY',
              uscs: 'CL',
              lithology: { key: 'clay', materialClass: 'clay', uscsSymbol: 'CL', confidence: 0.74 },
            },
          ],
        },
      ]),
    );
    expect(geojson.features[0].properties.layers[0].lithology.key).toBe('clay');
    expect(geojson.features[0].properties.layers[0].lithology.materialClass).toBe('clay');
  });

  it('serializes borehole GeoJSON layers without lithology unchanged (back-compat)', () => {
    const geojson = JSON.parse(
      exportBoreholeGeoJSON([
        { id: 'BH-02', lat: 51.5, lng: -0.1, depth: 5, layers: [{ depthFrom: 0, depthTo: 5, description: 'Sand' }] },
      ]),
    );
    expect(geojson.features[0].properties.layers[0]).toEqual({ depthFrom: 0, depthTo: 5, description: 'Sand' });
    expect(geojson.features[0].properties.layers[0].lithology).toBeUndefined();
  });

  it('builds borehole profile DXF text with key entities', () => {
    const dxf = exportBoreholeProfileDXF([
      {
        id: 'BH-01',
        x: 0,
        layers: [
          { depthFrom: 0, depthTo: 2, description: 'Fill' },
          { depthFrom: 2, depthTo: 8, description: 'Clay' },
        ],
      },
    ]);

    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('TEXT');
    expect(dxf).toContain('BH-01');
    expect(dxf.trim().endsWith('EOF')).toBe(true);
  });

  it('escapes CSV content safely', () => {
    const csv = exportCSV(
      ['id', 'description'],
      [
        ['BH-01', 'Soft clay, wet'],
        ['BH-02', 'Dense "sand"'],
      ],
    );

    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,description');
    expect(lines[1]).toContain('"Soft clay, wet"');
    expect(lines[2]).toContain('"Dense ""sand"""');
  });
});
