import { z } from 'zod';

// ---------------------------------------------------------------------------
// TBM Performance Prediction
// ---------------------------------------------------------------------------

export const TBMPredictInputSchema = z.object({
  diameter: z.number().positive().describe('TBM diameter D (m)'),
  ucs: z.number().positive().describe('Uniaxial compressive strength (MPa)'),
  rqd: z.number().min(0).max(100).describe('Rock Quality Designation (%)'),
  cai: z.number().min(0).max(7).optional().describe('Cerchar Abrasivity Index'),
  bts: z.number().positive().optional().describe('Brazilian Tensile Strength (MPa)'),
  jointSpacing: z.number().positive().optional().describe('Mean joint spacing (m)'),
  alpha: z.number().min(0).max(90).optional().describe('Angle between tunnel axis and joints (deg)'),
  cutterDiameter: z.number().positive().optional().describe('Cutter disc diameter (m)'),
  cutterSpacing: z.number().positive().optional().describe('Cutter spacing (m)'),
  rpm: z.number().positive().optional().describe('Cutterhead RPM'),
  numberOfCutters: z.number().int().positive().optional().describe('Number of disc cutters'),
});

export type TBMPredictInput = z.infer<typeof TBMPredictInputSchema>;

export interface TBMPredictResult {
  penetrationRate: number;
  advanceRate: number;
  fieldPenetrationIndex: number;
  cutterWearIndex: number;
  cutterLife: number;
  requiredThrust: number;
  requiredTorque: number;
  cutterheadPower: number;
  specificEnergy: number;
  steps: string[];
}

export function predictTBMPerformance(input: TBMPredictInput): TBMPredictResult {
  const v = TBMPredictInputSchema.parse(input);
  const steps: string[] = [];

  const { diameter: D, ucs, rqd } = v;
  const cutterDiameter = v.cutterDiameter ?? 0.4318;
  const s = v.cutterSpacing ?? 0.07;
  const cai = v.cai ?? 2.0;
  const bts = v.bts ?? ucs / 15;
  const jointSpacing = v.jointSpacing ?? 0.3;
  const alpha = v.alpha ?? 60;

  // Number of cutters estimate if not provided
  const nCutters = v.numberOfCutters ?? Math.round((D / 2 / s) * 1.1);
  const rpm = v.rpm ?? Math.max(1, 8 - D * 0.5);

  steps.push(`TBM diameter: ${D} m, ${nCutters} disc cutters @ ${cutterDiameter * 1000} mm`);
  steps.push(`Rock: UCS = ${ucs} MPa, BTS = ${bts.toFixed(1)} MPa, RQD = ${rqd}%, CAI = ${cai}`);

  // --- Field Penetration Index (FPI) ---
  // Based on NTNU/CSM model simplified
  // FPI = f(UCS, BTS, joint spacing, alpha)
  const drillingRateIndex = ucs * bts / (jointSpacing * 10);
  const alphaFactor = 1 + 0.5 * Math.sin((2 * alpha * Math.PI) / 180);
  const fpi = (drillingRateIndex * alphaFactor) / 100;
  steps.push(`Field Penetration Index (FPI): ${fpi.toFixed(2)} kN/cutter/mm/rev`);

  // --- Penetration Rate (PR) ---
  // Fn = average cutter normal force (kN), typically 250-300 kN for hard rock
  const Fn = Math.min(300, Math.max(100, 450 - ucs * 2));
  const PR = Fn / (fpi * 1000) * 1000; // mm/rev
  steps.push(`Average cutter force: Fn = ${Fn.toFixed(0)} kN`);
  steps.push(`Penetration rate: PR = ${PR.toFixed(2)} mm/rev`);

  // --- Advance Rate (AR) ---
  const utilization = 0.45; // typical 40-50%
  const AR = PR * rpm * 60 * utilization / 1000; // m/hr
  const dailyAdvance = AR * 16; // 16 operational hours/day
  steps.push(`RPM: ${rpm.toFixed(1)}, Utilization: ${(utilization * 100).toFixed(0)}%`);
  steps.push(`Advance rate: ${AR.toFixed(2)} m/hr (${dailyAdvance.toFixed(1)} m/day)`);

  // --- Cutter Wear ---
  // CLI (Cutter Life Index) based on CAI and UCS
  const cli = 1000 / (cai * Math.sqrt(ucs / 50));
  const cutterLife = Math.max(50, cli * 100); // meters of tunnel per cutter change
  const cutterWearIndex = cai * (ucs / 100);
  steps.push(`Cutter Life Index: ${cli.toFixed(2)}`);
  steps.push(`Estimated cutter life: ${cutterLife.toFixed(0)} m/cutter`);

  // --- Required Thrust ---
  const totalThrust = Fn * nCutters;
  steps.push(`Required thrust: ${(totalThrust / 1000).toFixed(0)} MN (${nCutters} cutters × ${Fn.toFixed(0)} kN)`);

  // --- Required Torque ---
  const rollingCoeff = 0.06;
  const torque = rollingCoeff * totalThrust * (D / 2);
  steps.push(`Required torque: ${torque.toFixed(0)} kNm`);

  // --- Cutterhead Power ---
  const power = (torque * 2 * Math.PI * rpm) / 60;
  steps.push(`Cutterhead power: ${(power / 1000).toFixed(0)} MW`);

  // --- Specific Energy ---
  const se = (totalThrust * PR / 1000) / (Math.PI * (D / 2) ** 2 * PR / 1000);
  steps.push(`Specific energy: ${se.toFixed(1)} MJ/m³`);

  return {
    penetrationRate: Math.round(PR * 100) / 100,
    advanceRate: Math.round(dailyAdvance * 10) / 10,
    fieldPenetrationIndex: Math.round(fpi * 100) / 100,
    cutterWearIndex: Math.round(cutterWearIndex * 100) / 100,
    cutterLife: Math.round(cutterLife),
    requiredThrust: Math.round(totalThrust),
    requiredTorque: Math.round(torque),
    cutterheadPower: Math.round(power),
    specificEnergy: Math.round(se * 10) / 10,
    steps,
  };
}

