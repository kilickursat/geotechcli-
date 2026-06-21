/**
 * Bounded, read-only views of a deterministic GroundModel for the LLM agent.
 *
 * `geotech analyze` builds an evidence-bound GroundModel, but the agent context historically only
 * received counts. These pure helpers expose the actual interpreted detail (strata, parameters,
 * groundwater, SPT, coordinates) in a token-bounded shape so the LLM can reason over the real ground
 * model without re-parsing raw files. They never recompute engineering values — they only surface what
 * the deterministic builder produced, and they preserve evidence IDs for traceability.
 */

import type {
  GroundModel,
  GroundModelBorehole,
  GroundModelGroundwaterObservation,
  GroundModelParameter,
  GroundModelSptTest,
  GroundModelStratum,
} from './model.js';

export type GroundModelAgentSection =
  | 'summary'
  | 'boreholes'
  | 'strata'
  | 'parameters'
  | 'groundwater'
  | 'spt'
  | 'coordinates'
  | 'all';

export interface GroundModelAgentViewOptions {
  section?: GroundModelAgentSection;
  boreholeId?: string;
  /** Max rows per collection (boreholes/strata/parameters/...). Defaults to 40. */
  limit?: number;
}

export interface GroundModelAgentCounts {
  boreholes: number;
  strata: number;
  parameters: number;
  groundwater: number;
  sptTests: number;
  evidenceRefs: number;
}

export interface GroundModelAgentStratumView {
  boreholeId?: string;
  topDepth?: number;
  bottomDepth?: number;
  description: string;
  lithologyKey?: string;
  uscsSymbol?: string | null;
  confidence: number;
  evidenceIds: string[];
}

export interface GroundModelAgentSptView {
  boreholeId?: string;
  depth: number;
  nValue: number;
  unit?: string;
  evidenceIds: string[];
}

export interface GroundModelAgentGroundwaterView {
  boreholeId?: string;
  depth: number;
  evidenceIds: string[];
}

export interface GroundModelAgentParameterView {
  name: string;
  value: number | string;
  unit?: string;
  boreholeId?: string;
  depth?: number;
  confidence: number;
  evidenceIds: string[];
}

export interface GroundModelAgentCoordinateView {
  boreholeId: string;
  easting?: number;
  northing?: number;
  latitude?: number;
  longitude?: number;
  confidence: number;
}

export interface GroundModelAgentBoreholeView {
  id: string;
  coordinates?: GroundModelAgentCoordinateView;
  confidence: number;
  strata: GroundModelAgentStratumView[];
  sptTests: GroundModelAgentSptView[];
  groundwater: GroundModelAgentGroundwaterView[];
}

export interface GroundModelAgentView {
  available: boolean;
  section: GroundModelAgentSection;
  coordinateSystem: { kind: string; crs?: string };
  counts: GroundModelAgentCounts;
  boreholes?: GroundModelAgentBoreholeView[];
  strata?: GroundModelAgentStratumView[];
  parameters?: GroundModelAgentParameterView[];
  groundwater?: GroundModelAgentGroundwaterView[];
  sptTests?: GroundModelAgentSptView[];
  coordinates?: GroundModelAgentCoordinateView[];
  warnings: string[];
  /** True when any collection was capped by `limit`. */
  truncated: boolean;
}

const DEFAULT_LIMIT = 40;

function stratumView(stratum: GroundModelStratum): GroundModelAgentStratumView {
  return {
    boreholeId: stratum.boreholeId,
    topDepth: stratum.topDepth,
    bottomDepth: stratum.bottomDepth,
    description: stratum.description,
    lithologyKey: stratum.lithology?.key,
    uscsSymbol: stratum.lithology?.uscsSymbol ?? null,
    confidence: stratum.confidence,
    evidenceIds: stratum.evidenceIds,
  };
}

function sptView(test: GroundModelSptTest, boreholeId?: string): GroundModelAgentSptView {
  return {
    boreholeId,
    depth: test.depth,
    nValue: test.nValue,
    unit: test.unit,
    evidenceIds: test.evidenceIds,
  };
}

