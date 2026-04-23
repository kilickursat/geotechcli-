import {
  normalizeBoreholeLocation,
  type BoreholeLocation,
  type CoordinateReferenceSystem,
  type WGS84Coordinate,
} from '../ingest/geotech-schemas.js';

export type CoordinateAxis = 'latitude' | 'longitude' | 'easting' | 'northing';

export interface CoordinateReferenceSystemDetectionInput {
  crs?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  easting?: unknown;
  northing?: unknown;
  description?: string;
  raw?: Record<string, unknown>;
}

export interface CoordinateTransformInput {
  latitude?: unknown;
  longitude?: unknown;
  easting?: unknown;
  northing?: unknown;
  crs?: CoordinateReferenceSystem | string | null;
}

export interface BoreholeLocationInput extends CoordinateReferenceSystemDetectionInput {
  boreholeId?: unknown;
  projected?: { easting?: unknown; northing?: unknown; elevation?: unknown } | null;
  wgs84?: { latitude?: unknown; longitude?: unknown; elevation?: unknown } | null;
  groundLevel?: unknown;
  reducedLevel?: unknown;
  accuracyMeters?: unknown;
  source?: unknown;
}

const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
const WGS84_E2 = 1 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);
const WEB_MERCATOR_LIMIT = 20037508.342789244;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function isWithinAxisRange(value: number, axis?: CoordinateAxis): boolean {
  if (!Number.isFinite(value)) return false;
  if (axis === 'latitude') return value >= -90 && value <= 90;
  if (axis === 'longitude') return value >= -180 && value <= 180;
  return true;
}

function parseDecimalCoordinate(text: string, axis?: CoordinateAxis): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/[\u2212\u2013\u2014]/g, '-');
  normalized = /^[-+]?\d+,\d+$/.test(normalized) && !normalized.includes('.')
    ? normalized.replace(',', '.')
    : normalized.replace(/,/g, '');

  const parsed = Number(normalized);
  return isWithinAxisRange(parsed, axis) ? parsed : null;
}

export function parseCoordinateText(value: unknown, axis?: CoordinateAxis): number | null {
  if (typeof value === 'number') {
    return isWithinAxisRange(value, axis) ? value : null;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[\u2212\u2013\u2014]/g, '-').replace(/\s+/g, ' ');
  const looksDms = /[NSEW]/i.test(normalized) || /[\u00B0\u00BA'"]/u.test(normalized);
  if (looksDms) {
    const parts = normalized.match(/[+-]?\d+(?:\.\d+)?/g)?.map((part) => Number(part)) ?? [];
    if (parts.length > 0) {
      const degrees = Math.abs(parts[0] ?? 0);
      const minutes = Math.abs(parts[1] ?? 0);
      const seconds = Math.abs(parts[2] ?? 0);
      let decimal = degrees + minutes / 60 + seconds / 3600;
      let sign = (parts[0] ?? 0) < 0 ? -1 : 1;

      if (/[SW]/i.test(normalized)) sign = -1;
      if (/[NE]/i.test(normalized)) sign = 1;

      decimal *= sign;
      return isWithinAxisRange(decimal, axis) ? decimal : null;
    }
  }

  return parseDecimalCoordinate(normalized, axis);
}

function parseFiniteNumber(value: unknown): number | undefined {
  const parsed = parseCoordinateText(value);
  return parsed == null ? undefined : parsed;
}

function buildCrsFromEpsg(
  epsg: number,
  source: CoordinateReferenceSystem['source'],
  confidence: number,
): CoordinateReferenceSystem {
  if (epsg === 4326) {
    return { kind: 'geographic', code: 'EPSG:4326', epsg, name: 'WGS 84', source, confidence };
  }

  if (epsg === 3857) {
    return {
      kind: 'projected',
      code: 'EPSG:3857',
      epsg,
      name: 'WGS 84 / Pseudo-Mercator',
      source,
      confidence,
    };
  }

  if (epsg === 27700) {
    return {
      kind: 'projected',
      code: 'EPSG:27700',
      epsg,
      name: 'OSGB36 / British National Grid',
      source,
      confidence,
    };
  }

  if (epsg >= 32601 && epsg <= 32660) {
    const zone = epsg - 32600;
    return {
      kind: 'projected',
      code: `EPSG:${epsg}`,
      epsg,
      name: `WGS 84 / UTM zone ${zone}N`,
      zone,
      hemisphere: 'north',
      source,
      confidence,
    };
  }

  if (epsg >= 32701 && epsg <= 32760) {
    const zone = epsg - 32700;
    return {
      kind: 'projected',
      code: `EPSG:${epsg}`,
      epsg,
      name: `WGS 84 / UTM zone ${zone}S`,
      zone,
      hemisphere: 'south',
      source,
      confidence,
    };
  }

  return {
    kind: 'unknown',
    code: `EPSG:${epsg}`,
    epsg,
    source,
    confidence,
  };
}

function buildUtmCrs(
  zone: number,
  hemisphere: 'north' | 'south',
  source: CoordinateReferenceSystem['source'],
  confidence: number,
): CoordinateReferenceSystem | undefined {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) return undefined;
  const epsg = hemisphere === 'south' ? 32700 + zone : 32600 + zone;
  return buildCrsFromEpsg(epsg, source, confidence);
}

