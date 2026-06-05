type ToolArgs = Record<string, unknown>;

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isRecord(value: unknown): value is ToolArgs {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function compactRecord(value: ToolArgs): ToolArgs | undefined {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function recordFromAliases(args: ToolArgs, aliases: readonly string[]): ToolArgs {
  for (const alias of aliases) {
    const value = args[alias];
    if (isRecord(value)) return value;
  }

  const keyLookup = new Map(Object.keys(args).map((key) => [normalizeKey(key), key]));
  for (const alias of aliases) {
    const key = keyLookup.get(normalizeKey(alias));
    const value = key ? args[key] : undefined;
    if (isRecord(value)) return value;
  }

  return {};
}

function mergeRecords(primary: ToolArgs, fallback: ToolArgs): ToolArgs {
  return { ...fallback, ...primary };
}

function valueFromAliases(source: ToolArgs, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) {
      return source[alias];
    }
  }

  const keyLookup = new Map(Object.keys(source).map((key) => [normalizeKey(key), key]));
  for (const alias of aliases) {
    const key = keyLookup.get(normalizeKey(alias));
    if (key) return source[key];
  }
  return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return undefined;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toFiniteNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .map((item) => toFiniteNumber(item))
    .filter((item): item is number => typeof item === 'number');
  return values.length > 0 ? values : undefined;
}

function firstFiniteNumber(source: ToolArgs, aliases: readonly string[]): number | undefined {
  return toFiniteNumber(valueFromAliases(source, aliases));
}

function firstString(source: ToolArgs, aliases: readonly string[]): string | undefined {
  const value = valueFromAliases(source, aliases);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function firstBoolean(source: ToolArgs, aliases: readonly string[]): boolean | undefined {
  const value = valueFromAliases(source, aliases);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = normalizeToken(value);
    if (normalized === 'true' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === 'no') return false;
  }
  return undefined;
}

function normalizeEnumValue(
  value: unknown,
  aliases: Record<string, string>,
): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = normalizeToken(value);
  return aliases[normalized] ?? value;
}

function applyAliases(
  args: ToolArgs,
  key: string,
  aliases: Record<string, string>,
): ToolArgs {
  if (!(key in args)) {
    return args;
  }

  const nextValue = normalizeEnumValue(args[key], aliases);
  if (nextValue === args[key]) {
    return args;
  }

  return {
    ...args,
    [key]: nextValue,
  };
}

const TBM_GROUND_TYPE_ALIASES: Record<string, string> = {
  rock: 'rock',
  'hard rock': 'rock',
  rocky: 'rock',
  'competent rock': 'rock',
  'soft ground': 'soft_ground',
  'soft soil': 'soft_ground',
  soil: 'soft_ground',
  'loose soil': 'soft_ground',
  mixed: 'mixed',
  'mixed ground': 'mixed',
  'mixed face': 'mixed',
  mixedface: 'mixed',
  'mixed geology': 'mixed',
  squeezing: 'squeezing',
  'squeezing ground': 'squeezing',
  'squeezing rock': 'squeezing',
  karst: 'karst',
  karstic: 'karst',
  karstified: 'karst',
};

const BEARING_METHOD_ALIASES: Record<string, string> = {
  terzaghi: 'terzaghi',
  meyerhof: 'meyerhof',
  hansen: 'hansen',
  vesic: 'vesic',
};

const FOUNDATION_SHAPE_ALIASES: Record<string, string> = {
  strip: 'strip',
  'strip footing': 'strip',
  square: 'square',
  'square footing': 'square',
  circular: 'circular',
  round: 'circular',
  'circular footing': 'circular',
  rectangular: 'rectangular',
  rectangle: 'rectangular',
  'rectangular footing': 'rectangular',
};

const PRESSURE_STATE_ALIASES: Record<string, string> = {
  active: 'active',
  passive: 'passive',
  'at rest': 'at_rest',
  atrest: 'at_rest',
  'at rest pressure': 'at_rest',
};

const SLOPE_METHOD_ALIASES: Record<string, string> = {
  bishop: 'bishop',
  'bishop simplified': 'bishop',
  ordinary: 'ordinary',
  'ordinary method': 'ordinary',
  fellenius: 'ordinary',
  'swedish circle': 'ordinary',
};

