import {
  calculateBearingCapacity,
  calculateConsolidation,
  calculateSchmertmann,
  calculatePeckSettlement,
  calculateLiquefaction,
  classifyUSCS,
  classifyRMR89,
  classifyQSystem,
  predictTBMPerformance,
  selectTBMType,
  predictCutterWear,
} from '../geo/index.js';

import {
  exportGeoJSON,
  exportCSV,
  exportDXF,
} from '../export/index.js';

// ---------------------------------------------------------------------------
// Tool definition — what the LLM sees
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

// ---------------------------------------------------------------------------
// Tool execution — what actually runs
// ---------------------------------------------------------------------------

export interface ToolResult {
  success: boolean;
  data: unknown;
  summary: string; // Human-readable one-liner for the agent to reason about
  error?: string;
}

type ToolExecutor = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;

interface RegisteredTool {
  definition: ToolDefinition;
  execute: ToolExecutor;
}

// ---------------------------------------------------------------------------
// The Registry
// ---------------------------------------------------------------------------

class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(def: ToolDefinition, execute: ToolExecutor): void {
    this.tools.set(def.name, { definition: def, execute });
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, data: null, summary: '', error: `Unknown tool: ${name}` };
    }
    try {
      return await tool.execute(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: null, summary: '', error: `Tool "${name}" failed: ${msg}` };
    }
  }

  /** Format all tool definitions for LLM system prompt injection */
  toToolDescriptions(): string {
    return this.list()
      .map((t) => {
        const params = Object.entries(
          (t.parameters as any).properties ?? {},
        )
          .map(([k, v]: [string, any]) => {
            const req = ((t.parameters as any).required ?? []).includes(k) ? ' (required)' : ' (optional)';
            return `    - ${k}: ${v.description ?? v.type}${req}`;
          })
          .join('\n');
        return `  ${t.name}: ${t.description}\n${params}`;
      })
      .join('\n\n');
  }

  /** Format as function-calling tool array for providers that support it */
  toFunctionCallingFormat(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    return this.list().map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}

// ---------------------------------------------------------------------------
// Singleton registry with all tools registered
// ---------------------------------------------------------------------------

export const toolRegistry = new ToolRegistry();

// --- Bearing Capacity ---
toolRegistry.register(
  {
    name: 'calculate_bearing_capacity',
    description:
      'Calculate ultimate and allowable bearing capacity for shallow foundations using Terzaghi, Meyerhof, Hansen, or Vesic methods. Returns qUltimate (kPa), qAllowable (kPa), bearing capacity factors, and calculation steps.',
    parameters: {
      type: 'object',
      required: ['depth', 'frictionAngle'],
      properties: {
        width: { type: 'number', description: 'Foundation width B in meters', default: 2 },
        length: { type: 'number', description: 'Foundation length L in meters (omit for strip footing)' },
        depth: { type: 'number', description: 'Embedment depth Df in meters' },
        unitWeight: { type: 'number', description: 'Soil unit weight γ in kN/m³', default: 18 },
        cohesion: { type: 'number', description: 'Cohesion c in kPa', default: 0 },
        frictionAngle: { type: 'number', description: 'Friction angle φ in degrees' },
        method: { type: 'string', enum: ['terzaghi', 'meyerhof', 'hansen', 'vesic'], description: 'Calculation method', default: 'meyerhof' },
        factorOfSafety: { type: 'number', description: 'Factor of safety', default: 3.0 },
        shape: { type: 'string', enum: ['strip', 'square', 'circular', 'rectangular'], default: 'strip' },
      },
    },
  },
  (args) => {
    const result = calculateBearingCapacity({
      width: (args.width as number) ?? 2,
      depth: args.depth as number,
      unitWeight: (args.unitWeight as number) ?? 18,
      cohesion: (args.cohesion as number) ?? 0,
      frictionAngle: args.frictionAngle as number,
      method: (args.method as string as any) ?? 'meyerhof',
      factorOfSafety: (args.factorOfSafety as number) ?? 3.0,
      shape: (args.shape as string as any) ?? 'strip',
      length: args.length as number | undefined,
    });
    return {
      success: true,
      data: result,
      summary: `Bearing capacity (${result.method}): q_ult = ${result.qUltimate} kPa, q_allow = ${result.qAllowable} kPa (FS=${result.factorOfSafety})`,
    };
  },
);

