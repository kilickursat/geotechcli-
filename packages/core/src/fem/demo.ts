import type {
  FemAnalysisCase,
  FemAssumption,
  FemResultDataset,
  FemResultField,
  FemResultManifest,
  FemResultStep,
  FemVisualizationFrame,
  FemVisualizationMesh,
} from './types.js';
import {
  runMohrCoulombMaterialPoint,
  runTerzaghiConsolidationTimeStepper,
} from './engineering-evidence.js';
import { validateFemAnalysisCase } from './validation.js';

const DEFAULT_UNITS = {
  length: 'm',
  force: 'kN',
  stress: 'kPa',
  density: 'kN/m3',
  displacement: 'mm',
} as const;

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function settlementColor(t: number): [number, number, number] {
  const stops: Array<[number, number, number]> = [
    [43, 62, 154],
    [47, 107, 205],
    [56, 170, 210],
    [80, 200, 120],
    [235, 210, 75],
    [220, 83, 44],
    [170, 25, 55],
  ];
  const scaled = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(left + 1, stops.length - 1);
  const local = scaled - left;
  return [0, 1, 2].map((index) => {
    const value = stops[left][index] + (stops[right][index] - stops[left][index]) * local;
    return round(value / 255, 4);
  }) as [number, number, number];
}

function movementColor(t: number): [number, number, number] {
  const stops: Array<[number, number, number]> = [
    [30, 64, 175],
    [56, 189, 248],
    [34, 197, 94],
    [250, 204, 21],
    [249, 115, 22],
    [239, 68, 68],
  ];
  const scaled = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(left + 1, stops.length - 1);
  const local = scaled - left;
  return [0, 1, 2].map((index) => {
    const value = stops[left][index] + (stops[right][index] - stops[left][index]) * local;
    return round(value / 255, 4);
  }) as [number, number, number];
}

export function buildRaftDemoAnalysisCase(now = new Date('2026-05-16T00:00:00.000Z')): FemAnalysisCase {
  const assumptions: FemAssumption[] = [
    {
      id: 'linear-elastic-screening',
      parameter: 'soil constitutive behavior',
      value: 'linear elastic, drained, small strain',
      basis: 'Experimental offline demonstration for WebGL/FEM workflow validation.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'poisson-ratio',
      parameter: 'nu',
      value: 0.3,
      unit: '-',
      basis: 'Typical preliminary drained elastic screening value.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'groundwater-not-modelled',
      parameter: 'groundwater',
      value: 'not modelled',
      basis: 'Phase 0 FEM demo excludes pore pressure and consolidation coupling.',
      confidence: 'review',
      reviewRequired: true,
    },
  ];

  return {
    schemaVersion: 'fem-analysis-case.v0',
    caseId: 'raft-settlement-demo',
    title: 'Experimental 3D FEM raft settlement demo',
    createdBy: 'geotechcli-fem-demo',
    createdAt: now.toISOString(),
    experimental: true,
    objective: 'foundation_settlement',
    analysisType: 'static_3d_small_strain',
    units: DEFAULT_UNITS,
    geometry: {
      domain: {
        type: 'box',
        lengthM: 24,
        widthM: 24,
        depthM: 12,
      },
      raft: {
        type: 'raft',
        lengthM: 8,
        widthM: 8,
        thicknessM: 0.6,
        centerXM: 0,
        centerYM: 0,
      },
    },
    materials: [
      {
        id: 'soil-1',
        name: 'Representative elastic soil',
        model: 'linear_elastic',
        elasticModulusKpa: 50000,
        poissonRatio: 0.3,
        unitWeightKnM3: 18,
        evidenceRefs: [],
        assumptions,
      },
    ],
    loads: [
      {
        id: 'raft-pressure',
        type: 'uniform_pressure',
        target: 'raft',
        pressureKpa: 150,
        evidenceRefs: [],
        assumptions: [
          {
            id: 'service-pressure',
            parameter: 'raft service pressure',
            value: 150,
            unit: 'kPa',
            basis: 'Representative load for the experimental demo.',
            confidence: 'review',
            reviewRequired: true,
          },
        ],
      },
    ],
    boundaryConditions: [
      {
        id: 'base-fixed',
        type: 'fixed_base',
        description: 'Base nodes fixed in all translations.',
      },
      {
        id: 'side-rollers',
        type: 'side_rollers',
        description: 'Side boundaries use normal-displacement rollers.',
      },
    ],
    mesh: {
      elementType: 'hex8',
      divisionsX: 12,
      divisionsY: 12,
      divisionsZ: 6,
    },
    groundwater: {
      condition: 'not_modelled',
      note: 'Groundwater and pore-pressure coupling are not included in this experimental demo.',
      reviewRequired: true,
    },
    assumptions,
    evidenceRefs: [],
    limitations: [
      'Experimental screening demo only; not a design model.',
      'Linear elastic small-strain response only.',
      'No plasticity, consolidation, pore-pressure coupling, or construction staging.',
      'Settlement field is generated by a deterministic built-in elastic influence approximation for viewer and workflow validation.',
    ],
  };
}

export function buildExcavationDemoAnalysisCase(now = new Date('2026-05-17T00:00:00.000Z')): FemAnalysisCase {
  const assumptions: FemAssumption[] = [
    {
      id: 'staged-elastic-screening',
      parameter: 'soil-structure response',
      value: 'linear elastic staged excavation preview',
      basis: 'Experimental offline demonstration for FEM routing, staged-result visualization, and review workflow validation.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'wall-support-proxy',
      parameter: 'retaining wall and support behavior',
      value: 'elastic proxy, not wall design',
      basis: 'Phase 0 excavation demo uses a deterministic displacement field and support reaction envelope only.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'groundwater-not-coupled',
      parameter: 'groundwater',
      value: 'not coupled',
      basis: 'Pore pressure, seepage, basal heave, and consolidation are outside this experimental preview.',
      confidence: 'review',
      reviewRequired: true,
    },
  ];

  return {
    schemaVersion: 'fem-analysis-case.v0',
    caseId: 'excavation-deformation-demo',
    title: 'Experimental 3D FEM staged excavation deformation demo',
    createdBy: 'geotechcli-fem-demo',
    createdAt: now.toISOString(),
    experimental: true,
    objective: 'excavation_deformation',
    analysisType: 'static_3d_staged_elastic',
    units: DEFAULT_UNITS,
    geometry: {
      domain: {
        type: 'box',
        lengthM: 48,
        widthM: 36,
        depthM: 22,
      },
      excavation: {
        type: 'braced_excavation',
        lengthM: 18,
        widthM: 12,
        finalDepthM: 8,
        centerXM: 0,
        centerYM: 0,
        wallToeDepthM: 13,
        wallType: 'diaphragm_wall',
        stages: [
          { id: 'stage-1', label: 'Stage 1 - excavate to 2.5 m', depthM: 2.5 },
          { id: 'stage-2', label: 'Stage 2 - excavate to 5.0 m, first support active', depthM: 5, supportLevelM: 1.5 },
          { id: 'stage-3', label: 'Stage 3 - excavate to 8.0 m, two support levels active', depthM: 8, supportLevelM: 4.5 },
        ],
      },
    },
    materials: [
      {
        id: 'upper-fill-clay',
        name: 'Upper fill and clay equivalent elastic layer',
        model: 'linear_elastic',
        elasticModulusKpa: 28000,
        poissonRatio: 0.32,
        unitWeightKnM3: 18.5,
        evidenceRefs: [],
        assumptions,
      },
      {
        id: 'dense-sand-weathered-rock',
        name: 'Lower dense granular / weathered rock equivalent layer',
        model: 'linear_elastic',
        elasticModulusKpa: 85000,
        poissonRatio: 0.28,
        unitWeightKnM3: 20,
        evidenceRefs: [],
        assumptions,
      },
    ],
    loads: [
      {
        id: 'construction-surcharge',
        type: 'uniform_pressure',
        target: 'excavation_surcharge',
        pressureKpa: 20,
        evidenceRefs: [],
        assumptions: [
          {
            id: 'surface-surcharge',
            parameter: 'construction surcharge',
            value: 20,
            unit: 'kPa',
            basis: 'Representative construction surcharge for the experimental excavation demo.',
            confidence: 'review',
            reviewRequired: true,
          },
        ],
      },
    ],
    boundaryConditions: [
      {
        id: 'base-fixed',
        type: 'fixed_base',
        description: 'Base nodes fixed in all translations.',
      },
      {
        id: 'side-rollers',
        type: 'side_rollers',
        description: 'Side boundaries use normal-displacement rollers.',
      },
    ],
    mesh: {
      elementType: 'hex8',
      divisionsX: 16,
      divisionsY: 12,
      divisionsZ: 8,
    },
    groundwater: {
      condition: 'not_modelled',
      note: 'Groundwater, pore pressure, seepage, and basal-heave checks are not included in this experimental excavation preview.',
      reviewRequired: true,
    },
    assumptions,
    evidenceRefs: [],
    limitations: [
      'Experimental staged excavation deformation preview only; not a design model.',
      'Linear elastic small-strain response only.',
      'No retaining wall design, basal heave verification, seepage, consolidation, plasticity, or construction risk acceptance check.',
      'Displacement and reaction fields are generated by a deterministic built-in screening approximation for agentic workflow and visualization validation.',
    ],
  };
}

