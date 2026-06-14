// ---------------------------------------------------------------------------
// Export utilities — format results for external tools
// No heavy dependencies — pure string/buffer generation
// ---------------------------------------------------------------------------

import { normalizeLithology } from '../geo/lithology.js';

export interface ExportOptions {
  filename: string;
  format: 'geojson' | 'dxf' | 'csv' | 'json';
}

// ---------------------------------------------------------------------------
// GeoJSON Export
// ---------------------------------------------------------------------------

export interface GeoJSONFeatureInput {
  lat: number;
  lng: number;
  properties: Record<string, unknown>;
  name?: string;
}

export function exportGeoJSON(features: GeoJSONFeatureInput[]): string {
  const geoJson = {
    type: 'FeatureCollection' as const,
    features: features.map((f, i) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [f.lng, f.lat],
      },
      properties: {
        name: f.name ?? `Point-${i + 1}`,
        ...f.properties,
      },
    })),
  };

  return JSON.stringify(geoJson, null, 2);
}

export function exportBoreholeGeoJSON(
  boreholes: Array<{
    id: string;
    lat: number;
    lng: number;
    depth: number;
    layers: Array<{
      depthFrom: number;
      depthTo: number;
      description: string;
      uscs?: string;
      lithology?: { key: string; materialClass: string; uscsSymbol?: string | null; confidence?: number } | null;
    }>;
  }>,
): string {
  const features = boreholes.map((bh) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [bh.lng, bh.lat] },
    properties: {
      id: bh.id,
      totalDepth: bh.depth,
      layerCount: bh.layers.length,
      layers: bh.layers,
    },
  }));

  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

// ---------------------------------------------------------------------------
// Geotechnical interchange exports — AGSi (JSON) and DIGGS (XML)
//
// Faithful, well-formed *subsets* of the AGSi 1.x and DIGGS 2.x standards: enough
// structure for real GI software (Leapfrog, Holebase, gINT, OpenGround) to read the
// project, borehole locations, total depths, and lithology-normalized stratum intervals.
// Dependency-free and deterministic (inject `generatedAt` to pin output). Not a full
// XSD/JSON-schema-validated document — 3D geometry, DIGGS measurement/sample coverage,
// and schema validation are intentionally out of scope.
// ---------------------------------------------------------------------------

export interface InterchangeLayer {
  depthFrom: number;
  depthTo: number;
  description: string;
  uscs?: string;
  lithology?: { key: string; materialClass: string; uscsSymbol?: string | null; confidence?: number } | null;
}

export interface InterchangeBorehole {
  id: string;
  lat?: number;
  lng?: number;
  easting?: number;
  northing?: number;
  groundLevel?: number;
  depth?: number;
  crs?: string;
  layers: InterchangeLayer[];
}

export interface InterchangeExportOptions {
  projectName?: string;
  crs?: string;
  generatedAt?: string;
}

// Geology-unit colours reuse the exact palette from workspace/dossier.ts materialColor,
// keyed by the canonical lithology key from geo/lithology.ts.
const LITHOLOGY_KEY_COLOURS: Record<string, string> = {
  organic: '#4d3b2e',
  bedrock: '#657282',
  'weathered-rock': '#657282',
  gravel: '#8a9aa4',
  sand: '#d4a843',
  clay: '#b87556',
  silt: '#b9a77a',
  fill: '#9a8065',
  mixed: '#aab4b0',
};

function lithologyColour(key: string): string {
  return LITHOLOGY_KEY_COLOURS[key] ?? LITHOLOGY_KEY_COLOURS.mixed;
}

interface ResolvedLithology {
  key: string;
  materialClass: string;
  uscsSymbol: string | null;
  confidence: number;
}