// --- Liquefaction ---
toolRegistry.register(
  {
    name: 'calculate_liquefaction',
    description:
      'Assess seismic liquefaction triggering potential using Boulanger & Idriss (2014) or NCEER simplified procedure. Requires SPT data, earthquake magnitude, and PGA. Returns CSR, CRR, factor of safety, and liquefaction potential per layer.',
    parameters: {
      type: 'object',
      required: ['earthquakeMagnitude', 'pga', 'layers'],
      properties: {
        earthquakeMagnitude: { type: 'number', description: 'Moment magnitude Mw (4-9.5)' },
        pga: { type: 'number', description: 'Peak ground acceleration in g' },
        method: { type: 'string', enum: ['boulanger-idriss-2014', 'nceer'], default: 'boulanger-idriss-2014' },
        layers: {
          type: 'array',
          description: 'Array of soil layers with depth, sptN, finesContent, unitWeight, waterTableDepth',
          items: {
            type: 'object',
            properties: {
              depth: { type: 'number', description: 'Mid-depth of layer in meters' },
              sptN: { type: 'number', description: 'Measured SPT N-value' },
              finesContent: { type: 'number', description: 'Fines content in percent', default: 5 },
              unitWeight: { type: 'number', description: 'Total unit weight kN/m³', default: 18 },
              waterTableDepth: { type: 'number', description: 'Water table depth in meters', default: 1 },
            },
          },
        },
      },
    },
  },
  (args) => {
    const result = calculateLiquefaction(args as any);
    const severe = result.layers.filter((l) => l.potential === 'SEVERE' || l.potential === 'HIGH').length;
    return {
      success: true,
      data: result,
      summary: `Liquefaction analysis: ${result.layers.length} layers evaluated, ${severe} with HIGH/SEVERE risk. Estimated settlement: ${result.estimatedSettlement} mm`,
    };
  },
);

// --- RMR89 ---
toolRegistry.register(
  {
    name: 'classify_rmr89',
    description:
      'Classify rock mass using Rock Mass Rating system (Bieniawski 1989). Returns RMR score (0-100), rock class (I-V), and support recommendations for tunnels.',
    parameters: {
      type: 'object',
      required: ['ucs', 'rqd'],
      properties: {
        ucs: { type: 'number', description: 'Uniaxial compressive strength in MPa' },
        rqd: { type: 'number', description: 'Rock Quality Designation in percent (0-100)' },
        spacing: { type: 'number', description: 'Discontinuity spacing in meters', default: 0.3 },
        condition: { type: 'string', enum: ['very_good', 'good', 'fair', 'poor', 'very_poor'], default: 'fair' },
        groundwater: { type: 'string', enum: ['dry', 'damp', 'wet', 'dripping', 'flowing'], default: 'dry' },
        orientationAdjustment: { type: 'number', description: 'Orientation adjustment (-60 to 0)', default: 0 },
      },
    },
  },
  (args) => {
    const result = classifyRMR89(args as any);
    return {
      success: true,
      data: result,
      summary: `RMR89 = ${result.totalRating} → Class ${result.classNumber}: ${result.rockClass}. Support: ${result.supportRecommendation}`,
    };
  },
);

// --- USCS ---
toolRegistry.register(
  {
    name: 'classify_uscs',
    description:
      'Classify soil using the Unified Soil Classification System (ASTM D2487). Requires grain size distribution and optionally Atterberg limits.',
    parameters: {
      type: 'object',
      required: ['gravelPercent', 'sandPercent', 'finesPercent'],
      properties: {
        gravelPercent: { type: 'number', description: 'Gravel fraction percent (retained on #4)' },
        sandPercent: { type: 'number', description: 'Sand fraction percent (passing #4, retained #200)' },
        finesPercent: { type: 'number', description: 'Fines fraction percent (passing #200)' },
        liquidLimit: { type: 'number', description: 'Liquid Limit in percent' },
        plasticityIndex: { type: 'number', description: 'Plasticity Index in percent' },
      },
    },
  },
  (args) => {
    const result = classifyUSCS(args as any);
    return {
      success: true,
      data: result,
      summary: `USCS: ${result.symbol} — ${result.name} (${result.group})`,
    };
  },
);