export function buildTunnelVolumeLossDemoAnalysisCase(now = new Date('2026-05-18T00:00:00.000Z')): FemAnalysisCase {
  const assumptions: FemAssumption[] = [
    {
      id: 'empirical-volume-loss',
      parameter: 'settlement method',
      value: 'Gaussian tunnel volume-loss trough',
      basis: 'Experimental deterministic preview for agentic routing, visualization, and review workflow validation.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'volume-loss-assumption',
      parameter: 'volume loss',
      value: 1.2,
      unit: '%',
      basis: 'Representative preliminary assumption; must be replaced with project-specific construction method evidence.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'trough-width-factor',
      parameter: 'trough width parameter K',
      value: 0.5,
      unit: '-',
      basis: 'Typical preliminary value for screening only; soil type and construction method require engineering review.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'groundwater-not-coupled',
      parameter: 'groundwater',
      value: 'not coupled',
      basis: 'Tunnel preview excludes pore pressure, consolidation, face stability, lining interaction, and time effects.',
      confidence: 'review',
      reviewRequired: true,
    },
  ];

  return {
    schemaVersion: 'fem-analysis-case.v0',
    caseId: 'tunnel-volume-loss-settlement-demo',
    title: 'Experimental 3D tunnel volume-loss settlement preview',
    createdBy: 'geotechcli-fem-demo',
    createdAt: now.toISOString(),
    experimental: true,
    objective: 'tunnel_volume_loss_settlement',
    analysisType: 'empirical_3d_settlement_surface',
    units: DEFAULT_UNITS,
    geometry: {
      domain: {
        type: 'box',
        lengthM: 80,
        widthM: 60,
        depthM: 32,
      },
      tunnel: {
        type: 'tunnel',
        diameterM: 6,
        axisDepthM: 18,
        lengthM: 56,
        centerXM: 0,
        centerYM: 0,
        volumeLossPercent: 1.2,
        troughWidthParameterK: 0.5,
      },
    },
    materials: [
      {
        id: 'overburden-equivalent',
        name: 'Representative overburden equivalent elastic ground',
        model: 'linear_elastic',
        elasticModulusKpa: 45_000,
        poissonRatio: 0.3,
        unitWeightKnM3: 19,
        evidenceRefs: [],
        assumptions,
      },
    ],
    loads: [],
    boundaryConditions: [
      {
        id: 'base-fixed',
        type: 'fixed_base',
        description: 'Base nodes fixed for manifest compatibility; empirical tunnel surface is evaluated at ground surface.',
      },
      {
        id: 'side-rollers',
        type: 'side_rollers',
        description: 'Side boundaries retained for case-contract compatibility and viewer context.',
      },
    ],
    mesh: {
      elementType: 'hex8',
      divisionsX: 18,
      divisionsY: 16,
      divisionsZ: 4,
    },
    groundwater: {
      condition: 'not_modelled',
      note: 'Groundwater, pore pressure, consolidation, lining interaction, and face-stability checks are not included in this experimental tunnel preview.',
      reviewRequired: true,
    },
    assumptions,
    evidenceRefs: [],
    limitations: [
      'Experimental empirical tunnel settlement preview only; not a production FEM solver or design model.',
      'Uses a Gaussian surface settlement trough from prescribed volume loss and trough-width factor.',
      'No face stability, lining design, staged excavation, consolidation, seepage, building damage assessment, or nonlinear soil response.',
      'Volume loss and trough-width assumptions must be justified from project evidence and reviewed by a qualified engineer.',
    ],
  };
}