const FEM_OBJECTIVE_ALIASES: Record<string, string> = {
  'foundation settlement': 'foundation-settlement',
  'raft settlement': 'foundation-settlement',
  settlement: 'foundation-settlement',
  'foundation deformation': 'foundation-settlement',
  'excavation deformation': 'excavation-deformation',
  excavation: 'excavation-deformation',
  'braced excavation': 'excavation-deformation',
  'excavation plane strain dp adaptive': 'excavation-plane-strain-dp-adaptive',
  'excavation plane strain drucker prager adaptive': 'excavation-plane-strain-dp-adaptive',
  'plane strain dp adaptive': 'excavation-plane-strain-dp-adaptive',
  'plane strain drucker prager adaptive': 'excavation-plane-strain-dp-adaptive',
  'drucker prager excavation': 'excavation-plane-strain-dp-adaptive',
  'dp adaptive excavation': 'excavation-plane-strain-dp-adaptive',
  'tunnel volume loss settlement': 'tunnel-volume-loss-settlement',
  'tunnel settlement': 'tunnel-volume-loss-settlement',
  tunnel: 'tunnel-volume-loss-settlement',
  'shaft deformation': 'shaft-deformation',
  shaft: 'shaft-deformation',
  'pile group elastic interaction': 'pile-group-elastic-interaction',
  'pile group': 'pile-group-elastic-interaction',
  'slope embankment deformation': 'slope-embankment-deformation',
  embankment: 'slope-embankment-deformation',
  'retaining wall excavation support': 'retaining-wall-excavation-support',
  'retaining wall': 'retaining-wall-excavation-support',
  'seepage groundwater coupling': 'seepage-groundwater-coupling',
  seepage: 'seepage-groundwater-coupling',
  'staged settlement consolidation': 'staged-settlement-consolidation',
  consolidation: 'staged-settlement-consolidation',
};

const GROUNDWATER_CONDITION_ALIASES: Record<string, string> = {
  'not modelled': 'not_modelled',
  'not modeled': 'not_modelled',
  'not included': 'not_modelled',
  dry: 'not_modelled',
  'below domain': 'below_domain',
  'below model': 'below_domain',
  'below zone of influence': 'below_domain',
  specified: 'specified',
  known: 'specified',
};

function addNumber(
  target: ToolArgs,
  key: string,
  source: ToolArgs,
  aliases: readonly string[],
): void {
  const value = firstFiniteNumber(source, [key, ...aliases]);
  if (value !== undefined) target[key] = value;
}

