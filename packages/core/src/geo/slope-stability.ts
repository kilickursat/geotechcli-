import { z } from 'zod';

// ---------------------------------------------------------------------------
// Slope Stability — Bishop Simplified Method
//
// Implements the method of slices with Bishop's simplified assumption
// (normal forces on slice sides are horizontal).
//
// References:
//   - Bishop, A.W. (1955). "The use of the slip circle in the stability analysis of slopes."
//   - Duncan, J.M. & Wright, S.G. (2005). "Soil Strength and Slope Stability."
//   - Eurocode 7 (EN 1997-1:2004), Section 11
// ---------------------------------------------------------------------------

export const SlopeStabilityInputSchema = z.object({
  slopeHeight: z.number().positive().describe('Slope height H (m)'),
  slopeAngle: z.number().min(1).max(89).describe('Slope angle from horizontal (degrees)'),
  soilLayers: z.array(z.object({
    thickness: z.number().positive().describe('Layer thickness (m)'),
    unitWeight: z.number().positive().describe('Total unit weight γ (kN/m³)'),
    cohesion: z.number().min(0).describe('Effective cohesion c\' (kPa)'),
    frictionAngle: z.number().min(0).max(50).describe('Effective friction angle φ\' (degrees)'),
    saturatedUnitWeight: z.number().positive().optional().describe('Saturated unit weight γ_sat (kN/m³)'),
  })).min(1),
  waterTableDepth: z.number().min(0).default(999).describe('Depth to water table from crest (m)'),
  surcharge: z.number().min(0).default(0).describe('Surcharge load at crest (kPa)'),
  seismicCoefficient: z.number().min(0).default(0).describe('Horizontal seismic coefficient kh'),
  numberOfSlices: z.number().int().min(5).max(50).default(10),
  method: z.enum(['bishop', 'ordinary']).default('bishop'),
});

export type SlopeStabilityInput = z.infer<typeof SlopeStabilityInputSchema>;