// --- Q-system ---
toolRegistry.register(
  {
    name: 'classify_q_system',
    description:
      'Classify rock mass using the Q-system (Barton et al. 1974). Returns Q-value and tunnel support recommendations.',
    parameters: {
      type: 'object',
      required: ['rqd', 'jn', 'jr', 'ja'],
      properties: {
        rqd: { type: 'number', description: 'RQD percent' },
        jn: { type: 'number', description: 'Joint set number' },
        jr: { type: 'number', description: 'Joint roughness number' },
        ja: { type: 'number', description: 'Joint alteration number' },
        jw: { type: 'number', description: 'Joint water reduction factor', default: 1.0 },
        srf: { type: 'number', description: 'Stress reduction factor', default: 1.0 },
      },
    },
  },
  (args) => {
    const result = classifyQSystem(args as any);
    return {
      success: true,
      data: result,
      summary: `Q = ${result.qValue} — ${result.category}. Support: ${result.supportRecommendation}`,
    };
  },
);

// --- TBM Predict ---
toolRegistry.register(
  {
    name: 'predict_tbm_performance',
    description:
      'Predict TBM performance: penetration rate, advance rate, cutter wear, thrust, torque, and cutterhead power. Based on NTNU/CSM model.',
    parameters: {
      type: 'object',
      required: ['diameter', 'ucs', 'rqd'],
      properties: {
        diameter: { type: 'number', description: 'TBM diameter in meters' },
        ucs: { type: 'number', description: 'Rock UCS in MPa' },
        rqd: { type: 'number', description: 'RQD percent' },
        cai: { type: 'number', description: 'Cerchar Abrasivity Index (0-7)' },
        bts: { type: 'number', description: 'Brazilian Tensile Strength in MPa' },
        jointSpacing: { type: 'number', description: 'Mean joint spacing in meters' },
        alpha: { type: 'number', description: 'Angle between tunnel axis and joints in degrees' },
      },
    },
  },
  (args) => {
    const result = predictTBMPerformance(args as any);
    return {
      success: true,
      data: result,
      summary: `TBM prediction: PR=${result.penetrationRate} mm/rev, advance=${result.advanceRate} m/day, thrust=${(result.requiredThrust / 1000).toFixed(0)} MN, cutter life=${result.cutterLife} m`,
    };
  },
);

// --- TBM Select ---
toolRegistry.register(
  {
    name: 'select_tbm_type',
    description:
      'Recommend optimal TBM type (Open, Shield, EPB, Slurry, Convertible) based on ground conditions, water pressure, and project specifics.',
    parameters: {
      type: 'object',
      required: ['diameter', 'groundType'],
      properties: {
        diameter: { type: 'number', description: 'Tunnel diameter in meters' },
        groundType: { type: 'string', enum: ['rock', 'soft_ground', 'mixed', 'squeezing', 'karst'] },
        ucs: { type: 'number', description: 'Average UCS in MPa' },
        waterPressure: { type: 'number', description: 'Max groundwater pressure in bar', default: 0 },
        overburden: { type: 'number', description: 'Max overburden depth in meters' },
        finesContent: { type: 'number', description: 'Fines content percent in soft ground' },
        stickyClayRisk: { type: 'boolean', description: 'Risk of clogging', default: false },
        boulderRisk: { type: 'boolean', description: 'Risk of boulders', default: false },
        gasRisk: { type: 'boolean', description: 'Risk of methane/H2S', default: false },
      },
    },
  },
  (args) => {
    const result = selectTBMType(args as any);
    return {
      success: true,
      data: result,
      summary: `TBM selection: ${result.recommendation} (${result.confidence}% confidence). Key: ${result.keyFactors[0] ?? 'N/A'}`,
    };
  },
);

// --- Cutter Wear ---
toolRegistry.register(
  {
    name: 'predict_cutter_wear',
    description:
      'Predict TBM disc cutter wear rate, total replacements, and cost estimate based on Cerchar Abrasivity Index and rock properties.',
    parameters: {
      type: 'object',
      required: ['cai', 'ucs', 'totalDistance', 'numberOfCutters'],
      properties: {
        cai: { type: 'number', description: 'Cerchar Abrasivity Index (0-7)' },
        ucs: { type: 'number', description: 'UCS in MPa' },
        quartz: { type: 'number', description: 'Quartz content percent', default: 30 },
        totalDistance: { type: 'number', description: 'Total tunnel length in meters' },
        numberOfCutters: { type: 'number', description: 'Number of disc cutters' },
      },
    },
  },
  (args) => {
    const result = predictCutterWear(args as any);
    return {
      success: true,
      data: result,
      summary: `Cutter wear: ${result.abrasivityClass}, life=${result.wearRatePerCutter} m/cutter, total changes=${result.totalCutterChanges}, cost=€${result.costEstimate.toLocaleString()}`,
    };
  },
);