function normalizeFemGeometry(source: ToolArgs, objective: unknown): ToolArgs | undefined {
  const target: ToolArgs = {};
  const objectiveText = typeof objective === 'string' ? normalizeToken(objective) : '';
  const geometryKind = normalizeToken([
    firstString(source, ['type', 'kind', 'geometryType']),
    objectiveText,
  ].filter(Boolean).join(' '));
  const isFoundation = /foundation|raft|settlement/.test(geometryKind);
  const isExcavation = /excavation|braced|wall/.test(geometryKind);
  const isTunnel = /tunnel|volume loss/.test(geometryKind);

  addNumber(target, 'raftLengthM', source, ['raftLength', 'raft_length', 'raft_length_m', 'length_m', 'lengthM', 'length', 'L']);
  addNumber(target, 'raftWidthM', source, ['raftWidth', 'raft_width', 'raft_width_m', 'width_m', 'widthM', 'width', 'B']);
  addNumber(target, 'raftThicknessM', source, ['raftThickness', 'raft_thickness', 'raft_thickness_m', 'thickness_m', 'thicknessM', 'thickness']);
  addNumber(target, 'domainLengthM', source, ['domainLength', 'domain_length', 'domain_length_m', 'model_length_m']);
  addNumber(target, 'domainWidthM', source, ['domainWidth', 'domain_width', 'domain_width_m', 'model_width_m']);
  addNumber(target, 'domainDepthM', source, ['domainDepth', 'domain_depth', 'domain_depth_m', 'model_depth_m']);

  addNumber(target, 'excavationLengthM', source, [
    'excavationLength',
    'excavation_length',
    'excavation_length_m',
    ...(isExcavation ? ['length_m', 'lengthM', 'length'] : []),
  ]);
  addNumber(target, 'excavationWidthM', source, [
    'excavationWidth',
    'excavation_width',
    'excavation_width_m',
    ...(isExcavation ? ['width_m', 'widthM', 'width'] : []),
  ]);
  addNumber(target, 'excavationFinalDepthM', source, [
    'excavationFinalDepth',
    'excavation_final_depth',
    'excavation_final_depth_m',
    'finalDepthM',
    'final_depth_m',
    ...(isExcavation ? ['depth_m', 'depthM', 'depth'] : []),
  ]);
  addNumber(target, 'wallToeDepthM', source, ['wallToeDepth', 'wall_toe_depth', 'wall_toe_depth_m', 'toe_depth_m']);

  addNumber(target, 'tunnelDiameterM', source, [
    'tunnelDiameter',
    'tunnel_diameter',
    'tunnel_diameter_m',
    ...(isTunnel ? ['diameter_m', 'diameterM', 'diameter'] : []),
  ]);
  addNumber(target, 'tunnelAxisDepthM', source, [
    'tunnelAxisDepth',
    'tunnel_axis_depth',
    'tunnel_axis_depth_m',
    'axisDepthM',
    'axis_depth_m',
    ...(isTunnel ? ['depth_m', 'depthM', 'depth'] : []),
  ]);
  addNumber(target, 'tunnelLengthM', source, [
    'tunnelLength',
    'tunnel_length',
    'tunnel_length_m',
    ...(isTunnel ? ['length_m', 'lengthM', 'length'] : []),
  ]);
  addNumber(target, 'tunnelCenterXM', source, ['tunnelCenterX', 'tunnel_center_x', 'tunnel_center_x_m', 'center_x_m', 'centerXM']);
  addNumber(target, 'tunnelCenterYM', source, ['tunnelCenterY', 'tunnel_center_y', 'tunnel_center_y_m', 'center_y_m', 'centerYM']);
  addNumber(target, 'tunnelVolumeLossPercent', source, ['tunnelVolumeLoss', 'tunnel_volume_loss', 'tunnel_volume_loss_percent', 'volumeLossPercent', 'volume_loss_percent']);
  addNumber(target, 'troughWidthParameterK', source, ['troughWidthK', 'trough_width_k', 'trough_width_parameter_k', 'troughWidthParameter', 'k']);

  if (!isFoundation) {
    delete target.raftLengthM;
    delete target.raftWidthM;
    delete target.raftThicknessM;
  }
  if (!isExcavation) {
    delete target.excavationLengthM;
    delete target.excavationWidthM;
    delete target.excavationFinalDepthM;
  }
  if (!isTunnel) {
    delete target.tunnelDiameterM;
    delete target.tunnelAxisDepthM;
    delete target.tunnelLengthM;
  }

  return compactRecord(target);
}

function normalizeFemExcavation(source: ToolArgs): ToolArgs | undefined {
  return compactRecord({
    stageDepthsM: toFiniteNumberArray(valueFromAliases(source, ['stageDepthsM', 'stageDepths', 'stage_depths_m', 'stage_depths', 'stages'])),
    supportLevelsM: toFiniteNumberArray(valueFromAliases(source, ['supportLevelsM', 'supportLevels', 'support_levels_m', 'support_levels'])),
    wallType: normalizeEnumValue(
      valueFromAliases(source, ['wallType', 'wall_type']),
      {
        'diaphragm wall': 'diaphragm_wall',
        diaphragm: 'diaphragm_wall',
        'secant pile wall': 'secant_pile_wall',
        secant: 'secant_pile_wall',
        'soldier pile lagging': 'soldier_pile_lagging',
        'soldier pile': 'soldier_pile_lagging',
        unsupported: 'unsupported_screening',
        'unsupported screening': 'unsupported_screening',
      },
    ),
  });
}

function normalizeFemLoad(source: ToolArgs): ToolArgs | undefined {
  return compactRecord({
    pressureKpa: firstFiniteNumber(source, [
      'pressureKpa',
      'pressureKPa',
      'pressure',
      'pressure_kpa',
      'servicePressure',
      'service_pressure',
      'servicePressureKPa',
      'bearingPressureKpa',
      'bearingPressureKPa',
      'bearing_pressure_kpa',
      'bearing_pressure_kPa',
      'raftPressureKpa',
      'servicePressureKpa',
      'service_pressure_kpa',
      'surchargeKpa',
      'surcharge_kpa',
    ]),
  });
}

