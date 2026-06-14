import { describe, expect, it } from 'vitest';

import { exportBoreholeAgsi, exportBoreholeDiggs, type InterchangeBorehole } from '../src/export/index.js';

const GENERATED_AT = '2026-06-14T00:00:00.000Z';

function fixtureBoreholes(): InterchangeBorehole[] {
  return [
    {
      id: 'BH-01',
      easting: 531000,
      northing: 181000,
      groundLevel: 12.5,
      depth: 8,
      layers: [
        { depthFrom: 0, depthTo: 2, description: 'MADE GROUND' },
        // Pre-normalized lithology should be used as-is (confidence carried through).
        {
          depthFrom: 2,
          depthTo: 8,
          description: 'Stiff CLAY',
          uscs: 'CL',
          lithology: { key: 'clay', materialClass: 'clay', uscsSymbol: 'CL', confidence: 0.8 },
        },
      ],
    },
    {
      id: 'BH-02',
      lat: 51.5,
      lng: -0.12,
      depth: 6,
      layers: [
        { depthFrom: 0, depthTo: 1.5, description: 'PEAT' },
        { depthFrom: 1.5, depthTo: 4, description: 'Weathered MUDSTONE' },
        // Special characters must be XML-escaped in DIGGS output.
        { depthFrom: 4, depthTo: 6, description: 'Sand & gravel <wet>' },
      ],
    },
  ];
}

describe('AGSi export (faithful subset)', () => {
  it('builds a well-formed AGSi ground model document', () => {
    const agsi = JSON.parse(
      exportBoreholeAgsi(fixtureBoreholes(), {
        projectName: 'Riverside GI',
        crs: 'EPSG:27700',
        generatedAt: GENERATED_AT,
      }),
    );

    expect(agsi.agsSchema.name).toBe('AGSi');
    expect(agsi.agsSchema.version).toBe('1.0.1');
    expect(agsi.agsProject.projectName).toBe('Riverside GI');
    expect(agsi.agsProject.coordinateSystem).toBe('EPSG:27700');
    expect(agsi.generatedAt).toBe(GENERATED_AT);

    expect(agsi.agsiModel).toHaveLength(1);
    const elements = agsi.agsiModel[0].element as any[];
    // One element per (borehole, layer): 2 + 3 = 5.
    expect(elements).toHaveLength(5);
    for (const element of elements) {
      expect(typeof element.geologyUnitID).toBe('string');
      expect(element.colourRGB).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(element.boreholeID).toMatch(/^BH-0[12]$/);
    }
  });

  it('derives geology units (deduped) and carries USCS + colour', () => {
    const agsi = JSON.parse(exportBoreholeAgsi(fixtureBoreholes(), { generatedAt: GENERATED_AT }));
    const units = agsi.agsiGeologyUnit as any[];
    const unitIds = units.map((u) => u.geologyUnitID).sort();

    // fill, clay, organic, weathered-rock, gravel -> 5 distinct, no duplicates.
    expect(unitIds).toEqual(['clay', 'fill', 'gravel', 'organic', 'weathered-rock']);
    for (const unit of units) {
      expect(unit.colourRGB).toMatch(/^#[0-9a-fA-F]{6}$/);
    }

    const clayElement = (agsi.agsiModel[0].element as any[]).find((e) => e.boreholeID === 'BH-01' && e.topDepth === 2);
    expect(clayElement.geologyUnitID).toBe('clay');
    expect(clayElement.uscs).toBe('CL');
    expect(clayElement.confidence).toBe(0.8); // pre-set lithology used as-is
  });

  it('computes levels from ground level when present and omits them otherwise', () => {
    const agsi = JSON.parse(exportBoreholeAgsi(fixtureBoreholes(), { generatedAt: GENERATED_AT }));
    const elements = agsi.agsiModel[0].element as any[];

    const bh01Top = elements.find((e) => e.boreholeID === 'BH-01' && e.topDepth === 0);
    expect(bh01Top.topLevel).toBeCloseTo(12.5);
    expect(bh01Top.bottomLevel).toBeCloseTo(10.5);

    const bh02Top = elements.find((e) => e.boreholeID === 'BH-02' && e.topDepth === 0);
    expect(bh02Top.topLevel).toBeUndefined();
    expect(bh02Top.bottomLevel).toBeUndefined();
  });

  it('handles boreholes with no layers (empty model, no geology units)', () => {
    const agsi = JSON.parse(
      exportBoreholeAgsi([{ id: 'BH-X', depth: 0, layers: [] }], { generatedAt: GENERATED_AT }),
    );
    expect(agsi.agsiModel[0].element).toHaveLength(0);
    expect(agsi.agsiGeologyUnit).toHaveLength(0);
  });
});

describe('DIGGS export (faithful subset)', () => {
  function assertNoUnescapedAmpersand(xml: string): void {
    expect(xml).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+);)/);
  }

  it('builds well-formed DIGGS XML with one borehole per sampling feature', () => {
    const xml = exportBoreholeDiggs(fixtureBoreholes(), {
      projectName: 'Riverside GI',
      crs: 'EPSG:27700',
      generatedAt: GENERATED_AT,
    });

    expect(xml.startsWith('<?xml')).toBe(true);
    expect((xml.match(/<Diggs[\s>]/g) ?? [])).toHaveLength(1);
    expect((xml.match(/<\/Diggs>/g) ?? [])).toHaveLength(1);
    expect(xml).toContain('xmlns:gml="http://www.opengis.net/gml/3.2"');
    expect((xml.match(/<Borehole\b/g) ?? [])).toHaveLength(2);
    expect(xml).toContain('Riverside GI');
    assertNoUnescapedAmpersand(xml);
  });

  it('emits total measured depth, geology intervals, and reference points', () => {
    const xml = exportBoreholeDiggs(fixtureBoreholes(), { crs: 'EPSG:27700', generatedAt: GENERATED_AT });

    expect(xml).toContain('<totalMeasuredDepth uom="m">8</totalMeasuredDepth>');
    expect(xml).toContain('<totalMeasuredDepth uom="m">6</totalMeasuredDepth>');
    // BH-01 has projected coords -> easting northing in gml:pos.
    expect(xml).toContain('531000 181000');
    // BH-02 has geographic coords -> lat lng in gml:pos.
    expect(xml).toContain('51.5 -0.12');
    expect(xml).toContain('srsName="EPSG:27700"');
    // Geology intervals carry depths and USCS where available.
    expect(xml).toContain('<uscs>CL</uscs>');
    expect((xml.match(/<GeologyInterval\b/g) ?? [])).toHaveLength(5);
  });

  it('escapes special characters in descriptions', () => {
    const xml = exportBoreholeDiggs(fixtureBoreholes(), { generatedAt: GENERATED_AT });
    expect(xml).toContain('Sand &amp; gravel &lt;wet&gt;');
    assertNoUnescapedAmpersand(xml);
  });

  it('omits the reference point when a borehole has no coordinates', () => {
    const xml = exportBoreholeDiggs([{ id: 'BH-NoCoord', depth: 3, layers: [] }], {
      generatedAt: GENERATED_AT,
    });
    expect(xml).toContain('<Borehole');
    expect(xml).not.toContain('<referencePoint>');
    assertNoUnescapedAmpersand(xml);
  });
});