function parseUtmHint(text: string): { zone: number; hemisphere: 'north' | 'south' } | undefined {
  const match = text.match(/\butm\b(?:\s*zone)?\s*(\d{1,2})\s*([ns])?\b/i);
  if (!match) return undefined;

  const zone = Number(match[1]);
  const hemisphere = match[2]?.toLowerCase() === 's' ? 'south' : 'north';
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) return undefined;
  return { zone, hemisphere };
}

function parseExplicitCrs(value: unknown): CoordinateReferenceSystem | undefined {
  if (isRecord(value)) {
    if (typeof value.epsg === 'number' && Number.isFinite(value.epsg)) {
      return buildCrsFromEpsg(value.epsg, (value.source as CoordinateReferenceSystem['source']) ?? 'explicit', 1);
    }

    const code = asOptionalString(value.code);
    const name = asOptionalString(value.name);
    if (code) return parseExplicitCrs(code);
    if (name) return parseExplicitCrs(name);
    return undefined;
  }

  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const numericEpsg = trimmed.match(/^(\d{4,5})$/);
  if (numericEpsg) {
    return buildCrsFromEpsg(Number(numericEpsg[1]), 'explicit', 1);
  }

  const epsgMatch = trimmed.match(/\bEPSG[:\s-]*(\d{4,5})\b/i);
  if (epsgMatch) {
    return buildCrsFromEpsg(Number(epsgMatch[1]), 'explicit', 1);
  }

  if (/wgs\s*84|gps|lat(?:itude)?\s*\/?\s*lon(?:gitude)?/i.test(trimmed)) {
    return buildCrsFromEpsg(4326, 'explicit', 0.98);
  }

  if (/web\s*mercator|pseudo-mercator|3857/i.test(trimmed)) {
    return buildCrsFromEpsg(3857, 'explicit', 0.98);
  }

  if (/british national grid|osgb36|uk national grid|\bbng\b|27700/i.test(trimmed)) {
    return buildCrsFromEpsg(27700, 'explicit', 0.98);
  }

  const utmHint = parseUtmHint(trimmed);
  if (utmHint) {
    return buildUtmCrs(utmHint.zone, utmHint.hemisphere, 'explicit', 0.95);
  }

  return undefined;
}

function gatherCrsHints(input: CoordinateReferenceSystemDetectionInput): string[] {
  const hints = new Set<string>();

  const pushHint = (value: unknown): void => {
    if (typeof value === 'string' && value.trim()) {
      hints.add(value.trim());
    }
  };

  pushHint(input.crs);
  pushHint(input.description);

  if (isRecord(input.raw)) {
    for (const [key, value] of Object.entries(input.raw)) {
      if (/(crs|epsg|projection|grid|datum|zone|coordinate)/i.test(key)) {
        pushHint(value);
      }
    }
  }

  return [...hints];
}

