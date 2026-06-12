import type { BoreholeLocation, CoordinateReferenceSystem } from './geotech-schemas.js';

/**
 * Deterministic coordinate plausibility validation for ingested borehole locations.
 *
 * OCR and vision extraction routinely confuse digits, decimal separators, and the label/value
 * pairing of easting vs northing. The parsing and CRS detection in `geo/coordinates.ts` recover a
 * location, but nothing yet checks that the recovered numbers are *plausible* for the detected CRS
 * or consistent across the boreholes of one document. This module adds those checks without
 * touching the parsing path:
 *
 * - per-borehole: CRS range envelopes, suspected easting/northing axis swaps, WGS84 results outside
 *   the CRS's geographic region, and UTM zone vs longitude consistency;
 * - cross-borehole: mixed coordinate systems in one document and spatial outliers (the classic
 *   OCR digit-error signature: one borehole plotting tens of kilometres from its siblings).
 *
 * Issues are flags for human review only — coordinates are never dropped or rewritten here.
 */

export type CoordinateValidationSeverity = 'advisory' | 'review';

export type CoordinateValidationCode =
  | 'projected_out_of_crs_range'
  | 'suspected_axis_swap'
  | 'wgs84_out_of_crs_region'
  | 'utm_zone_longitude_mismatch'
  | 'coordinate_outlier'
  | 'mixed_coordinate_systems';

export interface CoordinateValidationIssue {
  code: CoordinateValidationCode;
  severity: CoordinateValidationSeverity;
  message: string;
  /** Present for borehole-scoped issues; absent for document-scoped issues. */
  boreholeId?: string;
}

interface NumericRange {
  min: number;
  max: number;
}

interface CrsEnvelope {
  label: string;
  easting: NumericRange;
  northing: NumericRange;
  wgs84?: { latitude: NumericRange; longitude: NumericRange };
}

const BNG_ENVELOPE: CrsEnvelope = {
  label: 'British National Grid (EPSG:27700)',
  easting: { min: 0, max: 700000 },
  northing: { min: 0, max: 1300000 },
  wgs84: {
    latitude: { min: 49, max: 61.5 },
    longitude: { min: -9, max: 2.5 },
  },
};

const UTM_ENVELOPE: CrsEnvelope = {
  label: 'UTM',
  easting: { min: 100000, max: 900000 },
  northing: { min: 0, max: 10000000 },
};

/** Half-width of a UTM zone is 3 degrees; allow modest slack for boundary-zone surveys. */
const UTM_ZONE_LONGITUDE_SLACK_DEG = 4.5;

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

function within(value: number, range: NumericRange): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isUtmCrs(crs: CoordinateReferenceSystem): boolean {
  if (crs.zone != null) return true;
  if (crs.epsg != null && ((crs.epsg >= 32601 && crs.epsg <= 32660) || (crs.epsg >= 32701 && crs.epsg <= 32760))) {
    return true;
  }
  return crs.code === 'UTM';
}