export function buildStagedSettlementConsolidationDemoAnalysisCase(
  now = new Date('2026-06-03T00:00:00.000Z'),
): FemAnalysisCase {
  const assumptions: FemAssumption[] = [
    {
      id: 'one-dimensional-consolidation',
      parameter: 'consolidation model',
      value: '1D staged Terzaghi consolidation with Mohr-Coulomb material-point screening',
      basis: 'Production-candidate deterministic slice for staged settlement routing, not a full 2D/3D coupled FEM solver.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'drainage-boundary',
      parameter: 'drainage',
      value: 'double drainage',
      basis: 'Representative preliminary assumption; project drainage boundaries must be confirmed from ground model and construction details.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'mc-strength-screening',
      parameter: 'strength model',
      value: 'Mohr-Coulomb triaxial material-point cap',
      basis: 'Mobilized strength ratio and plastic settlement increment are used as review gates, not as a production plastic zone calculation.',
      confidence: 'review',
      reviewRequired: true,
    },
    {
      id: 'groundwater-saturated-column',
      parameter: 'groundwater',
      value: 'saturated column assumed for consolidation time-rate preview',
      basis: 'Terzaghi consolidation requires saturated low-permeability soil and reviewed drainage assumptions.',
      confidence: 'review',
      reviewRequired: true,
    },
  ];

  return {
    schemaVersion: 'fem-analysis-case.v0',
    caseId: 'staged-settlement-consolidation-demo',
    title: 'Experimental 1D staged settlement consolidation preview',
    createdBy: 'geotechcli-fem-demo',
    createdAt: now.toISOString(),
    experimental: true,
    objective: 'staged_settlement_consolidation',
    analysisType: 'time_dependent_1d_consolidation',
    units: DEFAULT_UNITS,
    geometry: {
      domain: {
        type: 'box',
        lengthM: 24,
        widthM: 12,
        depthM: 12,
      },
      consolidation: {
        type: 'soil_column',
        layerThicknessM: 10,
        surfaceAreaM2: 200,
        drainage: 'double',
        stages: [
          { id: 'stage-1', label: 'Stage 1 - preload fill', loadKpa: 45, durationYears: 0.5 },
          { id: 'stage-2', label: 'Stage 2 - embankment raise', loadKpa: 35, durationYears: 1 },
          { id: 'stage-3', label: 'Stage 3 - service surcharge hold', loadKpa: 20, durationYears: 2 },
        ],
      },
    },
    materials: [
      {
        id: 'soft-clay-1d',
        name: 'Representative saturated clay consolidation layer',
        model: 'mohr_coulomb',
        elasticModulusKpa: 30_000,
        poissonRatio: 0.32,
        unitWeightKnM3: 18.5,
        constrainedModulusKpa: 8_000,
        frictionAngleDeg: 28,
        cohesionKpa: 12,
        coefficientOfConsolidationM2PerYear: 0.8,
        hydraulicConductivityMPerS: 1e-9,
        evidenceRefs: [],
        assumptions,
      },
    ],
    loads: [
      {
        id: 'stage-1-load',
        type: 'uniform_pressure',
        target: 'ground_surface',
        pressureKpa: 45,
        evidenceRefs: [],
        assumptions: [
          {
            id: 'stage-1-load-assumption',
            parameter: 'stage 1 surface pressure',
            value: 45,
            unit: 'kPa',
            basis: 'Representative preload fill pressure for the experimental consolidation demo.',
            confidence: 'review',
            reviewRequired: true,
          },
        ],
      },
      {
        id: 'stage-2-load',
        type: 'uniform_pressure',
        target: 'ground_surface',
        pressureKpa: 35,
        evidenceRefs: [],
        assumptions: [
          {
            id: 'stage-2-load-assumption',
            parameter: 'stage 2 surface pressure',
            value: 35,
            unit: 'kPa',
            basis: 'Representative embankment raise pressure for the experimental consolidation demo.',
            confidence: 'review',
            reviewRequired: true,
          },
        ],
      },
      {
        id: 'stage-3-load',
        type: 'uniform_pressure',
        target: 'ground_surface',
        pressureKpa: 20,
        evidenceRefs: [],
        assumptions: [
          {
            id: 'stage-3-load-assumption',
            parameter: 'stage 3 surface pressure',
            value: 20,
            unit: 'kPa',
            basis: 'Representative service surcharge hold pressure for the experimental consolidation demo.',
            confidence: 'review',
            reviewRequired: true,
          },
        ],
      },
    ],
    boundaryConditions: [
      {
        id: 'base-fixed',
        type: 'fixed_base',
        description: 'Column base fixed in vertical displacement for 1D settlement preview.',
      },
      {
        id: 'side-rollers',
        type: 'side_rollers',
        description: 'Column sides constrained laterally to approximate one-dimensional strain.',
      },
    ],
    mesh: {
      elementType: 'hex8',
      divisionsX: 12,
      divisionsY: 4,
      divisionsZ: 10,
    },
    groundwater: {
      condition: 'specified',
      depthM: 0,
      note: 'Saturated drainage condition assumed for 1D consolidation; pore-pressure coupling is limited to the staged Terzaghi column preview.',
      reviewRequired: true,
    },
    assumptions,
    evidenceRefs: [],
    limitations: [
      'Experimental 1D staged consolidation preview only; not a production nonlinear geotechnical FEM solver.',
      'Uses Terzaghi average consolidation time stepping with reviewed drainage assumptions.',
      'Mohr-Coulomb behavior is a material-point strength cap and plastic-settlement review gate; no 2D/3D plastic zone is solved.',
      'No 2D/3D seepage field, embankment geometry, creep, secondary compression, monitoring calibration, or support/structure interaction is modelled.',
      'Independent published/commercial solver benchmarks are still required before production design use.',
    ],
  };
}

function buildVisualizationMesh(caseFile: FemAnalysisCase, maxSettlementMm: number): FemVisualizationMesh {
  const { domain, raft } = caseFile.geometry;
  if (!raft) {
    throw new Error('Raft visualization mesh requires raft geometry.');
  }
  const nx = caseFile.mesh.divisionsX;
  const ny = caseFile.mesh.divisionsY;
  const base: number[] = [];
  const disp: number[] = [];
  const color: number[] = [];
  const tri: number[] = [];
  const edge: number[] = [];
  const sigma = Math.max(raft.lengthM, raft.widthM) * 0.62;

  for (let iy = 0; iy <= ny; iy += 1) {
    const y = -domain.widthM / 2 + (domain.widthM * iy) / ny;
    for (let ix = 0; ix <= nx; ix += 1) {
      const x = -domain.lengthM / 2 + (domain.lengthM * ix) / nx;
      const dx = x - raft.centerXM;
      const dy = y - raft.centerYM;
      const radial = Math.sqrt(dx * dx + dy * dy);
      const edgeBoost = Math.abs(dx) <= raft.lengthM / 2 && Math.abs(dy) <= raft.widthM / 2 ? 1 : 0.88;
      const settlementMm = maxSettlementMm * Math.exp(-(radial * radial) / (2 * sigma * sigma)) * edgeBoost;
      const normalized = settlementMm / maxSettlementMm;
      const [r, g, b] = settlementColor(normalized);
      base.push(round(x), round(y), 0);
      disp.push(0, 0, round(-settlementMm / 1000, 6));
      color.push(r, g, b);
    }
  }

  const idx = (ix: number, iy: number) => iy * (nx + 1) + ix;
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const a = idx(ix, iy);
      const b = idx(ix + 1, iy);
      const c = idx(ix + 1, iy + 1);
      const d = idx(ix, iy + 1);
      tri.push(a, b, c, a, c, d);
    }
  }
  for (let iy = 0; iy <= ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      edge.push(idx(ix, iy), idx(ix + 1, iy));
    }
  }
  for (let ix = 0; ix <= nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      edge.push(idx(ix, iy), idx(ix, iy + 1));
    }
  }

  const z = 0.03;
  const halfL = raft.lengthM / 2;
  const halfW = raft.widthM / 2;
  return {
    base,
    disp,
    color,
    tri,
    edge,
    outlineBase: [
      -halfL, -halfW, z,
      halfL, -halfW, z,
      halfL, halfW, z,
      -halfL, halfW, z,
    ],
    outlineDisp: new Array(12).fill(0),
    outlineIdx: [0, 1, 1, 2, 2, 3, 3, 0],
  };
}

