import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildBoreholeLocation, type BoreholeLocationInput } from '../geo/coordinates.js';
import type { BoreholeLocation } from './geotech-schemas.js';

// ---------------------------------------------------------------------------
// CPT (Cone Penetration Test) Data Parser & Classifier
// Robertson 1990 / 2016 SBTn classification
// ---------------------------------------------------------------------------

export interface CPTReading {
  depth: number;
  qc: number;            // Measured tip resistance (MPa)
  fs: number;            // Sleeve friction (kPa)
  u2: number;            // Pore pressure behind cone (kPa)
  qt: number;            // Corrected tip resistance (MPa)
  Rf: number;            // Friction ratio (%)
  Bq: number;            // Pore pressure ratio
  Ic: number;            // Soil Behavior Type Index
  SBTn: number;          // SBT zone (1-9)
  SBTnDescription: string;
  sigmav: number;        // Total vertical stress (kPa)
  sigmavPrime: number;   // Effective vertical stress (kPa)
  Qtn: number;           // Normalized tip resistance
  Fr: number;            // Normalized friction ratio (%)
}

export interface CPTProfile {
  id: string;
  readings: CPTReading[];
  waterTableDepth: number;
  areaRatio: number;
  location?: BoreholeLocation;
  summary: {
    maxDepth: number;
    avgQc: number;
    dominantSoilType: string;
    layerBoundaries: Array<{ depth: number; from: string; to: string }>;
  };
}

export interface CPTParseOptions {
  id?: string;
  waterTableDepth?: number;
  areaRatio?: number;         // Cone area ratio (default 0.8)
  unitWeight?: number;        // Average unit weight kN/m^3 (default 18)
  location?: BoreholeLocationInput;
  columns?: {
    depth?: string;
    qc?: string;
    fs?: string;
    u2?: string;
  };
}