export function detectCoordinateReferenceSystem(
  input: CoordinateReferenceSystemDetectionInput,
): CoordinateReferenceSystem | undefined {
  for (const hint of gatherCrsHints(input)) {
    const explicit = parseExplicitCrs(hint);
    if (explicit) return explicit;
  }

  const latitude = parseCoordinateText(input.latitude, 'latitude');
  const longitude = parseCoordinateText(input.longitude, 'longitude');
  if (latitude != null && longitude != null) {
    return buildCrsFromEpsg(4326, 'heuristic', 0.95);
  }

  const easting = parseCoordinateText(input.easting, 'easting');
  const northing = parseCoordinateText(input.northing, 'northing');
  if (easting == null || northing == null) return undefined;

  if (easting >= 0 && easting <= 700000 && northing >= 0 && northing <= 1300000) {
    return buildCrsFromEpsg(27700, 'heuristic', 0.82);
  }

  if (
    Math.abs(easting) <= WEB_MERCATOR_LIMIT &&
    Math.abs(northing) <= WEB_MERCATOR_LIMIT &&
    (Math.abs(easting) > 1000000 || Math.abs(northing) > 1000000)
  ) {
    return buildCrsFromEpsg(3857, 'heuristic', 0.78);
  }

  const utmHint = gatherCrsHints(input)
    .map((hint) => parseUtmHint(hint))
    .find((hint): hint is { zone: number; hemisphere: 'north' | 'south' } => hint != null);
  if (utmHint && easting >= 100000 && easting <= 900000 && northing >= 0 && northing <= 10000000) {
    return buildUtmCrs(utmHint.zone, utmHint.hemisphere, 'heuristic', 0.75);
  }

  if (easting >= 100000 && easting <= 900000 && northing >= 0 && northing <= 10000000) {
    return {
      kind: 'projected',
      code: 'UTM',
      name: 'Universal Transverse Mercator',
      source: 'heuristic',
      confidence: 0.45,
    };
  }

  return {
    kind: 'projected',
    source: 'heuristic',
    confidence: 0.25,
  };
}