function normalizeFemMaterial(source: ToolArgs): ToolArgs | undefined {
  return compactRecord({
    elasticModulusKpa: firstFiniteNumber(source, [
      'elasticModulusKpa',
      'elasticModulusKPa',
      'elasticModulus',
      'elastic_modulus_kpa',
      'elastic_modulus',
      'soilElasticModulusKpa',
      'soilElasticModulusKPa',
      'soil_elastic_modulus_kpa',
      'soil_elastic_modulus_kPa',
      'soil_elastic_modulus',
      'youngsModulusKpa',
      'youngsModulus',
      'youngs_modulus_kpa',
      'youngs_modulus',
      'youngModulusKpa',
      'youngModulus',
      'young_modulus_kpa',
      'young_modulus',
      'modulusKpa',
      'modulus',
      'modulus_kpa',
      'E_kPa',
      'E_kpa',
      'E',
      'e',
    ]),
    poissonRatio: firstFiniteNumber(source, [
      'poissonRatio',
      'poisson_ratio',
      'poissonsRatio',
      'poissons_ratio',
      'soilPoissonRatio',
      'soil_poisson_ratio',
      'soilPoissonsRatio',
      'soil_poissons_ratio',
      'poisson',
      'nu',
      'v',
    ]),
    unitWeightKnM3: firstFiniteNumber(source, [
      'unitWeightKnM3',
      'unit_weight_kn_m3',
      'unitWeight',
      'unit_weight',
      'gamma',
      'gammaKnM3',
      'gamma_kn_m3',
    ]),
    frictionAngleDeg: firstFiniteNumber(source, [
      'frictionAngleDeg',
      'friction_angle_deg',
      'frictionAngle',
      'friction_angle',
      'phiDeg',
      'phi_deg',
      'phi',
    ]),
    cohesionKpa: firstFiniteNumber(source, [
      'cohesionKpa',
      'cohesionKPa',
      'cohesion',
      'cohesion_kpa',
      'cohesion_kPa',
      'cKpa',
      'c_kpa',
    ]),
    hardeningModulusKpa: firstFiniteNumber(source, [
      'hardeningModulusKpa',
      'hardeningModulusKPa',
      'hardeningModulus',
      'hardening_modulus_kpa',
      'hardening_modulus',
      'isotropicHardeningModulusKpa',
      'isotropic_hardening_modulus_kpa',
      'hKpa',
      'h_kpa',
    ]),
  });
}

function normalizeFemGroundwater(source: ToolArgs): ToolArgs | undefined {
  const rawCondition = valueFromAliases(source, ['condition', 'groundwaterCondition', 'groundwater_condition']);
  const condition = normalizeEnumValue(rawCondition, GROUNDWATER_CONDITION_ALIASES);
  return compactRecord({
    condition: condition === 'not_modelled' || condition === 'below_domain' || condition === 'specified'
      ? condition
      : undefined,
    depthM: firstFiniteNumber(source, ['depthM', 'depth_m', 'groundwaterDepthM', 'groundwater_depth_m', 'waterTableDepthM', 'water_table_depth_m', 'assumedDepthM', 'assumed_depth_m']),
    note: firstString(source, ['note', 'assumption', 'description']),
  });
}

