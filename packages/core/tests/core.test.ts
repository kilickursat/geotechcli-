import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';

import { calculateBearingCapacity } from '../src/geo/bearing-capacity.js';
import { calculateConsolidation, calculateSchmertmann, calculatePeckSettlement } from '../src/geo/settlement.js';
import { calculateLiquefaction } from '../src/geo/liquefaction.js';
import { classifyUSCS, classifyRMR89, classifyQSystem } from '../src/geo/classification.js';
import { predictTBMPerformance, selectTBMType, predictCutterWear } from '../src/geo/tunnel/tbm.js';
import { validateToolArgs } from '../src/agents/guardrails.js';
import {
  queryStandards,
  listStandards,
  getStandardById,
  listStandardProfiles,
  getStandardProfile,
  normalizeStandardProfileId,
} from '../src/standards/index.js';
import { exportGeoJSON, exportDXF, exportCSV, exportJSON } from '../src/export/index.js';
import { toolRegistry } from '../src/agents/tools.js';

import '../src/agents/filesystem-tools.js';
import '../src/agents/shell-tools.js';
import '../src/agents/data-tools.js';
import '../src/agents/signal-tools.js';
import '../src/agents/fem-tools.js';
import '../src/agents/skill-tools.js';

const corePackageRoot = fileURLToPath(new URL('..', import.meta.url));

function approx(actual: number, expected: number, tol: number, label: string) {
  expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(tol);
}

// =========================================================================
//  BEARING CAPACITY
// =========================================================================
describe('Bearing Capacity', () => {
  it('Meyerhof strip φ=30° c=0 D=1m', () => {
    const r = calculateBearingCapacity({ width: 2, depth: 1, unitWeight: 18, cohesion: 0, frictionAngle: 30, method: 'meyerhof', factorOfSafety: 3, shape: 'strip' });
    expect(r.qUltimate).toBeGreaterThan(400);
    expect(r.qUltimate).toBeLessThan(900);
    expect(r.qAllowable).toBeGreaterThan(0);
    expect(r.factorOfSafety).toBe(3);
    expect(r.method).toBe('meyerhof');
    expect(r.steps.length).toBeGreaterThan(3);
  });

  it('Terzaghi pure cohesive φ=0 c=50', () => {
    const r = calculateBearingCapacity({ width: 2, depth: 1.5, unitWeight: 18, cohesion: 50, frictionAngle: 0, method: 'terzaghi', factorOfSafety: 3, shape: 'strip' });
    approx(r.qUltimate, 312, 5, 'Terzaghi φ=0');
    expect(r.bearingCapacityFactors.Nc).toBe(5.7);
    expect(r.bearingCapacityFactors.Nq).toBe(1.0);
    expect(r.bearingCapacityFactors.Ngamma).toBe(0.0);
  });

  it('Hansen sq uses sin(φ) — regression test', () => {
    const r = calculateBearingCapacity({ width: 2, length: 3, depth: 1, unitWeight: 18, cohesion: 10, frictionAngle: 30, method: 'hansen', factorOfSafety: 2.5, shape: 'rectangular' });
    expect(r.shapeFactors).toBeDefined();
    approx(r.shapeFactors!.sq, 1.333, 0.01, 'Hansen sq');
    expect(r.shapeFactors!.sgamma).toBeGreaterThanOrEqual(0.6);
  });

  it('Vesic rectangular', () => {
    const r = calculateBearingCapacity({ width: 2, length: 4, depth: 1.5, unitWeight: 19, cohesion: 20, frictionAngle: 25, method: 'vesic', factorOfSafety: 3, shape: 'rectangular' });
    expect(r.qUltimate).toBeGreaterThan(0);
    expect(r.shapeFactors!.sq).toBeGreaterThan(1.0);
  });

  it('Square Terzaghi applies sc=1.3', () => {
    const r = calculateBearingCapacity({ width: 2, depth: 1, unitWeight: 18, cohesion: 25, frictionAngle: 20, method: 'terzaghi', factorOfSafety: 3, shape: 'square' });
    expect(r.steps.some(s => s.includes('sc=1.3'))).toBe(true);
  });

  it('Zero c + zero φ gives ~γD', () => {
    const r = calculateBearingCapacity({ width: 2, depth: 1, unitWeight: 18, cohesion: 0, frictionAngle: 0, method: 'meyerhof', factorOfSafety: 3, shape: 'strip' });
    approx(r.qUltimate, 18, 2, 'Zero c+φ');
  });
});

