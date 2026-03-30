import { z } from 'zod';

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
}

export interface LiquefactionResult {
  method: string;
  layers: LiquefactionLayerResult[];
  estimatedSettlement: number;
  steps: string[];
}

// ---------------------------------------------------------------------------
// SPT corrections
// ---------------------------------------------------------------------------

function correctSPT(
  N: number,
  depth: number,
  gamma: number,
  waterTableDepth: number,
): { N160: number; sigmaV: number; sigmaVPrime: number } {
  const sigmaV = gamma * depth;
  const u = depth > waterTableDepth ? 9.81 * (depth - waterTableDepth) : 0;
  const sigmaVPrime = Math.max(sigmaV - u, 1);

  // Overburden correction CN (Liao & Whitman 1986)
  const pa = 101.325; // atmospheric pressure kPa
  const CN = Math.min(Math.sqrt(pa / sigmaVPrime), 1.7);

  // Energy ratio correction (assume standard 60% energy)
  const CE = 1.0;
  const CB = 1.0; // standard borehole
  const CR = depth < 3 ? 0.75 : depth < 4 ? 0.8 : depth < 6 ? 0.85 : depth < 10 ? 0.95 : 1.0;
  const CS = 1.0; // standard sampler

  const N160 = N * CN * CE * CB * CR * CS;

  return { N160, sigmaV, sigmaVPrime };
}

// ---------------------------------------------------------------------------
// Fines content correction
// ---------------------------------------------------------------------------

function finesCorrection(N160: number, FC: number): number {
  // Boulanger & Idriss 2014 fines correction
  const deltaN = Math.exp(
    1.63 + 9.7 / (FC + 0.01) - (15.7 / (FC + 0.01)) ** 2,
  );
  return N160 + deltaN;
}

// ---------------------------------------------------------------------------
// CSR calculation (simplified procedure)
// ---------------------------------------------------------------------------

function calculateCSR(
  sigmaV: number,
  sigmaVPrime: number,
  amax: number,
  depth: number,
): number {
  // Stress reduction factor rd (Idriss 1999)
  let rd: number;
  if (depth <= 9.15) {
    rd = 1.0 - 0.00765 * depth;
  } else if (depth <= 23) {
    rd = 1.174 - 0.0267 * depth;
  } else {
    rd = 0.744 - 0.008 * depth;
  }
  rd = Math.max(rd, 0.1);

  return 0.65 * (sigmaV / sigmaVPrime) * amax * rd;
}

// ---------------------------------------------------------------------------
// CRR calculation (Boulanger & Idriss 2014)
// ---------------------------------------------------------------------------

function calculateCRR_BI2014(N160cs: number, Mw: number): number {
  // CRR7.5 from Boulanger & Idriss 2014 deterministic curve
  const x = N160cs / 14.1;
  const CRR75 = Math.exp(
    x + (x ** 2) / 2.67 - (x ** 3) / 3.0 + (x ** 4) / 4.0 - 2.8,
  );

  // Magnitude scaling factor MSF (Boulanger & Idriss 2014)
  const MSF = 6.9 * Math.exp(-Mw / 4.0) - 0.058;
  const MSFclamped = Math.max(Math.min(MSF, 2.0), 0.8);

  return CRR75 * MSFclamped;
}

// ---------------------------------------------------------------------------
// CRR calculation (NCEER simplified — Seed et al. 1985 / Youd et al. 2001)
// ---------------------------------------------------------------------------

function calculateCRR_NCEER(N160cs: number, Mw: number): number {
  if (N160cs >= 30) {
    return 99; // too dense to liquefy
  }

  const CRR75 =
    1 / (34 - N160cs) +
    N160cs / 135 +
    50 / (10 * N160cs + 45) ** 2 -
    1 / 200;

  // MSF (Idriss 1999)
  const MSF = Math.min(Math.pow(10, 2.24) / Math.pow(Mw, 2.56), 2.0);

  return CRR75 * MSF;
}

// ---------------------------------------------------------------------------
// Settlement estimation (Ishihara & Yoshimine 1992)
// ---------------------------------------------------------------------------

function estimateSettlement(layers: LiquefactionLayerResult[], thicknesses: number[]): number {
  let totalSettlement = 0;

  for (let i = 0; i < layers.length; i++) {
    const FS = layers[i].factorOfSafety;
    if (FS >= 1.2) continue;

    // Volumetric strain as function of FS
    let epsilonV: number;
    if (FS < 0.5) {
      epsilonV = 5.0;
    } else if (FS < 0.8) {
      epsilonV = 3.0;
    } else if (FS < 1.0) {
      epsilonV = 1.5;
    } else {
      epsilonV = 0.5;
    }

    totalSettlement += (epsilonV / 100) * (thicknesses[i] ?? 2) * 1000;
  }

  return Math.round(totalSettlement);
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateLiquefaction(input: LiquefactionInput): LiquefactionResult {
  const v = LiquefactionInputSchema.parse(input);
  const steps: string[] = [];
  const results: LiquefactionLayerResult[] = [];

  steps.push(`Method: ${v.method === 'boulanger-idriss-2014' ? 'Boulanger & Idriss (2014)' : 'NCEER Simplified (Youd et al. 2001)'}`);
  steps.push(`Mw = ${v.earthquakeMagnitude}, amax = ${v.pga}g`);

  const thicknesses: number[] = [];

  for (const layer of v.layers) {
    const { N160, sigmaV, sigmaVPrime } = correctSPT(
      layer.sptN,
      layer.depth,
      layer.unitWeight,
      layer.waterTableDepth,
    );

    const N160cs = finesCorrection(N160, layer.finesContent);
    const CSR = calculateCSR(sigmaV, sigmaVPrime, v.pga, layer.depth);

    const CRR =
      v.method === 'boulanger-idriss-2014'
        ? calculateCRR_BI2014(N160cs, v.earthquakeMagnitude)
        : calculateCRR_NCEER(N160cs, v.earthquakeMagnitude);

    const FS = Math.round((CRR / CSR) * 100) / 100;

    let potential: LiquefactionLayerResult['potential'];
    if (FS > 1.3) potential = 'LOW';
    else if (FS > 1.0) potential = 'MODERATE';
    else if (FS > 0.7) potential = 'HIGH';
    else potential = 'SEVERE';

    results.push({
      depth: layer.depth,
      N160: Math.round(N160 * 10) / 10,
      N160cs: Math.round(N160cs * 10) / 10,
      CSR: Math.round(CSR * 1000) / 1000,
      CRR: Math.round(CRR * 1000) / 1000,
      factorOfSafety: FS,
      potential,
    });

    thicknesses.push(2); // default 2m layer thickness

    steps.push(
      `  z=${layer.depth}m: N₁₆₀=${N160.toFixed(1)}, (N₁)₆₀cs=${N160cs.toFixed(1)}, CSR=${CSR.toFixed(3)}, CRR=${CRR.toFixed(3)}, FS=${FS.toFixed(2)} → ${potential}`,
    );
  }

  const estimatedSettlement = estimateSettlement(results, thicknesses);
  steps.push(`Estimated liquefaction-induced settlement: ${estimatedSettlement} mm`);

  return {
    method: v.method,
    layers: results,
    estimatedSettlement,
    steps,
  };
}
