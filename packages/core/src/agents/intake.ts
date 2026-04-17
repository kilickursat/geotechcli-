import type { LLMConfig } from '../llm/types.js';

type EvidenceGroup =
  | 'subsurface_profile'
  | 'material_description'
  | 'in_situ_tests'
  | 'lab_classification'
  | 'strength_props'
  | 'groundwater'
  | 'loads_structure'
  | 'seismic_demand'
  | 'slope_geometry'
  | 'wall_geometry'
  | 'tunnel_geometry'
  | 'machine_ops'
  | 'rock_mass'
  | 'pile_geometry';

interface IntakeRule {
  id: string;
  label: string;
  intentPattern: RegExp;
  toolNames: string[];
  isSatisfied: (groups: Set<EvidenceGroup>, query: string) => boolean;
  buildMissingInputs: (groups: Set<EvidenceGroup>, query: string) => string[];
  guidance?: string[];
}

interface IntakeAssessment {
  rule: IntakeRule;
  missingInputs: string[];
}

interface IntakeOptions {
  unavailablePrefix?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasAny(groups: Set<EvidenceGroup>, ...candidates: EvidenceGroup[]): boolean {
  return candidates.some((candidate) => groups.has(candidate));
}

function hasSubsurfaceCharacterization(groups: Set<EvidenceGroup>): boolean {
  return hasAny(groups, 'subsurface_profile', 'material_description');
}

function hasSoilOrRockStrengthEvidence(groups: Set<EvidenceGroup>): boolean {
  return hasAny(groups, 'in_situ_tests', 'lab_classification', 'strength_props', 'rock_mass');
}

function extractStoryCount(query: string): number | null {
  const match = query.match(/(\d+)\s*-\s*story|(\d+)\s*story|(\d+)\s*-\s*storey|(\d+)\s*storey/i);
  if (!match) return null;
  const value = match[1] ?? match[2] ?? match[3] ?? match[4];
  return value ? Number(value) : null;
}

function buildProjectDescriptor(query: string): string {
  const storyCount = extractStoryCount(query);
  if (storyCount != null) {
    return `for this ${storyCount}-story project`;
  }
  return 'for this request';
}

function hasEngineeringWorkIntent(query: string): boolean {
  return /\b(?:classify|classification|recommend|design|size|calculate|assess|analyse|analyze|evaluate|check|estimate|predict|select|screen|determine|compare|verify|capacity|settlement|stability|liquefaction|earth pressure|penetration|support recommendation|what foundation|which foundation|what type|which type|what machine|which machine)\b/i.test(
    query,
  );
}

function isGeotechnicalDomainQuery(query: string): boolean {
  return /\b(?:soil|rock|foundation|footing|raft|pile|bearing|settlement|liquefaction|slope|retaining|earth pressure|tunnel|tbm|groundwater|seepage|geotechnical|uscs|rmr|q-system|ucs|rqd|cai|joint spacing|water inflow|face pressure|excavation face)\b/i.test(
    query,
  );
}

function collectEvidenceGroups(query: string): Set<EvidenceGroup> {
  const groups = new Set<EvidenceGroup>();

  const signals: Array<{ group: EvidenceGroup; pattern: RegExp }> = [
    {
      group: 'subsurface_profile',
      pattern:
        /\b(?:borehole|bh-?\d+|cptu?|soil log|stratigraphy|stratum|sample id|sample no|from \d+(?:\.\d+)?\s*m\s*(?:to|-)\s*\d+(?:\.\d+)?\s*m|layer depths?)\b/i,
    },
    {
      group: 'material_description',
      pattern:
        /\b(?:clay|silt|sand|gravel|peat|fill|loam|soft ground|mixed face|karst|squeezing|weathered rock|hard rock|sandstone|limestone|shale|granite|basalt|mudstone|rock mass|rock)\b/i,
    },
    {
      group: 'in_situ_tests',
      pattern: /\b(?:spt|n[- ]?value|n60|n160|cptu?|qc|fs|u2|blow count)\b/i,
    },
    {
      group: 'lab_classification',
      pattern:
        /\b(?:liquid limit|plastic limit|plasticity index|atterberg|grain size|gradation|sieve|hydrometer|fines content|d10|d30|d60|gravel ?%|sand ?%|fines ?%)\b/i,
    },
    {
      group: 'strength_props',
      pattern:
        /\b(?:su\b|cu\b|undrained shear|shear strength|cohesion|friction angle|phi\b|unit weight|gamma\b|elastic modulus|modulus|es\b|cv\b|cc\b|e0\b|preconsolidation|permeability|hydraulic conductivity|applied stress|stress increase)\b/i,
    },
    {
      group: 'groundwater',
      pattern: /\b(?:groundwater|water table|gwt|phreatic|pore pressure|seepage|drawdown|water inflow|inflow)\b/i,
    },
    {
      group: 'loads_structure',
      pattern:
        /\b(?:load|column load|axial load|bearing pressure|surcharge|footing width|foundation width|raft thickness|wall height|pile load|pile diameter|pile length|building|story|storey)\b/i,
    },
    {
      group: 'seismic_demand',
      pattern: /\b(?:pga|peak ground acceleration|magnitude|mw\b|csr\b|crr\b|seismic coefficient|kh\b)\b/i,
    },
    {
      group: 'slope_geometry',
      pattern: /\b(?:slope height|slope angle|embankment|cut slope|landslide|bench(?:ed)? slope)\b/i,
    },
    {
      group: 'wall_geometry',
      pattern:
        /\b(?:retaining wall|sheet pile|soldier pile|braced excavation|backfill angle|wall friction|cantilever wall)\b/i,
    },
    {
      group: 'tunnel_geometry',
      pattern:
        /\b(?:tunnel diameter|tbm diameter|tunnel depth|cover depth|overburden|volume loss|settlement trough|peck|trough width|inflection point)\b/i,
    },
    {
      group: 'machine_ops',
      pattern: /\b(?:rpm|thrust|torque|cutterhead|cutters?|advance rate|penetration rate|face pressure|water inflow)\b/i,
    },
    {
      group: 'rock_mass',
      pattern: /\b(?:ucs|rqd|cai|bts|jn\b|jr\b|ja\b|jw\b|srf\b|joint spacing)\b/i,
    },
    {
      group: 'pile_geometry',
      pattern: /\b(?:pile diameter|pile length|shaft resistance|base resistance|end bearing)\b/i,
    },
  ];

  for (const signal of signals) {
    if (signal.pattern.test(query)) {
      groups.add(signal.group);
    }
  }

  return groups;
}

const INTAKE_RULES: IntakeRule[] = [
  {
    id: 'foundation_screening',
    label: 'Foundation screening / selection',
    intentPattern:
      /\b(?:foundation|footing|raft|mat foundation|spread footing|caisson|deep foundation|shallow foundation|bearing capacity|allowable bearing|foundation type)\b/i,
    toolNames: [
      'calculate_bearing_capacity',
      'calculate_schmertmann_settlement',
      'calculate_consolidation',
      'calculate_pile_capacity',
    ],
    isSatisfied: (groups) =>
      hasSubsurfaceCharacterization(groups) &&
      hasSoilOrRockStrengthEvidence(groups) &&
      groups.has('loads_structure'),
    buildMissingInputs: (groups, query) => {
      const missing: string[] = [];
      if (!hasSubsurfaceCharacterization(groups)) {
        missing.push('Borehole or CPT profile with layer depths and material descriptions');
      }
      if (!hasSoilOrRockStrengthEvidence(groups)) {
        missing.push('SPT/CPT data or layer-by-layer shear strength, friction angle, and unit weight');
      }
      if (!groups.has('groundwater')) {
        missing.push('Groundwater depth or water table information');
      }
      if (!groups.has('loads_structure')) {
        missing.push('Column loads, applied bearing pressure, or footing / raft geometry');
      }
      return missing;
    },
  },
  {
    id: 'pile_capacity',
    label: 'Pile capacity screening',
    intentPattern:
      /\b(?:pile capacity|pile design|single pile|shaft resistance|base resistance|end bearing)\b/i,
    toolNames: ['calculate_pile_capacity'],
    isSatisfied: (groups) =>
      groups.has('pile_geometry') &&
      hasSubsurfaceCharacterization(groups) &&
      hasAny(groups, 'in_situ_tests', 'strength_props'),
    buildMissingInputs: (groups, query) => {
      const missing: string[] = [];
      if (!groups.has('pile_geometry')) {
        missing.push('Pile diameter and pile length');
      }
      if (!hasSubsurfaceCharacterization(groups)) {
        missing.push('Layer-by-layer soil profile along the pile embedment depth');
      }
      if (!hasAny(groups, 'in_situ_tests', 'strength_props')) {
        missing.push('SPT/CPT values or layer shear-strength / friction-angle data for shaft and base resistance');
      }
      if (!groups.has('groundwater')) {
        missing.push('Groundwater depth if buoyancy or effective stress matters');
      }
      return missing;
    },
  },
  {
    id: 'soil_classification',
    label: 'Soil classification',
    intentPattern: /\b(?:classify|classification|uscs|soil profile|plasticity chart|atterberg)\b/i,
    toolNames: ['classify_uscs'],
    isSatisfied: (groups) =>
      groups.has('lab_classification') && hasSubsurfaceCharacterization(groups),
    buildMissingInputs: (groups, query) => {
      const missing: string[] = [];
      if (!groups.has('lab_classification')) {
        missing.push('Grain size distribution and/or Atterberg limits (LL, PL, PI)');
      }
      if (!hasSubsurfaceCharacterization(groups)) {
        missing.push('Layer depths or sample descriptions tied to each soil unit');
      }
      return missing;
    },
    guidance: [
      'Formal USCS classification needs gradation and/or Atterberg data; broad material descriptions alone are only screening-level evidence.',
    ],
  },
  {
    id: 'liquefaction',
    label: 'Liquefaction assessment',
    intentPattern: /\b(?:liquefaction|csr\b|crr\b|cyclic resistance)\b/i,
    toolNames: ['calculate_liquefaction'],
    isSatisfied: (groups) =>
      groups.has('seismic_demand') &&
      groups.has('in_situ_tests') &&
      hasSubsurfaceCharacterization(groups) &&
      groups.has('groundwater'),
    buildMissingInputs: (groups, query) => {
      const missing: string[] = [];
      if (!groups.has('seismic_demand')) {
        missing.push('Earthquake magnitude and PGA or equivalent seismic demand');
      }
      if (!hasSubsurfaceCharacterization(groups)) {
        missing.push('Layer depths and soil descriptions across the potentially liquefiable zone');
      }
      if (!groups.has('in_situ_tests')) {
        missing.push('SPT or CPT data by depth for the liquefaction screening layers');
      }
      if (!groups.has('groundwater')) {
        missing.push('Groundwater depth or phreatic surface');
      }
      return missing;
    },
  },
  {
    id: 'slope_stability',
    label: 'Slope stability',
    intentPattern: /\b(?:slope stability|embankment|cut slope|landslide|factor of safety)\b/i,
    toolNames: ['calculate_slope_stability'],
    isSatisfied: (groups) =>
      groups.has('slope_geometry') &&
      hasSubsurfaceCharacterization(groups) &&
      groups.has('strength_props'),
    buildMissingInputs: (groups, query) => {
      const missing: string[] = [];
      if (!groups.has('slope_geometry')) {
        missing.push('Slope height and slope angle or cross-section geometry');
      }
      if (!hasSubsurfaceCharacterization(groups)) {
        missing.push('Soil layering or material zoning within the slope');
      }
      if (!groups.has('strength_props')) {
        missing.push('Unit weight, cohesion, and friction angle for each relevant layer');
      }
      if (!groups.has('groundwater')) {
        missing.push('Groundwater level, seepage condition, or phreatic surface if relevant');
      }
      if (!groups.has('seismic_demand') && !/\b(?:static|no seismic)\b/i.test(query)) {
        missing.push('Seismic coefficient or confirmation that static screening is acceptable');
      }
      return missing;
    },
  },
  {
    id: 'retaining_wall',
    label: 'Retaining wall / earth pressure',
    intentPattern:
      /\b(?:retaining wall|earth pressure|sheet pile|braced excavation|cantilever wall|ka\b|kp\b|k0\b)\b/i,
    toolNames: ['calculate_lateral_earth_pressure'],
    isSatisfied: (groups) =>
      (groups.has('wall_geometry') || groups.has('loads_structure')) &&
      hasSubsurfaceCharacterization(groups) &&
      groups.has('strength_props'),
    buildMissingInputs: (groups, query) => {
      const missing: string[] = [];
      if (!(groups.has('wall_geometry') || groups.has('loads_structure'))) {
        missing.push('Wall height and backfill / excavation geometry');
      }
      if (!hasSubsurfaceCharacterization(groups)) {
        missing.push('Backfill or retained-side soil layering');
      }
      if (!groups.has('strength_props')) {
        missing.push('Unit weight, cohesion, and friction angle for each soil zone');
      }
      if (!groups.has('groundwater')) {
        missing.push('Groundwater level and any surcharge loads');
      }
      return missing;
    },
  },
  {
    id: 'tunnel_settlement',
    label: 'Tunnel settlement screening',
    intentPattern: /\b(?:settlement trough|peck|volume loss|tunnel settlement)\b/i,
    toolNames: ['calculate_tunnel_settlement'],
    isSatisfied: (groups, query) =>
      groups.has('tunnel_geometry') ||
      /\b(?:diameter|depth|cover)\b/i.test(query),
    buildMissingInputs: (groups, query) => {
      const missing: string[] = [];
      if (!groups.has('tunnel_geometry')) {
        missing.push('Tunnel diameter and tunnel axis depth or cover depth');
      }
      if (!/\b(?:volume loss|vl\b|trough width|k\s*=|trough-k)\b/i.test(query)) {
        missing.push('Volume loss estimate or confirmation that a default screening value is acceptable');
      }
      return missing;
    },
  },
  {
    id: 'tbm_performance',
    label: 'TBM performance / selection',
    intentPattern:
      /\b(?:tbm|epb|slurry|shield|cutter wear|penetration rate|advance rate|machine selection|tbm select|tbm predict|machine type|boring machine|excavation face|face pressure|water inflow)\b/i,
    toolNames: ['select_tbm_type', 'predict_tbm_performance', 'predict_cutter_wear'],
    isSatisfied: (groups, query) =>
      (groups.has('tunnel_geometry') || /\b(?:diameter)\b/i.test(query)) &&
      hasAny(groups, 'material_description', 'rock_mass'),
    buildMissingInputs: (groups) => {
      const missing: string[] = [];
      if (!groups.has('tunnel_geometry')) {
        missing.push('TBM or tunnel diameter, and excavation depth / overburden where relevant');
      }
      if (!hasAny(groups, 'material_description', 'rock_mass')) {
        missing.push('Ground type for machine selection, or rock metrics such as UCS and RQD for performance prediction');
      }
      if (!groups.has('machine_ops')) {
        missing.push('Operating parameters such as RPM, thrust, torque, or cutter count if you want performance rather than only machine-class selection');
      }
      return missing;
    },
    guidance: [
      'The current deterministic TBM performance predictor is validated for rock disc-cutter inputs; EPB soft-ground penetration screening still needs a validated deterministic model.',
    ],
  },
  {
    id: 'settlement',
    label: 'Foundation settlement',
    intentPattern: /\b(?:consolidation|schmertmann|immediate settlement|primary settlement)\b/i,
    toolNames: ['calculate_consolidation', 'calculate_schmertmann_settlement'],
    isSatisfied: (groups) =>
      groups.has('loads_structure') &&
      hasSubsurfaceCharacterization(groups) &&
      hasAny(groups, 'strength_props', 'lab_classification'),
    buildMissingInputs: (groups) => {
      const missing: string[] = [];
      if (!groups.has('loads_structure')) {
        missing.push('Applied stress, stress increase, or foundation width / geometry');
      }
      if (!hasSubsurfaceCharacterization(groups)) {
        missing.push('Settlement layer thicknesses and soil profile');
      }
      if (!hasAny(groups, 'strength_props', 'lab_classification')) {
        missing.push('Compressibility or stiffness inputs such as Cc, e0, Cv, or layer modulus');
      }
      return missing;
    },
  },
  {
    id: 'rock_mass_classification',
    label: 'Rock mass classification',
    intentPattern: /\b(?:rmr|q-system|rock mass|support class|support recommendation)\b/i,
    toolNames: ['classify_rmr89', 'classify_q_system'],
    isSatisfied: (groups) => groups.has('rock_mass'),
    buildMissingInputs: (groups) => {
      const missing: string[] = [];
      if (!groups.has('rock_mass')) {
        missing.push('RQD, UCS, and the discontinuity indices required by RMR89 or Q-system');
      }
      if (!groups.has('groundwater')) {
        missing.push('Groundwater / joint-water condition if support screening depends on it');
      }
      return missing;
    },
  },
];

const GENERAL_GEOTECHNICAL_RULE: IntakeRule = {
  id: 'general_geotechnical_analysis',
  label: 'General geotechnical engineering analysis',
  intentPattern: /.*/,
  toolNames: [],
  isSatisfied: (groups) => groups.size >= 3,
  buildMissingInputs: (groups) => {
    const missing: string[] = [];
    if (!hasSubsurfaceCharacterization(groups)) {
      missing.push('Site stratigraphy, material descriptions, or a borehole / CPT profile');
    }
    if (!hasSoilOrRockStrengthEvidence(groups)) {
      missing.push('Relevant in-situ tests, lab data, or engineering parameters for the governing soil or rock units');
    }
    if (!hasAny(groups, 'loads_structure', 'slope_geometry', 'wall_geometry', 'tunnel_geometry', 'pile_geometry', 'seismic_demand')) {
      missing.push('Project geometry, structural demand, or hazard demand tied to the analysis you want');
    }
    if (!groups.has('groundwater')) {
      missing.push('Groundwater level if effective stress, seepage, or buoyancy matters');
    }
    return missing;
  },
};

function hasRelevantProjectEvidence(sessionContext?: Record<string, unknown>): boolean {
  if (!sessionContext) {
    return false;
  }

  const soilProfiles = Array.isArray(sessionContext.soilProfiles) ? sessionContext.soilProfiles.length : 0;
  const namedDatasets = isRecord(sessionContext.namedDatasets)
    ? Object.keys(sessionContext.namedDatasets).length
    : 0;
  const derivedParameters = isRecord(sessionContext.derivedParameters)
    ? Object.keys(sessionContext.derivedParameters).length
    : 0;

  const activeAnalysisContext = isRecord(sessionContext.activeAnalysisContext)
    ? sessionContext.activeAnalysisContext
    : undefined;

  const analysisContext =
    activeAnalysisContext && isRecord(activeAnalysisContext.context)
      ? Object.keys(activeAnalysisContext.context).length
      : 0;
  const relatedDatasets =
    activeAnalysisContext && Array.isArray(activeAnalysisContext.relatedDatasets)
      ? activeAnalysisContext.relatedDatasets.length
      : 0;

  return (
    soilProfiles > 0 ||
    namedDatasets > 0 ||
    derivedParameters > 0 ||
    analysisContext > 0 ||
    relatedDatasets > 0
  );
}

function assessIntake(query: string): IntakeAssessment[] {
  const evidenceGroups = collectEvidenceGroups(query);
  const matchedRules = INTAKE_RULES.filter((rule) => rule.intentPattern.test(query));

  const rules = matchedRules.length > 0 ? matchedRules : [GENERAL_GEOTECHNICAL_RULE];

  return rules
    .map((rule) => ({
      rule,
      missingInputs: rule.isSatisfied(evidenceGroups, query)
        ? []
        : rule.buildMissingInputs(evidenceGroups, query),
    }))
    .filter((assessment) => assessment.missingInputs.length > 0);
}

function buildIntakeAnswer(query: string, assessments: IntakeAssessment[], options?: IntakeOptions): string {
  const missingLines = assessments.flatMap((assessment) =>
    assessment.missingInputs.map((item) => `- ${assessment.rule.label}: ${item}`),
  );
  const tools = [...new Set(assessments.flatMap((assessment) => assessment.rule.toolNames))];
  const guidance = [...new Set(assessments.flatMap((assessment) => assessment.rule.guidance ?? []))];

  const lines = [
    options?.unavailablePrefix ??
      `This request is asking for geotechnical engineering analysis ${buildProjectDescriptor(query)}, but it does not yet include enough engineering evidence to run a defensible agent workflow.`,
    '',
    'Likely analysis tracks:',
    ...assessments.map((assessment) => `- ${assessment.rule.label}`),
    '',
    'Minimum inputs still needed:',
    ...missingLines,
  ];

  if (tools.length > 0) {
    lines.push('');
    lines.push('Deterministic tools geotechCLI can use once the data is provided:');
    lines.push(...tools.map((toolName) => `- \`${toolName}\``));
  }

  if (guidance.length > 0) {
    lines.push('');
    lines.push('Engineering notes:');
    lines.push(...guidance.map((note) => `- ${note}`));
  }

  lines.push('');
  lines.push('If you already have borehole, CPT, lab, or load data, rerun the agent with the key numbers or attach an `.ags`, `.csv`, or `.json` path.');

  return lines.join('\n');
}

export function buildGeotechnicalPreflightAnswer(
  userQuery: string,
  config: LLMConfig,
  sessionContext?: Record<string, unknown>,
): string | null {
  if (config.provider !== 'hosted-beta') {
    return null;
  }

  if (!hasEngineeringWorkIntent(userQuery) || !isGeotechnicalDomainQuery(userQuery)) {
    return null;
  }

  if (hasRelevantProjectEvidence(sessionContext)) {
    return null;
  }

  const assessments = assessIntake(userQuery);
  if (assessments.length === 0) {
    return null;
  }

  return buildIntakeAnswer(userQuery, assessments);
}

export function buildGeotechnicalFallbackAnswer(
  userQuery: string,
  sessionContext?: Record<string, unknown>,
): string | null {
  if (!hasEngineeringWorkIntent(userQuery) || !isGeotechnicalDomainQuery(userQuery)) {
    return null;
  }

  if (hasRelevantProjectEvidence(sessionContext)) {
    return null;
  }

  const assessments = assessIntake(userQuery);
  if (assessments.length === 0) {
    return null;
  }

  return buildIntakeAnswer(userQuery, assessments, {
    unavailablePrefix:
      'Hosted beta was temporarily unavailable, so geotechCLI returned a deterministic engineering intake instead of waiting for the model to restate missing data.',
  });
}