function inverseWebMercator(easting: number, northing: number): WGS84Coordinate {
  const longitude = (easting / WGS84_A) * RAD_TO_DEG;
  const latitude = (2 * Math.atan(Math.exp(northing / WGS84_A)) - Math.PI / 2) * RAD_TO_DEG;
  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

function inverseUtm(
  easting: number,
  northing: number,
  zone: number,
  hemisphere: 'north' | 'south',
): WGS84Coordinate {
  const k0 = 0.9996;
  const x = easting - 500000;
  const y = hemisphere === 'south' ? northing - 10000000 : northing;
  const M = y / k0;
  const e1 = (1 - Math.sqrt(1 - WGS84_E2)) / (1 + Math.sqrt(1 - WGS84_E2));
  const mu = M / (WGS84_A * (1 - WGS84_E2 / 4 - (3 * WGS84_E2 * WGS84_E2) / 64 - (5 * WGS84_E2 ** 3) / 256));

  const phi1 =
    mu +
    (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) +
    (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) +
    (151 * e1 ** 3 / 96) * Math.sin(6 * mu) +
    (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const N1 = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = WGS84_EP2 * cosPhi1 * cosPhi1;
  const R1 = WGS84_A * (1 - WGS84_E2) / Math.pow(1 - WGS84_E2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);
  const lambda0 = ((zone - 1) * 6 - 180 + 3) * DEG_TO_RAD;

  const latitude =
    phi1 -
    (N1 * tanPhi1 / R1) *
      (D * D / 2 -
        (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * WGS84_EP2) * D ** 4 / 24 +
        (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * WGS84_EP2 - 3 * C1 * C1) * D ** 6 / 720);

  const longitude =
    lambda0 +
    (D -
      (1 + 2 * T1 + C1) * D ** 3 / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * WGS84_EP2 + 24 * T1 * T1) * D ** 5 / 120) /
      cosPhi1;

  return {
    latitude: roundCoordinate(latitude * RAD_TO_DEG),
    longitude: roundCoordinate(longitude * RAD_TO_DEG),
  };
}

function airy1830ToCartesian(latitude: number, longitude: number): { x: number; y: number; z: number } {
  const a = 6377563.396;
  const b = 6356256.909;
  const e2 = 1 - (b * b) / (a * a);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  const nu = a / Math.sqrt(1 - e2 * sinLat * sinLat);

  return {
    x: nu * cosLat * cosLon,
    y: nu * cosLat * sinLon,
    z: nu * (1 - e2) * sinLat,
  };
}

function helmertOsgb36ToWgs84(
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const tx = 446.448;
  const ty = -125.157;
  const tz = 542.06;
  const s = 20.4894 * 1e-6;
  const rx = (0.1502 / 3600) * DEG_TO_RAD;
  const ry = (0.247 / 3600) * DEG_TO_RAD;
  const rz = (0.8421 / 3600) * DEG_TO_RAD;

  return {
    x: tx + (1 + s) * x - rz * y + ry * z,
    y: ty + rz * x + (1 + s) * y - rx * z,
    z: tz - ry * x + rx * y + (1 + s) * z,
  };
}

function cartesianToWgs84(x: number, y: number, z: number): WGS84Coordinate {
  const p = Math.sqrt(x * x + y * y);
  let latitude = Math.atan2(z, p * (1 - WGS84_E2));
  let previous = Number.NaN;

  while (!Number.isFinite(previous) || Math.abs(latitude - previous) > 1e-12) {
    previous = latitude;
    const sinLat = Math.sin(latitude);
    const nu = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    latitude = Math.atan2(z + WGS84_E2 * nu * sinLat, p);
  }

  const longitude = Math.atan2(y, x);
  return {
    latitude: roundCoordinate(latitude * RAD_TO_DEG),
    longitude: roundCoordinate(longitude * RAD_TO_DEG),
  };
}

function inverseBritishNationalGrid(easting: number, northing: number): WGS84Coordinate {
  const a = 6377563.396;
  const b = 6356256.909;
  const F0 = 0.9996012717;
  const latitude0 = 49 * DEG_TO_RAD;
  const longitude0 = -2 * DEG_TO_RAD;
  const northing0 = -100000;
  const easting0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);

  let latitude = latitude0;
  let M = 0;
  do {
    latitude = (northing - northing0 - M) / (a * F0) + latitude;
    const ma = (1 + n + (5 / 4) * n ** 2 + (5 / 4) * n ** 3) * (latitude - latitude0);
    const mb = (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) * Math.sin(latitude - latitude0) * Math.cos(latitude + latitude0);
    const mc = ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) * Math.sin(2 * (latitude - latitude0)) * Math.cos(2 * (latitude + latitude0));
    const md = (35 / 24) * n ** 3 * Math.sin(3 * (latitude - latitude0)) * Math.cos(3 * (latitude + latitude0));
    M = b * F0 * (ma - mb + mc - md);
  } while (northing - northing0 - M >= 0.00001);

  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const tanLat = Math.tan(latitude);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;
  const dE = easting - easting0;

  const vii = tanLat / (2 * rho * nu);
  const viii = tanLat / (24 * rho * nu ** 3) * (5 + 3 * tanLat ** 2 + eta2 - 9 * tanLat ** 2 * eta2);
  const ix = tanLat / (720 * rho * nu ** 5) * (61 + 90 * tanLat ** 2 + 45 * tanLat ** 4);
  const x = 1 / (cosLat * nu);
  const xi = 1 / (6 * cosLat * nu ** 3) * (nu / rho + 2 * tanLat ** 2);
  const xii = 1 / (120 * cosLat * nu ** 5) * (5 + 28 * tanLat ** 2 + 24 * tanLat ** 4);
  const xiia = 1 / (5040 * cosLat * nu ** 7) * (61 + 662 * tanLat ** 2 + 1320 * tanLat ** 4 + 720 * tanLat ** 6);

  const osgbLatitude = latitude - vii * dE ** 2 + viii * dE ** 4 - ix * dE ** 6;
  const osgbLongitude = longitude0 + x * dE - xi * dE ** 3 + xii * dE ** 5 - xiia * dE ** 7;

  const airyCartesian = airy1830ToCartesian(osgbLatitude, osgbLongitude);
  const wgs84Cartesian = helmertOsgb36ToWgs84(airyCartesian.x, airyCartesian.y, airyCartesian.z);
  return cartesianToWgs84(wgs84Cartesian.x, wgs84Cartesian.y, wgs84Cartesian.z);
}

