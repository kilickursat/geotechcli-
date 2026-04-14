type ToolArgs = Record<string, unknown>;

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
    default:
      return args;
  }
}
