import { z } from 'zod';

// ---------------------------------------------------------------------------
// Seepage Analysis Engine
// Methods: Dupuit-Forchheimer (unconfined) + Flow Net approximation
// Includes piping/heave safety checks per Terzaghi critical gradient
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Dupuit-Forchheimer — Unconfined 2D Seepage
// ---------------------------------------------------------------------------

export const DupuitSeepageInputSchema = z.object({
  hydraulicConductivity: z.number().positive().describe('Hydraulic conductivity k (m/s)'),
  upstreamHead: z.number().nonnegative().describe('Upstream head h₁ (m)'),
  downstreamHead: z.number().nonnegative().describe('Downstream head h₂ (m)'),
  seepageLength: z.number().positive().describe('Seepage path length L (m)'),
  specificGravity: z.number().positive().default(2.65).describe('Specific gravity Gs'),
  voidRatio: z.number().positive().default(0.7).describe('Void ratio e₀'),
});

export type DupuitSeepageInput = z.infer<typeof DupuitSeepageInputSchema>;

export interface SeepageResult {
  seepageFlow: number;         // m³/s per m width
  exitGradient: number;        // dimensionless
  criticalGradient: number;    // Terzaghi critical gradient
  pipingFOS: number;           // Factor of safety against piping
  heaveRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  heaveRiskDescription: string;
  steps: string[];
}

export function calculateDupuitSeepage(input: DupuitSeepageInput): SeepageResult {
  const v = DupuitSeepageInputSchema.parse(input);
  const steps: string[] = [];

  const { hydraulicConductivity: k, upstreamHead: h1, downstreamHead: h2, seepageLength: L, specificGravity: Gs, voidRatio: e } = v;

  // Head difference
  const H = h1 - h2;
  steps.push(`Head difference: H = h₁ - h₂ = ${h1} - ${h2} = ${H.toFixed(2)} m`);

  // Dupuit-Forchheimer flow: Q = k × (h₁² - h₂²) / (2L)
  const Q = k * (h1 ** 2 - h2 ** 2) / (2 * L);
  steps.push(`Seepage flow (Dupuit): Q = k(h₁² - h₂²) / (2L) = ${Q.toExponential(3)} m³/s per m`);

  // Average hydraulic gradient
  const iAvg = H / L;
  steps.push(`Average hydraulic gradient: i_avg = H/L = ${iAvg.toFixed(4)}`);

  // Exit gradient at the downstream face.
  //
  // This used to report the average gradient H/L, which is not an exit
  // gradient: the gradient at the downstream face is always the larger of the
  // two, which is precisely why piping initiates there. Reporting the average
  // therefore inflated the factor of safety against piping.
  //
  // The engine already solves Dupuit-Forchheimer, so take the gradient that
  // solution actually produces. Differentiating the Dupuit parabola
  //   h(x)² = h₁² − (h₁² − h₂²)·x/L
  // gives dh/dx = −(h₁² − h₂²) / (2·h·L), and evaluating at the downstream
  // face (x = L, h = h₂):
  //   i_exit = (h₁² − h₂²) / (2·h₂·L)
  let iExitUsed: number;
  let exitGradientUnbounded = false;

  if (h2 > 0) {
    iExitUsed = (h1 ** 2 - h2 ** 2) / (2 * h2 * L);
    steps.push(
      `Exit gradient (Dupuit, at downstream face): i_exit = (h₁² - h₂²) / (2·h₂·L) = ` +
        `(${h1}² - ${h2}²) / (2·${h2}·${L}) = ${iExitUsed.toFixed(4)}`,
    );
    steps.push(`  (average gradient H/L = ${iAvg.toFixed(4)}; the exit gradient governs piping)`);
  } else {
    // With no tailwater the Dupuit exit gradient is unbounded: h₂ → 0 puts the
    // phreatic surface on the downstream face itself. Treat this as a critical
    // exit condition rather than reporting a finite number that would read as
    // a safe result.
    exitGradientUnbounded = true;
    iExitUsed = Infinity;
    steps.push(
      'Exit gradient: unbounded — with zero downstream head the Dupuit phreatic surface ' +
        'daylights on the exit face. Piping must be assessed with a flow net and a filter/cutoff design.',
    );
  }

  // Terzaghi critical gradient: i_cr = (Gs - 1) / (1 + e)
  const iCritical = (Gs - 1) / (1 + e);
  steps.push(`Critical gradient (Terzaghi): i_cr = (Gs - 1) / (1 + e) = (${Gs} - 1) / (1 + ${e}) = ${iCritical.toFixed(3)}`);

  // Factor of safety against piping
  const FOS = exitGradientUnbounded ? 0 : iExitUsed > 0 ? iCritical / iExitUsed : Infinity;
  steps.push(
    `Factor of safety against piping: FS = i_cr / i_exit = ${
      exitGradientUnbounded ? '0 (unbounded exit gradient)' : FOS === Infinity ? '∞' : FOS.toFixed(2)
    }`,
  );

  // Risk classification
  let heaveRisk: SeepageResult['heaveRisk'];
  let heaveRiskDescription: string;
  if (FOS >= 5) {
    heaveRisk = 'LOW';
    heaveRiskDescription = 'Piping risk is low. Standard drainage measures are adequate.';
  } else if (FOS >= 3) {
    heaveRisk = 'MODERATE';
    heaveRiskDescription = 'Moderate piping risk. Consider filter design and drainage improvements.';
  } else if (FOS >= 1.5) {
    heaveRisk = 'HIGH';
    heaveRiskDescription = 'High piping risk. Filter and cutoff design is strongly recommended.';
  } else {
    heaveRisk = 'SEVERE';
    heaveRiskDescription = 'SEVERE: Exit gradient approaches critical. Immediate remedial measures required.';
  }
  steps.push(`Heave/piping risk: ${heaveRisk} (FS = ${FOS === Infinity ? '∞' : FOS.toFixed(2)})`);

  return {
    seepageFlow: parseFloat(Q.toExponential(4)),
    exitGradient: exitGradientUnbounded ? Infinity : parseFloat(iExitUsed.toFixed(4)),
    criticalGradient: parseFloat(iCritical.toFixed(4)),
    pipingFOS: FOS === Infinity ? 999 : parseFloat(FOS.toFixed(2)),
    heaveRisk,
    heaveRiskDescription,
    steps,
  };
}