export function transformCoordinatesToWGS84(input: CoordinateTransformInput): WGS84Coordinate | null {
  const latitude = parseCoordinateText(input.latitude, 'latitude');
  const longitude = parseCoordinateText(input.longitude, 'longitude');
  if (latitude != null && longitude != null) {
    return {
      latitude: roundCoordinate(latitude),
      longitude: roundCoordinate(longitude),
    };
  }

  const easting = parseCoordinateText(input.easting, 'easting');
  const northing = parseCoordinateText(input.northing, 'northing');
  if (easting == null || northing == null) return null;

  const crs = detectCoordinateReferenceSystem({
    crs: input.crs ?? undefined,
    easting,
    northing,
  });
  if (!crs) return null;

  if (crs.epsg === 4326 || crs.kind === 'geographic') {
    const geographicLatitude = parseCoordinateText(input.easting, 'latitude');
    const geographicLongitude = parseCoordinateText(input.northing, 'longitude');
    return geographicLatitude != null && geographicLongitude != null
      ? {
          latitude: roundCoordinate(geographicLatitude),
          longitude: roundCoordinate(geographicLongitude),
        }
      : null;
  }

  if (crs.epsg === 3857) return inverseWebMercator(easting, northing);
  if (crs.epsg === 27700) return inverseBritishNationalGrid(easting, northing);
  if (crs.zone != null && crs.hemisphere != null) {
    return inverseUtm(easting, northing, crs.zone, crs.hemisphere);
  }

  return null;
}

export function buildBoreholeLocation(input: BoreholeLocationInput): BoreholeLocation | undefined {
  const projectedSource = input.projected ?? {};
  const wgs84Source = input.wgs84 ?? {};
  const easting = parseCoordinateText(projectedSource.easting ?? input.easting, 'easting');
  const northing = parseCoordinateText(projectedSource.northing ?? input.northing, 'northing');
  const latitude = parseCoordinateText(wgs84Source.latitude ?? input.latitude, 'latitude');
  const longitude = parseCoordinateText(wgs84Source.longitude ?? input.longitude, 'longitude');
  const crs = detectCoordinateReferenceSystem({
    crs: input.crs,
    latitude,
    longitude,
    easting,
    northing,
    description: asOptionalString(input.description),
    raw: input.raw,
  });

  const transformed = latitude == null || longitude == null
    ? transformCoordinatesToWGS84({ easting, northing, crs: crs ?? null })
    : null;

  return normalizeBoreholeLocation({
    boreholeId: asOptionalString(input.boreholeId),
    source: asOptionalString(input.source),
    description: asOptionalString(input.description),
    crs,
    projected: easting != null && northing != null
      ? {
          easting,
          northing,
          elevation: parseFiniteNumber(projectedSource.elevation),
        }
      : undefined,
    wgs84: latitude != null && longitude != null
      ? {
          latitude,
          longitude,
          elevation: parseFiniteNumber(wgs84Source.elevation),
        }
      : transformed ?? undefined,
    groundLevel: parseFiniteNumber(input.groundLevel),
    reducedLevel: parseFiniteNumber(input.reducedLevel),
    accuracyMeters: parseFiniteNumber(input.accuracyMeters),
    raw: input.raw,
  });
}