// =========================================================================
//  SETTLEMENT
// =========================================================================
describe('Consolidation Settlement', () => {
  it('NC clay 1D consolidation', () => {
    const r = calculateConsolidation({ compressionIndex: 0.3, voidRatio: 0.9, layerThickness: 4, stressIncrease: 50, initialEffectiveStress: 100, drainagePath: 'double' });
    approx(r.primarySettlement, 111.2, 5, 'NC consolidation');
    expect(r.isOverconsolidated).toBe(false);
  });

  it('OC clay past preconsolidation', () => {
    const r = calculateConsolidation({ compressionIndex: 0.3, recompressionIndex: 0.06, voidRatio: 0.9, layerThickness: 4, stressIncrease: 80, initialEffectiveStress: 80, preconsolidationPressure: 120, drainagePath: 'double' });
    expect(r.isOverconsolidated).toBe(true);
    expect(r.primarySettlement).toBeGreaterThan(0);
    const ncFull = (0.3 / 1.9) * 4 * Math.log10(160 / 80) * 1000;
    expect(r.primarySettlement).toBeLessThan(ncFull);
  });

  it('Time curve when Cv provided', () => {
    const r = calculateConsolidation({ compressionIndex: 0.25, voidRatio: 1.0, layerThickness: 6, stressIncrease: 40, initialEffectiveStress: 60, drainagePath: 'double', coefficientOfConsolidation: 2.5 });
    expect(r.timeSettlement).toBeDefined();
    expect(r.timeSettlement!.length).toBeGreaterThanOrEqual(10);
    expect(r.timeSettlement![r.timeSettlement!.length - 1].consolidation).toBeGreaterThanOrEqual(0.99);
  });
});

describe('Schmertmann', () => {
  it('3-sublayer basic calculation', () => {
    const r = calculateSchmertmann({ appliedStress: 100, foundationWidth: 2, layers: [{ thickness: 1, elasticModulus: 15000 }, { thickness: 1, elasticModulus: 20000 }, { thickness: 2, elasticModulus: 25000 }], embedmentDepth: 1, unitWeight: 18, timeFactor: 1 });
    expect(r.immediateSettlement).toBeGreaterThan(0);
    expect(r.totalSettlement).toBeGreaterThanOrEqual(r.immediateSettlement);
    expect(r.creepSettlement).toBeGreaterThanOrEqual(0);
  });
});

describe('Peck Settlement Trough', () => {
  it('6m tunnel at 15m depth', () => {
    const r = calculatePeckSettlement({ tunnelDiameter: 6, tunnelDepth: 15, volumeLoss: 1.0, troughWidthParam: 0.5 });
    approx(r.inflectionPoint, 7.5, 0.01, 'i');
    approx(r.maxSettlement, 15.0, 1.0, 'Smax');
    expect(r.profile.length).toBeGreaterThan(10);
    const center = r.profile.find(p => Math.abs(p.x) < 0.5);
    expect(center).toBeDefined();
    approx(center!.settlement, r.maxSettlement, 0.5, 'center=max');
  });
});

// =========================================================================
//  LIQUEFACTION
// =========================================================================
describe('Liquefaction', () => {
  it('B&I 2014 3-layer profile', () => {
    const r = calculateLiquefaction({ earthquakeMagnitude: 7.5, pga: 0.25, method: 'boulanger-idriss-2014', layers: [
      { depth: 3, sptN: 8, finesContent: 15, unitWeight: 18, waterTableDepth: 1 },
      { depth: 6, sptN: 15, finesContent: 5, unitWeight: 19, waterTableDepth: 1 },
      { depth: 10, sptN: 25, finesContent: 3, unitWeight: 19, waterTableDepth: 1 },
    ]});
    expect(r.layers.length).toBe(3);
    expect(r.layers[0].potential === 'HIGH' || r.layers[0].potential === 'SEVERE').toBe(true);
    expect(r.layers[2].factorOfSafety).toBeGreaterThan(r.layers[0].factorOfSafety);
    expect(r.estimatedSettlement).toBeGreaterThanOrEqual(0);
  });

  it('NCEER dense sand no liquefaction', () => {
    const r = calculateLiquefaction({ earthquakeMagnitude: 6.5, pga: 0.15, method: 'nceer', layers: [{ depth: 5, sptN: 35, finesContent: 3, unitWeight: 20, waterTableDepth: 2 }] });
    expect(r.layers[0].factorOfSafety).toBeGreaterThan(1.3);
    expect(r.layers[0].potential).toBe('LOW');
  });

  it('CSR increases with PGA', () => {
    const r1 = calculateLiquefaction({ earthquakeMagnitude: 7.0, pga: 0.1, layers: [{ depth: 5, sptN: 12, finesContent: 10, unitWeight: 18, waterTableDepth: 1 }] });
    const r2 = calculateLiquefaction({ earthquakeMagnitude: 7.0, pga: 0.4, layers: [{ depth: 5, sptN: 12, finesContent: 10, unitWeight: 18, waterTableDepth: 1 }] });
    expect(r2.layers[0].CSR).toBeGreaterThan(r1.layers[0].CSR);
  });
});