// ---------------------------------------------------------------------------
// 2. Flow Net Method — Q = k × H × (Nf / Nd) per unit width
// ---------------------------------------------------------------------------

export const FlowNetSeepageInputSchema = z.object({
  hydraulicConductivity: z.number().positive().describe('Hydraulic conductivity k (m/s)'),
  totalHead: z.number().positive().describe('Total head loss H (m)'),
  flowChannels: z.number().int().positive().describe('Number of flow channels Nf'),
  equipotentialDrops: z.number().int().positive().describe('Number of equipotential drops Nd'),
  specificGravity: z.number().positive().default(2.65),
  voidRatio: z.number().positive().default(0.7),
  criticalFlowPath: z.number().positive().optional().describe('Length of critical flow path for exit gradient (m)'),
});

export type FlowNetSeepageInput = z.infer<typeof FlowNetSeepageInputSchema>;

export function calculateFlowNetSeepage(input: FlowNetSeepageInput): SeepageResult {
  const v = FlowNetSeepageInputSchema.parse(input);
  const steps: string[] = [];

  const { hydraulicConductivity: k, totalHead: H, flowChannels: Nf, equipotentialDrops: Nd, specificGravity: Gs, voidRatio: e } = v;

  // Flow net seepage: Q = k × H × (Nf / Nd)
  const Q = k * H * (Nf / Nd);
  steps.push(`Flow net seepage: Q = k × H × Nf/Nd = ${k} × ${H} × ${Nf}/${Nd} = ${Q.toExponential(3)} m³/s per m`);

  // Exit gradient: Δh per last potential drop / last flow net square dimension
  // For approximation: i_exit ≈ H / (Nd × last_square_size), use H/Nd as head per drop
  const headPerDrop = H / Nd;
  steps.push(`Head loss per equipotential drop: Δh = H/Nd = ${headPerDrop.toFixed(3)} m`);

  // Exit gradient (approximate — last square assumed to have unit dimension 1m if not given)
  const critPathLen = v.criticalFlowPath ?? 1.0;
  const iExit = headPerDrop / critPathLen;
  steps.push(`Exit gradient (approx): i_exit = Δh / critical_path = ${headPerDrop.toFixed(3)} / ${critPathLen} = ${iExit.toFixed(4)}`);

  const iCritical = (Gs - 1) / (1 + e);
  steps.push(`Critical gradient: i_cr = (Gs-1)/(1+e) = ${iCritical.toFixed(3)}`);

  const FOS = iCritical / iExit;
  steps.push(`Piping FS = i_cr / i_exit = ${FOS.toFixed(2)}`);

  let heaveRisk: SeepageResult['heaveRisk'];
  let heaveRiskDescription: string;
  if (FOS >= 5) {
    heaveRisk = 'LOW';
    heaveRiskDescription = 'Piping risk is low. Standard drainage measures are adequate.';
  } else if (FOS >= 3) {
    heaveRisk = 'MODERATE';
    heaveRiskDescription = 'Moderate piping risk. Consider filter design and drainage improvements.';
  } else if (FOS >= 1.5) {
    heaveRisk = 'HIGH';
    heaveRiskDescription = 'High piping risk. Filter and cutoff design is strongly recommended.';
  } else {
    heaveRisk = 'SEVERE';
    heaveRiskDescription = 'SEVERE: Exit gradient approaches critical. Immediate remedial measures required.';
  }

  return {
    seepageFlow: parseFloat(Q.toExponential(4)),
    exitGradient: parseFloat(iExit.toFixed(4)),
    criticalGradient: parseFloat(iCritical.toFixed(4)),
    pipingFOS: parseFloat(FOS.toFixed(2)),
    heaveRisk,
    heaveRiskDescription,
    steps,
  };
}