function buildExcavationVisualizationMesh(
  caseFile: FemAnalysisCase,
  maxSurfaceSettlementMm: number,
  maxHorizontalDisplacementMm: number,
  maxWallDeflectionMm: number,
): FemVisualizationMesh {
  const { domain, excavation } = caseFile.geometry;
  if (!excavation) {
    throw new Error('Excavation visualization mesh requires excavation geometry.');
  }
  const excavationGeometry = excavation;
  const nx = caseFile.mesh.divisionsX;
  const ny = caseFile.mesh.divisionsY;
  const base: number[] = [];
  const tri: number[] = [];
  const edge: number[] = [];
  const sigma = Math.max(excavation.lengthM, excavation.widthM) * 0.72;
  const halfL = excavation.lengthM / 2;
  const halfW = excavation.widthM / 2;

  const idx = (ix: number, iy: number) => iy * (nx + 1) + ix;
  for (let iy = 0; iy <= ny; iy += 1) {
    const y = -domain.widthM / 2 + (domain.widthM * iy) / ny;
    for (let ix = 0; ix <= nx; ix += 1) {
      const x = -domain.lengthM / 2 + (domain.lengthM * ix) / nx;
      base.push(round(x), round(y), 0);
    }
  }
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const a = idx(ix, iy);
      const b = idx(ix + 1, iy);
      const c = idx(ix + 1, iy + 1);
      const d = idx(ix, iy + 1);
      tri.push(a, b, c, a, c, d);
    }
  }
  for (let iy = 0; iy <= ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      edge.push(idx(ix, iy), idx(ix + 1, iy));
    }
  }
  for (let ix = 0; ix <= nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      edge.push(idx(ix, iy), idx(ix, iy + 1));
    }
  }

  function distanceFromExcavation(x: number, y: number): number {
    const dx = Math.max(Math.abs(x) - halfL, 0);
    const dy = Math.max(Math.abs(y) - halfW, 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function buildFrame(
    stageIndex: number,
    stageLabel: string,
    field: string,
    fieldLabel: string,
  ): FemVisualizationFrame {
    const stage = excavationGeometry.stages[stageIndex];
    const stageRatio = stage.depthM / excavationGeometry.finalDepthM;
    const disp: number[] = [];
    const color: number[] = [];
    for (let index = 0; index < base.length; index += 3) {
      const x = base[index];
      const y = base[index + 1];
      const dist = distanceFromExcavation(x, y);
      const influence = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      const inside = Math.abs(x) <= halfL && Math.abs(y) <= halfW;
      const nearWall = dist <= Math.max(1.5, Math.min(halfL, halfW) * 0.22);
      const radial = Math.max(Math.sqrt(x * x + y * y), 1e-6);
      const wallFactor = nearWall ? 1 : 0.38;
      const settlementMm = maxSurfaceSettlementMm * stageRatio * influence * (inside ? 0.72 : 1);
      const horizontalMm = maxHorizontalDisplacementMm * stageRatio * influence * wallFactor;
      const wallMm = maxWallDeflectionMm * stageRatio * influence * (nearWall ? 1 : 0.2);
      if (field === 'horizontal_displacement') {
        disp.push(round((-x / radial * horizontalMm) / 1000, 6), round((-y / radial * horizontalMm) / 1000, 6), round(-settlementMm / 1000 * 0.18, 6));
        color.push(...movementColor(horizontalMm / Math.max(maxHorizontalDisplacementMm, 1)));
      } else if (field === 'wall_deflection_proxy') {
        disp.push(round((-x / radial * wallMm) / 1000, 6), round((-y / radial * wallMm) / 1000, 6), 0);
        color.push(...movementColor(wallMm / Math.max(maxWallDeflectionMm, 1)));
      } else {
        disp.push(0, 0, round(-settlementMm / 1000, 6));
        color.push(...settlementColor(settlementMm / Math.max(maxSurfaceSettlementMm, 1)));
      }
    }
    return { field, fieldLabel, stageIndex, stageLabel, disp, color };
  }

  const frames: FemVisualizationFrame[] = excavation.stages.flatMap((stage, stageIndex) => [
    buildFrame(stageIndex, stage.label, 'surface_settlement', 'Surface settlement'),
    buildFrame(stageIndex, stage.label, 'horizontal_displacement', 'Horizontal displacement'),
    buildFrame(stageIndex, stage.label, 'wall_deflection_proxy', 'Wall deflection proxy'),
  ]);
  const primary = frames.find((frame) => frame.field === 'surface_settlement' && frame.stageIndex === excavation.stages.length - 1) ?? frames[0];
  const z = 0.04;
  return {
    base,
    disp: primary.disp,
    color: primary.color,
    tri,
    edge,
    outlineBase: [
      -halfL, -halfW, z,
      halfL, -halfW, z,
      halfL, halfW, z,
      -halfL, halfW, z,
    ],
    outlineDisp: new Array(12).fill(0),
    outlineIdx: [0, 1, 1, 2, 2, 3, 3, 0],
    frames,
  };
}

function buildTunnelVisualizationMesh(
  caseFile: FemAnalysisCase,
  maxSettlementMm: number,
): FemVisualizationMesh {
  const { domain, tunnel } = caseFile.geometry;
  if (!tunnel) {
    throw new Error('Tunnel visualization mesh requires tunnel geometry.');
  }
  const nx = caseFile.mesh.divisionsX;
  const ny = caseFile.mesh.divisionsY;
  const base: number[] = [];
  const disp: number[] = [];
  const color: number[] = [];
  const tri: number[] = [];
  const edge: number[] = [];
  const troughWidthM = tunnel.axisDepthM * tunnel.troughWidthParameterK;
  const halfTunnelLength = tunnel.lengthM / 2;
  const endTaperWidth = Math.max(troughWidthM * 1.25, tunnel.diameterM);

  for (let iy = 0; iy <= ny; iy += 1) {
    const y = -domain.widthM / 2 + (domain.widthM * iy) / ny;
    for (let ix = 0; ix <= nx; ix += 1) {
      const x = -domain.lengthM / 2 + (domain.lengthM * ix) / nx;
      const crossAxisOffset = y - tunnel.centerYM;
      const beyondTunnel = Math.max(Math.abs(x - tunnel.centerXM) - halfTunnelLength, 0);
      const crossAxisInfluence = Math.exp(-(crossAxisOffset * crossAxisOffset) / (2 * troughWidthM * troughWidthM));
      const endInfluence = beyondTunnel === 0
        ? 1
        : Math.exp(-(beyondTunnel * beyondTunnel) / (2 * endTaperWidth * endTaperWidth));
      const settlementMm = maxSettlementMm * crossAxisInfluence * endInfluence;
      const normalized = settlementMm / Math.max(maxSettlementMm, 1e-6);
      const [r, g, b] = settlementColor(normalized);
      base.push(round(x), round(y), 0);
      disp.push(0, 0, round(-settlementMm / 1000, 6));
      color.push(r, g, b);
    }
  }

  const idx = (ix: number, iy: number) => iy * (nx + 1) + ix;
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const a = idx(ix, iy);
      const b = idx(ix + 1, iy);
      const c = idx(ix + 1, iy + 1);
      const d = idx(ix, iy + 1);
      tri.push(a, b, c, a, c, d);
    }
  }
  for (let iy = 0; iy <= ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      edge.push(idx(ix, iy), idx(ix + 1, iy));
    }
  }
  for (let ix = 0; ix <= nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      edge.push(idx(ix, iy), idx(ix, iy + 1));
    }
  }

  const z = 0.05;
  const halfInfluenceWidth = Math.min(domain.widthM / 2, troughWidthM * 3);
  const x0 = tunnel.centerXM - halfTunnelLength;
  const x1 = tunnel.centerXM + halfTunnelLength;
  const y0 = tunnel.centerYM - halfInfluenceWidth;
  const y1 = tunnel.centerYM + halfInfluenceWidth;
  return {
    base,
    disp,
    color,
    tri,
    edge,
    outlineBase: [
      x0, y0, z,
      x1, y0, z,
      x1, y1, z,
      x0, y1, z,
      x0, tunnel.centerYM, z + 0.04,
      x1, tunnel.centerYM, z + 0.04,
    ],
    outlineDisp: new Array(18).fill(0),
    outlineIdx: [0, 1, 1, 2, 2, 3, 3, 0, 4, 5],
  };
}

interface ConsolidationStageResult {
  stageId: string;
  stageLabel: string;
  stageIndex: number;
  cumulativeTimeYears: number;
  stageLoadKpa: number;
  cumulativeLoadKpa: number;
  elasticSettlementMm: number;
  plasticSettlementMm: number;
  settlementMm: number;
  degreeOfConsolidation: number;
  averageExcessPorePressureKpa: number;
  mobilizedStrengthRatio: number;
  state: 'elastic' | 'plastic';
  maxReferenceError: number;
}

