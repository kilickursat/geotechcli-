import type {
  GroundModel,
  GroundModelCoordinateSystem,
  GroundModelMap,
  GroundModelMapCoordinateType,
  GroundModelMapExtent,
  GroundModelMapPoint,
} from './model.js';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeExtent(points: GroundModelMapPoint[]): GroundModelMapExtent | undefined {
  if (points.length === 0) return undefined;

  let minX = Math.min(...points.map((point) => point.x));
  let maxX = Math.max(...points.map((point) => point.x));
  let minY = Math.min(...points.map((point) => point.y));
  let maxY = Math.max(...points.map((point) => point.y));

  if (minX === maxX) {
    const delta = Math.max(Math.abs(minX) * 0.0001, 5);
    minX -= delta;
    maxX += delta;
  }

  if (minY === maxY) {
    const delta = Math.max(Math.abs(minY) * 0.0001, 5);
    minY -= delta;
    maxY += delta;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function coordinateTypeFor(
  coordinateSystem: GroundModelCoordinateSystem,
  pointTypes: GroundModelMapCoordinateType[],
): GroundModelMapCoordinateType | undefined {
  if (coordinateSystem.kind === 'geographic') return 'geographic';
  if (coordinateSystem.kind === 'local-grid') return 'projected';
  const unique = [...new Set(pointTypes)];
  return unique.length === 1 ? unique[0] : undefined;
}

export function buildGroundModelMap(model: GroundModel): GroundModelMap {
  const points: GroundModelMapPoint[] = [];
  let missingBoreholeCoordinates = 0;

  for (const borehole of model.boreholes) {
    const coordinate = borehole.coordinates;
    if (!coordinate) {
      missingBoreholeCoordinates += 1;
      continue;
    }

    const hasGeographic = isFiniteNumber(coordinate.latitude) && isFiniteNumber(coordinate.longitude);
    const hasProjected = isFiniteNumber(coordinate.easting) && isFiniteNumber(coordinate.northing);
    if (!hasGeographic && !hasProjected) {
      missingBoreholeCoordinates += 1;
      continue;
    }

    const coordinateType: GroundModelMapCoordinateType = hasGeographic ? 'geographic' : 'projected';
    points.push({
      id: borehole.id,
      label: borehole.id,
      kind: 'borehole',
      coordinateType,
      x: hasGeographic ? coordinate.longitude! : coordinate.easting!,
      y: hasGeographic ? coordinate.latitude! : coordinate.northing!,
      easting: coordinate.easting,
      northing: coordinate.northing,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      sourceEvidenceIds: coordinate.evidenceIds,
      confidence: coordinate.confidence,
      warnings: [...borehole.warnings],
    });
  }

  const warnings = [...model.coordinateSystem.warnings];
  if (points.length === 0) {
    warnings.push('No plottable GroundModel coordinates were detected.');
  }
  if (missingBoreholeCoordinates > 0) {
    warnings.push(`${missingBoreholeCoordinates} borehole${missingBoreholeCoordinates === 1 ? '' : 's'} do not have plottable coordinates.`);
  }
  if (model.coordinateSystem.kind === 'local-grid' && !model.coordinateSystem.crs) {
    warnings.push('Local-grid map points need a declared CRS before design or GIS overlay use.');
  }

  const averageConfidence = points.length > 0
    ? points.reduce((total, point) => total + point.confidence, 0) / points.length
    : 0;

  return {
    schemaVersion: 'ground-model-map.v1',
    coordinateSystem: model.coordinateSystem,
    coordinateType: coordinateTypeFor(model.coordinateSystem, points.map((point) => point.coordinateType)),
    points,
    extent: normalizeExtent(points),
    summary: {
      totalPoints: points.length,
      boreholePoints: points.filter((point) => point.kind === 'borehole').length,
      missingBoreholeCoordinates,
      averageConfidence,
    },
    warnings: [...new Set(warnings)],
  };
}
