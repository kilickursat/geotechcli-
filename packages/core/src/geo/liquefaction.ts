import { z } from 'zod';

// ---------------------------------------------------------------------------
// SPT-based liquefaction triggering
//
// Two independent procedures are implemented. Each one uses the stress
// reduction coefficient, overburden correction, magnitude scaling factor and
// resistance curve that belong to *its own* source — they are not mixed.
//
// References:
//   - Boulanger, R.W. & Idriss, I.M. (2014). "CPT and SPT Based Liquefaction
//     Triggering Procedures." Report No. UCD/CGM-14/01, Center for Geotechnical
//     Modeling, University of California, Davis.
//   - Idriss, I.M. (1999). "An update to the Seed-Idriss simplified procedure
//     for evaluating liquefaction potential." (magnitude-dependent r_d)
//   - Youd, T.L. et al. (2001). "Liquefaction resistance of soils: summary
//     report from the 1996 NCEER and 1998 NCEER/NSF workshops." JGGE 127(10).
//   - Liao, S.S.C. & Whitman, R.V. (1986). "Overburden correction factors for
//     SPT in sand." JGE 112(3).
//   - Ishihara, K. & Yoshimine, M. (1992). "Evaluation of settlements in sand
//     deposits following liquefaction during earthquakes." S&F 32(1), as
//     parameterized by Yoshimine et al. (2006) / Idriss & Boulanger (2008).
// ---------------------------------------------------------------------------

const PA = 101.325; // atmospheric pressure (kPa)
const GAMMA_W = 9.81; // unit weight of water (kN/m³)

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const LiquefactionInputSchema = z.object({
  layers: z.array(z.object({
    depth: z.number().positive().describe('Layer mid-depth (m)'),
    sptN: z.number().nonnegative().describe('Measured SPT N-value'),
    finesContent: z.number().min(0).max(100).default(5).describe('Fines content FC (%)'),
    unitWeight: z.number().positive().default(18).describe('Total unit weight γ (kN/m³)'),
    waterTableDepth: z.number().nonnegative().default(1).describe('Depth to water table (m)'),
    thickness: z.number().positive().optional().describe('Layer thickness for settlement integration (m)'),
    energyRatio: z.number().positive().optional().describe('Hammer energy ratio ER (%) — CE = ER/60, default 60'),
    boreholeDiameter: z.number().positive().optional().describe('Borehole diameter (mm) for CB, default 65-115mm → 1.0'),
    linerCorrection: z.number().positive().optional().describe('Sampler liner correction CS, default 1.0'),
  })).min(1),
  earthquakeMagnitude: z.number().min(4).max(9.5).describe('Moment magnitude Mw'),
  pga: z.number().positive().describe('Peak ground acceleration amax (g)'),
  method: z.enum(['boulanger-idriss-2014', 'nceer']).default('boulanger-idriss-2014'),
});

export type LiquefactionInput = z.infer<typeof LiquefactionInputSchema>;

export interface LiquefactionLayerResult {
  depth: number;
  N160: number;
  N160cs: number;
  CSR: number;
  CRR: number;
  factorOfSafety: number;
  potential: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  /** Effective vertical stress at layer mid-depth (kPa). */
  sigmaVPrime: number;
  /** Overburden correction factor applied to the measured blow count. */
  CN: number;
  /** Stress reduction coefficient at this depth. */
  rd: number;
  /** Magnitude scaling factor applied to CRR_{M7.5,1atm}. */
  MSF: number;
  /** Overburden correction factor on cyclic resistance (1.0 for NCEER). */
  Ksigma: number;
  /** Post-liquefaction volumetric strain (%) used for the settlement estimate. */
  volumetricStrain: number;
}

export interface LiquefactionResult {
  method: string;
  layers: LiquefactionLayerResult[];
  estimatedSettlement: number;
  steps: string[];
}

// ---------------------------------------------------------------------------
// Stress reduction coefficient r_d
// ---------------------------------------------------------------------------

