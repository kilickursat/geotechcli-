import { z } from 'zod';

// ---------------------------------------------------------------------------
// Terzaghi 1D consolidation
// ---------------------------------------------------------------------------

export const ConsolidationInputSchema = z.object({
  compressionIndex: z.number().positive().describe('Compression index Cc'),
  recompressionIndex: z.number().positive().optional().describe('Recompression index Cr'),
  voidRatio: z.number().positive().describe('Initial void ratio e₀'),
  layerThickness: z.number().positive().describe('Clay layer thickness H (m)'),
  stressIncrease: z.number().positive().describe('Stress increase Δσ (kPa)'),
  initialEffectiveStress: z.number().positive().describe('Initial effective stress σ₀ (kPa)'),
  preconsolidationPressure: z.number().positive().optional().describe('Preconsolidation pressure σ_p (kPa)'),
  drainagePath: z.enum(['single', 'double']).default('double'),
  coefficientOfConsolidation: z.number().positive().optional().describe('Cv (m²/year)'),
});

export type ConsolidationInput = z.infer<typeof ConsolidationInputSchema>;

export interface ConsolidationResult {
  primarySettlement: number;
  isOverconsolidated: boolean;
  steps: string[];
  timeSettlement?: Array<{ timeFactor: number; consolidation: number; timeYears: number; settlement: number }>;
}

export function calculateConsolidation(input: ConsolidationInput): ConsolidationResult {
  const v = ConsolidationInputSchema.parse(input);
  const steps: string[] = [];

  const { compressionIndex: Cc, voidRatio: e0, layerThickness: H, stressIncrease: dSigma, initialEffectiveStress: sigma0 } = v;
  const Cr = v.recompressionIndex ?? Cc / 5;
  const sigmaP = v.preconsolidationPressure ?? sigma0;
  const Hd = v.drainagePath === 'double' ? H / 2 : H;

  const sigmaFinal = sigma0 + dSigma;
  const isOC = sigmaP > sigma0;

  steps.push(`σ₀' = ${sigma0.toFixed(1)} kPa, Δσ = ${dSigma.toFixed(1)} kPa, σ_f' = ${sigmaFinal.toFixed(1)} kPa`);
  steps.push(`Cc = ${Cc}, e₀ = ${e0}, H = ${H} m, drainage = ${v.drainagePath}`);

  let settlement: number;

  if (!isOC || sigmaFinal <= sigmaP) {
    // Normally consolidated or loading within recompression range
    if (isOC && sigmaFinal <= sigmaP) {
      settlement = (Cr / (1 + e0)) * Math.log10(sigmaFinal / sigma0) * H;
      steps.push(`OC soil, σ_f' ≤ σ_p': S = Cr/(1+e₀) × log(σ_f'/σ₀') × H`);
    } else {
      settlement = (Cc / (1 + e0)) * Math.log10(sigmaFinal / sigma0) * H;
      steps.push(`NC soil: S = Cc/(1+e₀) × log(σ_f'/σ₀') × H`);
    }
  } else {
    // OC soil loaded past preconsolidation
    const s1 = (Cr / (1 + e0)) * Math.log10(sigmaP / sigma0) * H;
    const s2 = (Cc / (1 + e0)) * Math.log10(sigmaFinal / sigmaP) * H;
    settlement = s1 + s2;
    steps.push(`OC soil, σ_f' > σ_p': S = Cr/(1+e₀)×log(σ_p'/σ₀')×H + Cc/(1+e₀)×log(σ_f'/σ_p')×H`);
    steps.push(`S₁ (recompression) = ${(s1 * 1000).toFixed(1)} mm`);
    steps.push(`S₂ (virgin compression) = ${(s2 * 1000).toFixed(1)} mm`);
  }

  steps.push(`Total primary consolidation settlement = ${(settlement * 1000).toFixed(1)} mm`);

  // Time-settlement curve if Cv provided
  let timeSettlement: ConsolidationResult['timeSettlement'];
  if (v.coefficientOfConsolidation) {
    const Cv = v.coefficientOfConsolidation;
    timeSettlement = [];
    const tvValues = [0.008, 0.031, 0.071, 0.126, 0.197, 0.287, 0.403, 0.567, 0.848, 1.0, 1.5, 2.0];
    const uValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1.0];

    for (let i = 0; i < tvValues.length; i++) {
      const Tv = tvValues[i];
      const U = uValues[i];
      const t = (Tv * Hd * Hd) / Cv;
      timeSettlement.push({
        timeFactor: Tv,
        consolidation: U,
        timeYears: Math.round(t * 100) / 100,
        settlement: Math.round(settlement * U * 1000 * 10) / 10,
      });
    }
  }

  return {
    primarySettlement: Math.round(settlement * 1000 * 10) / 10,
    isOverconsolidated: isOC,
    steps,
    timeSettlement,
  };
}

// ---------------------------------------------------------------------------
// Schmertmann method (immediate settlement)
// ---------------------------------------------------------------------------

export const SchmertmannInputSchema = z.object({
  appliedStress: z.number().positive().describe('Net applied stress q (kPa)'),
  foundationWidth: z.number().positive().describe('Foundation width B (m)'),
  layers: z.array(z.object({
    thickness: z.number().positive().describe('Layer thickness (m)'),
    elasticModulus: z.number().positive().describe('Es from CPT or SPT (kPa)'),
  })).min(1),
  embedmentDepth: z.number().nonnegative().default(0),
  unitWeight: z.number().positive().default(18),
  timeFactor: z.number().positive().default(1).describe('Creep time factor (years)'),
});

export type SchmertmannInput = z.infer<typeof SchmertmannInputSchema>;

export interface SchmertmannResult {
  immediateSettlement: number;
  creepSettlement: number;
  totalSettlement: number;
  steps: string[];
}

