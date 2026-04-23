import { z } from 'zod';

type RawLocationValue = string | number | null;

export const CoordinateReferenceSystemSchema = z.object({
  kind: z.enum(['geographic', 'projected', 'unknown']).default('unknown'),
  code: z.string().min(1).optional(),
  epsg: z.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  zone: z.number().int().min(1).max(60).optional(),
  hemisphere: z.enum(['north', 'south']).optional(),
  source: z.enum(['explicit', 'heuristic', 'unknown']).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).passthrough();

export type CoordinateReferenceSystem = z.infer<typeof CoordinateReferenceSystemSchema>;

export const ProjectedCoordinateSchema = z.object({
  easting: z.number().finite(),
  northing: z.number().finite(),
  elevation: z.number().finite().optional(),
}).passthrough();

export type ProjectedCoordinate = z.infer<typeof ProjectedCoordinateSchema>;

export const WGS84CoordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  elevation: z.number().finite().optional(),
}).passthrough();

export type WGS84Coordinate = z.infer<typeof WGS84CoordinateSchema>;

export const BoreholeLocationSchema = z.object({
  boreholeId: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  crs: CoordinateReferenceSystemSchema.optional(),
  projected: ProjectedCoordinateSchema.optional(),
  wgs84: WGS84CoordinateSchema.optional(),
  groundLevel: z.number().finite().nullable().optional(),
  reducedLevel: z.number().finite().nullable().optional(),
  accuracyMeters: z.number().finite().positive().optional(),
  raw: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
}).passthrough();

export type BoreholeLocation = z.infer<typeof BoreholeLocationSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const normalized = /^[-+]?\d+,\d+$/.test(trimmed) && !trimmed.includes('.')
    ? trimmed.replace(',', '.')
    : trimmed.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asNullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return asFiniteNumber(value);
}

function normalizeRawRecord(value: unknown): Record<string, RawLocationValue> | undefined {
  if (!isRecord(value)) return undefined;

  const result: Record<string, RawLocationValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) {
      result[key] = null;
    } else if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) result[key] = trimmed;
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      result[key] = entry;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeCoordinateReferenceSystemValue(value: unknown): CoordinateReferenceSystem | undefined {
  if (typeof value === 'string' && value.trim()) {
    const epsgMatch = value.trim().match(/^(?:EPSG[:\s-]*)?(\d{4,5})$/i);
    const epsg = epsgMatch ? Number(epsgMatch[1]) : undefined;
    const parsed = CoordinateReferenceSystemSchema.safeParse({
      code: value.trim(),
      epsg,
      kind: epsg === 4326 ? 'geographic' : epsg != null ? 'projected' : 'unknown',
    });
    return parsed.success ? parsed.data : undefined;
  }

  if (!isRecord(value)) return undefined;
  const epsg = asFiniteNumber(value.epsg);
  const parsed = CoordinateReferenceSystemSchema.safeParse({
    kind: value.kind ?? (epsg === 4326 ? 'geographic' : epsg != null ? 'projected' : undefined),
    code: asOptionalString(value.code),
    epsg,
    name: asOptionalString(value.name),
    zone: asFiniteNumber(value.zone),
    hemisphere: value.hemisphere,
    source: value.source,
    confidence: asFiniteNumber(value.confidence),
  });
  return parsed.success ? parsed.data : undefined;
}

export function normalizeBoreholeLocation(value: unknown): BoreholeLocation | undefined {
  if (!isRecord(value)) return undefined;

  const projectedSource = isRecord(value.projected)
    ? value.projected
    : { easting: value.easting, northing: value.northing, elevation: value.elevation };
  const wgs84Source = isRecord(value.wgs84)
    ? value.wgs84
    : { latitude: value.latitude, longitude: value.longitude, elevation: value.elevation };

  const projected = ProjectedCoordinateSchema.safeParse({
    easting: asFiniteNumber(projectedSource.easting),
    northing: asFiniteNumber(projectedSource.northing),
    elevation: asFiniteNumber(projectedSource.elevation),
  });
  const wgs84 = WGS84CoordinateSchema.safeParse({
    latitude: asFiniteNumber(wgs84Source.latitude),
    longitude: asFiniteNumber(wgs84Source.longitude),
    elevation: asFiniteNumber(wgs84Source.elevation),
  });

  const locationCandidate = {
    boreholeId: asOptionalString(value.boreholeId),
    source: asOptionalString(value.source),
    description: asOptionalString(value.description),
    crs: normalizeCoordinateReferenceSystemValue(value.crs),
    projected: projected.success ? projected.data : undefined,
    wgs84: wgs84.success ? wgs84.data : undefined,
    groundLevel: asNullableFiniteNumber(value.groundLevel),
    reducedLevel: asNullableFiniteNumber(value.reducedLevel),
    accuracyMeters: asFiniteNumber(value.accuracyMeters),
    raw: normalizeRawRecord(value.raw),
  };

  if (
    locationCandidate.boreholeId == null &&
    locationCandidate.source == null &&
    locationCandidate.description == null &&
    locationCandidate.crs == null &&
    locationCandidate.projected == null &&
    locationCandidate.wgs84 == null &&
    locationCandidate.groundLevel === undefined &&
    locationCandidate.reducedLevel === undefined &&
    locationCandidate.accuracyMeters == null &&
    locationCandidate.raw == null
  ) {
    return undefined;
  }

  const parsed = BoreholeLocationSchema.safeParse(locationCandidate);
  return parsed.success ? parsed.data : undefined;
}