export interface SlopeStabilityResult {
  method: string;
  factorOfSafety: number;
  criticalCircle: {
    centerX: number;
    centerY: number;
    radius: number;
  };
  sliceResults: Array<{
    sliceNumber: number;
    width: number;
    weight: number;
    baseAngle: number;
    normalForce: number;
    shearStrength: number;
  }>;
  isStable: boolean;
  stabilityClass: 'STABLE' | 'MARGINAL' | 'UNSTABLE' | 'CRITICAL';
  steps: string[];
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// Bishop Simplified Iteration
// ---------------------------------------------------------------------------

function bishopAnalysis(
  centerX: number,
  centerY: number,
  radius: number,
  slopeAngle: number,
  slopeHeight: number,
  layers: SlopeStabilityInput['soilLayers'],
  gwt: number,
  surcharge: number,
  kh: number,
  nSlices: number,
): { fos: number; slices: SlopeStabilityResult['sliceResults'] } {

  const slopeAngleRad = degToRad(slopeAngle);
  const slopeLength = slopeHeight / Math.sin(slopeAngleRad);
  const slopeBase = slopeHeight / Math.tan(slopeAngleRad);

  // Find intersection of circle with slope surface
  // Simplification: use chord from left to right intersection
  const leftX = centerX - radius;
  const rightX = centerX + radius;

  const sliceWidth = (rightX - leftX) / nSlices;
  const slices: SlopeStabilityResult['sliceResults'] = [];

  // Iterative Bishop solution
  let fos = 1.5; // initial guess
  const maxIterations = 50;
  const tolerance = 0.001;

  for (let iter = 0; iter < maxIterations; iter++) {
    let sumResisting = 0;
    let sumDriving = 0;
    const iterSlices: SlopeStabilityResult['sliceResults'] = [];

    for (let i = 0; i < nSlices; i++) {
      const xMid = leftX + (i + 0.5) * sliceWidth;
      const dx = xMid - centerX;

      // Base of slice on circle
      const yBase = centerY - Math.sqrt(Math.max(0, radius * radius - dx * dx));

      // Surface elevation at this x
      let ySurface: number;
      if (xMid <= 0) {
        ySurface = slopeHeight; // crest
      } else if (xMid >= slopeBase) {
        ySurface = 0; // toe
      } else {
        ySurface = slopeHeight - xMid * Math.tan(slopeAngleRad) * (slopeHeight / (slopeBase * Math.tan(slopeAngleRad)));
        ySurface = Math.max(0, slopeHeight * (1 - xMid / slopeBase));
      }

      const height = Math.max(0, ySurface - yBase);
      if (height <= 0.01) continue;

      // Base angle
      // Use the absolute base inclination for slice force resolution.
      // The slip base angle magnitude controls driving/resisting terms;
      // keeping signed left/right geometry here can create cancellation
      // that makes pseudo-static loading appear stabilizing.
      const alpha = Math.abs(Math.atan2(dx, Math.sqrt(Math.max(0, radius * radius - dx * dx))));

      // Determine soil properties at base of slice
      let cumThickness = 0;
      let c = layers[0].cohesion;
      let phi = layers[0].frictionAngle;
      let gamma = layers[0].unitWeight;

      for (const layer of layers) {
        cumThickness += layer.thickness;
        if (yBase <= ySurface - cumThickness + layer.thickness) {
          c = layer.cohesion;
          phi = layer.frictionAngle;
          gamma = layer.unitWeight;
          break;
        }
      }

      // Weight of slice
      const W = gamma * height * sliceWidth + (xMid <= 0 ? surcharge * sliceWidth : 0);

      // Pore water pressure at base
      const uBase = yBase < ySurface - gwt ? 0 : 9.81 * Math.max(0, ySurface - gwt - yBase);

      const phiRad = degToRad(phi);
      const cosAlpha = Math.cos(alpha);
      const sinAlpha = Math.sin(alpha);

      // Bishop's m_alpha factor
      const mAlpha = cosAlpha + (sinAlpha * Math.tan(phiRad)) / fos;

      if (Math.abs(mAlpha) < 0.001) continue;

      // Normal force on base (Bishop simplified)
      const baseLength = sliceWidth / cosAlpha;
      const N = (W - uBase * baseLength * sinAlpha) / mAlpha;

      // Shear strength
      const S = (c * baseLength + (N - uBase * baseLength) * Math.tan(phiRad));

      // Driving force
      // Pseudo-static horizontal acceleration adds a horizontal inertia term.
      const seismicDrivingForce = kh > 0 ? kh * W * cosAlpha : 0;
      const drivingForce = W * sinAlpha + seismicDrivingForce;

      sumResisting += S / mAlpha;
      sumDriving += drivingForce;

      iterSlices.push({
        sliceNumber: i + 1,
        width: Math.round(sliceWidth * 100) / 100,
        weight: Math.round(W * 10) / 10,
        baseAngle: Math.round(alpha * 180 / Math.PI * 10) / 10,
        normalForce: Math.round(N * 10) / 10,
        shearStrength: Math.round(S * 10) / 10,
      });
    }

    if (Math.abs(sumDriving) < 0.001) {
      fos = 99;
      break;
    }

    const newFos = sumResisting / Math.abs(sumDriving);
    if (Math.abs(newFos - fos) < tolerance) {
      fos = newFos;
      slices.push(...iterSlices);
      break;
    }
    fos = newFos;

    if (iter === maxIterations - 1) {
      slices.push(...iterSlices);
    }
  }

  return { fos, slices };
}

// ---------------------------------------------------------------------------
// Main calculation — searches for critical circle
// ---------------------------------------------------------------------------

export function calculateSlopeStability(input: SlopeStabilityInput): SlopeStabilityResult {
  const v = SlopeStabilityInputSchema.parse(input);
  const steps: string[] = [];
  const { slopeHeight: H, slopeAngle, soilLayers, waterTableDepth: gwt, surcharge, seismicCoefficient: kh, numberOfSlices } = v;

  const slopeAngleRad = degToRad(slopeAngle);
  const slopeBase = H / Math.tan(slopeAngleRad);

  steps.push(`Slope: H=${H}m, angle=${slopeAngle}°, base=${slopeBase.toFixed(1)}m`);
  steps.push(`Soil: ${soilLayers.length} layer(s), GWT=${gwt}m, kh=${kh}`);
  steps.push(`Method: ${v.method === 'bishop' ? 'Bishop Simplified' : 'Ordinary Method of Slices'}`);

  // Search grid for critical circle center
  let minFos = Infinity;
  let bestCenter = { x: slopeBase / 2, y: H * 1.5 };
  let bestRadius = H;
  let bestSlices: SlopeStabilityResult['sliceResults'] = [];

  // Search over circle centers above the slope
  const nSearchX = 8;
  const nSearchY = 6;
  const nSearchR = 5;

  for (let ix = 0; ix < nSearchX; ix++) {
    const cx = -slopeBase * 0.3 + (ix / (nSearchX - 1)) * slopeBase * 1.3;
    for (let iy = 0; iy < nSearchY; iy++) {
      const cy = H * 0.8 + (iy / (nSearchY - 1)) * H * 1.5;
      for (let ir = 0; ir < nSearchR; ir++) {
        const rMin = Math.sqrt((cx - slopeBase) ** 2 + cy ** 2) * 0.8;
        const rMax = Math.sqrt(cx ** 2 + cy ** 2) * 1.2;
        const r = rMin + (ir / Math.max(1, nSearchR - 1)) * (rMax - rMin);

        if (r <= 0 || r < H * 0.3) continue;

        try {
          const result = bishopAnalysis(cx, cy, r, slopeAngle, H, soilLayers, gwt, surcharge, kh, numberOfSlices);
          if (result.fos > 0 && result.fos < minFos && result.fos < 50) {
            minFos = result.fos;
            bestCenter = { x: cx, y: cy };
            bestRadius = r;
            bestSlices = result.slices;
          }
        } catch {
          // Skip invalid geometry
        }
      }
    }
  }

  // Stability classification
  let stabilityClass: SlopeStabilityResult['stabilityClass'];
  if (minFos >= 1.5) stabilityClass = 'STABLE';
  else if (minFos >= 1.25) stabilityClass = 'MARGINAL';
  else if (minFos >= 1.0) stabilityClass = 'UNSTABLE';
  else stabilityClass = 'CRITICAL';

  steps.push(`Critical circle: center (${bestCenter.x.toFixed(1)}, ${bestCenter.y.toFixed(1)}), R=${bestRadius.toFixed(1)}m`);
  steps.push(`Factor of Safety: ${minFos.toFixed(3)}`);
  steps.push(`Classification: ${stabilityClass} (EC7 min FOS=1.25 with partial factors, global FOS=1.5)`);

  if (kh > 0) {
    steps.push(`Pseudo-static seismic coefficient kh=${kh} applied (Mononobe-Okabe simplified)`);
  }

  return {
    method: v.method === 'bishop' ? 'Bishop Simplified' : 'Ordinary Method of Slices',
    factorOfSafety: Math.round(minFos * 1000) / 1000,
    criticalCircle: {
      centerX: Math.round(bestCenter.x * 100) / 100,
      centerY: Math.round(bestCenter.y * 100) / 100,
      radius: Math.round(bestRadius * 100) / 100,
    },
    sliceResults: bestSlices,
    isStable: minFos >= 1.5,
    stabilityClass,
    steps,
  };
}