export function calculateSchmertmann(input: SchmertmannInput): SchmertmannResult {
  const v = SchmertmannInputSchema.parse(input);
  const steps: string[] = [];

  const { appliedStress: q, foundationWidth: B, layers, embedmentDepth: D, unitWeight: gamma, timeFactor } = v;

  // Influence depth = 2B for L/B=1 (square), 4B for strip
  const zMax = 2 * B;
  steps.push(`Influence depth z_max = 2B = ${zMax.toFixed(1)} m`);

  // Peak influence factor at z = B/2
  const zPeak = B / 2;
  const sigmaVp = gamma * (D + zPeak);
  const IzPeak = 0.5 + 0.1 * Math.sqrt(q / sigmaVp);
  steps.push(`Peak Iz at z = B/2 = ${zPeak.toFixed(1)} m: Iz_peak = ${IzPeak.toFixed(3)}`);

  // Embedment correction C1
  const q0 = gamma * D;
  const C1 = Math.max(0.5, 1 - 0.5 * (q0 / q));
  steps.push(`C₁ (embedment) = 1 - 0.5(q₀/q) = ${C1.toFixed(3)}`);

  // Creep correction C2
  const C2 = 1 + 0.2 * Math.log10(timeFactor / 0.1);
  steps.push(`C₂ (creep, t=${timeFactor} yr) = ${C2.toFixed(3)}`);

  // Sum Iz/Es * dz for each sublayer
  let zCurrent = 0;
  let sumIzDzEs = 0;

  for (const layer of layers) {
    const zMid = zCurrent + layer.thickness / 2;
    if (zMid > zMax) break;

    // Triangular Iz distribution: 0 at z=0, peak at z=B/2, 0 at z=2B
    let Iz: number;
    if (zMid <= zPeak) {
      Iz = (zMid / zPeak) * IzPeak;
    } else {
      Iz = IzPeak * (1 - (zMid - zPeak) / (zMax - zPeak));
    }
    Iz = Math.max(0, Iz);

    const contribution = (Iz * layer.thickness) / layer.elasticModulus;
    sumIzDzEs += contribution;

    steps.push(`  z=${zMid.toFixed(1)}m: Iz=${Iz.toFixed(3)}, Es=${layer.elasticModulus} kPa, contrib=${(contribution * 1000).toFixed(4)}`);
    zCurrent += layer.thickness;
  }

  const immediateSettlement = C1 * q * sumIzDzEs * 1000;
  const creepSettlement = immediateSettlement * (C2 - 1);
  const totalSettlement = C1 * C2 * q * sumIzDzEs * 1000;

  steps.push(`Immediate settlement = ${immediateSettlement.toFixed(1)} mm`);
  steps.push(`Creep settlement = ${creepSettlement.toFixed(1)} mm`);
  steps.push(`Total settlement = ${totalSettlement.toFixed(1)} mm`);

  return {
    immediateSettlement: Math.round(immediateSettlement * 10) / 10,
    creepSettlement: Math.round(creepSettlement * 10) / 10,
    totalSettlement: Math.round(totalSettlement * 10) / 10,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Peck tunnel settlement trough
// ---------------------------------------------------------------------------

export const PeckSettlementInputSchema = z.object({
  tunnelDiameter: z.number().positive().describe('Tunnel diameter D (m)'),
  tunnelDepth: z.number().positive().describe('Depth to tunnel axis Z₀ (m)'),
  volumeLoss: z.number().positive().max(10).default(1.0).describe('Volume loss Vl (%)'),
  troughWidthParam: z.number().positive().default(0.5).describe('Trough width parameter K'),
});

export type PeckSettlementInput = z.infer<typeof PeckSettlementInputSchema>;

export interface PeckSettlementResult {
  maxSettlement: number;
  inflectionPoint: number;
  troughWidth: number;
  profile: Array<{ x: number; settlement: number }>;
  steps: string[];
}

export function calculatePeckSettlement(input: PeckSettlementInput): PeckSettlementResult {
  const v = PeckSettlementInputSchema.parse(input);
  const steps: string[] = [];

  const { tunnelDiameter: D, tunnelDepth: Z0, volumeLoss: Vl, troughWidthParam: K } = v;

  // Trough width parameter i = K × Z₀
  const i = K * Z0;
  steps.push(`Trough width parameter: i = K × Z₀ = ${K} × ${Z0} = ${i.toFixed(2)} m`);

  // Volume of settlement trough per unit length
  const Vs = (Vl / 100) * Math.PI * (D / 2) ** 2;
  steps.push(`Settlement volume: Vs = Vl × π(D/2)² = ${Vs.toFixed(4)} m³/m`);

  // Maximum settlement: Smax = Vs / (i × √(2π))
  const Smax = Vs / (i * Math.sqrt(2 * Math.PI));
  steps.push(`Max surface settlement: Smax = Vs / (i√(2π)) = ${(Smax * 1000).toFixed(1)} mm`);

  // Settlement profile: S(x) = Smax × exp(-x²/(2i²))
  const profile: Array<{ x: number; settlement: number }> = [];
  const xRange = 3 * i;
  const step = xRange / 30;

  for (let x = -xRange; x <= xRange; x += step) {
    const S = Smax * Math.exp(-(x * x) / (2 * i * i));
    profile.push({
      x: Math.round(x * 100) / 100,
      settlement: Math.round(S * 1000 * 10) / 10,
    });
  }

  steps.push(`Trough width (2.5i) = ${(2.5 * i).toFixed(1)} m`);

  return {
    maxSettlement: Math.round(Smax * 1000 * 10) / 10,
    inflectionPoint: Math.round(i * 100) / 100,
    troughWidth: Math.round(2.5 * i * 100) / 100,
    profile,
    steps,
  };
}