// =========================================================================
//  CLASSIFICATION
// =========================================================================
describe('USCS', () => {
  it('CL', () => { expect(classifyUSCS({ gravelPercent: 5, sandPercent: 30, finesPercent: 65, liquidLimit: 35, plasticityIndex: 15 }).symbol).toBe('CL'); });
  it('CH', () => { expect(classifyUSCS({ gravelPercent: 2, sandPercent: 18, finesPercent: 80, liquidLimit: 60, plasticityIndex: 35 }).symbol).toBe('CH'); });
  it('SW', () => { expect(classifyUSCS({ gravelPercent: 10, sandPercent: 87, finesPercent: 3, d10: 0.1, d30: 0.5, d60: 2.0 }).symbol).toBe('SW'); });
  it('SP', () => { expect(classifyUSCS({ gravelPercent: 5, sandPercent: 92, finesPercent: 3, d10: 0.2, d30: 0.25, d60: 0.3 }).symbol).toBe('SP'); });
  it('ML', () => { expect(classifyUSCS({ gravelPercent: 5, sandPercent: 20, finesPercent: 75, liquidLimit: 30, plasticityIndex: 2 }).symbol).toBe('ML'); });
  it('SC', () => { expect(classifyUSCS({ gravelPercent: 10, sandPercent: 70, finesPercent: 20, liquidLimit: 35, plasticityIndex: 15 }).symbol).toBe('SC'); });
});

describe('RMR89', () => {
  it('Class I good granite', () => {
    const r = classifyRMR89({ ucs: 120, rqd: 85, spacing: 0.8, condition: 'good', groundwater: 'dry', orientationAdjustment: 0 });
    expect(r.classNumber).toBe('I');
    expect(r.totalRating).toBeGreaterThanOrEqual(80);
    expect(r.supportRecommendation).toContain('spot bolting');
  });

  it('Class IV poor rock', () => {
    const r = classifyRMR89({ ucs: 15, rqd: 30, spacing: 0.1, condition: 'poor', groundwater: 'dripping', orientationAdjustment: -10 });
    expect(r.classNumber).toBe('IV');
    expect(r.totalRating).toBeGreaterThanOrEqual(10);
    expect(r.totalRating).toBeLessThanOrEqual(40);
  });

  it('Orientation adjustment', () => {
    const a = classifyRMR89({ ucs: 80, rqd: 70, spacing: 0.5, condition: 'fair', groundwater: 'damp', orientationAdjustment: 0 });
    const b = classifyRMR89({ ucs: 80, rqd: 70, spacing: 0.5, condition: 'fair', groundwater: 'damp', orientationAdjustment: -12 });
    expect(a.totalRating - b.totalRating).toBe(12);
  });
});

describe('Q-System', () => {
  it('Good rock Q=135', () => {
    const r = classifyQSystem({ rqd: 90, jn: 2, jr: 3, ja: 1, jw: 1, srf: 1 });
    approx(r.qValue, 135, 0.1, 'Q-value');
    expect(r.category).toContain('good');
  });
  it('Very poor Q<0.1', () => {
    const r = classifyQSystem({ rqd: 10, jn: 15, jr: 0.5, ja: 6, jw: 0.33, srf: 10 });
    expect(r.qValue).toBeLessThan(0.1);
  });
});

// =========================================================================
//  TBM
// =========================================================================
describe('TBM Performance', () => {
  it('Hard rock scenario', () => {
    const r = predictTBMPerformance({ diameter: 6.5, ucs: 80, rqd: 65, cai: 2.1 });
    expect(r.penetrationRate).toBeGreaterThan(0);
    expect(r.advanceRate).toBeGreaterThan(0);
    expect(r.requiredThrust).toBeGreaterThan(0);
    expect(r.requiredTorque).toBeGreaterThan(0);
    expect(r.cutterheadPower).toBeGreaterThan(0);
    expect(r.cutterLife).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(5);
  });
  it('Soft > hard PR', () => {
    const soft = predictTBMPerformance({ diameter: 6.5, ucs: 30, rqd: 50 });
    const hard = predictTBMPerformance({ diameter: 6.5, ucs: 200, rqd: 90 });
    expect(soft.penetrationRate).toBeGreaterThan(hard.penetrationRate);
  });
});