function normalizePrepareFemAnalysisCaseArgs(args: ToolArgs): ToolArgs {
  const inputs = recordFromAliases(args, ['inputs', 'input']);
  const objective = normalizeEnumValue(
    args.objective ?? inputs.objective,
    FEM_OBJECTIVE_ALIASES,
  );
  const inputGeometry = mergeRecords(
    recordFromAliases(inputs, ['geometry']),
    mergeRecords(
      recordFromAliases(inputs, ['plan_dimensions', 'planDimensions', 'dimensions']),
      recordFromAliases(inputs, ['raft_dimensions_m', 'raftDimensionsM', 'raft_dimensions', 'raftDimensions']),
    ),
  );
  const geometry = normalizeFemGeometry(mergeRecords(
    recordFromAliases(args, ['geometry']),
    mergeRecords(
      recordFromAliases(args, ['raft_dimensions_m', 'raftDimensionsM', 'raft_dimensions', 'raftDimensions']),
      mergeRecords(inputGeometry, mergeRecords(inputs, args)),
    ),
  ), objective);
  const load = normalizeFemLoad(mergeRecords(
    recordFromAliases(args, ['load']),
    mergeRecords(
      recordFromAliases(args, ['loading', 'loads']),
      mergeRecords(
        recordFromAliases(inputs, ['load']),
        mergeRecords(recordFromAliases(inputs, ['loading', 'loads']), mergeRecords(inputs, args)),
      ),
    ),
  ));
  const material = normalizeFemMaterial(mergeRecords(
    recordFromAliases(args, ['material']),
    mergeRecords(
      recordFromAliases(args, ['materials', 'soil']),
      mergeRecords(
        recordFromAliases(inputs, ['material']),
        mergeRecords(recordFromAliases(inputs, ['materials', 'soil']), mergeRecords(inputs, args)),
      ),
    ),
  ));
  const excavation = normalizeFemExcavation(mergeRecords(
    recordFromAliases(args, ['excavation']),
    mergeRecords(recordFromAliases(inputs, ['excavation']), mergeRecords(inputs, args)),
  ));
  const groundwater = normalizeFemGroundwater(mergeRecords(
    recordFromAliases(args, ['groundwater']),
    mergeRecords(
      recordFromAliases(args, ['ground_water', 'waterTable', 'water_table']),
      mergeRecords(
        recordFromAliases(inputs, ['groundwater']),
        mergeRecords(recordFromAliases(inputs, ['ground_water', 'waterTable', 'water_table']), mergeRecords(inputs, args)),
      ),
    ),
  ));
  const evidenceRefs = Array.isArray(args.evidenceRefs)
    ? args.evidenceRefs
    : Array.isArray(args.evidence_refs)
      ? args.evidence_refs
      : Array.isArray(inputs.evidenceRefs)
        ? inputs.evidenceRefs
        : Array.isArray(inputs.evidence_refs)
          ? inputs.evidence_refs
          : undefined;

  const normalized: ToolArgs = {
    objective,
    useDemoDefaults: firstBoolean(
      mergeRecords(args, inputs),
      ['useDemoDefaults', 'use_demo_defaults', 'demoDefaults', 'demo_defaults', 'demo'],
    ),
    geometry,
    load,
    material,
    excavation,
    groundwater,
    evidenceRefs,
  };

  return {
    ...args,
    ...compactRecord(normalized),
  };
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === 'string') {
    const items = value
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

function normalizeAssessFemProductionReadinessArgs(args: ToolArgs): ToolArgs {
  const objective = normalizeEnumValue(
    valueFromAliases(args, ['objective', 'femObjectiveHint', 'fem_objective_hint', 'objectiveHint', 'route', 'routeObjective']),
    FEM_OBJECTIVE_ALIASES,
  );
  const requestedFeatures = normalizeStringList(valueFromAliases(args, [
    'requestedFeatures',
    'requested_features',
    'features',
    'capabilities',
    'requestedCapabilities',
    'requested_capabilities',
  ]));

  return {
    ...args,
    ...(objective ? { objective } : {}),
    ...(requestedFeatures ? { requestedFeatures } : {}),
  };
}

export function normalizeToolArgs(toolName: string, args: ToolArgs): ToolArgs {
  switch (toolName) {
    case 'select_tbm_type':
      return applyAliases(args, 'groundType', TBM_GROUND_TYPE_ALIASES);
    case 'calculate_bearing_capacity':
      return applyAliases(
        applyAliases(args, 'method', BEARING_METHOD_ALIASES),
        'shape',
        FOUNDATION_SHAPE_ALIASES,
      );
    case 'calculate_lateral_earth_pressure':
      return applyAliases(args, 'pressureState', PRESSURE_STATE_ALIASES);
    case 'calculate_slope_stability':
      return applyAliases(args, 'method', SLOPE_METHOD_ALIASES);
    case 'list_fem_capabilities':
      return applyAliases(args, 'objective', FEM_OBJECTIVE_ALIASES);
    case 'assess_fem_production_readiness':
      return normalizeAssessFemProductionReadinessArgs(args);
    case 'prepare_fem_analysis_case':
      return normalizePrepareFemAnalysisCaseArgs(args);
    default:
      return args;
  }
}