function resolveCrsEnvelope(crs: CoordinateReferenceSystem | undefined): CrsEnvelope | undefined {
  if (!crs) return undefined;
  if (crs.epsg === 27700) return BNG_ENVELOPE;
  if (isUtmCrs(crs)) return UTM_ENVELOPE;
  return undefined;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * DEG_TO_RAD;
  const dLon = (bLon - aLon) * DEG_TO_RAD;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat
    + Math.cos(aLat * DEG_TO_RAD) * Math.cos(bLat * DEG_TO_RAD) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Validate a single borehole location against its detected CRS. Returns review-severity issues for
 * out-of-range coordinates, suspected axis swaps, out-of-region WGS84 results, and UTM zone vs
 * longitude mismatches. Locations without a recognized CRS envelope produce no issues here; the
 * existing `validateMergedBorehole` checks (missing CRS, low CRS confidence, near-origin WGS84)
 * remain authoritative for those cases.
 */
export function validateBoreholeLocationPlausibility(
  boreholeId: string,
  location: BoreholeLocation | null | undefined,
): CoordinateValidationIssue[] {
  if (!location) return [];

  const issues: CoordinateValidationIssue[] = [];
  const crs = location.crs;
  const envelope = resolveCrsEnvelope(crs);
  const projected = location.projected;

  if (envelope && projected) {
    const { easting, northing } = projected;
    const inRange = within(easting, envelope.easting) && within(northing, envelope.northing);
    const swappedInRange = within(northing, envelope.easting) && within(easting, envelope.northing);

    if (!inRange && swappedInRange) {
      issues.push({
        code: 'suspected_axis_swap',
        severity: 'review',
        boreholeId,
        message: `Borehole ${boreholeId} projected coordinates (E ${fmt(easting)}, N ${fmt(northing)}) fall outside the expected ${envelope.label} ranges but fit when swapped; easting and northing may be transposed.`,
      });
    } else if (!inRange) {
      issues.push({
        code: 'projected_out_of_crs_range',
        severity: 'review',
        boreholeId,
        message: `Borehole ${boreholeId} projected coordinates (E ${fmt(easting)}, N ${fmt(northing)}) fall outside the expected ${envelope.label} ranges and should be reviewed.`,
      });
    }
  }

  const wgs84 = location.wgs84;
  if (envelope?.wgs84 && wgs84) {
    if (!within(wgs84.latitude, envelope.wgs84.latitude) || !within(wgs84.longitude, envelope.wgs84.longitude)) {
      issues.push({
        code: 'wgs84_out_of_crs_region',
        severity: 'review',
        boreholeId,
        message: `Borehole ${boreholeId} resolved to WGS84 (${fmt(wgs84.latitude)}, ${fmt(wgs84.longitude)}), outside the geographic region covered by ${envelope.label}; the CRS or coordinates should be reviewed.`,
      });
    }
  }

  if (wgs84 && crs?.zone != null && crs.zone >= 1 && crs.zone <= 60) {
    const centralMeridian = crs.zone * 6 - 183;
    let delta = Math.abs(wgs84.longitude - centralMeridian);
    if (delta > 180) delta = 360 - delta;
    if (delta > UTM_ZONE_LONGITUDE_SLACK_DEG) {
      issues.push({
        code: 'utm_zone_longitude_mismatch',
        severity: 'review',
        boreholeId,
        message: `Borehole ${boreholeId} resolved longitude ${fmt(wgs84.longitude)} is ${fmt(delta)} degrees from the central meridian of UTM zone ${crs.zone} (${fmt(centralMeridian)}); the zone or coordinates may be wrong.`,
      });
    }
  }

  return issues;
}

export interface BoreholeCoordinateEntry {
  boreholeId: string;
  location: BoreholeLocation | null | undefined;
}

export interface AssessBoreholeCoordinateConsistencyOptions {
  /**
   * A borehole whose nearest sibling is farther than this (km) while at least two other boreholes
   * cluster within it is flagged as a spatial outlier. Default 10 km — generous enough for long
   * linear (tunnel) alignments while still catching OCR digit errors, which typically displace a
   * point by tens of kilometres.
   */
  maxNearestNeighborKm?: number;
}

const DEFAULT_MAX_NEAREST_NEIGHBOR_KM = 10;

function crsIdentifier(crs: CoordinateReferenceSystem | undefined): string | null {
  if (!crs) return null;
  if (crs.epsg != null) return `EPSG:${crs.epsg}`;
  if (crs.code) return crs.code;
  return null;
}

/**
 * Cross-borehole consistency checks for one document: mixed coordinate systems and spatial
 * outliers. Outlier detection needs at least three located boreholes to attribute blame; with
 * exactly two, an advisory document-scoped issue reports the separation without picking a culprit.
 */
export function assessBoreholeCoordinateConsistency(
  entries: BoreholeCoordinateEntry[],
  options: AssessBoreholeCoordinateConsistencyOptions = {},
): CoordinateValidationIssue[] {
  const maxNearestNeighborKm = options.maxNearestNeighborKm ?? DEFAULT_MAX_NEAREST_NEIGHBOR_KM;
  const issues: CoordinateValidationIssue[] = [];

  const crsIds = new Set<string>();
  for (const entry of entries) {
    const id = crsIdentifier(entry.location?.crs);
    if (id) crsIds.add(id);
  }
  if (crsIds.size > 1) {
    issues.push({
      code: 'mixed_coordinate_systems',
      severity: 'review',
      message: `Boreholes in this document use ${crsIds.size} different coordinate systems (${[...crsIds].sort().join(', ')}); confirm a single project CRS before mapping.`,
    });
  }

  const points = entries.flatMap((entry) => {
    const wgs84 = entry.location?.wgs84;
    if (!wgs84 || !Number.isFinite(wgs84.latitude) || !Number.isFinite(wgs84.longitude)) {
      return [];
    }
    return [{ boreholeId: entry.boreholeId, latitude: wgs84.latitude, longitude: wgs84.longitude }];
  });

  if (points.length === 2) {
    const [a, b] = points as [typeof points[number], typeof points[number]];
    const distance = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    if (distance > maxNearestNeighborKm) {
      issues.push({
        code: 'coordinate_outlier',
        severity: 'advisory',
        message: `Boreholes ${a.boreholeId} and ${b.boreholeId} plot ${fmt(distance)} km apart, beyond the expected site extent (${fmt(maxNearestNeighborKm)} km); one location may carry an OCR digit error.`,
      });
    }
    return issues;
  }

  if (points.length < 3) {
    return issues;
  }

  const nearest = points.map((point, index) => {
    let best = Number.POSITIVE_INFINITY;
    for (let other = 0; other < points.length; other += 1) {
      if (other === index) continue;
      const candidate = points[other]!;
      const distance = haversineKm(point.latitude, point.longitude, candidate.latitude, candidate.longitude);
      if (distance < best) best = distance;
    }
    return { ...point, nearestKm: best };
  });

  const clusteredCount = nearest.filter((point) => point.nearestKm <= maxNearestNeighborKm).length;
  if (clusteredCount < 2) {
    return issues;
  }

  for (const point of nearest) {
    if (point.nearestKm > maxNearestNeighborKm) {
      issues.push({
        code: 'coordinate_outlier',
        severity: 'review',
        boreholeId: point.boreholeId,
        message: `Borehole ${point.boreholeId} plots ${fmt(point.nearestKm)} km from its nearest sibling while the remaining boreholes cluster together; the coordinates likely carry an OCR digit error and should be reviewed.`,
      });
    }
  }

  return issues;
}
