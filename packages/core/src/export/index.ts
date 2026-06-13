// ---------------------------------------------------------------------------
// Export utilities — format results for external tools
// No heavy dependencies — pure string/buffer generation
// ---------------------------------------------------------------------------

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
