import { z } from 'zod';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const BearingCapacityInputSchema = z.object({
  width: z.number().positive().describe('Foundation width B (m)'),
  length: z.number().positive().optional().describe('Foundation length L (m) — omit for strip'),
  depth: z.number().nonnegative().describe('Embedment depth Df (m)'),
  unitWeight: z.number().positive().describe('Soil unit weight γ (kN/m³)'),
  cohesion: z.number().nonnegative().describe('Cohesion c (kPa)'),
  frictionAngle: z.number().min(0).max(50).describe('Friction angle φ (degrees)'),
  method: z.enum(['terzaghi', 'meyerhof', 'hansen', 'vesic']).default('meyerhof'),
  factorOfSafety: z.number().positive().default(3.0),
  waterTableDepth: z.number().nonnegative().optional().describe('Depth to water table from surface (m)'),
  shape: z.enum(['strip', 'square', 'circular', 'rectangular']).default('strip'),
});

export type BearingCapacityInput = z.infer<typeof BearingCapacityInputSchema>;

export interface BearingCapacityResult {
  method: string;
  qUltimate: number;
  qAllowable: number;
  factorOfSafety: number;
  bearingCapacityFactors: { Nc: number; Nq: number; Ngamma: number };
  shapeFactors?: { sc: number; sq: number; sgamma: number };
  depthFactors?: { dc: number; dq: number; dgamma: number };
  steps: string[];
}

// ---------------------------------------------------------------------------
// Bearing capacity factors (Terzaghi original)
// ---------------------------------------------------------------------------

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function terzaghiFactors(phi: number): { Nc: number; Nq: number; Ngamma: number } {
  const phiRad = degToRad(phi);

  if (phi === 0) {
    return { Nc: 5.7, Nq: 1.0, Ngamma: 0.0 };
  }

  // Nq = exp(2π(0.75 - φ/360)tanφ) / (2cos²(45 + φ/2))
  const a = Math.exp(2 * Math.PI * (0.75 - phi / 360) * Math.tan(phiRad));
  const b = 2 * Math.pow(Math.cos(degToRad(45 + phi / 2)), 2);
  const Nq = a / b;

  // Nc = (Nq - 1) * cot(φ)
  const Nc = (Nq - 1) / Math.tan(phiRad);

  // Nγ approximation (Kumbhojkar 1993)
  const Ngamma = 2 * (Nq + 1) * Math.tan(phiRad);

  return { Nc, Nq, Ngamma };
}

// ---------------------------------------------------------------------------
// General bearing capacity factors (Meyerhof/Hansen/Vesic use these)
// ---------------------------------------------------------------------------

function generalFactors(phi: number): { Nc: number; Nq: number; Ngamma: number } {
  const phiRad = degToRad(phi);

  if (phi === 0) {
    return { Nc: 5.14, Nq: 1.0, Ngamma: 0.0 };
  }

  // Nq = tan²(45 + φ/2) * exp(π tanφ)
  const Nq =
    Math.pow(Math.tan(degToRad(45 + phi / 2)), 2) *
    Math.exp(Math.PI * Math.tan(phiRad));

  // Nc = (Nq - 1) cot(φ)
  const Nc = (Nq - 1) / Math.tan(phiRad);

  // Nγ = 2(Nq + 1) tanφ (Vesic approximation, widely used)
  const Ngamma = 2 * (Nq + 1) * Math.tan(phiRad);

  return { Nc, Nq, Ngamma };
}

// ---------------------------------------------------------------------------
// Shape factors
// ---------------------------------------------------------------------------

function meyerhofShapeFactors(
  B: number,
  L: number | undefined,
  phi: number,
): { sc: number; sq: number; sgamma: number } {
  if (!L || L === 0) {
    return { sc: 1, sq: 1, sgamma: 1 }; // strip
  }
  const phiRad = degToRad(phi);
  const BL = B / L;

  return {
    sc: 1 + 0.2 * BL * Math.pow(Math.tan(degToRad(45 + phi / 2)), 2),
    sq: phi > 10 ? 1 + 0.1 * BL * Math.pow(Math.tan(degToRad(45 + phi / 2)), 2) : 1,
    sgamma: phi > 10 ? 1 + 0.1 * BL * Math.pow(Math.tan(degToRad(45 + phi / 2)), 2) : 1,
  };
}