function buildConsolidationVisualizationMesh(
  caseFile: FemAnalysisCase,
  stageResults: ConsolidationStageResult[],
  finalSettlementMm: number,
): FemVisualizationMesh {
  const { domain, consolidation } = caseFile.geometry;
  if (!consolidation) {
    throw new Error('Consolidation visualization mesh requires consolidation geometry.');
  }
  const nx = caseFile.mesh.divisionsX;
  const ny = caseFile.mesh.divisionsY;
  const base: number[] = [];
  const tri: number[] = [];
  const edge: number[] = [];
  const totalTimeYears = Math.max(stageResults[stageResults.length - 1]?.cumulativeTimeYears ?? 1, 1e-6);
  const halfWidth = domain.widthM / 2;
  const idx = (ix: number, iy: number) => iy * (nx + 1) + ix;

  for (let iy = 0; iy <= ny; iy += 1) {
    const y = -halfWidth + (domain.widthM * iy) / ny;
    for (let ix = 0; ix <= nx; ix += 1) {
      const x = -domain.lengthM / 2 + (domain.lengthM * ix) / nx;
      base.push(round(x), round(y), 0);
    }
  }
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const a = idx(ix, iy);
      const b = idx(ix + 1, iy);
      const c = idx(ix + 1, iy + 1);
      const d = idx(ix, iy + 1);
      tri.push(a, b, c, a, c, d);
    }
  }
  for (let iy = 0; iy <= ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      edge.push(idx(ix, iy), idx(ix + 1, iy));
    }
  }
  for (let ix = 0; ix <= nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      edge.push(idx(ix, iy), idx(ix, iy + 1));
    }
  }

  function settlementAtTime(timeYears: number, activeStage: ConsolidationStageResult): number {
    let previous: ConsolidationStageResult | undefined;
    for (const stage of stageResults) {
      if (stage.cumulativeTimeYears <= timeYears) {
        previous = stage;
      }
    }
    if (previous) return previous.settlementMm;
    const activeTimeRatio = Math.max(0, Math.min(1, timeYears / Math.max(activeStage.cumulativeTimeYears, 1e-6)));
    return activeStage.settlementMm * activeTimeRatio;
  }

  function buildFrame(stageResult: ConsolidationStageResult): FemVisualizationFrame {
    const disp: number[] = [];
    const color: number[] = [];
    for (let index = 0; index < base.length; index += 3) {
      const x = base[index];
      const y = base[index + 1];
      const timeRatio = (x + domain.lengthM / 2) / domain.lengthM;
      const timeYears = totalTimeYears * Math.max(0, Math.min(1, timeRatio));
      const crossSectionTaper = 0.94 + 0.06 * Math.cos((Math.PI * y) / Math.max(halfWidth, 1e-6));
      const settlementMm = Math.min(stageResult.settlementMm, settlementAtTime(timeYears, stageResult)) * crossSectionTaper;
      const normalized = settlementMm / Math.max(finalSettlementMm, 1e-6);
      disp.push(0, 0, round(-settlementMm / 1000, 6));
      color.push(...settlementColor(normalized));
    }
    return {
      field: 'vertical_settlement',
      fieldLabel: 'Vertical settlement',
      stageIndex: stageResult.stageIndex,
      stageLabel: stageResult.stageLabel,
      disp,
      color,
    };
  }

  const frames = stageResults.map(buildFrame);
  const primary = frames[frames.length - 1];
  const z = 0.05;
  return {
    base,
    disp: primary.disp,
    color: primary.color,
    tri,
    edge,
    outlineBase: [
      -domain.lengthM / 2, -halfWidth, z,
      domain.lengthM / 2, -halfWidth, z,
      domain.lengthM / 2, halfWidth, z,
      -domain.lengthM / 2, halfWidth, z,
    ],
    outlineDisp: new Array(12).fill(0),
    outlineIdx: [0, 1, 1, 2, 2, 3, 3, 0],
    frames,
  };
}

function buildRaftResultFields(): FemResultField[] {
  return [
    {
      id: 'vertical_settlement',
      label: 'Vertical settlement',
      unit: 'mm',
      location: 'surface_nodes',
      quantity: 'displacement',
      component: 'z',
      signConvention: 'Positive values represent downward settlement magnitude in the viewer color scale.',
    },
  ];
}

function buildConsolidationResultFields(): FemResultField[] {
  return [
    {
      id: 'vertical_settlement',
      label: 'Vertical settlement',
      unit: 'mm',
      location: 'surface_nodes',
      quantity: 'displacement',
      component: 'z',
      signConvention: 'Positive values represent downward settlement magnitude in the staged consolidation viewer.',
    },
    {
      id: 'final_settlement',
      label: 'Final settlement',
      unit: 'mm',
      location: 'envelope',
      quantity: 'displacement',
      signConvention: 'Final downward surface settlement at the end of the staged consolidation preview.',
    },
    {
      id: 'plastic_settlement',
      label: 'Plastic settlement increment',
      unit: 'mm',
      location: 'envelope',
      quantity: 'displacement',
      signConvention: 'Material-point plastic settlement increment from the Mohr-Coulomb review gate.',
    },
    {
      id: 'final_degree_of_consolidation',
      label: 'Final degree of consolidation',
      unit: 'ratio',
      location: 'envelope',
      quantity: 'degree_of_consolidation',
      signConvention: 'Average degree of consolidation at the final staged time.',
    },
    {
      id: 'max_excess_pore_pressure',
      label: 'Maximum excess pore pressure',
      unit: 'kPa',
      location: 'envelope',
      quantity: 'pore_pressure',
      signConvention: 'Maximum average excess pore pressure carried by a staged load increment.',
    },
    {
      id: 'max_mobilized_strength_ratio',
      label: 'Maximum mobilized strength ratio',
      unit: 'ratio',
      location: 'envelope',
      quantity: 'strength_ratio',
      signConvention: 'Maximum Mohr-Coulomb material-point mobilized strength ratio across stages.',
    },
    {
      id: 'stage_count',
      label: 'Load stages',
      unit: 'count',
      location: 'envelope',
      quantity: 'stage_count',
      signConvention: 'Number of staged loading steps in the consolidation preview.',
    },
    {
      id: 'total_load',
      label: 'Total applied load',
      unit: 'kN',
      location: 'envelope',
      quantity: 'load',
      signConvention: 'Applied staged surface pressure multiplied by the reviewed tributary surface area.',
    },
    {
      id: 'reaction',
      label: 'Boundary reaction',
      unit: 'kN',
      location: 'envelope',
      quantity: 'reaction',
      signConvention: 'Deterministic preview reaction balancing the applied surface load.',
    },
  ];
}

function buildRaftResultSteps(): FemResultStep[] {
  return [
    {
      id: 'final',
      label: 'Final load step',
      index: 0,
    },
  ];
}

function buildConsolidationResultSteps(stageResults: ConsolidationStageResult[]): FemResultStep[] {
  return stageResults.map((stageResult) => ({
    id: stageResult.stageId,
    label: stageResult.stageLabel,
    index: stageResult.stageIndex,
  }));
}

function buildRaftResultDatasets(visualization: FemVisualizationMesh): FemResultDataset[] {
  return [
    {
      id: 'vertical_settlement-final',
      fieldId: 'vertical_settlement',
      stepId: 'final',
      values: visualization.disp,
      stride: 3,
      source: 'visualization.disp',
    },
  ];
}