function normalizeHeaderToken(value: string): string {
  return value.trim().toLowerCase().replace(/['"]/g, '');
}

function normalizeMetadataKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function parseMetadataLines(lines: string[]): { metadata: Record<string, string>; dataLines: string[] } {
  const metadata: Record<string, string> = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? '';
    if (!line) {
      index += 1;
      continue;
    }

    if (!(line.startsWith('#') || line.startsWith('//') || line.startsWith(';'))) break;

    const stripped = line.replace(/^#\s*/, '').replace(/^\/\/\s*/, '').replace(/^;\s*/, '');
    const match = stripped.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (match) {
      metadata[normalizeMetadataKey(match[1])] = match[2].trim();
    }

    index += 1;
  }

  return {
    metadata,
    dataLines: lines.slice(index).map((line) => line.trim()).filter(Boolean),
  };
}

function firstMetadataValue(metadata: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Robertson SBTn classification (1990, updated 2016)
// ---------------------------------------------------------------------------

function classifyRobertsonSBTn(Ic: number): { zone: number; description: string } {
  if (Ic > 3.6) return { zone: 1, description: 'Sensitive fine grained' };
  if (Ic > 2.95) return { zone: 2, description: 'Organic soils - clay' };
  if (Ic > 2.6) return { zone: 3, description: 'Clay - silty clay' };
  if (Ic > 2.05) return { zone: 4, description: 'Silt mixtures - clayey silt' };
  if (Ic > 1.31) return { zone: 5, description: 'Sand mixtures - silty sand' };
  if (Ic > 1.0) return { zone: 6, description: 'Clean sand to silty sand' };
  return { zone: 7, description: 'Gravelly sand to dense sand' };
}

// ---------------------------------------------------------------------------
// Parse CPT data from CSV
// ---------------------------------------------------------------------------

export function parseCPT(filePath: string, options?: CPTParseOptions): CPTProfile {
  const content = readFileSync(resolve(filePath), 'utf-8');
  return parseCPTContent(content, options);
}

export function parseCPTContent(content: string, options?: CPTParseOptions): CPTProfile {
  const { metadata, dataLines } = parseMetadataLines(content.split(/\r?\n/));
  if (dataLines.length < 2) throw new Error('CPT file must have at least header + one data row');

  const header = dataLines[0].split(',').map((value) => normalizeHeaderToken(value));

  // Auto-detect columns
  const depthCol = normalizeHeaderToken(options?.columns?.depth ?? header.find((value) => /depth|z/i.test(value)) ?? header[0]);
  const qcCol = normalizeHeaderToken(options?.columns?.qc ?? header.find((value) => /qc|q_c|tip/i.test(value)) ?? header[1]);
  const fsCol = normalizeHeaderToken(options?.columns?.fs ?? header.find((value) => /fs|f_s|sleeve/i.test(value)) ?? header[2]);
  const u2Col = normalizeHeaderToken(options?.columns?.u2 ?? header.find((value) => /u2|u_2|pore/i.test(value)) ?? header[3]);

  const depthIdx = header.indexOf(depthCol);
  const qcIdx = header.indexOf(qcCol);
  const fsIdx = header.indexOf(fsCol);
  const u2Idx = header.indexOf(u2Col);

  const gwt = options?.waterTableDepth ?? 1.0;
  const a = options?.areaRatio ?? 0.8;
  const gamma = options?.unitWeight ?? 18;
  const gammaW = 9.81;

  const readings: CPTReading[] = [];

  for (let i = 1; i < dataLines.length; i++) {
    const cols = dataLines[i].split(',').map((value) => value.trim().replace(/['"]/g, ''));
    const depth = parseFloat(cols[depthIdx]);
    const qc = parseFloat(cols[qcIdx]);
    const fs = parseFloat(cols[fsIdx]) || 0;
    const u2Raw = u2Idx >= 0 ? parseFloat(cols[u2Idx]) : 0;

    if (isNaN(depth) || isNaN(qc)) continue;

    const u2 = isNaN(u2Raw) ? 0 : u2Raw;

    // Corrected tip resistance: qt = qc + u2(1 - a)
    const qt = qc + (u2 / 1000) * (1 - a); // u2 in kPa, qt in MPa

    // Stresses
    const sigmav = gamma * depth;
    const u0 = depth > gwt ? gammaW * (depth - gwt) : 0;
    const sigmavPrime = Math.max(sigmav - u0, 1);

    // Friction ratio
    const Rf = qc > 0 ? (fs / (qc * 1000)) * 100 : 0;

    // Pore pressure ratio
    const Bq = qt > sigmav / 1000 ? (u2 / 1000) / (qt - sigmav / 1000) : 0;

    // Normalized parameters
    const pa = 0.1; // Atmospheric pressure in MPa
    const Qtn = ((qt - sigmav / 1000) / pa) * Math.pow(pa / (sigmavPrime / 1000), 0.5);
    const Fr = sigmav / 1000 < qt ? ((fs / 1000) / (qt - sigmav / 1000)) * 100 : 0;

    // Soil Behavior Type Index (Robertson 2009)
    const Ic = Math.sqrt(
      Math.pow(3.47 - Math.log10(Math.max(Qtn, 1)), 2) +
      Math.pow(Math.log10(Math.max(Fr, 0.1)) + 1.22, 2),
    );

    const sbt = classifyRobertsonSBTn(Ic);

    readings.push({
      depth,
      qc,
      fs,
      u2,
      qt: Math.round(qt * 1000) / 1000,
      Rf: Math.round(Rf * 100) / 100,
      Bq: Math.round(Bq * 1000) / 1000,
      Ic: Math.round(Ic * 100) / 100,
      SBTn: sbt.zone,
      SBTnDescription: sbt.description,
      sigmav: Math.round(sigmav * 10) / 10,
      sigmavPrime: Math.round(sigmavPrime * 10) / 10,
      Qtn: Math.round(Qtn * 10) / 10,
      Fr: Math.round(Fr * 100) / 100,
    });
  }

  // Detect layer boundaries (where SBTn changes)
  const layerBoundaries: Array<{ depth: number; from: string; to: string }> = [];
  for (let i = 1; i < readings.length; i++) {
    if (readings[i].SBTn !== readings[i - 1].SBTn) {
      layerBoundaries.push({
        depth: readings[i].depth,
        from: readings[i - 1].SBTnDescription,
        to: readings[i].SBTnDescription,
      });
    }
  }

  // Dominant soil type
  const zoneCounts = new Map<string, number>();
  for (const reading of readings) {
    zoneCounts.set(reading.SBTnDescription, (zoneCounts.get(reading.SBTnDescription) ?? 0) + 1);
  }
  const dominantSoilType = [...zoneCounts.entries()].sort((aEntry, bEntry) => bEntry[1] - aEntry[1])[0]?.[0] ?? 'Unknown';

  const avgQc = readings.length > 0 ? readings.reduce((sum, reading) => sum + reading.qc, 0) / readings.length : 0;
  const metadataId = firstMetadataValue(metadata, ['id', 'cpt_id', 'borehole_id', 'location_id']);
  const location = buildBoreholeLocation({
    ...options?.location,
    boreholeId: options?.location?.boreholeId ?? options?.id ?? metadataId,
    latitude: options?.location?.wgs84?.latitude ?? options?.location?.latitude ?? firstMetadataValue(metadata, ['latitude', 'lat']),
    longitude: options?.location?.wgs84?.longitude ?? options?.location?.longitude ?? firstMetadataValue(metadata, ['longitude', 'lon', 'lng']),
    easting: options?.location?.projected?.easting ?? options?.location?.easting ?? firstMetadataValue(metadata, ['easting', 'east']),
    northing: options?.location?.projected?.northing ?? options?.location?.northing ?? firstMetadataValue(metadata, ['northing', 'north']),
    groundLevel: options?.location?.groundLevel ?? firstMetadataValue(metadata, ['ground_level', 'gl', 'reduced_level', 'rl']),
    crs: options?.location?.crs ?? firstMetadataValue(metadata, ['crs', 'epsg', 'coordinate_reference_system', 'coordinate_system', 'grid']),
    source: options?.location?.source ?? 'cpt',
    raw: options?.location?.raw ?? (Object.keys(metadata).length > 0 ? metadata : undefined),
  });

  return {
    id: options?.id ?? metadataId ?? 'CPT-01',
    readings,
    waterTableDepth: gwt,
    areaRatio: a,
    location,
    summary: {
      maxDepth: readings.length > 0 ? readings[readings.length - 1].depth : 0,
      avgQc: Math.round(avgQc * 100) / 100,
      dominantSoilType,
      layerBoundaries,
    },
  };
}
