import { z } from 'zod';

// ---------------------------------------------------------------------------
// USCS Classification (ASTM D2487)
// ---------------------------------------------------------------------------

export const USCSInputSchema = z.object({
  gravelPercent: z.number().min(0).max(100).describe('% retained on #4 sieve'),
  sandPercent: z.number().min(0).max(100).describe('% passing #4 retained on #200'),
  finesPercent: z.number().min(0).max(100).describe('% passing #200 sieve'),
  liquidLimit: z.number().min(0).max(200).optional().describe('Liquid Limit (%)'),
  plasticityIndex: z.number().min(0).max(100).optional().describe('Plasticity Index (%)'),
  d10: z.number().positive().optional().describe('D10 particle size (mm)'),
  d30: z.number().positive().optional().describe('D30 particle size (mm)'),
  d60: z.number().positive().optional().describe('D60 particle size (mm)'),
  // ASTM D2487 separates organic from inorganic fine-grained soils on the
  // ratio of the liquid limit after oven drying to the liquid limit not dried.
  // Without this input the organic groups are unreachable, which is how peat
  // and organic clays were previously being reported as MH or CH.
  liquidLimitOvenDriedRatio: z
    .number()
    .positive()
    .max(2)
    .optional()
    .describe('LL(oven-dried) / LL(not dried) — organic if < 0.75 (ASTM D2487)'),
  organicContentPercent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Organic content by mass (%) — highly organic (Pt) at >= 75%'),
});

export type USCSInput = z.infer<typeof USCSInputSchema>;

export interface USCSResult {
  symbol: string;
  name: string;
  group: 'coarse-grained' | 'fine-grained' | 'organic';
  steps: string[];
}

export function classifyUSCS(input: USCSInput): USCSResult {
  const v = USCSInputSchema.parse(input);
  const steps: string[] = [];
  const { gravelPercent, sandPercent, finesPercent, liquidLimit: LL, plasticityIndex: PI } = v;

  steps.push(`Gravel: ${gravelPercent}%, Sand: ${sandPercent}%, Fines: ${finesPercent}%`);
  if (LL !== undefined) steps.push(`LL = ${LL}%, PI = ${PI ?? 'N/A'}%`);

  // Highly organic soil (peat) is its own group and short-circuits the
  // gradation and plasticity route entirely — ASTM D2487 identifies Pt by
  // visual-manual examination; an explicit organic content is the closest
  // machine-checkable proxy, using the ASTM D4427 peat threshold of 75%.
  const { organicContentPercent, liquidLimitOvenDriedRatio } = v;

  if (organicContentPercent !== undefined && organicContentPercent >= 75) {
    steps.push(`Organic content ${organicContentPercent}% ≥ 75% → highly organic soil`);
    return {
      symbol: 'Pt',
      name: 'Peat',
      group: 'organic',
      steps,
    };
  }

  // Fine-grained soil (≥50% fines)
  if (finesPercent >= 50) {
    // Organic silts and clays: ASTM D2487 classifies a fine-grained soil as
    // organic when LL(oven-dried)/LL(not dried) < 0.75. OL below LL 50, OH at
    // or above it. This must be tested before the A-line route, otherwise an
    // organic clay is reported as CL/CH and its compressibility understated.
    if (liquidLimitOvenDriedRatio !== undefined && liquidLimitOvenDriedRatio < 0.75) {
      const isHighPlasticity = LL !== undefined && LL >= 50;
      steps.push(
        `LL(oven-dried)/LL(not dried) = ${liquidLimitOvenDriedRatio} < 0.75 → organic soil`,
      );
      steps.push(`LL ${LL ?? 'N/A'} ${isHighPlasticity ? '≥' : '<'} 50 → ${isHighPlasticity ? 'OH' : 'OL'}`);
      return {
        symbol: isHighPlasticity ? 'OH' : 'OL',
        name: isHighPlasticity ? 'Organic Clay / Organic Silt (high plasticity)' : 'Organic Silt / Organic Clay (low plasticity)',
        group: 'organic',
        steps,
      };
    }

    steps.push(`Fines ≥ 50% → Fine-grained soil`);

    if (LL === undefined || PI === undefined) {
      return { symbol: 'ML/CL', name: 'Fine-grained (Atterberg limits needed)', group: 'fine-grained', steps };
    }

    if (LL < 50) {
      // Low plasticity
      const aLine = 0.73 * (LL - 20);
      if (PI > aLine && PI > 7) {
        steps.push(`PI (${PI}) above A-line (${aLine.toFixed(1)}) and > 7 → CL`);
        return { symbol: 'CL', name: 'Lean Clay', group: 'fine-grained', steps };
      } else if (PI < 4 || PI < aLine) {
        steps.push(`PI (${PI}) below A-line or < 4 → ML`);
        return { symbol: 'ML', name: 'Silt', group: 'fine-grained', steps };
      } else {
        return { symbol: 'CL-ML', name: 'Silty Clay', group: 'fine-grained', steps };
      }
    } else {
      // High plasticity
      const aLine = 0.73 * (LL - 20);
      if (PI > aLine) {
        steps.push(`LL ≥ 50, PI above A-line → CH`);
        return { symbol: 'CH', name: 'Fat Clay', group: 'fine-grained', steps };
      } else {
        steps.push(`LL ≥ 50, PI below A-line → MH`);
        return { symbol: 'MH', name: 'Elastic Silt', group: 'fine-grained', steps };
      }
    }
  }

  // Coarse-grained soil
  steps.push(`Fines < 50% → Coarse-grained soil`);
  const isGravel = gravelPercent > sandPercent;
  const prefix = isGravel ? 'G' : 'S';
  const baseName = isGravel ? 'Gravel' : 'Sand';

  steps.push(`${isGravel ? 'Gravel > Sand' : 'Sand ≥ Gravel'} → ${baseName}-based`);

  // Gradation coefficients
  let Cu: number | undefined;
  let Cc: number | undefined;
  if (v.d10 && v.d30 && v.d60) {
    Cu = v.d60 / v.d10;
    Cc = (v.d30 * v.d30) / (v.d60 * v.d10);
    steps.push(`Cu = ${Cu.toFixed(1)}, Cc = ${Cc.toFixed(2)}`);
  }

  if (finesPercent < 5) {
    // Clean
    const wellGraded = Cu !== undefined && Cc !== undefined &&
      ((isGravel && Cu >= 4 && Cc >= 1 && Cc <= 3) ||
       (!isGravel && Cu >= 6 && Cc >= 1 && Cc <= 3));

    if (wellGraded) {
      return { symbol: `${prefix}W`, name: `Well-graded ${baseName}`, group: 'coarse-grained', steps };
    }
    return { symbol: `${prefix}P`, name: `Poorly-graded ${baseName}`, group: 'coarse-grained', steps };
  } else if (finesPercent <= 12) {
    // Dual symbol
    return { symbol: `${prefix}W-${prefix}M`, name: `${baseName} with fines (borderline)`, group: 'coarse-grained', steps };
  } else {
    // >12% fines
    if (PI !== undefined && PI > 7) {
      return { symbol: `${prefix}C`, name: `Clayey ${baseName}`, group: 'coarse-grained', steps };
    }
    return { symbol: `${prefix}M`, name: `Silty ${baseName}`, group: 'coarse-grained', steps };
  }
}