/**
 * Idriss (1999) magnitude-dependent r_d, used by the Boulanger & Idriss
 * procedure. Valid to z ≈ 34 m; deeper values are held at the 34 m result as
 * recommended by B&I (2014).
 */
function stressReductionIdriss(depth: number, Mw: number): number {
  const z = Math.min(depth, 34);
  const alpha = -1.012 - 1.126 * Math.sin(z / 11.73 + 5.133);
  const beta = 0.106 + 0.118 * Math.sin(z / 11.28 + 5.142);
  return Math.exp(alpha + beta * Mw);
}

/**
 * Liao & Whitman (1986) piecewise r_d, as carried in the NCEER summary
 * (Youd et al. 2001) for the simplified procedure.
 */
function stressReductionLiaoWhitman(depth: number): number {
  if (depth <= 9.15) return 1.0 - 0.00765 * depth;
  if (depth <= 23) return 1.174 - 0.0267 * depth;
  if (depth <= 30) return 0.744 - 0.008 * depth;
  return 0.5;
}

// ---------------------------------------------------------------------------
// Rod-length / energy / borehole / sampler corrections
// ---------------------------------------------------------------------------

function rodLengthCorrection(depth: number): number {
  // CR after Youd et al. (2001) Table 2, keyed on rod length below ground.
  if (depth < 3) return 0.75;
  if (depth < 4) return 0.8;
  if (depth < 6) return 0.85;
  if (depth < 10) return 0.95;
  return 1.0;
}

function boreholeCorrection(diameterMm: number | undefined): number {
  // CB after Youd et al. (2001) Table 2.
  if (diameterMm === undefined) return 1.0;
  if (diameterMm <= 115) return 1.0;
  if (diameterMm <= 150) return 1.05;
  return 1.15;
}

// ---------------------------------------------------------------------------
// Overburden correction C_N
// ---------------------------------------------------------------------------

/**
 * Boulanger & Idriss (2014) Eq. 2.15b: C_N = (Pa/σ'v)^m with
 * m = 0.784 − 0.0768·sqrt((N1)60cs), capped at 1.7.
 *
 * C_N depends on (N1)60cs, which itself depends on C_N, so the pair is solved
 * by fixed-point iteration as recommended in the source.
 */
function overburdenCorrectionBI(
  N: number,
  sigmaVPrime: number,
  FC: number,
  ceCbCrCs: number,
): { CN: number; N160: number; N160cs: number } {
  let N160cs = N * ceCbCrCs; // seed
  let CN = 1.0;
  let N160 = N * ceCbCrCs;

  for (let i = 0; i < 20; i++) {
    // m is defined on (N1)60cs; B&I bound the argument to the dataset range.
    const m = 0.784 - 0.0768 * Math.sqrt(Math.max(Math.min(N160cs, 46), 0));
    const nextCN = Math.min(Math.pow(PA / sigmaVPrime, m), 1.7);
    const nextN160 = N * nextCN * ceCbCrCs;
    const nextN160cs = nextN160 + finesCorrectionBI(nextN160, FC);

    const converged = Math.abs(nextN160cs - N160cs) < 1e-6;
    CN = nextCN;
    N160 = nextN160;
    N160cs = nextN160cs;
    if (converged) break;
  }

  return { CN, N160, N160cs };
}

/** Liao & Whitman (1986): C_N = sqrt(Pa/σ'v), capped at 1.7 (NCEER practice). */
function overburdenCorrectionLiaoWhitman(sigmaVPrime: number): number {
  return Math.min(Math.sqrt(PA / sigmaVPrime), 1.7);
}

// ---------------------------------------------------------------------------
// Fines content correction
// ---------------------------------------------------------------------------

/** Boulanger & Idriss (2014) Eq. 2.11. */
function finesCorrectionBI(N160: number, FC: number): number {
  const f = FC + 0.01;
  return Math.exp(1.63 + 9.7 / f - (15.7 / f) ** 2);
}