// ---------------------------------------------------------------------------
// TBM Type Selection
// ---------------------------------------------------------------------------

export const TBMSelectInputSchema = z.object({
  diameter: z.number().positive().describe('Tunnel diameter (m)'),
  groundType: z.enum(['rock', 'soft_ground', 'mixed', 'squeezing', 'karst']).describe('Predominant ground type'),
  ucs: z.number().nonnegative().optional().describe('Average UCS (MPa)'),
  waterPressure: z.number().nonnegative().default(0).describe('Max groundwater pressure (bar)'),
  overburden: z.number().positive().optional().describe('Max overburden depth (m)'),
  finesContent: z.number().min(0).max(100).optional().describe('% fines in soft ground'),
  permeability: z.number().positive().optional().describe('Ground permeability k (m/s)'),
  stickyClayRisk: z.boolean().default(false).describe('Risk of sticky clay / clogging'),
  boulderRisk: z.boolean().default(false).describe('Risk of boulders in soft ground'),
  gasRisk: z.boolean().default(false).describe('Risk of methane / H2S'),
  minimumCoverDiameterRatio: z.number().positive().optional().describe('Min cover/diameter ratio'),
});

export type TBMSelectInput = z.infer<typeof TBMSelectInputSchema>;

export interface TBMSelectResult {
  recommendation: string;
  type: 'Open' | 'Single Shield' | 'Double Shield' | 'EPB' | 'Slurry' | 'Hybrid' | 'Convertible';
  confidence: number;
  keyFactors: string[];
  alternatives: string[];
  operationalNotes: string[];
  steps: string[];
}