// ---------------------------------------------------------------------------
// RMR89 (Bieniawski 1989)
// ---------------------------------------------------------------------------

export const RMR89InputSchema = z.object({
  ucs: z.number().positive().describe('Uniaxial Compressive Strength (MPa)'),
  rqd: z.number().min(0).max(100).describe('Rock Quality Designation (%)'),
  spacing: z.number().positive().describe('Discontinuity spacing (m)'),
  condition: z.enum(['very_good', 'good', 'fair', 'poor', 'very_poor']).describe('Joint condition'),
  groundwater: z.enum(['dry', 'damp', 'wet', 'dripping', 'flowing']).describe('Groundwater condition'),
  orientationAdjustment: z.number().min(-60).max(0).default(0).describe('Orientation adjustment'),
});

export type RMR89Input = z.infer<typeof RMR89InputSchema>;

export interface RMR89Result {
  totalRating: number;
  rockClass: string;
  classNumber: string;
  ratings: {
    ucs: number;
    rqd: number;
    spacing: number;
    condition: number;
    groundwater: number;
    orientation: number;
  };
  supportRecommendation: string;
  steps: string[];
}

function rateUCS(ucs: number): number {
  if (ucs > 250) return 15;
  if (ucs > 100) return 12;
  if (ucs > 50) return 7;
  if (ucs > 25) return 4;
  if (ucs > 5) return 2;
  if (ucs > 1) return 1;
  return 0;
}

function rateRQD(rqd: number): number {
  if (rqd > 90) return 20;
  if (rqd > 75) return 17;
  if (rqd > 50) return 13;
  if (rqd > 25) return 8;
  return 3;
}

function rateSpacing(spacing: number): number {
  if (spacing > 2) return 20;
  if (spacing > 0.6) return 15;
  if (spacing > 0.2) return 10;
  if (spacing > 0.06) return 8;
  return 5;
}

function rateCondition(cond: string): number {
  const map: Record<string, number> = {
    very_good: 30, good: 25, fair: 20, poor: 10, very_poor: 0,
  };
  return map[cond] ?? 10;
}

function rateGroundwater(gw: string): number {
  const map: Record<string, number> = {
    dry: 15, damp: 10, wet: 7, dripping: 4, flowing: 0,
  };
  return map[gw] ?? 7;
}