// --- Settlement (Peck) ---
toolRegistry.register(
  {
    name: 'calculate_tunnel_settlement',
    description:
      'Calculate surface settlement trough above a tunnel using Peck\'s Gaussian formula. Returns max settlement, inflection point, and full settlement profile.',
    parameters: {
      type: 'object',
      required: ['tunnelDiameter', 'tunnelDepth'],
      properties: {
        tunnelDiameter: { type: 'number', description: 'Tunnel diameter D in meters' },
        tunnelDepth: { type: 'number', description: 'Depth to tunnel axis Z₀ in meters' },
        volumeLoss: { type: 'number', description: 'Volume loss Vl in percent', default: 1.0 },
        troughWidthParam: { type: 'number', description: 'Trough width parameter K', default: 0.5 },
      },
    },
  },
  (args) => {
    const result = calculatePeckSettlement(args as any);
    return {
      success: true,
      data: result,
      summary: `Tunnel settlement: Smax=${result.maxSettlement} mm, inflection point i=${result.inflectionPoint} m, trough width=${result.troughWidth} m`,
    };
  },
);

// --- Consolidation Settlement (Terzaghi 1D) ---
toolRegistry.register(
  {
    name: 'calculate_consolidation',
    description:
      'Calculate 1D consolidation settlement for clay layers using Terzaghi theory. Handles NC and OC soils. Returns primary settlement, time-settlement curve if Cv provided.',
    parameters: {
      type: 'object',
      required: ['compressionIndex', 'voidRatio', 'layerThickness', 'stressIncrease', 'initialEffectiveStress'],
      properties: {
        compressionIndex: { type: 'number', description: 'Compression index Cc' },
        recompressionIndex: { type: 'number', description: 'Recompression index Cr (default Cc/5)' },
        voidRatio: { type: 'number', description: 'Initial void ratio e\u2080' },
        layerThickness: { type: 'number', description: 'Clay layer thickness H (m)' },
        stressIncrease: { type: 'number', description: 'Stress increase (kPa)' },
        initialEffectiveStress: { type: 'number', description: 'Initial effective stress (kPa)' },
        preconsolidationPressure: { type: 'number', description: 'Preconsolidation pressure (kPa)' },
        drainagePath: { type: 'string', enum: ['single', 'double'], default: 'double' },
        coefficientOfConsolidation: { type: 'number', description: 'Cv (m^2/year)' },
      },
    },
  },
  (args) => {
    const result = calculateConsolidation(args as any);
    return {
      success: true,
      data: result,
      summary: `Consolidation: ${result.primarySettlement} mm (${result.isOverconsolidated ? 'OC' : 'NC'})`,
    };
  },
);

// --- Schmertmann Settlement ---
toolRegistry.register(
  {
    name: 'calculate_schmertmann_settlement',
    description:
      'Calculate immediate settlement using Schmertmann (1970/1978). Uses strain influence diagram with embedment and creep corrections for granular soils.',
    parameters: {
      type: 'object',
      required: ['appliedStress', 'foundationWidth', 'layers'],
      properties: {
        appliedStress: { type: 'number', description: 'Net applied stress q (kPa)' },
        foundationWidth: { type: 'number', description: 'Foundation width B (m)' },
        layers: { type: 'array', description: 'Sublayers: [{thickness, elasticModulus}]', items: { type: 'object', properties: { thickness: { type: 'number' }, elasticModulus: { type: 'number' } } } },
        embedmentDepth: { type: 'number', default: 0 },
        unitWeight: { type: 'number', default: 18 },
        timeFactor: { type: 'number', default: 1 },
      },
    },
  },
  (args) => {
    const result = calculateSchmertmann(args as any);
    return {
      success: true,
      data: result,
      summary: `Schmertmann: immediate=${result.immediateSettlement} mm, total=${result.totalSettlement} mm`,
    };
  },
);

// ---------------------------------------------------------------------------
// NEW: Pile Capacity
// ---------------------------------------------------------------------------

import { calculatePileCapacity } from '../geo/pile-capacity.js';

