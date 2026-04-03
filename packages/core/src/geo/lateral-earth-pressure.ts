import { z } from 'zod';

// ---------------------------------------------------------------------------
// Lateral Earth Pressure — Rankine & Coulomb Methods
//
// Calculates active (Ka), passive (Kp), and at-rest (K0) earth pressure
// coefficients and resultant forces for retaining wall design.
//
// References:
//   - Rankine, W.J.M. (1857). "On the stability of loose earth."
//   - Coulomb, C.A. (1776). "Essai sur une application des règles de maximis et minimis."
//   - Jaky, J. (1944). "The coefficient of earth pressure at rest." K0 = 1 - sin(φ)
//   - Eurocode 7 (EN 1997-1:2004), Section 9
// ---------------------------------------------------------------------------

export const LateralEarthPressureInputSchema = z.object({
  wallHeight: z.number().positive().describe('Retaining wall height H (m)'),
  soilLayers: z.array(z.object({
    thickness: z.number().positive().describe('Layer thickness (m)'),
    unitWeight: z.number().positive().describe('Unit weight γ (kN/m³)'),
    cohesion: z.number().min(0).default(0).describe('Cohesion c (kPa)'),
    frictionAngle: z.number().min(0).max(50).describe('Friction angle φ (degrees)'),
  })).min(1),
  method: z.enum(['rankine', 'coulomb']).default('rankine'),
  pressureState: z.enum(['active', 'passive', 'at_rest']).default('active'),
  wallFrictionAngle: z.number().min(0).max(40).default(0).describe('Wall friction angle δ (degrees) — Coulomb only'),
  backfillAngle: z.number().min(0).max(45).default(0).describe('Backfill slope angle β (degrees)'),
  wallInclination: z.number().min(0).max(30).default(0).describe('Wall inclination from vertical α (degrees)'),
  waterTableDepth: z.number().min(0).default(999).describe('Water table depth from top of wall (m)'),
  surcharge: z.number().min(0).default(0).describe('Uniform surcharge on backfill (kPa)'),
});

export type LateralEarthPressureInput = z.infer<typeof LateralEarthPressureInputSchema>;