export function selectTBMType(input: TBMSelectInput): TBMSelectResult {
  const v = TBMSelectInputSchema.parse(input);
  const steps: string[] = [];
  const keyFactors: string[] = [];
  const alternatives: string[] = [];
  const operationalNotes: string[] = [];

  steps.push(`Ground: ${v.groundType}, D=${v.diameter}m, water=${v.waterPressure} bar`);

  let type: TBMSelectResult['type'];
  let confidence: number;

  if (v.groundType === 'rock') {
    const ucs = v.ucs ?? 80;
    steps.push(`Rock ground: UCS=${ucs} MPa`);

    if (ucs > 150 && v.waterPressure < 1) {
      type = 'Open';
      confidence = 85;
      keyFactors.push('Hard competent rock with low water inflow');
      keyFactors.push(`High UCS (${ucs} MPa) — self-supporting`);
      alternatives.push('Single Shield if ground conditions vary along alignment');
    } else if (v.waterPressure > 3) {
      type = 'Single Shield';
      confidence = 80;
      keyFactors.push(`Significant water pressure (${v.waterPressure} bar)`);
      keyFactors.push('Shield required for sealing with gaskets');
      alternatives.push('Double Shield if mixed stable/unstable zones');
    } else {
      type = 'Double Shield';
      confidence = 75;
      keyFactors.push('Variable rock quality expected');
      keyFactors.push('Gripper mode in stable rock, shield mode in fault zones');
      alternatives.push('Open TBM if consistently good rock (RMR > 60)');
      alternatives.push('Single Shield if consistently poor rock');
    }
  } else if (v.groundType === 'soft_ground') {
    const fines = v.finesContent ?? 30;
    steps.push(`Soft ground: fines=${fines}%, permeability=${v.permeability ?? 'unknown'}`);

    if (fines > 30 && v.waterPressure < 3 && !v.stickyClayRisk) {
      type = 'EPB';
      confidence = 85;
      keyFactors.push(`High fines content (${fines}%) — natural conditioning possible`);
      keyFactors.push('Moderate water pressure manageable with foam/polymer');
      if (v.stickyClayRisk) {
        operationalNotes.push('Anti-clogging agents required for sticky clay');
      }
      alternatives.push('Slurry if fines decrease or water pressure increases');
    } else if (v.waterPressure > 5 || (v.permeability && v.permeability > 1e-4)) {
      type = 'Slurry';
      confidence = 82;
      keyFactors.push(`High water pressure (${v.waterPressure} bar) or permeable ground`);
      keyFactors.push('Slurry provides superior face support in high-permeability soils');
      alternatives.push('EPB with high-pressure foam injection as backup');
    } else {
      type = 'EPB';
      confidence = 75;
      keyFactors.push('General soft ground conditions suit EPB');
      alternatives.push('Slurry TBM for better separation in coarse granular soil');
    }

    if (v.boulderRisk) {
      operationalNotes.push('Boulder crusher in cutterhead chamber required');
      operationalNotes.push('Hyperbaric intervention capability recommended');
      confidence -= 5;
    }
  } else if (v.groundType === 'mixed') {
    type = 'Convertible';
    confidence = 70;
    keyFactors.push('Mixed face conditions require adaptable machine');
    keyFactors.push('Convertible (Multi-mode) TBM can switch EPB/Open modes');
    alternatives.push('EPB with rock cutters if soft ground dominates');
    alternatives.push('Double Shield if rock dominates');
    operationalNotes.push('Conversion between modes takes 2-5 days');
  } else if (v.groundType === 'squeezing') {
    type = 'Double Shield';
    confidence = 72;
    keyFactors.push('Squeezing ground requires rapid advance and immediate support');
    keyFactors.push('Double shield allows segment installation concurrent with boring');
    operationalNotes.push('Oversized shield gap (60-80mm) to accommodate convergence');
    operationalNotes.push('Compressible backfill grouting recommended');
    alternatives.push('Single Shield with over-excavation profile');
  } else {
    // karst
    type = 'EPB';
    confidence = 60;
    keyFactors.push('Karst conditions require active face pressure control');
    keyFactors.push('Risk of sudden loss of face pressure in cavities');
    operationalNotes.push('Probe drilling ahead of face mandatory');
    operationalNotes.push('Pre-treatment (grouting) for large cavities');
    operationalNotes.push('Emergency foam injection system required');
    alternatives.push('Slurry TBM for better cavity filling capability');
  }

  if (v.gasRisk) {
    operationalNotes.push('ATEX-rated electrical equipment required (Zone 1)');
    operationalNotes.push('Continuous gas monitoring with automatic shutdown');
    confidence -= 3;
  }

  steps.push(`Recommendation: ${type} TBM (${confidence}% confidence)`);

  return {
    recommendation: `${type} TBM`,
    type,
    confidence,
    keyFactors,
    alternatives,
    operationalNotes,
    steps,
  };
}