describe('TBM Selection', () => {
  it('Rock → Open/Double Shield', () => {
    const r = selectTBMType({ diameter: 6.5, groundType: 'rock', ucs: 160, waterPressure: 0.5 });
    expect(r.type === 'Open' || r.type === 'Double Shield').toBe(true);
    expect(r.confidence).toBeGreaterThan(50);
  });
  it('Soft → EPB', () => { expect(selectTBMType({ diameter: 8, groundType: 'soft_ground', finesContent: 45, waterPressure: 2 }).type).toBe('EPB'); });
  it('Mixed → Convertible', () => { expect(selectTBMType({ diameter: 10, groundType: 'mixed' }).type).toBe('Convertible'); });
  it('Gas → ATEX note', () => {
    const r = selectTBMType({ diameter: 6, groundType: 'soft_ground', finesContent: 40, gasRisk: true });
    expect(r.operationalNotes.some(n => n.includes('ATEX'))).toBe(true);
  });
});

describe('Cutter Wear', () => {
  it('Medium abrasive', () => {
    const r = predictCutterWear({ cai: 2.5, ucs: 100, totalDistance: 5000, numberOfCutters: 50 });
    expect(r.abrasivityClass).toContain('abrasive');
    expect(r.wearRatePerCutter).toBeGreaterThan(0);
    expect(r.totalCutterChanges).toBeGreaterThan(0);
    expect(r.costEstimate).toBeGreaterThan(0);
  });
});

// =========================================================================
//  GUARDRAILS
// =========================================================================
describe('Guardrails', () => {
  it('Blocks negative φ', () => { expect(validateToolArgs('calculate_bearing_capacity', { frictionAngle: -5, depth: 1 }).passed).toBe(false); });
  it('Blocks φ=0+c=0', () => { expect(validateToolArgs('calculate_bearing_capacity', { frictionAngle: 0, cohesion: 0, depth: 1 }).passed).toBe(false); });
  it('Warns UCS>400', () => { const r = validateToolArgs('classify_rmr89', { ucs: 500, rqd: 80 }); expect(r.passed).toBe(true); expect(r.violations.some(v => v.severity === 'warning')).toBe(true); });
  it('Blocks tunnel depth<radius', () => { expect(validateToolArgs('calculate_tunnel_settlement', { tunnelDiameter: 10, tunnelDepth: 3, volumeLoss: 1 }).passed).toBe(false); });
  it('Blocks negative SPT', () => { expect(validateToolArgs('calculate_liquefaction', { earthquakeMagnitude: 7, pga: 0.2, layers: [{ depth: 5, sptN: -3, finesContent: 10, unitWeight: 18, waterTableDepth: 1 }] }).passed).toBe(false); });
  it('Warns USCS sum≠100', () => { expect(validateToolArgs('classify_uscs', { gravelPercent: 10, sandPercent: 10, finesPercent: 10 }).violations.some(v => v.rule.includes('sum'))).toBe(true); });
  it('Passes valid input', () => { const r = validateToolArgs('calculate_bearing_capacity', { frictionAngle: 30, cohesion: 10, depth: 2, width: 3, unitWeight: 18 }); expect(r.passed).toBe(true); expect(r.violations.length).toBe(0); });
  it('Unknown tool passes', () => { expect(validateToolArgs('some_future_tool', { x: 1 }).passed).toBe(true); });
  it('Blocks negative Cc', () => { expect(validateToolArgs('calculate_consolidation', { compressionIndex: -0.2, voidRatio: 0.9, layerThickness: 4, stressIncrease: 50, initialEffectiveStress: 100 }).passed).toBe(false); });
  it('Blocks zero Es', () => { expect(validateToolArgs('calculate_schmertmann_settlement', { appliedStress: 100, foundationWidth: 2, layers: [{ thickness: 1, elasticModulus: 0 }] }).passed).toBe(false); });
});

// =========================================================================
//  STANDARDS DB
// =========================================================================
describe('Standards', () => {
  it('Finds bearing capacity', () => { const r = queryStandards('bearing capacity foundation'); expect(r.matches.length).toBeGreaterThan(0); });
  it('Finds liquefaction', () => { expect(queryStandards('liquefaction spt earthquake').matches.some(m => m.standard.includes('Boulanger'))).toBe(true); });
  it('Finds RMR', () => { expect(queryStandards('rmr rock mass rating bieniawski').matches.some(m => m.id === 'RMR89')).toBe(true); });
  it('Lists all', () => { expect(listStandards().length).toBeGreaterThanOrEqual(12); });
  it('Gets by ID', () => { expect(getStandardById('EC7-6.5')?.standard).toBe('EN 1997-1:2004'); });
  it('Empty for nonsense', () => { expect(queryStandards('xyzzyplugh').matches.length).toBe(0); });
  it('Lists supported standards profiles for calculation draft assumptions', () => {
    expect(listStandardProfiles().map((profile) => profile.id).sort()).toEqual(['aashto', 'astm', 'bs', 'eurocode7', 'is']);
    expect(getStandardProfile('ec7')?.id).toBe('eurocode7');
    expect(getStandardProfile('AASHTO LRFD')?.designFormat).toBe('lrfd');
    expect(normalizeStandardProfileId('EN 1997')).toBe('eurocode7');
    expect(normalizeStandardProfileId('unknown')).toBeUndefined();
  });
});