export interface LateralEarthPressureResult {
  method: string;
  pressureState: string;
  coefficient: number;          // Ka, Kp, or K0
  totalForce: number;           // Resultant force Pa/Pp (kN/m)
  pointOfApplication: number;   // Height from base (m)
  overturningMoment: number;    // Moment about base (kN·m/m)
  pressureDistribution: Array<{
    depth: number;
    pressure: number;           // kPa
    waterPressure: number;      // kPa
    totalPressure: number;      // kPa
  }>;
  steps: string[];
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// Rankine coefficients
// ---------------------------------------------------------------------------

function rankineKa(phi: number, beta: number = 0): number {
  const phiRad = degToRad(phi);
  const betaRad = degToRad(beta);
  if (beta === 0) {
    return Math.tan(degToRad(45 - phi / 2)) ** 2;
  }
  // General Rankine with sloping backfill
  const cosBeta = Math.cos(betaRad);
  const cosPhi = Math.cos(phiRad);
  return cosBeta * (cosBeta - Math.sqrt(cosBeta ** 2 - cosPhi ** 2)) /
         (cosBeta + Math.sqrt(cosBeta ** 2 - cosPhi ** 2));
}

function rankineKp(phi: number, beta: number = 0): number {
  const phiRad = degToRad(phi);
  const betaRad = degToRad(beta);
  if (beta === 0) {
    return Math.tan(degToRad(45 + phi / 2)) ** 2;
  }
  const cosBeta = Math.cos(betaRad);
  const cosPhi = Math.cos(phiRad);
  return cosBeta * (cosBeta + Math.sqrt(cosBeta ** 2 - cosPhi ** 2)) /
         (cosBeta - Math.sqrt(cosBeta ** 2 - cosPhi ** 2));
}

// ---------------------------------------------------------------------------
// Coulomb coefficients
// ---------------------------------------------------------------------------

function coulombKa(phi: number, delta: number, alpha: number, beta: number): number {
  const phiRad = degToRad(phi);
  const deltaRad = degToRad(delta);
  const alphaRad = degToRad(alpha);
  const betaRad = degToRad(beta);
  const cosDeltaAlpha = Math.cos(deltaRad + alphaRad);
  const cosAlphaBeta = Math.cos(alphaRad - betaRad);
  const rootTermDenom = cosDeltaAlpha * cosAlphaBeta;

  if (cosDeltaAlpha <= 0 || cosAlphaBeta <= 0 || rootTermDenom <= 0) {
    return 0;
  }

  const rootTerm = (Math.sin(phiRad + deltaRad) * Math.sin(phiRad - betaRad)) / rootTermDenom;
  if (rootTerm < 0) {
    return 0;
  }

  const numerator = Math.cos(phiRad - alphaRad) ** 2;
  const denominator = Math.cos(alphaRad) ** 2 * cosDeltaAlpha *
    (1 + Math.sqrt(rootTerm)) ** 2;

  return denominator > 0 ? numerator / denominator : 0;
}

function coulombKp(phi: number, delta: number, alpha: number, beta: number): number {
  const phiRad = degToRad(phi);
  const deltaRad = degToRad(delta);
  const alphaRad = degToRad(alpha);
  const betaRad = degToRad(beta);
  const cosDeltaAlpha = Math.cos(deltaRad - alphaRad);
  const cosAlphaBeta = Math.cos(alphaRad - betaRad);
  const rootTermDenom = cosDeltaAlpha * cosAlphaBeta;

  if (cosDeltaAlpha <= 0 || cosAlphaBeta <= 0 || rootTermDenom <= 0) {
    return 999;
  }

  const rootTerm = (Math.sin(phiRad + deltaRad) * Math.sin(phiRad + betaRad)) / rootTermDenom;
  if (rootTerm < 0 || rootTerm >= 1) {
    return 999;
  }

  const numerator = Math.cos(phiRad + alphaRad) ** 2;
  const denominator = Math.cos(alphaRad) ** 2 * cosDeltaAlpha *
    (1 - Math.sqrt(rootTerm)) ** 2;

  return denominator > 0 ? numerator / denominator : 999;
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateLateralEarthPressure(input: LateralEarthPressureInput): LateralEarthPressureResult {
  const v = LateralEarthPressureInputSchema.parse(input);
  const steps: string[] = [];
  const { wallHeight: H, soilLayers, method, pressureState, wallFrictionAngle: delta, backfillAngle: beta, wallInclination: alpha, waterTableDepth: gwt, surcharge: q } = v;

  steps.push(`Wall: H=${H}m, method=${method}, state=${pressureState}`);

  // Use weighted average soil properties for coefficient calculation
  let totalWeight = 0;
  let weightedPhi = 0;
  let weightedC = 0;
  let weightedGamma = 0;
  let cumThickness = 0;

  for (const layer of soilLayers) {
    const effectiveThickness = Math.min(layer.thickness, H - cumThickness);
    if (effectiveThickness <= 0) break;
    totalWeight += effectiveThickness;
    weightedPhi += layer.frictionAngle * effectiveThickness;
    weightedC += layer.cohesion * effectiveThickness;
    weightedGamma += layer.unitWeight * effectiveThickness;
    cumThickness += effectiveThickness;
  }

  const avgPhi = weightedPhi / totalWeight;
  const avgC = weightedC / totalWeight;
  const avgGamma = weightedGamma / totalWeight;

  steps.push(`Weighted avg: φ=${avgPhi.toFixed(1)}°, c=${avgC.toFixed(1)} kPa, γ=${avgGamma.toFixed(1)} kN/m³`);

  // Calculate coefficient
  let K: number;

  if (pressureState === 'at_rest') {
    // Jaky (1944): K0 = 1 - sin(φ)
    K = 1 - Math.sin(degToRad(avgPhi));
    steps.push(`K0 = 1 - sin(${avgPhi.toFixed(1)}°) = ${K.toFixed(4)} (Jaky 1944)`);
  } else if (method === 'rankine') {
    K = pressureState === 'active' ? rankineKa(avgPhi, beta) : rankineKp(avgPhi, beta);
    steps.push(`${pressureState === 'active' ? 'Ka' : 'Kp'} = ${K.toFixed(4)} (Rankine${beta > 0 ? `, β=${beta}°` : ''})`);
  } else {
    K = pressureState === 'active'
      ? coulombKa(avgPhi, delta, alpha, beta)
      : coulombKp(avgPhi, delta, alpha, beta);
    steps.push(`${pressureState === 'active' ? 'Ka' : 'Kp'} = ${K.toFixed(4)} (Coulomb, δ=${delta}°, α=${alpha}°, β=${beta}°)`);
  }

  // Pressure distribution (10 points)
  const nPoints = 20;
  const pressureDistribution: LateralEarthPressureResult['pressureDistribution'] = [];
  let totalForce = 0;
  let totalMoment = 0;

  for (let i = 0; i <= nPoints; i++) {
    const depth = (i / nPoints) * H;

    // Determine layer properties at this depth
    let layerGamma = soilLayers[0].unitWeight;
    let layerC = soilLayers[0].cohesion;
    let cumD = 0;
    for (const layer of soilLayers) {
      cumD += layer.thickness;
      if (depth <= cumD) {
        layerGamma = layer.unitWeight;
        layerC = layer.cohesion;
        break;
      }
    }

    // Vertical stress
    const sigma_v = layerGamma * depth + q;

    // Water pressure
    const u = depth > gwt ? 9.81 * (depth - gwt) : 0;
    const sigma_v_eff = sigma_v - u;

    // Lateral earth pressure
    let lateralPressure: number;
    if (pressureState === 'active') {
      lateralPressure = K * sigma_v_eff - 2 * layerC * Math.sqrt(K);
      lateralPressure = Math.max(0, lateralPressure); // tension crack
    } else if (pressureState === 'passive') {
      lateralPressure = K * sigma_v_eff + 2 * layerC * Math.sqrt(K);
    } else {
      lateralPressure = K * sigma_v_eff;
    }

    const totalPressure = lateralPressure + u;

    pressureDistribution.push({
      depth: Math.round(depth * 100) / 100,
      pressure: Math.round(lateralPressure * 10) / 10,
      waterPressure: Math.round(u * 10) / 10,
      totalPressure: Math.round(totalPressure * 10) / 10,
    });

    // Trapezoidal integration
    if (i > 0) {
      const prevP = pressureDistribution[i - 1].totalPressure;
      const dz = H / nPoints;
      const avgP = (prevP + totalPressure) / 2;
      const dF = avgP * dz;
      totalForce += dF;
      totalMoment += dF * (H - depth + dz / 2);
    }
  }

  const pointOfApplication = totalMoment / Math.max(totalForce, 0.001);

  steps.push(`Total force: ${totalForce.toFixed(1)} kN/m`);
  steps.push(`Point of application: ${pointOfApplication.toFixed(2)} m from base`);
  steps.push(`Overturning moment: ${totalMoment.toFixed(1)} kN·m/m about base`);

  if (q > 0) steps.push(`Surcharge q=${q} kPa included in vertical stress`);
  if (gwt < H) steps.push(`Water table at ${gwt}m — hydrostatic pressure added to lateral earth pressure`);

  return {
    method: method.charAt(0).toUpperCase() + method.slice(1),
    pressureState,
    coefficient: Math.round(K * 10000) / 10000,
    totalForce: Math.round(totalForce * 10) / 10,
    pointOfApplication: Math.round(pointOfApplication * 100) / 100,
    overturningMoment: Math.round(totalMoment * 10) / 10,
    pressureDistribution,
    steps,
  };
}