/** Youd et al. (2001) Eqs. 8-9: (N1)60cs = α + β·(N1)60. */
function finesCorrectionNCEER(N160: number, FC: number): number {
  let alpha: number;
  let beta: number;

  if (FC <= 5) {
    alpha = 0;
    beta = 1.0;
  } else if (FC < 35) {
    alpha = Math.exp(1.76 - 190 / FC ** 2);
    beta = 0.99 + FC ** 1.5 / 1000;
  } else {
    alpha = 5.0;
    beta = 1.2;
  }

  return alpha + beta * N160;
}

// ---------------------------------------------------------------------------
// Cyclic stress ratio
// ---------------------------------------------------------------------------

function calculateCSR(sigmaV: number, sigmaVPrime: number, amax: number, rd: number): number {
  return 0.65 * (sigmaV / sigmaVPrime) * amax * rd;
}

// ---------------------------------------------------------------------------
// Cyclic resistance ratio
// ---------------------------------------------------------------------------

/**
 * Boulanger & Idriss (2014) Eq. 2.24 — deterministic triggering curve at
 * M = 7.5 and σ'v = 1 atm:
 *
 *   CRR = exp[ N/14.1 + (N/126)² − (N/23.6)³ + (N/25.4)⁴ − 2.8 ]
 *
 * Each term carries its own divisor; they cannot be folded onto a single
 * normalized variable.
 */
function crr75_BI2014(N160cs: number): number {
  const N = Math.min(N160cs, 37.5); // curve is asymptotic; B&I cap the input
  return Math.exp(
    N / 14.1 + (N / 126) ** 2 - (N / 23.6) ** 3 + (N / 25.4) ** 4 - 2.8,
  );
}

/**
 * Boulanger & Idriss (2014) Eqs. 2.19-2.20 — magnitude scaling factor whose
 * amplitude depends on the density of the sand.
 */
function magnitudeScalingFactorBI(N160cs: number, Mw: number): number {
  const MSFmax = Math.min(1.09 + (Math.min(N160cs, 37.5) / 31.5) ** 2, 2.2);
  return 1 + (MSFmax - 1) * (8.64 * Math.exp(-Mw / 4) - 1.325);
}

/**
 * Boulanger & Idriss (2014) Eqs. 2.16-2.17 — overburden correction on cyclic
 * resistance, capped at 1.1.
 */
function overburdenResistanceFactorBI(N160cs: number, sigmaVPrime: number): number {
  const denominator = 18.9 - 2.55 * Math.sqrt(Math.min(N160cs, 37.5));
  const Csigma = Math.min(1 / Math.max(denominator, 1e-6), 0.3);
  return Math.min(1 - Csigma * Math.log(sigmaVPrime / PA), 1.1);
}

/** Youd et al. (2001) Eq. 4 — NCEER clean-sand base curve. */
function crr75_NCEER(N160cs: number): number {
  if (N160cs >= 30) return 2.0; // beyond the curve: treated as non-liquefiable
  return (
    1 / (34 - N160cs) +
    N160cs / 135 +
    50 / (10 * N160cs + 45) ** 2 -
    1 / 200
  );
}

/** Youd et al. (2001) Eq. 24 — lower-bound MSF for engineering practice. */
function magnitudeScalingFactorNCEER(Mw: number): number {
  return Math.pow(10, 2.24) / Math.pow(Mw, 2.56);
}

// ---------------------------------------------------------------------------
// Post-liquefaction settlement
// ---------------------------------------------------------------------------

/**
 * Post-liquefaction reconsolidation volumetric strain after Ishihara &
 * Yoshimine (1992), using the closed-form parameterization given by
 * Yoshimine et al. (2006) and reproduced in Idriss & Boulanger (2008).
 *
 * Returns volumetric strain in percent.
 */