// =========================================================================
//  EXPORTS
// =========================================================================
describe('Exports', () => {
  it('GeoJSON FeatureCollection', () => {
    const p = JSON.parse(exportGeoJSON([{ lat: 35.45, lng: 139.63, properties: { sptN: 15 }, name: 'BH-1' }, { lat: 35.46, lng: 139.64, properties: { sptN: 22 }, name: 'BH-2' }]));
    expect(p.type).toBe('FeatureCollection');
    expect(p.features.length).toBe(2);
    expect(p.features[0].geometry.type).toBe('Point');
    expect(p.features[0].geometry.coordinates).toEqual([139.63, 35.45]);
  });
  it('DXF entities', () => {
    const d = exportDXF([{ type: 'LINE', x1: 0, y1: 0, x2: 10, y2: -5 }, { type: 'TEXT', x: 0, y: 1, text: 'BH-1', height: 0.5 }, { type: 'CIRCLE', cx: 5, cy: 5, radius: 2 }]);
    expect(d).toContain('LINE'); expect(d).toContain('TEXT'); expect(d).toContain('CIRCLE'); expect(d).toContain('EOF');
  });
  it('CSV escaping', () => {
    const c = exportCSV(['Name', 'Desc', 'Val'], [['BH-1', 'Has "quotes" and, commas', 42]]);
    expect(c).toContain('"Has ""quotes"" and, commas"');
  });
  it('JSON redacts keys', () => {
    const p = JSON.parse(exportJSON({ project: 'test', api_key: 'secret', config: { openai_api_key: 'sk', data: 'safe' } }));
    expect(p.api_key).toBeUndefined(); expect(p.config.openai_api_key).toBeUndefined(); expect(p.config.data).toBe('safe');
  });
});