// ---------------------------------------------------------------------------
// TBM Cutter Wear Prediction (Gehring model)
// ---------------------------------------------------------------------------

export const CutterWearInputSchema = z.object({
  cai: z.number().min(0).max(7).describe('Cerchar Abrasivity Index'),
  ucs: z.number().positive().describe('UCS (MPa)'),
  quartz: z.number().min(0).max(100).optional().describe('Quartz content (%)'),
  cutterDiameter: z.number().positive().optional().describe('Cutter disc diameter (mm)'),
  cutterRingType: z.enum(['constant_section', 'wedge']).optional().describe('Cutter ring type'),
  totalDistance: z.number().positive().describe('Total tunnel length (m)'),
  numberOfCutters: z.number().int().positive().describe('Number of cutters'),
});

export type CutterWearInput = z.infer<typeof CutterWearInputSchema>;

export interface CutterWearResult {
  wearRatePerCutter: number;
  totalCutterChanges: number;
  costEstimate: number;
  abrasivityClass: string;
  steps: string[];
}

export function predictCutterWear(input: CutterWearInput): CutterWearResult {
  const v = CutterWearInputSchema.parse(input);
  const steps: string[] = [];

  // Abrasivity classification
  let abrasivityClass: string;
  if (v.cai < 0.5) abrasivityClass = 'Not abrasive';
  else if (v.cai < 1.0) abrasivityClass = 'Not very abrasive';
  else if (v.cai < 2.0) abrasivityClass = 'Slightly abrasive';
  else if (v.cai < 3.0) abrasivityClass = 'Medium abrasive';
  else if (v.cai < 4.0) abrasivityClass = 'Abrasive';
  else if (v.cai < 5.0) abrasivityClass = 'Very abrasive';
  else abrasivityClass = 'Extremely abrasive';

  steps.push(`CAI = ${v.cai} → ${abrasivityClass}`);

  const quartz = v.quartz ?? 30;
  const cutterDiameter = v.cutterDiameter ?? 432;
  const cutterRingType = v.cutterRingType ?? 'constant_section';

  steps.push(`UCS = ${v.ucs} MPa, Quartz = ${quartz}%`);

  // Cutter life estimation (meters per cutter)
  const quartzFactor = 1 + (quartz - 30) * 0.01;
  const cutterLife = Math.max(30, (800 / (v.cai * quartzFactor)) * (cutterRingType === 'wedge' ? 0.7 : 1.0));
  steps.push(`Estimated cutter life: ${cutterLife.toFixed(0)} m/cutter`);

  const changesPerCutter = Math.ceil(v.totalDistance / cutterLife);
  const totalChanges = changesPerCutter * v.numberOfCutters;
  steps.push(`Changes per cutter: ${changesPerCutter}, Total changes: ${totalChanges}`);

  // Cost estimate (rough: €500-800 per 17" cutter)
  const costPerCutter = cutterDiameter > 400 ? 700 : 500;
  const costEstimate = totalChanges * costPerCutter;
  steps.push(`Estimated cutter cost: €${costEstimate.toLocaleString()}`);

  return {
    wearRatePerCutter: Math.round(cutterLife),
    totalCutterChanges: totalChanges,
    costEstimate,
    abrasivityClass,
    steps,
  };
}