function groundwaterView(
  observation: GroundModelGroundwaterObservation,
  boreholeId?: string,
): GroundModelAgentGroundwaterView {
  return {
    boreholeId: boreholeId ?? observation.boreholeId,
    depth: observation.depth,
    evidenceIds: observation.evidenceIds,
  };
}

function parameterView(parameter: GroundModelParameter): GroundModelAgentParameterView {
  return {
    name: parameter.name,
    value: parameter.value,
    unit: parameter.unit,
    boreholeId: parameter.boreholeId,
    depth: parameter.depth,
    confidence: parameter.confidence,
    evidenceIds: parameter.evidenceIds,
  };
}

function coordinateView(borehole: GroundModelBorehole): GroundModelAgentCoordinateView | undefined {
  if (!borehole.coordinates) return undefined;
  return {
    boreholeId: borehole.id,
    easting: borehole.coordinates.easting,
    northing: borehole.coordinates.northing,
    latitude: borehole.coordinates.latitude,
    longitude: borehole.coordinates.longitude,
    confidence: borehole.coordinates.confidence,
  };
}

function boreholeView(borehole: GroundModelBorehole, limit: number): {
  view: GroundModelAgentBoreholeView;
  truncated: boolean;
} {
  const strata = borehole.strata.slice(0, limit).map(stratumView);
  const sptTests = borehole.sptTests.slice(0, limit).map((test) => sptView(test, borehole.id));
  const groundwater = borehole.groundwater.slice(0, limit).map((obs) => groundwaterView(obs, borehole.id));
  const truncated =
    borehole.strata.length > strata.length ||
    borehole.sptTests.length > sptTests.length ||
    borehole.groundwater.length > groundwater.length;
  return {
    view: {
      id: borehole.id,
      coordinates: coordinateView(borehole),
      confidence: borehole.confidence,
      strata,
      sptTests,
      groundwater,
    },
    truncated,
  };
}

function emptyView(section: GroundModelAgentSection): GroundModelAgentView {
  return {
    available: false,
    section,
    coordinateSystem: { kind: 'unknown' },
    counts: { boreholes: 0, strata: 0, parameters: 0, groundwater: 0, sptTests: 0, evidenceRefs: 0 },
    warnings: [],
    truncated: false,
  };
}

/**
 * Build a bounded, read-only view of a deterministic GroundModel for the agent. Pure: no recomputation,
 * no mutation, evidence IDs preserved. Returns `available: false` when there is no ground model.
 */