function buildConsolidationResultDatasets(
  visualization: FemVisualizationMesh,
  steps: FemResultStep[],
  envelope: {
    finalSettlementMm: number;
    plasticSettlementMm: number;
    finalDegreeOfConsolidation: number;
    maxExcessPorePressureKpa: number;
    maxMobilizedStrengthRatio: number;
    stageCount: number;
    totalLoadKn: number;
    reactionKn: number;
  },
): FemResultDataset[] {
  const stepByIndex = new Map(steps.map((step) => [step.index, step.id]));
  const frameDatasets = (visualization.frames ?? []).map((frame) => ({
    id: `vertical_settlement-${stepByIndex.get(frame.stageIndex ?? 0) ?? 'final'}`,
    fieldId: 'vertical_settlement',
    stepId: stepByIndex.get(frame.stageIndex ?? 0),
    values: frame.disp,
    stride: 3 as const,
    source: 'visualization.frame' as const,
  }));

  return [
    ...frameDatasets,
    { id: 'final_settlement-final', fieldId: 'final_settlement', values: [envelope.finalSettlementMm], stride: 1, source: 'envelope' },
    { id: 'plastic_settlement-final', fieldId: 'plastic_settlement', values: [envelope.plasticSettlementMm], stride: 1, source: 'envelope' },
    { id: 'final_degree_of_consolidation-final', fieldId: 'final_degree_of_consolidation', values: [envelope.finalDegreeOfConsolidation], stride: 1, source: 'envelope' },
    { id: 'max_excess_pore_pressure-final', fieldId: 'max_excess_pore_pressure', values: [envelope.maxExcessPorePressureKpa], stride: 1, source: 'envelope' },
    { id: 'max_mobilized_strength_ratio-final', fieldId: 'max_mobilized_strength_ratio', values: [envelope.maxMobilizedStrengthRatio], stride: 1, source: 'envelope' },
    { id: 'stage_count-final', fieldId: 'stage_count', values: [envelope.stageCount], stride: 1, source: 'envelope' },
    { id: 'total_load-final', fieldId: 'total_load', values: [envelope.totalLoadKn], stride: 1, source: 'envelope' },
    { id: 'reaction-final', fieldId: 'reaction', values: [envelope.reactionKn], stride: 1, source: 'envelope' },
  ];
}

function buildExcavationResultFields(): FemResultField[] {
  return [
    {
      id: 'surface_settlement',
      label: 'Surface settlement',
      unit: 'mm',
      location: 'surface_nodes',
      quantity: 'displacement',
      component: 'z',
      signConvention: 'Positive values represent downward settlement magnitude in the viewer color scale.',
    },
    {
      id: 'horizontal_displacement',
      label: 'Horizontal displacement',
      unit: 'mm',
      location: 'surface_nodes',
      quantity: 'displacement',
      component: 'magnitude',
      signConvention: 'Magnitude of inward horizontal movement toward the excavation.',
    },
    {
      id: 'wall_deflection_proxy',
      label: 'Wall deflection proxy',
      unit: 'mm',
      location: 'surface_nodes',
      quantity: 'displacement',
      component: 'magnitude',
      signConvention: 'Screening proxy for wall-adjacent lateral movement; not a wall design result.',
    },
    {
      id: 'support_reaction',
      label: 'Support reaction',
      unit: 'kN',
      location: 'envelope',
      quantity: 'reaction',
      signConvention: 'Total deterministic preview support reaction from the result envelope.',
    },
  ];
}

function buildExcavationResultSteps(caseFile: FemAnalysisCase): FemResultStep[] {
  return (caseFile.geometry.excavation?.stages ?? []).map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    index,
    analysisStageId: stage.id,
    depthM: stage.depthM,
  }));
}

function buildExcavationResultDatasets(
  visualization: FemVisualizationMesh,
  steps: FemResultStep[],
  supportReactionKn: number,
): FemResultDataset[] {
  const stepByIndex = new Map(steps.map((step) => [step.index, step.id]));
  const frameDatasets = (visualization.frames ?? []).map((frame) => ({
    id: `${frame.field}-${stepByIndex.get(frame.stageIndex ?? 0) ?? 'final'}`,
    fieldId: frame.field,
    stepId: stepByIndex.get(frame.stageIndex ?? 0),
    values: frame.disp,
    stride: 3 as const,
    source: 'visualization.frame' as const,
  }));

  return [
    ...frameDatasets,
    {
      id: 'support_reaction-final',
      fieldId: 'support_reaction',
      stepId: steps[steps.length - 1]?.id,
      values: [supportReactionKn],
      stride: 1,
      source: 'envelope',
    },
  ];
}

function buildTunnelResultFields(): FemResultField[] {
  return [
    {
      id: 'surface_settlement',
      label: 'Tunnel surface settlement',
      unit: 'mm',
      location: 'surface_nodes',
      quantity: 'displacement',
      component: 'z',
      signConvention: 'Positive values represent downward settlement magnitude from the empirical volume-loss trough.',
    },
  ];
}

function buildTunnelResultSteps(): FemResultStep[] {
  return [
    {
      id: 'final',
      label: 'Final volume-loss settlement surface',
      index: 0,
    },
  ];
}

function buildTunnelResultDatasets(visualization: FemVisualizationMesh): FemResultDataset[] {
  return [
    {
      id: 'surface_settlement-final',
      fieldId: 'surface_settlement',
      stepId: 'final',
      values: visualization.disp,
      stride: 3,
      source: 'visualization.disp',
    },
  ];
}

export function runBuiltinElasticRaftDemo(caseFile = buildRaftDemoAnalysisCase()): FemResultManifest {
  const validation = validateFemAnalysisCase(caseFile);
  const material = caseFile.materials[0];
  const load = caseFile.loads[0];
  if (!material || !load) {
    throw new Error('Raft demo requires one material and one pressure load.');
  }
  if (validation.status === 'blocked') {
    throw new Error(`FEM case is blocked: ${validation.findings.map((item) => item.message).join('; ')}`);
  }

  const raft = caseFile.geometry.raft;
  if (!raft) {
    throw new Error('Raft demo requires raft geometry.');
  }
  const loadedArea = raft.lengthM * raft.widthM;
  const totalLoadKn = load.pressureKpa * loadedArea;
  const stiffnessSettlementM =
    (load.pressureKpa * Math.min(raft.lengthM, raft.widthM) * (1 - material.poissonRatio ** 2)) /
    material.elasticModulusKpa;
  const maxSettlementMm = round(stiffnessSettlementM * 1000 * 0.82, 3);
  const visualization = buildVisualizationMesh(caseFile, maxSettlementMm);
  const surfaceSettlements = visualization.disp
    .filter((_, index) => index % 3 === 2)
    .map((value) => Math.abs(value * 1000));
  const minSettlementMm = round(Math.min(...surfaceSettlements), 3);

  return {
    schemaVersion: 'fem-result-manifest.v0',
    caseId: caseFile.caseId,
    title: caseFile.title,
    generatedAt: new Date().toISOString(),
    backend: {
      id: 'builtin-elastic3d-demo',
      label: 'Built-in experimental elastic 3D screening demo',
      deterministic: true,
      version: '0.1.0',
    },
    analysisCase: caseFile,
    validation,
    mesh: {
      nodes: (caseFile.mesh.divisionsX + 1) * (caseFile.mesh.divisionsY + 1) * (caseFile.mesh.divisionsZ + 1),
      elements: caseFile.mesh.divisionsX * caseFile.mesh.divisionsY * caseFile.mesh.divisionsZ,
      elementType: caseFile.mesh.elementType,
      divisions: [caseFile.mesh.divisionsX, caseFile.mesh.divisionsY, caseFile.mesh.divisionsZ],
      visualizationNodes: visualization.base.length / 3,
      visualizationTriangles: visualization.tri.length / 3,
      visualizationEdges: visualization.edge.length / 2,
    },
    envelope: {
      maxSettlementMm,
      minSettlementMm,
      totalLoadKn: round(totalLoadKn, 3),
      reactionKn: round(totalLoadKn, 3),
      reactionBalanceRatio: 1,
    },
    visualization,
    resultFields: buildRaftResultFields(),
    steps: buildRaftResultSteps(),
    datasets: buildRaftResultDatasets(visualization),
    assumptions: [
      ...caseFile.assumptions,
      ...caseFile.loads.flatMap((item) => item.assumptions),
    ],
    limitations: caseFile.limitations,
  };
}