// =========================================================================
//  TOOL REGISTRY
// =========================================================================
describe('Tool Registry', () => {
  it('All expected tools registered', () => {
    const names = toolRegistry.list().map(t => t.name);
    for (const n of ['calculate_bearing_capacity', 'calculate_liquefaction', 'classify_rmr89', 'classify_uscs', 'classify_q_system', 'predict_tbm_performance', 'select_tbm_type', 'predict_cutter_wear', 'calculate_tunnel_settlement', 'calculate_consolidation', 'calculate_schmertmann_settlement', 'read_file', 'list_directory', 'parse_csv', 'write_file', 'scan_project', 'run_command', 'parse_ags', 'parse_cpt', 'analyze_signal_file', 'ingest_geotech_document', 'list_persisted_ingest_reviews', 'load_persisted_ingest_review', 'list_persisted_ingest_review_approvals', 'load_persisted_ingest_review_approval', 'approve_persisted_ingest_review', 'promote_persisted_ingest_review', 'query_standards', 'list_fem_capabilities', 'prepare_fem_analysis_case', 'validate_fem_analysis_case', 'check_fem_support_member_design', 'project_create', 'project_load', 'project_list', 'project_save_dataset', 'project_save_parameter', 'project_add_assumption', 'project_add_artifact', 'project_save_result']) {
      expect(names).toContain(n);
    }
  });
  it('Descriptions include new tools', () => {
    const d = toolRegistry.toToolDescriptions();
    expect(d).toContain('calculate_consolidation');
    expect(d).toContain('calculate_schmertmann_settlement');
  });
  it('Function-calling format', () => {
    const f = toolRegistry.toFunctionCallingFormat();
    expect(f.length).toBeGreaterThan(20);
    f.forEach(t => { expect(t.type).toBe('function'); expect(t.function.name).toBeTruthy(); });
  });
  it('Unknown tool returns error', async () => {
    const r = await toolRegistry.execute('nonexistent', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('Unknown tool');
  });
});

// =========================================================================
//  PILE CAPACITY (NEW)
// =========================================================================
import { calculatePileCapacity } from '../src/geo/pile-capacity.js';

describe('Pile Capacity', () => {
  it('Alpha method driven pile in clay — basic', () => {
    const r = calculatePileCapacity({
      pileDiameter: 0.6,
      pileLength: 15,
      pileType: 'driven',
      pileShape: 'circular',
      layers: [{
        thickness: 20,
        soilType: 'clay',
        undrained_shear_strength: 60,
        unit_weight: 18,
      }],
      factorOfSafety: 2.5,
      method: 'alpha',
    });
    expect(r.shaftResistance).toBeGreaterThan(0);
    expect(r.baseResistance).toBeGreaterThan(0);
    expect(r.ultimateCapacity).toBe(r.shaftResistance + r.baseResistance);
    expect(r.allowableCapacity).toBeCloseTo(r.ultimateCapacity / 2.5, 0);
    expect(r.method).toBe('alpha');
    expect(r.steps.length).toBeGreaterThan(3);
  });

  it('Beta method driven pile in sand', () => {
    const r = calculatePileCapacity({
      pileDiameter: 0.5,
      pileLength: 12,
      pileType: 'driven',
      pileShape: 'circular',
      layers: [{
        thickness: 15,
        soilType: 'sand',
        friction_angle: 35,
        unit_weight: 19,
      }],
      factorOfSafety: 2.5,
      method: 'beta',
    });
    expect(r.shaftResistance).toBeGreaterThan(0);
    expect(r.baseResistance).toBeGreaterThan(0);
    expect(r.ultimateCapacity).toBeGreaterThan(100);
    expect(r.method).toBe('beta');
  });

  it('SPT-based Meyerhof method', () => {
    const r = calculatePileCapacity({
      pileDiameter: 0.4,
      pileLength: 10,
      pileType: 'driven',
      layers: [{
        thickness: 12,
        soilType: 'sand',
        spt_n: 25,
        unit_weight: 19,
      }],
      method: 'spt-meyerhof',
    });
    expect(r.method).toBe('spt-meyerhof');
    expect(r.shaftResistance).toBeGreaterThan(0);
    expect(r.baseResistance).toBeGreaterThan(0);
  });

  it('Multi-layer pile', () => {
    const r = calculatePileCapacity({
      pileDiameter: 0.8,
      pileLength: 20,
      pileType: 'bored',
      layers: [
        { thickness: 5, soilType: 'clay', undrained_shear_strength: 30, unit_weight: 17 },
        { thickness: 8, soilType: 'sand', friction_angle: 32, unit_weight: 19 },
        { thickness: 10, soilType: 'clay', undrained_shear_strength: 80, unit_weight: 19 },
      ],
      method: 'auto',
    });
    expect(r.shaftFrictionPerLayer.length).toBeGreaterThanOrEqual(2);
    expect(r.ultimateCapacity).toBeGreaterThan(0);
  });

  it('Guardrails block zero diameter', () => {
    const check = validateToolArgs('calculate_pile_capacity', { pileDiameter: 0, pileLength: 10, layers: [] });
    expect(check.passed).toBe(false);
    expect(check.violations.some(v => v.parameter === 'pileDiameter')).toBe(true);
  });
});

// =========================================================================
//  SLOPE STABILITY (NEW)
// =========================================================================
import { calculateSlopeStability } from '../src/geo/slope-stability.js';

describe('Slope Stability', () => {
  it('Simple slope c=10 phi=25 should have FOS > 1', () => {
    const r = calculateSlopeStability({
      slopeHeight: 8,
      slopeAngle: 30,
      soilLayers: [{
        thickness: 20,
        unitWeight: 18,
        cohesion: 10,
        frictionAngle: 25,
      }],
    });
    expect(r.factorOfSafety).toBeGreaterThan(0.5);
    expect(r.factorOfSafety).toBeLessThan(10);
    expect(r.criticalCircle.radius).toBeGreaterThan(0);
    expect(['STABLE', 'MARGINAL', 'UNSTABLE', 'CRITICAL']).toContain(r.stabilityClass);
    expect(r.method).toBe('Bishop Simplified');
  });

  it('Very steep slope with weak soil should be unstable', () => {
    const r = calculateSlopeStability({
      slopeHeight: 15,
      slopeAngle: 70,
      soilLayers: [{
        thickness: 30,
        unitWeight: 18,
        cohesion: 5,
        frictionAngle: 15,
      }],
    });
    expect(r.factorOfSafety).toBeLessThan(1.5);
  });

  it('Seismic loading reduces FOS', () => {
    const rStatic = calculateSlopeStability({
      slopeHeight: 10,
      slopeAngle: 35,
      soilLayers: [{ thickness: 25, unitWeight: 18, cohesion: 15, frictionAngle: 28 }],
      seismicCoefficient: 0,
    });
    const rSeismic = calculateSlopeStability({
      slopeHeight: 10,
      slopeAngle: 35,
      soilLayers: [{ thickness: 25, unitWeight: 18, cohesion: 15, frictionAngle: 28 }],
      seismicCoefficient: 0.15,
    });
    // Seismic loading should reduce or equal static FOS
    expect(rSeismic.factorOfSafety).toBeLessThanOrEqual(rStatic.factorOfSafety * 1.05);
  });

  it('Guardrails block c=0 phi=0 soil', () => {
    const check = validateToolArgs('calculate_slope_stability', {
      slopeHeight: 10,
      slopeAngle: 30,
      soilLayers: [{ thickness: 20, unitWeight: 18, cohesion: 0, frictionAngle: 0 }],
    });
    expect(check.passed).toBe(false);
  });
});

// =========================================================================
//  LATERAL EARTH PRESSURE (NEW)
// =========================================================================
import { calculateLateralEarthPressure } from '../src/geo/lateral-earth-pressure.js';

describe('Lateral Earth Pressure', () => {
  it('Rankine active Ka for phi=30 should be ~0.333', () => {
    const r = calculateLateralEarthPressure({
      wallHeight: 6,
      soilLayers: [{ thickness: 10, unitWeight: 18, cohesion: 0, frictionAngle: 30 }],
      method: 'rankine',
      pressureState: 'active',
    });
    expect(Math.abs(r.coefficient - 0.333)).toBeLessThan(0.01);
    expect(r.totalForce).toBeGreaterThan(0);
    expect(r.pointOfApplication).toBeGreaterThan(0);
    expect(r.pointOfApplication).toBeLessThan(6);
  });

  it('Rankine passive Kp for phi=30 should be ~3.0', () => {
    const r = calculateLateralEarthPressure({
      wallHeight: 6,
      soilLayers: [{ thickness: 10, unitWeight: 18, cohesion: 0, frictionAngle: 30 }],
      method: 'rankine',
      pressureState: 'passive',
    });
    expect(Math.abs(r.coefficient - 3.0)).toBeLessThan(0.05);
  });

  it('At-rest K0 = 1-sin(phi) (Jaky)', () => {
    const r = calculateLateralEarthPressure({
      wallHeight: 5,
      soilLayers: [{ thickness: 10, unitWeight: 18, cohesion: 0, frictionAngle: 30 }],
      pressureState: 'at_rest',
    });
    const expected = 1 - Math.sin(30 * Math.PI / 180);
    expect(Math.abs(r.coefficient - expected)).toBeLessThan(0.001);
  });

  it('Passive force > Active force (same geometry)', () => {
    const rA = calculateLateralEarthPressure({
      wallHeight: 5,
      soilLayers: [{ thickness: 10, unitWeight: 18, cohesion: 0, frictionAngle: 25 }],
      pressureState: 'active',
    });
    const rP = calculateLateralEarthPressure({
      wallHeight: 5,
      soilLayers: [{ thickness: 10, unitWeight: 18, cohesion: 0, frictionAngle: 25 }],
      pressureState: 'passive',
    });
    expect(rP.totalForce).toBeGreaterThan(rA.totalForce);
  });

  it('Coulomb Ka with wall friction', () => {
    const r = calculateLateralEarthPressure({
      wallHeight: 6,
      soilLayers: [{ thickness: 10, unitWeight: 18, cohesion: 0, frictionAngle: 30 }],
      method: 'coulomb',
      pressureState: 'active',
      wallFrictionAngle: 20,
    });
    // Coulomb Ka with wall friction should be less than Rankine Ka
    expect(r.coefficient).toBeLessThan(0.333);
    expect(r.coefficient).toBeGreaterThan(0.1);
  });

  it('Pressure distribution has correct number of points', () => {
    const r = calculateLateralEarthPressure({
      wallHeight: 8,
      soilLayers: [{ thickness: 15, unitWeight: 18, cohesion: 0, frictionAngle: 30 }],
    });
    expect(r.pressureDistribution.length).toBe(21); // 20 intervals + 1
    expect(r.pressureDistribution[0].depth).toBe(0);
    expect(r.pressureDistribution[r.pressureDistribution.length - 1].depth).toBe(8);
  });
});

// =========================================================================
//  BEARING CAPACITY — WATER TABLE CORRECTION (NEW)
// =========================================================================
describe('Bearing Capacity — Water Table', () => {
  it('Water table reduces bearing capacity vs dry case', () => {
    const rDry = calculateBearingCapacity({
      width: 2, depth: 1.5, unitWeight: 18, cohesion: 0,
      frictionAngle: 30, method: 'meyerhof', factorOfSafety: 3, shape: 'strip',
    });
    const rWet = calculateBearingCapacity({
      width: 2, depth: 1.5, unitWeight: 18, cohesion: 0,
      frictionAngle: 30, method: 'meyerhof', factorOfSafety: 3, shape: 'strip',
      waterTableDepth: 0.5,
    });
    expect(rWet.qUltimate).toBeLessThan(rDry.qUltimate);
  });

  it('Deep water table has no effect', () => {
    const rDry = calculateBearingCapacity({
      width: 2, depth: 1, unitWeight: 18, cohesion: 10,
      frictionAngle: 25, method: 'meyerhof', factorOfSafety: 3, shape: 'strip',
    });
    const rDeep = calculateBearingCapacity({
      width: 2, depth: 1, unitWeight: 18, cohesion: 10,
      frictionAngle: 25, method: 'meyerhof', factorOfSafety: 3, shape: 'strip',
      waterTableDepth: 100,
    });
    expect(rDeep.qUltimate).toBeCloseTo(rDry.qUltimate, 1);
  });
});

// =========================================================================
//  SANDBOX SECURITY (NEW)
// =========================================================================
import { validateReadPath, validateWritePath, validateShellCommand } from '../src/agents/sandbox.js';

describe('Filesystem Sandbox', () => {
  it('Blocks /etc/passwd read', () => {
    const check = validateReadPath('/etc/passwd');
    expect(check.safe).toBe(false);
    expect(check.error).toContain('system directory');
  });

  it('Blocks .ssh directory', () => {
    const check = validateReadPath('/home/user/.ssh/id_rsa');
    expect(check.safe).toBe(false);
    expect(check.error).toContain('sensitive pattern');
  });

  it('Blocks .aws credentials', () => {
    const check = validateReadPath('/home/user/.aws/credentials');
    expect(check.safe).toBe(false);
  });

  it('Allows CWD files', () => {
    const check = validateReadPath('./test.csv');
    expect(check.safe).toBe(true);
  });

  it('Blocks geotechCLI core source tree reads', () => {
    const check = validateReadPath(`${corePackageRoot}/src/agents/sandbox.ts`);
    expect(check.safe).toBe(false);
    expect(check.error).toContain('core source tree');
  });

  it('Blocks write to /usr', () => {
    const check = validateWritePath('/usr/local/bin/evil');
    expect(check.safe).toBe(false);
  });
});

describe('Shell Command Sandbox', () => {
  it('Allows ls on a scoped project path', () => {
    const check = validateShellCommand('ls -la samples');
    expect(check.safe).toBe(true);
  });

  it('Blocks rm', () => {
    const check = validateShellCommand('rm -rf /');
    expect(check.safe).toBe(false);
  });

  it('Blocks python -c', () => {
    const check = validateShellCommand('python -c "import os"');
    expect(check.safe).toBe(false);
    expect(check.error).toContain('python');
  });

  it('Blocks python script.py', () => {
    const check = validateShellCommand('python analysis.py');
    expect(check.safe).toBe(false);
  });

  it('Blocks shell glob expansion', () => {
    const check = validateShellCommand('cat *.ts', { cwd: corePackageRoot });
    expect(check.safe).toBe(false);
    expect(check.error).toContain('shell expansion');
  });

  it('Blocks broad geotechCLI internal enumeration', () => {
    const check = validateShellCommand('ls -la', { cwd: corePackageRoot });
    expect(check.safe).toBe(false);
    expect(check.error).toContain('too broad');
  });

  it('Blocks pipe operators', () => {
    const check = validateShellCommand('cat file.txt | grep secret');
    expect(check.safe).toBe(false);
  });

  it('Blocks redirect', () => {
    const check = validateShellCommand('echo hacked > /etc/crontab');
    expect(check.safe).toBe(false);
  });

  it('Blocks curl', () => {
    const check = validateShellCommand('curl http://evil.com');
    expect(check.safe).toBe(false);
  });

  it('Blocks sudo', () => {
    const check = validateShellCommand('ls && sudo rm -rf /');
    expect(check.safe).toBe(false);
  });
});

// =========================================================================
//  TOOL REGISTRY — new tools exist
// =========================================================================
describe('New Tool Registration', () => {
  it('Pile capacity tool is registered', () => {
    const tool = toolRegistry.get('calculate_pile_capacity');
    expect(tool).toBeDefined();
    expect(tool!.definition.name).toBe('calculate_pile_capacity');
  });

  it('Slope stability tool is registered', () => {
    const tool = toolRegistry.get('calculate_slope_stability');
    expect(tool).toBeDefined();
  });

  it('Lateral earth pressure tool is registered', () => {
    const tool = toolRegistry.get('calculate_lateral_earth_pressure');
    expect(tool).toBeDefined();
  });

  it('Skill tools are registered', async () => {
    expect(toolRegistry.get('list_skills')).toBeDefined();
    expect(toolRegistry.get('describe_skill')).toBeDefined();
    expect(toolRegistry.get('run_skill')).toBeDefined();
  });

  it('Total tools >= 26', () => {
    const tools = toolRegistry.list();
    expect(tools.length).toBeGreaterThanOrEqual(26);
  });
});