function hansenShapeFactors(
  B: number,
  L: number | undefined,
  phi: number,
  Nc: number,
  Nq: number,
): { sc: number; sq: number; sgamma: number } {
  if (!L || L === 0) {
    return { sc: 1, sq: 1, sgamma: 1 };
  }
  const BL = B / L;
  const phiRad = degToRad(phi);

  return {
    sc: 1 + (Nq / Nc) * BL,
    sq: 1 + BL * Math.sin(phiRad),
    sgamma: Math.max(1 - 0.4 * BL, 0.6),
  };
}

// ---------------------------------------------------------------------------
// Depth factors
// ---------------------------------------------------------------------------

function meyerhofDepthFactors(
  B: number,
  D: number,
  phi: number,
): { dc: number; dq: number; dgamma: number } {
  const DB = D / B;

  return {
    dc: 1 + 0.2 * DB * Math.tan(degToRad(45 + phi / 2)),
    dq: phi > 10 ? 1 + 0.1 * DB * Math.tan(degToRad(45 + phi / 2)) : 1,
    dgamma: phi > 10 ? 1 + 0.1 * DB * Math.tan(degToRad(45 + phi / 2)) : 1,
  };
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateBearingCapacity(
  input: BearingCapacityInput,
): BearingCapacityResult {
  const validated = BearingCapacityInputSchema.parse(input);
  const { width: B, length: L, depth: D, unitWeight: gamma, cohesion: c, frictionAngle: phi, method, factorOfSafety: FS } = validated;

  const steps: string[] = [];
  steps.push(`Method: ${method.charAt(0).toUpperCase() + method.slice(1)}`);
  steps.push(`B = ${B} m, D = ${D} m, γ = ${gamma} kN/m³, c = ${c} kPa, φ = ${phi}°`);

  let Nc: number, Nq: number, Ngamma: number;
  let sc = 1, sq = 1, sgamma = 1;
  let dc = 1, dq = 1, dgamma = 1;

  if (method === 'terzaghi') {
    ({ Nc, Nq, Ngamma } = terzaghiFactors(phi));
    steps.push(`Bearing capacity factors (Terzaghi): Nc=${Nc.toFixed(2)}, Nq=${Nq.toFixed(2)}, Nγ=${Ngamma.toFixed(2)}`);

    // Terzaghi shape corrections
    if (validated.shape === 'square') {
      sc = 1.3; sgamma = 0.8;
      steps.push(`Square footing: sc=1.3, sγ=0.8`);
    } else if (validated.shape === 'circular') {
      sc = 1.3; sgamma = 0.6;
      steps.push(`Circular footing: sc=1.3, sγ=0.6`);
    }
  } else {
    ({ Nc, Nq, Ngamma } = generalFactors(phi));
    steps.push(`Bearing capacity factors: Nc=${Nc.toFixed(2)}, Nq=${Nq.toFixed(2)}, Nγ=${Ngamma.toFixed(2)}`);

    if (method === 'meyerhof') {
      ({ sc, sq, sgamma } = meyerhofShapeFactors(B, L, phi));
      ({ dc, dq, dgamma } = meyerhofDepthFactors(B, D, phi));
      steps.push(`Shape factors: sc=${sc.toFixed(3)}, sq=${sq.toFixed(3)}, sγ=${sgamma.toFixed(3)}`);
      steps.push(`Depth factors: dc=${dc.toFixed(3)}, dq=${dq.toFixed(3)}, dγ=${dgamma.toFixed(3)}`);
    } else if (method === 'hansen' || method === 'vesic') {
      ({ sc, sq, sgamma } = hansenShapeFactors(B, L, phi, Nc, Nq));
      ({ dc, dq, dgamma } = meyerhofDepthFactors(B, D, phi));
      steps.push(`Shape factors (Hansen): sc=${sc.toFixed(3)}, sq=${sq.toFixed(3)}, sγ=${sgamma.toFixed(3)}`);
      steps.push(`Depth factors: dc=${dc.toFixed(3)}, dq=${dq.toFixed(3)}, dγ=${dgamma.toFixed(3)}`);
    }
  }

  // --- Water table correction ---
  // Case 1: GWT at or above foundation level → reduce γ in Nγ term and q in Nq term
  // Case 2: GWT within influence zone (D to D+B) → interpolated reduction on Nγ term
  // Case 3: GWT below D+B → no correction needed
  const gwt = validated.waterTableDepth;
  const gammaW = 9.81; // unit weight of water

  let q: number;            // overburden pressure at foundation level
  let gammaBelow: number;   // effective unit weight below foundation for Nγ term

  if (gwt !== undefined && gwt < D + B) {
    if (gwt <= D) {
      // Case 1: Water table at or above foundation level
      // Overburden uses effective stress: γ*gwt + γ'*(D-gwt)
      const gammaPrime = gamma - gammaW;
      q = gamma * gwt + gammaPrime * (D - gwt);
      gammaBelow = gammaPrime;
      steps.push(`Water table at ${gwt}m (above foundation): q = γ×${gwt} + γ'×${(D - gwt).toFixed(1)} = ${q.toFixed(2)} kPa`);
      steps.push(`Submerged unit weight γ' = ${gammaPrime.toFixed(2)} kN/m³ used in Nγ term`);
    } else {
      // Case 2: Water table between D and D+B
      // q uses full γ (water is below foundation), but Nγ term uses interpolated γ
      q = gamma * D;
      const dw = gwt - D; // depth of water below foundation
      const gammaPrime = gamma - gammaW;
      gammaBelow = gammaPrime + (dw / B) * (gamma - gammaPrime);
      steps.push(`Water table at ${gwt}m (within influence zone): γ_eff = ${gammaBelow.toFixed(2)} kN/m³ (interpolated)`);
    }
  } else {
    // Case 3: No water table effect
    q = gamma * D;
    gammaBelow = gamma;
  }
  steps.push(`Overburden pressure: q = ${q.toFixed(2)} kPa`);

  // General bearing capacity equation:
  // q_ult = c·Nc·sc·dc + q·Nq·sq·dq + 0.5·γ·B·Nγ·sγ·dγ
  const term1 = c * Nc * sc * dc;
  const term2 = q * Nq * sq * dq;
  const term3 = 0.5 * gammaBelow * B * Ngamma * sgamma * dgamma;

  const qUltimate = term1 + term2 + term3;

  steps.push(`q_ult = c·Nc·sc·dc + q·Nq·sq·dq + 0.5·γ·B·Nγ·sγ·dγ`);
  steps.push(`q_ult = ${term1.toFixed(2)} + ${term2.toFixed(2)} + ${term3.toFixed(2)} = ${qUltimate.toFixed(2)} kPa`);

  const qAllowable = qUltimate / FS;
  steps.push(`q_allow = q_ult / FS = ${qUltimate.toFixed(2)} / ${FS} = ${qAllowable.toFixed(2)} kPa`);

  return {
    method,
    qUltimate: Math.round(qUltimate * 100) / 100,
    qAllowable: Math.round(qAllowable * 100) / 100,
    factorOfSafety: FS,
    bearingCapacityFactors: {
      Nc: Math.round(Nc * 100) / 100,
      Nq: Math.round(Nq * 100) / 100,
      Ngamma: Math.round(Ngamma * 100) / 100,
    },
    shapeFactors: { sc, sq, sgamma },
    depthFactors: { dc, dq, dgamma },
    steps,
  };
}