export function classifyRMR89(input: RMR89Input): RMR89Result {
  const v = RMR89InputSchema.parse(input);
  const steps: string[] = [];

  const ratings = {
    ucs: rateUCS(v.ucs),
    rqd: rateRQD(v.rqd),
    spacing: rateSpacing(v.spacing),
    condition: rateCondition(v.condition),
    groundwater: rateGroundwater(v.groundwater),
    orientation: v.orientationAdjustment,
  };

  steps.push(`UCS (${v.ucs} MPa) → ${ratings.ucs}`);
  steps.push(`RQD (${v.rqd}%) → ${ratings.rqd}`);
  steps.push(`Spacing (${v.spacing} m) → ${ratings.spacing}`);
  steps.push(`Joint condition (${v.condition}) → ${ratings.condition}`);
  steps.push(`Groundwater (${v.groundwater}) → ${ratings.groundwater}`);
  steps.push(`Orientation adjustment → ${ratings.orientation}`);

  const total = ratings.ucs + ratings.rqd + ratings.spacing +
    ratings.condition + ratings.groundwater + ratings.orientation;

  let rockClass: string;
  let classNumber: string;
  let support: string;

  if (total > 80) {
    rockClass = 'Very Good Rock'; classNumber = 'I';
    support = 'Generally no support required except spot bolting.';
  } else if (total > 60) {
    rockClass = 'Good Rock'; classNumber = 'II';
    support = 'Locally, bolts in crown 3m long, spaced 2.5m, with occasional wire mesh. 50mm shotcrete in crown where required.';
  } else if (total > 40) {
    rockClass = 'Fair Rock'; classNumber = 'III';
    support = 'Systematic bolts 4m long, spaced 1.5-2m in crown and walls. 50-100mm shotcrete in crown and 30mm on sides.';
  } else if (total > 20) {
    rockClass = 'Poor Rock'; classNumber = 'IV';
    support = 'Systematic bolts 4-5m long, spaced 1-1.5m in crown and walls. 100-150mm shotcrete with wire mesh. Light to medium steel sets where required.';
  } else {
    rockClass = 'Very Poor Rock'; classNumber = 'V';
    support = 'Systematic bolts 5-6m long, spaced 1-1.5m. 150-200mm shotcrete with wire mesh. Medium to heavy steel sets. Close invert. Forepoling may be needed.';
  }

  steps.push(`Total RMR = ${total} → Class ${classNumber}: ${rockClass}`);

  return {
    totalRating: total,
    rockClass,
    classNumber,
    ratings,
    supportRecommendation: support,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Q-system (Barton et al. 1974)
// ---------------------------------------------------------------------------

export const QSystemInputSchema = z.object({
  rqd: z.number().min(0).max(100).describe('Rock Quality Designation (%)'),
  jn: z.number().positive().describe('Joint set number Jn'),
  jr: z.number().positive().describe('Joint roughness number Jr'),
  ja: z.number().positive().describe('Joint alteration number Ja'),
  jw: z.number().positive().max(1).describe('Joint water reduction factor Jw'),
  srf: z.number().positive().describe('Stress reduction factor SRF'),
});

export type QSystemInput = z.infer<typeof QSystemInputSchema>;

export interface QSystemResult {
  qValue: number;
  category: string;
  supportRecommendation: string;
  steps: string[];
}

export function classifyQSystem(input: QSystemInput): QSystemResult {
  const v = QSystemInputSchema.parse(input);
  const steps: string[] = [];

  const Q = (v.rqd / v.jn) * (v.jr / v.ja) * (v.jw / v.srf);

  steps.push(`Q = (RQD/Jn) × (Jr/Ja) × (Jw/SRF)`);
  steps.push(`Q = (${v.rqd}/${v.jn}) × (${v.jr}/${v.ja}) × (${v.jw}/${v.srf})`);
  steps.push(`Q = ${Q.toFixed(3)}`);

  let category: string;
  let support: string;

  if (Q > 40) {
    category = 'Exceptionally to extremely good';
    support = 'Unsupported or spot bolting.';
  } else if (Q > 10) {
    category = 'Very good to good';
    support = 'Spot to systematic bolting.';
  } else if (Q > 4) {
    category = 'Fair';
    support = 'Systematic bolting with 40-100mm unreinforced shotcrete.';
  } else if (Q > 1) {
    category = 'Poor';
    support = 'Systematic bolting with 100-150mm fiber-reinforced shotcrete.';
  } else if (Q > 0.1) {
    category = 'Very poor';
    support = 'Fiber-reinforced shotcrete 150-200mm and bolting with steel ribs.';
  } else if (Q > 0.01) {
    category = 'Extremely poor';
    support = 'Cast concrete lining or heavy steel sets with shotcrete.';
  } else {
    category = 'Exceptionally poor';
    support = 'Special methods required: ground freezing, jet grouting, or pre-reinforcement.';
  }

  steps.push(`Category: ${category}`);

  return { qValue: Math.round(Q * 1000) / 1000, category, supportRecommendation: support, steps };
}