export function buildGroundModelAgentView(
  groundModel: GroundModel | null | undefined,
  options: GroundModelAgentViewOptions = {},
): GroundModelAgentView {
  const section = options.section ?? 'summary';
  if (!groundModel) {
    return emptyView(section);
  }

  const limit = Number.isFinite(options.limit) && (options.limit as number) > 0
    ? Math.floor(options.limit as number)
    : DEFAULT_LIMIT;
  const boreholeFilter = options.boreholeId?.trim();

  const boreholes = boreholeFilter
    ? groundModel.boreholes.filter((borehole) => borehole.id === boreholeFilter)
    : groundModel.boreholes;
  const strata = boreholeFilter
    ? groundModel.strata.filter((stratum) => stratum.boreholeId === boreholeFilter)
    : groundModel.strata;
  const parameters = boreholeFilter
    ? groundModel.parameters.filter((parameter) => parameter.boreholeId === boreholeFilter)
    : groundModel.parameters;
  const groundwater = boreholeFilter
    ? groundModel.groundwater.filter((obs) => obs.boreholeId === boreholeFilter)
    : groundModel.groundwater;
  const sptTests = boreholeFilter
    ? boreholes.flatMap((borehole) => borehole.sptTests.map((test) => ({ test, boreholeId: borehole.id })))
    : groundModel.boreholes.flatMap((borehole) =>
        borehole.sptTests.map((test) => ({ test, boreholeId: borehole.id })),
      );

  const counts: GroundModelAgentCounts = {
    boreholes: boreholes.length,
    strata: strata.length,
    parameters: parameters.length,
    groundwater: groundwater.length,
    sptTests: sptTests.length,
    evidenceRefs: groundModel.stats.evidenceRefs,
  };

  const view: GroundModelAgentView = {
    available: true,
    section,
    coordinateSystem: { kind: groundModel.coordinateSystem.kind, crs: groundModel.coordinateSystem.crs },
    counts,
    warnings: groundModel.warnings.slice(0, 12),
    truncated: false,
  };

  let truncated = false;
  const wants = (target: GroundModelAgentSection): boolean => section === 'all' || section === target;

  if (wants('boreholes') || section === 'summary') {
    const limited = boreholes.slice(0, section === 'summary' ? Math.min(limit, 8) : limit);
    const built = limited.map((borehole) => boreholeView(borehole, section === 'summary' ? 8 : limit));
    truncated = truncated || boreholes.length > limited.length || built.some((entry) => entry.truncated);
    view.boreholes = built.map((entry) => entry.view);
  }

  if (wants('strata')) {
    view.strata = strata.slice(0, limit).map(stratumView);
    truncated = truncated || strata.length > view.strata.length;
  }

  if (wants('parameters')) {
    view.parameters = parameters.slice(0, limit).map(parameterView);
    truncated = truncated || parameters.length > view.parameters.length;
  }

  if (wants('groundwater')) {
    view.groundwater = groundwater.slice(0, limit).map((obs) => groundwaterView(obs));
    truncated = truncated || groundwater.length > view.groundwater.length;
  }

  if (wants('spt')) {
    view.sptTests = sptTests.slice(0, limit).map(({ test, boreholeId }) => sptView(test, boreholeId));
    truncated = truncated || sptTests.length > view.sptTests.length;
  }

  if (wants('coordinates')) {
    const coords = boreholes
      .map(coordinateView)
      .filter((entry): entry is GroundModelAgentCoordinateView => entry !== undefined)
      .slice(0, limit);
    view.coordinates = coords;
  }

  view.truncated = truncated;
  return view;
}

function formatDepth(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '?';
}

function formatStratumLine(stratum: GroundModelAgentStratumView): string {
  const range = `${formatDepth(stratum.topDepth)}-${formatDepth(stratum.bottomDepth)}m`;
  const tags = [stratum.lithologyKey, stratum.uscsSymbol].filter(Boolean).join('/');
  return `${range} ${stratum.description}${tags ? ` [${tags}]` : ''}`;
}

/**
 * Compact one-line-per-borehole text digest for prompt injection, ending with a pointer to the
 * `query_ground_model` tool for full detail. Bounded by the view's own limits.
 */
export function formatGroundModelAgentDigest(view: GroundModelAgentView): string {
  if (!view.available) {
    return 'GroundModel: no evidence-bound ground model is available for this workspace yet.';
  }

  const header =
    `GroundModel (deterministic workspace scan): ${view.counts.boreholes} borehole(s), ` +
    `${view.counts.strata} strata, ${view.counts.parameters} parameter(s), ` +
    `${view.counts.groundwater} groundwater obs, ${view.counts.sptTests} SPT.`;

  const boreholeLines = (view.boreholes ?? []).map((borehole) => {
    const loc = borehole.coordinates
      ? borehole.coordinates.latitude != null
        ? ` (${borehole.coordinates.latitude}, ${borehole.coordinates.longitude})`
        : borehole.coordinates.easting != null
          ? ` (E${borehole.coordinates.easting}, N${borehole.coordinates.northing})`
          : ''
      : '';
    const strata = borehole.strata.slice(0, 6).map(formatStratumLine).join('; ');
    const gwl = borehole.groundwater.length > 0 ? `; GWL ${formatDepth(borehole.groundwater[0].depth)}m` : '';
    return `- ${borehole.id}${loc}: ${strata || 'no strata'}${gwl}`;
  });

  const pointer =
    'Full detail via the query_ground_model tool (sections: boreholes, strata, parameters, groundwater, spt, coordinates).';

  return [header, ...boreholeLines, view.truncated ? '(truncated)' : '', pointer]
    .filter(Boolean)
    .join('\n');
}