// Prefer a lithology already normalized upstream (ingest/ground-model); otherwise derive
// deterministically here so geology codes and colours are always populated.
function resolveLayerLithology(layer: InterchangeLayer): ResolvedLithology {
  const pre = layer.lithology;
  if (pre && typeof pre.key === 'string') {
    const norm = normalizeLithology(layer.description, layer.uscs);
    return {
      key: pre.key,
      materialClass: typeof pre.materialClass === 'string' ? pre.materialClass : pre.key,
      uscsSymbol: pre.uscsSymbol ?? layer.uscs ?? norm.uscsSymbol,
      confidence: typeof pre.confidence === 'number' ? pre.confidence : norm.confidence,
    };
  }
  const norm = normalizeLithology(layer.description, layer.uscs);
  return { key: norm.key, materialClass: norm.materialClass, uscsSymbol: norm.uscsSymbol, confidence: norm.confidence };
}

function resolveCrs(boreholes: InterchangeBorehole[], options?: InterchangeExportOptions): string | undefined {
  return options?.crs ?? boreholes.find((bh) => typeof bh.crs === 'string' && bh.crs.trim())?.crs;
}

function numberToXml(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Export an AGSi 1.x ground-model document (JSON) — project + coordinate system + one
 * observational model whose elements are the per-borehole stratum intervals, plus the
 * deduped geology units they reference.
 */
export function exportBoreholeAgsi(
  boreholes: InterchangeBorehole[],
  options?: InterchangeExportOptions,
): string {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const crs = resolveCrs(boreholes, options);

  const elements: Array<Record<string, unknown>> = [];
  const units = new Map<string, { geologyUnitID: string; geologyCode: string; description: string; colourRGB: string }>();

  for (const bh of boreholes) {
    bh.layers.forEach((layer, index) => {
      const litho = resolveLayerLithology(layer);
      const colour = lithologyColour(litho.key);
      const hasLevels = typeof bh.groundLevel === 'number' && Number.isFinite(bh.groundLevel);

      elements.push({
        elementID: `${bh.id}--${index + 1}`,
        boreholeID: bh.id,
        name: `${bh.id}: ${layer.depthFrom.toFixed(2)}-${layer.depthTo.toFixed(2)} m`,
        description: layer.description,
        geologyUnitID: litho.key,
        colourRGB: colour,
        topDepth: layer.depthFrom,
        bottomDepth: layer.depthTo,
        ...(hasLevels
          ? { topLevel: bh.groundLevel! - layer.depthFrom, bottomLevel: bh.groundLevel! - layer.depthTo }
          : {}),
        ...(litho.uscsSymbol ? { uscs: litho.uscsSymbol } : {}),
        confidence: litho.confidence,
      });

      if (!units.has(litho.key)) {
        units.set(litho.key, {
          geologyUnitID: litho.key,
          geologyCode: litho.key,
          description: litho.materialClass,
          colourRGB: colour,
        });
      }
    });
  }

  const document = {
    agsSchema: { name: 'AGSi', version: '1.0.1' },
    agsProject: {
      projectName: options?.projectName ?? 'GeotechCLI ground model',
      coordinateSystem: crs ?? 'unknown',
    },
    agsiModel: [
      {
        modelID: 'model-1',
        modelName: 'Observational ground model',
        category: 'Geological observations',
        element: elements,
      },
    ],
    agsiGeologyUnit: [...units.values()],
    generatedAt,
  };

  return JSON.stringify(document, null, 2);
}

/**
 * Export a DIGGS 2.x document (XML) — project + one Borehole sampling feature per borehole
 * (location, total depth) + per-borehole geology intervals. Hand-rolled, fully escaped, and
 * well-formed; no XML dependency.
 */
export function exportBoreholeDiggs(
  boreholes: InterchangeBorehole[],
  options?: InterchangeExportOptions,
): string {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const fallbackCrs = resolveCrs(boreholes, options);
  const projectName = options?.projectName ?? 'GeotechCLI ground model';

  const referencePoint = (
    bh: InterchangeBorehole,
  ): { coords: string; srs?: string } | null => {
    const srs = bh.crs ?? fallbackCrs;
    if (typeof bh.easting === 'number' && typeof bh.northing === 'number') {
      return { coords: `${numberToXml(bh.easting)} ${numberToXml(bh.northing)}`, srs };
    }
    if (typeof bh.lat === 'number' && typeof bh.lng === 'number') {
      return { coords: `${numberToXml(bh.lat)} ${numberToXml(bh.lng)}`, srs };
    }
    return null;
  };

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<Diggs xmlns="http://diggsml.org/schemas/2.6" xmlns:gml="http://www.opengis.net/gml/3.2" ' +
      'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'gml:id="geotechcli-diggs">',
  );

  lines.push('  <documentInformation>');
  lines.push('    <DocumentInformation gml:id="di-1">');
  lines.push(`      <creationDate>${escapeXml(generatedAt)}</creationDate>`);
  lines.push('      <description>Generated by geotechCLI</description>');
  lines.push('    </DocumentInformation>');
  lines.push('  </documentInformation>');

  lines.push('  <project>');
  lines.push('    <Project gml:id="project-1">');
  lines.push(`      <gml:name>${escapeXml(projectName)}</gml:name>`);
  lines.push('    </Project>');
  lines.push('  </project>');

  for (const bh of boreholes) {
    lines.push('  <samplingFeature>');
    lines.push(`    <Borehole gml:id="${escapeXml(bh.id)}">`);
    lines.push(`      <gml:name>${escapeXml(bh.id)}</gml:name>`);
    lines.push('      <investigationTarget>Geotechnical</investigationTarget>');
    lines.push('      <samplingFeatureType>Borehole</samplingFeatureType>');
    const pos = referencePoint(bh);
    if (pos) {
      lines.push('      <referencePoint>');
      lines.push(
        `        <gml:Point gml:id="${escapeXml(bh.id)}-rp"${pos.srs ? ` srsName="${escapeXml(pos.srs)}"` : ''}>`,
      );
      lines.push(`          <gml:pos>${pos.coords}</gml:pos>`);
      lines.push('        </gml:Point>');
      lines.push('      </referencePoint>');
    }
    if (typeof bh.depth === 'number' && Number.isFinite(bh.depth)) {
      lines.push(`      <totalMeasuredDepth uom="m">${numberToXml(bh.depth)}</totalMeasuredDepth>`);
    }
    lines.push('    </Borehole>');
    lines.push('  </samplingFeature>');
  }

  for (const bh of boreholes) {
    if (bh.layers.length === 0) continue;
    lines.push('  <observation>');
    lines.push(`    <Geology gml:id="${escapeXml(bh.id)}-geol">`);
    lines.push(`      <samplingFeatureRef xlink:href="#${escapeXml(bh.id)}"/>`);
    bh.layers.forEach((layer, index) => {
      const litho = resolveLayerLithology(layer);
      lines.push('      <geologyInterval>');
      lines.push(`        <GeologyInterval gml:id="${escapeXml(bh.id)}-geol-${index + 1}">`);
      lines.push(`          <topDepth uom="m">${numberToXml(layer.depthFrom)}</topDepth>`);
      lines.push(`          <baseDepth uom="m">${numberToXml(layer.depthTo)}</baseDepth>`);
      lines.push(`          <description>${escapeXml(layer.description)}</description>`);
      lines.push(`          <geologyCode>${escapeXml(litho.key)}</geologyCode>`);
      if (litho.uscsSymbol) {
        lines.push(`          <uscs>${escapeXml(litho.uscsSymbol)}</uscs>`);
      }
      lines.push('        </GeologyInterval>');
      lines.push('      </geologyInterval>');
    });
    lines.push('    </Geology>');
    lines.push('  </observation>');
  }

  lines.push('</Diggs>');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DXF Export (minimal but valid DXF for AutoCAD import)
// ---------------------------------------------------------------------------

export interface DXFEntity {
  type: 'LINE' | 'CIRCLE' | 'TEXT' | 'POINT';
  layer?: string;
  x1?: number; y1?: number; x2?: number; y2?: number;
  cx?: number; cy?: number; radius?: number;
  x?: number; y?: number; text?: string; height?: number;
}

export function exportDXF(entities: DXFEntity[], title?: string): string {
  const lines: string[] = [];

  // Header
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1015');
  if (title) {
    lines.push('9', '$PROJECTNAME', '1', title);
  }
  lines.push('0', 'ENDSEC');

  // Tables (minimal)
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '2');
  lines.push('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'GEOTECH', '70', '0', '62', '3', '6', 'CONTINUOUS');
  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // Entities
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  for (const e of entities) {
    const layer = e.layer ?? 'GEOTECH';

    if (e.type === 'LINE' && e.x1 != null && e.y1 != null && e.x2 != null && e.y2 != null) {
      lines.push('0', 'LINE', '8', layer);
      lines.push('10', String(e.x1), '20', String(e.y1), '30', '0');
      lines.push('11', String(e.x2), '21', String(e.y2), '31', '0');
    } else if (e.type === 'CIRCLE' && e.cx != null && e.cy != null && e.radius != null) {
      lines.push('0', 'CIRCLE', '8', layer);
      lines.push('10', String(e.cx), '20', String(e.cy), '30', '0');
      lines.push('40', String(e.radius));
    } else if (e.type === 'TEXT' && e.x != null && e.y != null && e.text) {
      lines.push('0', 'TEXT', '8', layer);
      lines.push('10', String(e.x), '20', String(e.y), '30', '0');
      lines.push('40', String(e.height ?? 1));
      lines.push('1', e.text);
    } else if (e.type === 'POINT' && e.x != null && e.y != null) {
      lines.push('0', 'POINT', '8', layer);
      lines.push('10', String(e.x), '20', String(e.y), '30', '0');
    }
  }

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\n');
}

export function exportBoreholeProfileDXF(
  boreholes: Array<{
    id: string;
    x: number;
    layers: Array<{ depthFrom: number; depthTo: number; description: string }>;
  }>,
  spacing = 10,
): string {
  const entities: DXFEntity[] = [];
  const colWidth = 5;

  boreholes.forEach((bh, idx) => {
    const xBase = idx * spacing;

    // Borehole label
    entities.push({ type: 'TEXT', x: xBase, y: 2, text: bh.id, height: 0.8, layer: 'GEOTECH' });

    // Borehole column
    const maxDepth = bh.layers.length > 0 ? -bh.layers[bh.layers.length - 1].depthTo : -20;
    entities.push({ type: 'LINE', x1: xBase - colWidth / 2, y1: 0, x2: xBase - colWidth / 2, y2: maxDepth, layer: 'GEOTECH' });
    entities.push({ type: 'LINE', x1: xBase + colWidth / 2, y1: 0, x2: xBase + colWidth / 2, y2: maxDepth, layer: 'GEOTECH' });

    // Layer boundaries and labels
    for (const layer of bh.layers) {
      const y = -layer.depthTo;
      entities.push({ type: 'LINE', x1: xBase - colWidth / 2, y1: y, x2: xBase + colWidth / 2, y2: y, layer: 'GEOTECH' });
      entities.push({ type: 'TEXT', x: xBase + colWidth / 2 + 0.5, y: -(layer.depthFrom + layer.depthTo) / 2, text: layer.description.slice(0, 30), height: 0.5, layer: 'GEOTECH' });
    }
  });

  return exportDXF(entities, 'Borehole Profile');
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

export function exportCSV(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSON Export (pretty-printed, sanitized)
// ---------------------------------------------------------------------------

export function exportJSON(data: unknown): string {
  return JSON.stringify(data, (key, value) => {
    if (/api.?key|token|secret|password/i.test(key)) return undefined;
    return value;
  }, 2);
}