export function runBuiltinTunnelVolumeLossDemo(
  caseFile = buildTunnelVolumeLossDemoAnalysisCase(),
): FemResultManifest {
  const validation = validateFemAnalysisCase(caseFile);
  const tunnel = caseFile.geometry.tunnel;
  if (!tunnel) {
    throw new Error('Tunnel demo requires tunnel geometry.');
  }
  if (validation.status === 'blocked') {
    throw new Error(`FEM case is blocked: ${validation.findings.map((item) => item.message).join('; ')}`);
  }

  const troughWidthM = tunnel.axisDepthM * tunnel.troughWidthParameterK;
  const tunnelAreaM2 = Math.PI * (tunnel.diameterM / 2) ** 2;
  const settlementVolumePerM = (tunnel.volumeLossPercent / 100) * tunnelAreaM2;
  const maxSettlementMm = round((settlementVolumePerM / (Math.sqrt(2 * Math.PI) * troughWidthM)) * 1000, 3);
  const visualization = buildTunnelVisualizationMesh(caseFile, maxSettlementMm);
  const settlements = visualization.disp
    .filter((_, index) => index % 3 === 2)
    .map((value) => Math.abs(value * 1000));
  const minSettlementMm = round(Math.min(...settlements), 3);
  const totalSettlementVolumeM3 = round(settlementVolumePerM * tunnel.lengthM, 3);

  return {
    schemaVersion: 'fem-result-manifest.v0',
    caseId: caseFile.caseId,
    title: caseFile.title,
    generatedAt: new Date().toISOString(),
    backend: {
      id: 'builtin-tunnel-volume-loss-demo',
      label: 'Built-in experimental tunnel volume-loss settlement preview',
      deterministic: true,
      version: '0.1.0',
    },
    analysisCase: caseFile,
    validation,
    mesh: {
      nodes: (caseFile.mesh.divisionsX + 1) * (caseFile.mesh.divisionsY + 1) * (caseFile.mesh.divisionsZ + 1),
      elements: caseFile.mesh.divisionsX * caseFile.mesh.divisionsY * caseFile.mesh.divisionsZ,
      elementType: caseFile.mesh.elementType,
      divisions: [caseFile.mesh.divisionsX, caseFile.mesh.divisionsY, caseFile.mesh.divisionsZ],
      visualizationNodes: visualization.base.length / 3,
      visualizationTriangles: visualization.tri.length / 3,
      visualizationEdges: visualization.edge.length / 2,
    },
    envelope: {
      maxSettlementMm,
      minSettlementMm,
      totalLoadKn: 0,
      reactionKn: 0,
      reactionBalanceRatio: 1,
      maxSurfaceSettlementMm: maxSettlementMm,
      tunnelDiameterM: tunnel.diameterM,
      tunnelAxisDepthM: tunnel.axisDepthM,
      volumeLossPercent: tunnel.volumeLossPercent,
      troughWidthM: round(troughWidthM, 3),
      influenceWidthM: round(troughWidthM * 6, 3),
      settlementVolumeM3: totalSettlementVolumeM3,
      settlementVolumePerM: round(settlementVolumePerM, 5),
    },
    visualization,
    resultFields: buildTunnelResultFields(),
    steps: buildTunnelResultSteps(),
    datasets: buildTunnelResultDatasets(visualization),
    assumptions: caseFile.assumptions,
    limitations: caseFile.limitations,
  };
}

export function runBuiltinStagedSettlementConsolidationDemo(
  caseFile = buildStagedSettlementConsolidationDemoAnalysisCase(),
): FemResultManifest {
  const validation = validateFemAnalysisCase(caseFile);
  const consolidation = caseFile.geometry.consolidation;
  const material = caseFile.materials[0];
  if (!consolidation || !material) {
    throw new Error('Staged consolidation demo requires consolidation geometry and one material.');
  }
  if (validation.status === 'blocked') {
    throw new Error(`FEM case is blocked: ${validation.findings.map((item) => item.message).join('; ')}`);
  }

  const constrainedModulusKpa = material.constrainedModulusKpa ?? material.elasticModulusKpa;
  const coefficientOfConsolidationM2PerYear = material.coefficientOfConsolidationM2PerYear ?? 0.5;
  const frictionAngleDeg = material.frictionAngleDeg ?? 30;
  const cohesionKpa = material.cohesionKpa ?? 0;
  const k0 = Math.max(0.25, Math.min(0.75, 1 - Math.sin((frictionAngleDeg * Math.PI) / 180)));
  const initialVerticalEffectiveStressKpa = Math.max(25, material.unitWeightKnM3 * consolidation.layerThicknessM * 0.5);
  const stageResults: ConsolidationStageResult[] = [];
  let cumulativeLoadKpa = 0;
  let cumulativeTimeYears = 0;
  let cumulativeElasticSettlementMm = 0;
  let cumulativePlasticSettlementMm = 0;
  let maxReferenceError = 0;

  for (const [index, stage] of consolidation.stages.entries()) {
    cumulativeLoadKpa += stage.loadKpa;
    cumulativeTimeYears += stage.durationYears;
    const primarySettlementMm = (stage.loadKpa / constrainedModulusKpa) * consolidation.layerThicknessM * 1000;
    const timeStepsYears = [0.2, 0.4, 0.6, 0.8, 1].map((ratio) => round(stage.durationYears * ratio, 8));
    const consolidationResult = runTerzaghiConsolidationTimeStepper({
      layerThicknessM: consolidation.layerThicknessM,
      drainage: consolidation.drainage,
      coefficientOfConsolidationM2PerYear,
      initialExcessPorePressureKpa: stage.loadKpa,
      primarySettlementMm,
      timeStepsYears,
      nodeCount: Math.max(21, caseFile.mesh.divisionsZ * 8 + 1),
    });
    maxReferenceError = Math.max(maxReferenceError, consolidationResult.maxReferenceError);
    cumulativeElasticSettlementMm += consolidationResult.finalStep.settlementMm;

    const materialPoint = runMohrCoulombMaterialPoint({
      confiningEffectiveStressKpa: Math.max(10, k0 * (initialVerticalEffectiveStressKpa + cumulativeLoadKpa * 0.5)),
      axialStrain: cumulativeLoadKpa / constrainedModulusKpa,
      elasticModulusKpa: material.elasticModulusKpa,
      poissonRatio: material.poissonRatio,
      frictionAngleDeg,
      cohesionKpa,
      increments: 24,
    });
    const plasticSettlementAtStageMm = materialPoint.finalStep.plasticAxialStrain * consolidation.layerThicknessM * 1000 * 0.35;
    cumulativePlasticSettlementMm = Math.max(cumulativePlasticSettlementMm, plasticSettlementAtStageMm);
    const settlementMm = cumulativeElasticSettlementMm + cumulativePlasticSettlementMm;
    stageResults.push({
      stageId: stage.id,
      stageLabel: stage.label,
      stageIndex: index,
      cumulativeTimeYears: round(cumulativeTimeYears, 6),
      stageLoadKpa: round(stage.loadKpa, 4),
      cumulativeLoadKpa: round(cumulativeLoadKpa, 4),
      elasticSettlementMm: round(cumulativeElasticSettlementMm, 4),
      plasticSettlementMm: round(cumulativePlasticSettlementMm, 4),
      settlementMm: round(settlementMm, 4),
      degreeOfConsolidation: consolidationResult.finalStep.degreeOfConsolidation,
      averageExcessPorePressureKpa: consolidationResult.finalStep.averageExcessPorePressureKpa,
      mobilizedStrengthRatio: materialPoint.finalStep.mobilizedStrengthRatio,
      state: materialPoint.finalStep.state,
      maxReferenceError: consolidationResult.maxReferenceError,
    });
  }

  const finalStage = stageResults[stageResults.length - 1];
  const finalSettlementMm = finalStage.settlementMm;
  const totalLoadKn = consolidation.stages.reduce(
    (total, stage) => total + stage.loadKpa * consolidation.surfaceAreaM2,
    0,
  );
  const maxExcessPorePressureKpa = Math.max(...stageResults.map((stage) => stage.stageLoadKpa));
  const maxMobilizedStrengthRatio = Math.max(...stageResults.map((stage) => stage.mobilizedStrengthRatio));
  const visualization = buildConsolidationVisualizationMesh(caseFile, stageResults, finalSettlementMm);
  const steps = buildConsolidationResultSteps(stageResults);
  const drainagePathM = consolidation.drainage === 'double'
    ? consolidation.layerThicknessM / 2
    : consolidation.layerThicknessM;
  const envelope = {
    maxSettlementMm: round(finalSettlementMm, 3),
    minSettlementMm: 0,
    totalLoadKn: round(totalLoadKn, 3),
    reactionKn: round(totalLoadKn, 3),
    reactionBalanceRatio: 1,
    stageCount: consolidation.stages.length,
    finalSettlementMm: round(finalSettlementMm, 3),
    plasticSettlementMm: round(cumulativePlasticSettlementMm, 3),
    finalDegreeOfConsolidation: round(finalStage.degreeOfConsolidation, 6),
    maxExcessPorePressureKpa: round(maxExcessPorePressureKpa, 4),
    maxMobilizedStrengthRatio: round(maxMobilizedStrengthRatio, 6),
    drainagePathM: round(drainagePathM, 6),
    consolidationDurationYears: round(cumulativeTimeYears, 6),
  };

  return {
    schemaVersion: 'fem-result-manifest.v0',
    caseId: caseFile.caseId,
    title: caseFile.title,
    generatedAt: new Date().toISOString(),
    backend: {
      id: 'builtin-staged-consolidation-1d',
      label: 'Built-in experimental staged 1D consolidation preview',
      deterministic: true,
      version: '0.1.0',
    },
    analysisCase: caseFile,
    validation,
    mesh: {
      nodes: (caseFile.mesh.divisionsX + 1) * (caseFile.mesh.divisionsY + 1) * (caseFile.mesh.divisionsZ + 1),
      elements: caseFile.mesh.divisionsX * caseFile.mesh.divisionsY * caseFile.mesh.divisionsZ,
      elementType: caseFile.mesh.elementType,
      divisions: [caseFile.mesh.divisionsX, caseFile.mesh.divisionsY, caseFile.mesh.divisionsZ],
      visualizationNodes: visualization.base.length / 3,
      visualizationTriangles: visualization.tri.length / 3,
      visualizationEdges: visualization.edge.length / 2,
    },
    envelope,
    visualization,
    resultFields: buildConsolidationResultFields(),
    steps,
    datasets: buildConsolidationResultDatasets(visualization, steps, {
      finalSettlementMm: envelope.finalSettlementMm,
      plasticSettlementMm: envelope.plasticSettlementMm,
      finalDegreeOfConsolidation: envelope.finalDegreeOfConsolidation,
      maxExcessPorePressureKpa: envelope.maxExcessPorePressureKpa,
      maxMobilizedStrengthRatio: envelope.maxMobilizedStrengthRatio,
      stageCount: envelope.stageCount,
      totalLoadKn: envelope.totalLoadKn,
      reactionKn: envelope.reactionKn,
    }),
    assumptions: [
      ...caseFile.assumptions,
      ...caseFile.loads.flatMap((item) => item.assumptions),
      {
        id: 'consolidation-reference-error',
        parameter: 'maximum Terzaghi reference error',
        value: round(maxReferenceError, 8),
        unit: 'ratio',
        basis: 'Backward-Euler 1D consolidation stepper compared with analytical average consolidation for each stage.',
        confidence: 'measured',
        reviewRequired: true,
      },
    ],
    limitations: caseFile.limitations,
  };
}