function volumetricStrain(N160cs: number, FS: number): number {
  const N = Math.max(Math.min(N160cs, 33), 0);

  // Limiting shear strain (Eq. after Yoshimine et al. 2006).
  const gammaLim = Math.max(0, 1.859 * (1.1 - Math.sqrt(N / 46)) ** 3);
  if (gammaLim <= 0) return 0;

  // F_alpha marks the FS below which shear strains begin to accumulate.
  const Nfa = Math.max(N, 7);
  const Falpha = 0.032 + 0.69 * Math.sqrt(Nfa) - 0.13 * Nfa;

  let gammaMax: number;
  if (FS >= 2) {
    gammaMax = 0;
  } else if (FS <= Falpha) {
    gammaMax = gammaLim;
  } else {
    gammaMax = Math.min(gammaLim, 0.035 * (2 - FS) * ((1 - Falpha) / (FS - Falpha)));
  }

  // Volumetric strain from the maximum shear strain.
  const epsV = 1.5 * Math.exp(-0.369 * Math.sqrt(N)) * Math.min(0.08, gammaMax);
  return epsV * 100;
}

// ---------------------------------------------------------------------------
// Layer thickness inference for settlement integration
// ---------------------------------------------------------------------------

/**
 * Tributary thickness for each sample, taken as the midpoint distance to the
 * neighbouring samples. An explicit `thickness` on a layer always wins.
 */