toolRegistry.register(
  {
    name: 'calculate_pile_capacity',
    description:
      'Calculate axial pile capacity using α-method (clay), β-method (sand), or SPT-based (Meyerhof 1976). Returns shaft resistance, base resistance, ultimate and allowable capacity per layer. Supports driven, bored, and CFA piles.',
    parameters: {
      type: 'object',
      required: ['pileDiameter', 'pileLength', 'layers'],
      properties: {
        pileDiameter: { type: 'number', description: 'Pile diameter (m)' },
        pileLength: { type: 'number', description: 'Embedded pile length (m)' },
        pileType: { type: 'string', enum: ['driven', 'bored', 'cfa'], default: 'driven' },
        pileShape: { type: 'string', enum: ['circular', 'square', 'h-section'], default: 'circular' },
        layers: {
          type: 'array',
          description: 'Soil layers: [{thickness, soilType, undrained_shear_strength?, friction_angle?, unit_weight, spt_n?}]',
          items: { type: 'object' },
        },
        waterTableDepth: { type: 'number', default: 999 },
        factorOfSafety: { type: 'number', default: 2.5 },
        method: { type: 'string', enum: ['alpha', 'beta', 'spt-meyerhof', 'auto'], default: 'auto' },
      },
    },
  },
  (args) => {
    const result = calculatePileCapacity(args as any);
    return {
      success: true,
      data: result,
      summary: `Pile capacity (${result.method}): Qu=${result.ultimateCapacity} kN (Qs=${result.shaftResistance}+Qb=${result.baseResistance}), Qa=${result.allowableCapacity} kN (FS=${result.factorOfSafety})`,
    };
  },
);

// ---------------------------------------------------------------------------
// NEW: Slope Stability
// ---------------------------------------------------------------------------

import { calculateSlopeStability } from '../geo/slope-stability.js';

toolRegistry.register(
  {
    name: 'calculate_slope_stability',
    description:
      'Analyze slope stability using Bishop Simplified method. Searches for the critical slip circle and returns factor of safety, stability class, and slice-by-slice results. Supports multi-layer soils, water table, seismic loading, and surcharge.',
    parameters: {
      type: 'object',
      required: ['slopeHeight', 'slopeAngle', 'soilLayers'],
      properties: {
        slopeHeight: { type: 'number', description: 'Slope height H (m)' },
        slopeAngle: { type: 'number', description: 'Slope angle from horizontal (degrees)' },
        soilLayers: {
          type: 'array',
          description: 'Layers: [{thickness, unitWeight, cohesion, frictionAngle}]',
          items: { type: 'object' },
        },
        waterTableDepth: { type: 'number', default: 999 },
        surcharge: { type: 'number', default: 0 },
        seismicCoefficient: { type: 'number', default: 0, description: 'Horizontal seismic coefficient kh' },
        numberOfSlices: { type: 'number', default: 10 },
        method: { type: 'string', enum: ['bishop', 'ordinary'], default: 'bishop' },
      },
    },
  },
  (args) => {
    const result = calculateSlopeStability(args as any);
    return {
      success: true,
      data: result,
      summary: `Slope stability (${result.method}): FOS=${result.factorOfSafety} → ${result.stabilityClass}. Critical circle: R=${result.criticalCircle.radius}m`,
    };
  },
);

// ---------------------------------------------------------------------------
// NEW: Lateral Earth Pressure
// ---------------------------------------------------------------------------

import { calculateLateralEarthPressure } from '../geo/lateral-earth-pressure.js';

toolRegistry.register(
  {
    name: 'calculate_lateral_earth_pressure',
    description:
      'Calculate lateral earth pressure using Rankine or Coulomb method. Returns Ka/Kp/K0 coefficient, resultant force, point of application, and pressure distribution. For retaining wall design.',
    parameters: {
      type: 'object',
      required: ['wallHeight', 'soilLayers'],
      properties: {
        wallHeight: { type: 'number', description: 'Retaining wall height H (m)' },
        soilLayers: {
          type: 'array',
          description: 'Layers: [{thickness, unitWeight, cohesion, frictionAngle}]',
          items: { type: 'object' },
        },
        method: { type: 'string', enum: ['rankine', 'coulomb'], default: 'rankine' },
        pressureState: { type: 'string', enum: ['active', 'passive', 'at_rest'], default: 'active' },
        wallFrictionAngle: { type: 'number', default: 0, description: 'δ (degrees) — Coulomb' },
        backfillAngle: { type: 'number', default: 0, description: 'β (degrees)' },
        wallInclination: { type: 'number', default: 0, description: 'α (degrees) from vertical' },
        waterTableDepth: { type: 'number', default: 999 },
        surcharge: { type: 'number', default: 0 },
      },
    },
  },
  (args) => {
    const result = calculateLateralEarthPressure(args as any);
    return {
      success: true,
      data: result,
      summary: `Lateral earth pressure (${result.method} ${result.pressureState}): K=${result.coefficient}, F=${result.totalForce} kN/m, M=${result.overturningMoment} kN·m/m`,
    };
  },
);