export function runBuiltinElasticExcavationDemo(
  caseFile = buildExcavationDemoAnalysisCase(),
): FemResultManifest {
  const validation = validateFemAnalysisCase(caseFile);
  const excavation = caseFile.geometry.excavation;
  const upperMaterial = caseFile.materials[0];
  if (!excavation || !upperMaterial) {
    throw new Error('Excavation demo requires excavation geometry and at least one material.');
  }
  if (validation.status === 'blocked') {
    throw new Error(`FEM case is blocked: ${validation.findings.map((item) => item.message).join('; ')}`);
  }

  const excavationVolumeM3 = excavation.lengthM * excavation.widthM * excavation.finalDepthM;
  const totalExcavatedWeightKn = excavationVolumeM3 * upperMaterial.unitWeightKnM3;
  const depthRatio = excavation.finalDepthM / Math.max(excavation.wallToeDepthM, excavation.finalDepthM);
  const stiffnessFactor = Math.max(0.35, Math.min(1.8, 45_000 / upperMaterial.elasticModulusKpa));
  const maxSurfaceSettlementMm = round(excavation.finalDepthM * 1.72 * stiffnessFactor, 3);
  const maxHorizontalDisplacementMm = round(maxSurfaceSettlementMm * (0.7 + depthRatio * 0.35), 3);
  const maxWallDeflectionMm = round(maxHorizontalDisplacementMm * 0.82, 3);
  const maxBasalHeaveMm = round(excavation.finalDepthM * 0.55 * stiffnessFactor, 3);
  const supportReactionKn = round(totalExcavatedWeightKn * 0.28, 3);
  const boundaryReactionKn = round(totalExcavatedWeightKn - supportReactionKn, 3);
  const visualization = buildExcavationVisualizationMesh(
    caseFile,
    maxSurfaceSettlementMm,
    maxHorizontalDisplacementMm,
    maxWallDeflectionMm,
  );
  const steps = buildExcavationResultSteps(caseFile);

  return {
    schemaVersion: 'fem-result-manifest.v0',
    caseId: caseFile.caseId,
    title: caseFile.title,
    generatedAt: new Date().toISOString(),
    backend: {
      id: 'builtin-staged-excavation-demo',
      label: 'Built-in experimental staged excavation deformation preview',
      deterministic: true,
      version: '0.1.0',
    },
    analysisCase: caseFile,
    validation,
    mesh: {
      nodes: (caseFile.mesh.divisionsX + 1) * (caseFile.mesh.divisionsY + 1) * (caseFile.mesh.divisionsZ + 1),
      elements: caseFile.mesh.divisionsX * caseFile.mesh.divisionsY * caseFile.mesh.divisionsZ,
      elementType: caseFile.mesh.elementType,
      divisions: [caseFile.mesh.divisionsX, caseFile.mesh.divisionsY, caseFile.mesh.divisionsZ],
      visualizationNodes: visualization.base.length / 3,
      visualizationTriangles: visualization.tri.length / 3,
      visualizationEdges: visualization.edge.length / 2,
    },
    envelope: {
      maxSettlementMm: maxSurfaceSettlementMm,
      minSettlementMm: 0,
      totalLoadKn: round(totalExcavatedWeightKn, 3),
      reactionKn: round(totalExcavatedWeightKn, 3),
      reactionBalanceRatio: 1,
      maxSurfaceSettlementMm,
      maxHorizontalDisplacementMm,
      maxWallDeflectionMm,
      maxBasalHeaveMm,
      totalExcavatedWeightKn: round(totalExcavatedWeightKn, 3),
      supportReactionKn,
      boundaryReactionKn,
      stageCount: excavation.stages.length,
    },
    visualization,
    resultFields: buildExcavationResultFields(),
    steps,
    datasets: buildExcavationResultDatasets(visualization, steps, supportReactionKn),
    assumptions: [
      ...caseFile.assumptions,
      ...caseFile.loads.flatMap((item) => item.assumptions),
    ],
    limitations: caseFile.limitations,
  };
}