function inferThicknesses(layers: LiquefactionInput['layers']): number[] {
  const order = layers.map((layer, index) => ({ depth: layer.depth, index }))
    .sort((a, b) => a.depth - b.depth);

  const thicknesses = new Array<number>(layers.length).fill(0);

  for (let i = 0; i < order.length; i++) {
    const explicit = layers[order[i].index].thickness;
    if (explicit !== undefined) {
      thicknesses[order[i].index] = explicit;
      continue;
    }

    const depth = order[i].depth;
    const prevDepth = i > 0 ? order[i - 1].depth : undefined;
    const nextDepth = i < order.length - 1 ? order[i + 1].depth : undefined;

    const top = prevDepth === undefined ? Math.max(0, depth - (nextDepth !== undefined ? (nextDepth - depth) / 2 : 0.5))
      : (prevDepth + depth) / 2;
    const bottom = nextDepth === undefined ? depth + (prevDepth !== undefined ? (depth - prevDepth) / 2 : 0.5)
      : (depth + nextDepth) / 2;

    thicknesses[order[i].index] = Math.max(bottom - top, 0.1);
  }

  return thicknesses;
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateLiquefaction(input: LiquefactionInput): LiquefactionResult {
  const v = LiquefactionInputSchema.parse(input);
  const steps: string[] = [];
  const results: LiquefactionLayerResult[] = [];
  const isBI = v.method === 'boulanger-idriss-2014';

  steps.push(`Method: ${isBI ? 'Boulanger & Idriss (2014)' : 'NCEER Simplified (Youd et al. 2001)'}`);
  steps.push(`Mw = ${v.earthquakeMagnitude}, amax = ${v.pga}g`);
  steps.push(
    isBI
      ? `r_d: Idriss (1999) magnitude-dependent; C_N: B&I (2014) Eq. 2.15b; K_σ applied`
      : `r_d: Liao & Whitman (1986); C_N = sqrt(Pa/σ'v); K_σ = 1.0`,
  );

  const thicknesses = inferThicknesses(v.layers);

  for (let i = 0; i < v.layers.length; i++) {
    const layer = v.layers[i];

    // --- in-situ stresses ---
    const sigmaV = layer.unitWeight * layer.depth;
    const u = layer.depth > layer.waterTableDepth
      ? GAMMA_W * (layer.depth - layer.waterTableDepth)
      : 0;
    const sigmaVPrime = Math.max(sigmaV - u, 1);

    // --- blow count corrections common to both procedures ---
    const CE = layer.energyRatio !== undefined ? layer.energyRatio / 60 : 1.0;
    const CB = boreholeCorrection(layer.boreholeDiameter);
    const CR = rodLengthCorrection(layer.depth);
    const CS = layer.linerCorrection ?? 1.0;
    const ceCbCrCs = CE * CB * CR * CS;

    let CN: number;
    let N160: number;
    let N160cs: number;
    let rd: number;
    let MSF: number;
    let Ksigma: number;
    let CRR: number;

    if (isBI) {
      ({ CN, N160, N160cs } = overburdenCorrectionBI(
        layer.sptN, sigmaVPrime, layer.finesContent, ceCbCrCs,
      ));
      rd = stressReductionIdriss(layer.depth, v.earthquakeMagnitude);
      MSF = magnitudeScalingFactorBI(N160cs, v.earthquakeMagnitude);
      Ksigma = overburdenResistanceFactorBI(N160cs, sigmaVPrime);
      CRR = crr75_BI2014(N160cs) * MSF * Ksigma;
    } else {
      CN = overburdenCorrectionLiaoWhitman(sigmaVPrime);
      N160 = layer.sptN * CN * ceCbCrCs;
      N160cs = finesCorrectionNCEER(N160, layer.finesContent);
      rd = stressReductionLiaoWhitman(layer.depth);
      MSF = magnitudeScalingFactorNCEER(v.earthquakeMagnitude);
      Ksigma = 1.0;
      CRR = crr75_NCEER(N160cs) * MSF;
    }

    const CSR = calculateCSR(sigmaV, sigmaVPrime, v.pga, rd);
    const FSraw = CSR > 0 ? CRR / CSR : 99;
    const FS = Math.round(Math.min(FSraw, 99) * 100) / 100;

    let potential: LiquefactionLayerResult['potential'];
    if (FS > 1.3) potential = 'LOW';
    else if (FS > 1.0) potential = 'MODERATE';
    else if (FS > 0.7) potential = 'HIGH';
    else potential = 'SEVERE';

    const epsV = volumetricStrain(N160cs, FSraw);

    results.push({
      depth: layer.depth,
      N160: Math.round(N160 * 10) / 10,
      N160cs: Math.round(N160cs * 10) / 10,
      CSR: Math.round(CSR * 1000) / 1000,
      CRR: Math.round(CRR * 1000) / 1000,
      factorOfSafety: FS,
      potential,
      sigmaVPrime: Math.round(sigmaVPrime * 10) / 10,
      CN: Math.round(CN * 1000) / 1000,
      rd: Math.round(rd * 1000) / 1000,
      MSF: Math.round(MSF * 1000) / 1000,
      Ksigma: Math.round(Ksigma * 1000) / 1000,
      volumetricStrain: Math.round(epsV * 100) / 100,
    });

    steps.push(
      `  z=${layer.depth}m: (N₁)₆₀=${N160.toFixed(1)}, (N₁)₆₀cs=${N160cs.toFixed(1)}, ` +
      `r_d=${rd.toFixed(3)}, CSR=${CSR.toFixed(3)}, MSF=${MSF.toFixed(2)}, K_σ=${Ksigma.toFixed(2)}, ` +
      `CRR=${CRR.toFixed(3)}, FS=${FS.toFixed(2)} → ${potential}`,
    );
  }

  // --- settlement integration ---
  let totalSettlement = 0;
  for (let i = 0; i < results.length; i++) {
    totalSettlement += (results[i].volumetricStrain / 100) * thicknesses[i] * 1000;
  }
  const estimatedSettlement = Math.round(totalSettlement);

  steps.push(
    `Post-liquefaction settlement (Ishihara & Yoshimine 1992): ${estimatedSettlement} mm ` +
    `over ${thicknesses.reduce((a, b) => a + b, 0).toFixed(1)} m of profile`,
  );

  return {
    method: v.method,
    layers: results,
    estimatedSettlement,
    steps,
  };
}
