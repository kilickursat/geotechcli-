import { describe, expect, it } from 'vitest';

import {
  buildPlaneStrainRectangularMesh,
  assessFemProductionReadiness,
  runPlaneStrainBiotConsolidation,
  runPlaneStrainDruckerPragerLoadSteps,
  runPlaneStrainQuad4Assembly,
  runPlaneStrainSteadySeepage,
  terzaghiAverageConsolidation,
  type FemPlaneStrainBiotConsolidationModel,
  type FemPlaneStrainModel,
  type FemPlaneStrainSeepageModel,
} from '../src/fem/index.js';

function baseModel(overrides: Partial<FemPlaneStrainModel> = {}): FemPlaneStrainModel {
  return {
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: [
      { id: 'n1', xM: 0, yM: 0 },
      { id: 'n2', xM: 1, yM: 0 },
      { id: 'n3', xM: 1, yM: 1 },
      { id: 'n4', xM: 0, yM: 1 },
    ],
    elements: [{ id: 'e1', nodeIds: ['n1', 'n2', 'n3', 'n4'], materialId: 'soil' }],
    materials: [{ id: 'soil', elasticModulusKpa: 30_000, poissonRatio: 0.3 }],
    boundaryConditions: [
      { nodeId: 'n1', dof: 'ux' },
      { nodeId: 'n1', dof: 'uy' },
      { nodeId: 'n2', dof: 'ux' },
      { nodeId: 'n2', dof: 'uy' },
    ],
    ...overrides,
  };
}

describe('plane-strain Quad4 global assembly evidence kernel', () => {
  it('builds deterministic rectangular meshes and rejects unsafe division counts', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 6,
      heightM: 3,
      divisionsX: 2,
      divisionsY: 3,
      materialId: 'clay',
    });

    expect(mesh.nodes).toHaveLength(12);
    expect(mesh.elements).toHaveLength(6);
    expect(mesh.nodes[0]).toEqual({ id: 'n-0-0', xM: 0, yM: 0 });
    expect(mesh.nodes.at(-1)).toEqual({ id: 'n-2-3', xM: 6, yM: 3 });
    expect(mesh.elements[0]).toEqual({
      id: 'e-0-0',
      materialId: 'clay',
      nodeIds: ['n-0-0', 'n-1-0', 'n-1-1', 'n-0-1'],
    });

    expect(() => buildPlaneStrainRectangularMesh({
      widthM: 1,
      heightM: 1,
      divisionsX: 1.5,
      divisionsY: 1,
    })).toThrow(/divisionsX must be a finite positive integer/);
    expect(() => buildPlaneStrainRectangularMesh({
      widthM: 1,
      heightM: 1,
      divisionsX: Number.NaN,
      divisionsY: 1,
    })).toThrow(/divisionsX must be a finite positive integer/);
    expect(() => buildPlaneStrainRectangularMesh({
      widthM: 1,
      heightM: 1,
      divisionsX: 1,
      divisionsY: Number.POSITIVE_INFINITY,
    })).toThrow(/divisionsY must be a finite positive integer/);
  });

  it('solves steady Quad4 seepage with a linear head patch and Darcy mass balance', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 20,
      heightM: 5,
      divisionsX: 2,
      divisionsY: 1,
      materialId: 'soil',
    });
    const leftNodes = mesh.nodes.filter((node) => node.xM === 0);
    const rightNodes = mesh.nodes.filter((node) => node.xM === 20);
    const model: FemPlaneStrainSeepageModel = {
      schemaVersion: 'fem-plane-strain-seepage-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 30_000,
        poissonRatio: 0.3,
        hydraulicConductivityXMPerS: 1e-5,
        hydraulicConductivityYMPerS: 5e-6,
        biotCoefficient: 0.8,
      }],
      headBoundaryConditions: [
        ...leftNodes.map((node) => ({ nodeId: node.id, headM: 10 })),
        ...rightNodes.map((node) => ({ nodeId: node.id, headM: 6 })),
      ],
    };

    const result = runPlaneStrainSteadySeepage(model);
    const expectedFlow = 1e-5 * ((10 - 6) / 20) * 5;
    const midBottom = result.nodes.find((node) => node.id === 'n-1-0')!;
    const maxGaussEffectiveStressReduction = Math.max(
      ...result.elements.flatMap((element) =>
        element.gaussPoints.map((point) => point.effectiveStressReductionKpa)),
    );

    expect(result.schemaVersion).toBe('fem-plane-strain-seepage-result.v1');
    expect(result.method).toBe('quad4-plane-strain-steady-darcy-seepage');
    expect(result.converged).toBe(true);
    expect(result.freeHeadDofCount).toBe(2);
    expect(result.constrainedHeadDofCount).toBe(4);
    expect(result.maxFreeMassResidualM3PerS).toBeLessThanOrEqual(result.policy.porePressureMassBalanceTolerance);
    expect(result.massBalanceErrorRatio).toBeLessThanOrEqual(result.policy.porePressureMassBalanceTolerance);
    expect(result.totalPositiveBoundaryFluxM3PerS).toBeCloseTo(expectedFlow, 12);
    expect(result.totalNegativeBoundaryFluxM3PerS).toBeCloseTo(expectedFlow, 12);
    expect(midBottom.headM).toBeCloseTo(8, 10);
    expect(midBottom.porePressureKpa).toBeCloseTo(78.48, 8);
    expect(result.maxPorePressureKpa).toBeCloseTo(98.1, 8);
    expect(result.maxEffectiveStressReductionKpa).toBeCloseTo(maxGaussEffectiveStressReduction, 8);

    for (const element of result.elements) {
      for (const point of element.gaussPoints) {
        expect(point.hydraulicGradient[0]).toBeCloseTo(-0.2, 12);
        expect(point.hydraulicGradient[1]).toBeCloseTo(0, 12);
        expect(point.darcyFluxMPerS[0]).toBeCloseTo(2e-6, 12);
        expect(point.darcyFluxMPerS[1]).toBeCloseTo(0, 12);
        expect(point.effectiveStressReductionKpa).toBeCloseTo(point.porePressureKpa * 0.8, 8);
      }
    }
  });

  it('balances prescribed head seepage with an interior nodal source', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 10,
      heightM: 4,
      divisionsX: 2,
      divisionsY: 1,
      materialId: 'soil',
    });
    const boundaryNodes = mesh.nodes.filter((node) => node.xM === 0 || node.xM === 10);
    const result = runPlaneStrainSteadySeepage({
      schemaVersion: 'fem-plane-strain-seepage-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 25_000,
        poissonRatio: 0.28,
        hydraulicConductivityXMPerS: 1e-5,
      }],
      headBoundaryConditions: boundaryNodes.map((node) => ({ nodeId: node.id, headM: 5 })),
      nodalFluxes: [{ nodeId: 'n-1-0', flowM3PerSPerM: 2e-6 }],
    });

    expect(result.converged).toBe(true);
    expect(result.netNodalFluxM3PerS).toBeCloseTo(2e-6, 12);
    expect(result.massBalanceErrorRatio).toBeLessThanOrEqual(result.policy.porePressureMassBalanceTolerance);
    expect(result.totalNegativeBoundaryFluxM3PerS).toBeGreaterThan(0);
    expect(result.nodes.find((node) => node.id === 'n-1-0')?.headM).toBeGreaterThan(5);
  });

  it('rejects unsafe seepage inputs before solving', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 1,
      heightM: 1,
      divisionsX: 1,
      divisionsY: 1,
      materialId: 'soil',
    });

    expect(() => runPlaneStrainSteadySeepage({
      schemaVersion: 'fem-plane-strain-seepage-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{ id: 'soil', elasticModulusKpa: 30_000, poissonRatio: 0.3 }],
      headBoundaryConditions: [{ nodeId: 'n-0-0', headM: 1 }],
    })).toThrow(/hydraulicConductivityXMPerS is required/);

    expect(() => runPlaneStrainSteadySeepage({
      schemaVersion: 'fem-plane-strain-seepage-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 30_000,
        poissonRatio: 0.3,
        hydraulicConductivityXMPerS: 1e-5,
      }],
      headBoundaryConditions: [{ nodeId: 'n-0-0', headM: 1 }],
    })).toThrow(/at least two hydraulic head boundary conditions/);
  });

  it('solves benchmark-scale Quad4 Biot u-p consolidation with stress-coupling evidence', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 2,
      divisionsY: 2,
      materialId: 'soil',
    });
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);
    const topNodes = mesh.nodes.filter((node) => node.yM === 1);
    const materials = [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
      hydraulicConductivityXMPerS: 1e-6,
      hydraulicConductivityYMPerS: 1e-6,
      biotCoefficient: 0.8,
      specificStorage1PerM: 1e-4,
    }];
    const boundaryConditions = bottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]);
    const nodalLoads = topNodes.map((node) => ({ nodeId: node.id, fyKn: -8 }));
    const drained = runPlaneStrainQuad4Assembly({
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials,
      boundaryConditions,
      nodalLoads,
    });
    const result = runPlaneStrainBiotConsolidation({
      schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials,
      boundaryConditions,
      porePressureBoundaryConditions: [
        ...bottomNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 100 })),
        ...topNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 0 })),
      ],
      nodalLoads,
      initialPorePressureKpa: 100,
      timeStepsSeconds: [3_600, 7_200, 14_400],
    });

    const drainedTopSettlement = Math.max(0, -Math.min(
      ...topNodes.map((node) => drained.nodes.find((item) => item.id === node.id)?.uyM ?? 0),
    ));
    const coupledTopSettlement = Math.max(0, -Math.min(
      ...topNodes.map((node) => result.nodes.find((item) => item.id === node.id)?.uyM ?? 0),
    ));
    const firstGauss = result.elements[0].gaussPoints[0];

    expect(result.schemaVersion).toBe('fem-plane-strain-biot-consolidation-result.v1');
    expect(result.method).toBe('quad4-plane-strain-biot-u-p-backward-euler-evidence');
    expect(result.productionReady).toBe(false);
    expect(result.numericalContract).toMatchObject({
      pressureKind: 'excess-pore-pressure',
      pressureUnit: 'kPa',
      pressureSignConvention: 'positive-compression-pore-pressure-only',
      unsupportedNegativePressurePolicy: 'reject-negative-free-pressure-solve',
      stressConvention: 'tension-positive-plane-strain-output',
      darcyFluxRelation: 'q = -k/gamma_water * grad(p)',
      transientStepPolicy: 'fixed backward-Euler grid requires minAcceptedSteps and bounded step-growth ratio',
      maxTimeStepGrowthRatio: 8,
      gammaWaterKpaPerM: 9.81,
    });
    expect(result.displacementDofCount).toBe(mesh.nodes.length * 2);
    expect(result.porePressureDofCount).toBe(mesh.nodes.length);
    expect(result.freeDisplacementDofCount).toBeGreaterThan(0);
    expect(result.freePorePressureDofCount).toBeGreaterThan(0);
    expect(result.coupledUnknownCount).toBe(result.freeDisplacementDofCount + result.freePorePressureDofCount);
    expect(result.timeSteps).toHaveLength(3);
    expect(result.converged).toBe(true);
    expect(result.maxFreeResidualKn).toBeLessThanOrEqual(result.policy.forceBalanceTolerance);
    expect(result.massBalanceErrorRatio).toBeLessThanOrEqual(result.policy.porePressureMassBalanceTolerance);
    expect(result.minPorePressureKpa).toBeGreaterThanOrEqual(0);
    expect(result.maxPorePressureKpa).toBeCloseTo(100, 8);
    expect(result.freePorePressureResidualL1M3PerS).toBeLessThanOrEqual(
      result.timeSteps.at(-1)?.freePorePressureResidualL1M3PerS ?? Number.POSITIVE_INFINITY,
    );
    expect(result.pressureAudit.freePorePressureResidualL1M3PerS).toBe(
      result.timeSteps.at(-1)?.pressureAudit.freePorePressureResidualL1M3PerS,
    );
    expect(result.pressureDiagnostics).toEqual(result.timeSteps.at(-1)?.pressureDiagnostics);
    expect(result.pressureDiagnostics.averagePorePressureKpa).toBeGreaterThanOrEqual(0);
    expect(result.pressureDiagnostics.porePressureDissipationRatio).toBeGreaterThanOrEqual(0);
    expect(result.pressureDiagnostics.porePressureDissipationRatio).toBeLessThanOrEqual(1);
    expect(result.pressureDiagnostics.pressureOvershootKpa).toBe(0);
    expect(result.pressureAudit.prescribedPorePressureResidualL1M3PerS).toBeGreaterThan(0);
    expect(result.maxBiotCouplingKpa).toBeGreaterThan(0);
    expect(coupledTopSettlement).not.toBeCloseTo(drainedTopSettlement, 12);
    expect(firstGauss.porePressureKpa).toBeGreaterThan(0);
    expect(firstGauss.effectiveStressKpa[1] - firstGauss.totalStressKpa[1])
      .toBeCloseTo(firstGauss.biotStressReductionKpa, 7);
    expect(firstGauss.totalStressKpa[1]).toBeLessThan(firstGauss.effectiveStressKpa[1]);
    expect(result.limitations.join(' ')).toMatch(/Benchmark-scale/i);
    expect(result.limitations.join(' ')).toMatch(/not a production sparse solver/i);
    expect(result.limitations.join(' ')).toMatch(/nonlinear plasticity coupling/i);
  });

  it('reports Biot pressure-gradient flux, sign, and storage contract metadata', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 1,
      divisionsY: 1,
      materialId: 'soil',
    });
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);
    const topNodes = mesh.nodes.filter((node) => node.yM === 1);
    const result = runPlaneStrainBiotConsolidation({
      schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 30_000,
        poissonRatio: 0.3,
        hydraulicConductivityXMPerS: 1e-6,
        hydraulicConductivityYMPerS: 1e-6,
        biotCoefficient: 0.75,
        specificStorage1PerM: 1e-4,
      }],
      boundaryConditions: bottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      porePressureBoundaryConditions: [
        ...bottomNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 100 })),
        ...topNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 0 })),
      ],
      initialPorePressureKpa: 100,
      timeStepsSeconds: [1_000, 2_000, 3_000],
    });

    const firstGauss = result.elements[0].gaussPoints[0];
    const expectedFluxY = (1e-6 / 9.81) * 100;

    expect(result.numericalContract.totalStressRelation)
      .toBe('sigma_total_xx_yy = sigma_effective_xx_yy - alpha_B * p; shear unchanged');
    expect(result.numericalContract.storageConvention)
      .toBe('specificStorage1PerM is head-based; pressure storage uses Ss / gamma_water');
    expect(firstGauss.hydraulicGradientKpaPerM[0]).toBeCloseTo(0, 12);
    expect(firstGauss.hydraulicGradientKpaPerM[1]).toBeCloseTo(-100, 12);
    expect(firstGauss.darcyFluxMPerS[0]).toBeCloseTo(0, 12);
    expect(firstGauss.darcyFluxMPerS[1]).toBeCloseTo(expectedFluxY, 12);
    expect(firstGauss.biotStressReductionKpa).toBeCloseTo(firstGauss.porePressureKpa * 0.75, 8);
    expect(result.pressureAudit.prescribedPorePressureResidualL1M3PerS).toBeGreaterThan(0);
    expect(result.pressureAudit.freePorePressureResidualL1M3PerS).toBe(0);
  });

  it('decouples Biot pressure from deformation when alpha is zero', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 2,
      divisionsY: 1,
      materialId: 'soil',
    });
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);
    const topNodes = mesh.nodes.filter((node) => node.yM === 1);
    const materials = [{
      id: 'soil',
      elasticModulusKpa: 22_000,
      poissonRatio: 0.27,
      hydraulicConductivityXMPerS: 5e-7,
      hydraulicConductivityYMPerS: 5e-7,
      biotCoefficient: 0,
      specificStorage1PerM: 2e-4,
    }];
    const boundaryConditions = bottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]);
    const nodalLoads = topNodes.map((node) => ({ nodeId: node.id, fyKn: -6 }));
    const drained = runPlaneStrainQuad4Assembly({
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials,
      boundaryConditions,
      nodalLoads,
    });
    const biot = runPlaneStrainBiotConsolidation({
      schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials,
      boundaryConditions,
      porePressureBoundaryConditions: [
        ...bottomNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 80 })),
        ...topNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 0 })),
      ],
      nodalLoads,
      initialPorePressureKpa: 80,
      timeStepsSeconds: [600, 1_200, 1_800],
    });

    for (const drainedNode of drained.nodes) {
      const biotNode = biot.nodes.find((node) => node.id === drainedNode.id)!;
      expect(biotNode.uxM).toBeCloseTo(drainedNode.uxM, 10);
      expect(biotNode.uyM).toBeCloseTo(drainedNode.uyM, 10);
    }
    expect(biot.maxBiotCouplingKpa).toBe(0);
    expect(biot.elements.flatMap((element) => element.gaussPoints)
      .every((point) => point.biotStressReductionKpa === 0)).toBe(true);
    expect(biot.converged).toBe(true);
  });

  it('matches Terzaghi pressure dissipation for an alpha-zero Biot drainage column', () => {
    const initialPorePressureKpa = 100;
    const timeFactor = 0.197;
    const hydraulicConductivityMPerS = 1e-6;
    const specificStorage1PerM = 1e-4;
    const drainagePathM = 1;
    const finalTimeSeconds = timeFactor * drainagePathM ** 2 /
      (hydraulicConductivityMPerS / specificStorage1PerM);
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 1,
      heightM: 1,
      divisionsX: 1,
      divisionsY: 16,
      materialId: 'soil',
    });
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);
    const topNodes = mesh.nodes.filter((node) => node.yM === 1);
    const result = runPlaneStrainBiotConsolidation({
      schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 30_000,
        poissonRatio: 0.3,
        hydraulicConductivityXMPerS: hydraulicConductivityMPerS,
        hydraulicConductivityYMPerS: hydraulicConductivityMPerS,
        biotCoefficient: 0,
        specificStorage1PerM,
      }],
      boundaryConditions: bottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      porePressureBoundaryConditions: topNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 0 })),
      initialPorePressureKpa,
      timeStepsSeconds: Array.from({ length: 80 }, (_, index) => finalTimeSeconds * ((index + 1) / 80)),
    });

    const totalWeight = result.elements.reduce((sum, element) => sum + element.areaM2 * element.thicknessM, 0);
    const finalAveragePressureKpa = result.elements.reduce((sum, element) => {
      const pointWeight = (element.areaM2 * element.thicknessM) / element.gaussPoints.length;
      return sum + element.gaussPoints.reduce(
        (pointSum, point) => pointSum + point.porePressureKpa * pointWeight,
        0,
      );
    }, 0) / totalWeight;
    const degreeOfConsolidation = 1 - (finalAveragePressureKpa / initialPorePressureKpa);
    const referenceDegreeOfConsolidation = terzaghiAverageConsolidation(timeFactor);

    expect(result.productionReady).toBe(false);
    expect(result.converged).toBe(true);
    expect(result.maxBiotCouplingKpa).toBe(0);
    expect(result.massBalanceErrorRatio).toBeLessThanOrEqual(result.policy.porePressureMassBalanceTolerance);
    expect(result.minPorePressureKpa).toBe(0);
    expect(result.maxPorePressureKpa).toBeLessThan(initialPorePressureKpa);
    expect(result.timeSteps[0].maxPorePressureKpa).toBeGreaterThan(result.timeSteps.at(-1)!.maxPorePressureKpa);
    expect(degreeOfConsolidation).toBeCloseTo(referenceDegreeOfConsolidation, 2);
    expect(degreeOfConsolidation).toBeGreaterThan(0.49);
    expect(degreeOfConsolidation).toBeLessThan(0.51);
    expect(result.nodes.every((node) => Math.abs(node.uxM) <= 1e-12 && Math.abs(node.uyM) <= 1e-12))
      .toBe(true);
  });

  it('rejects unsafe Biot u-p consolidation inputs before solving', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 1,
      heightM: 1,
      divisionsX: 1,
      divisionsY: 1,
      materialId: 'soil',
    });
    const model: FemPlaneStrainBiotConsolidationModel = {
      schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 30_000,
        poissonRatio: 0.3,
        hydraulicConductivityXMPerS: 1e-6,
        specificStorage1PerM: 1e-4,
      }],
      boundaryConditions: mesh.nodes
        .filter((node) => node.yM === 0)
        .flatMap((node) => [
          { nodeId: node.id, dof: 'ux' as const },
          { nodeId: node.id, dof: 'uy' as const },
        ]),
      porePressureBoundaryConditions: [{ nodeId: 'n-0-0', porePressureKpa: 0 }],
      timeStepsSeconds: [1, 2, 3],
    };

    expect(() => runPlaneStrainBiotConsolidation({
      ...model,
      materials: [{ id: 'soil', elasticModulusKpa: 30_000, poissonRatio: 0.3, hydraulicConductivityXMPerS: 1e-6 }],
    })).toThrow(/specificStorage1PerM is required/);
    expect(() => runPlaneStrainBiotConsolidation({
      ...model,
      porePressureBoundaryConditions: [],
    })).toThrow(/at least one pore-pressure boundary condition/);
    expect(() => runPlaneStrainBiotConsolidation({
      ...model,
      timeStepsSeconds: [1],
    })).toThrow(/at least 3 accepted transient steps/);
    expect(() => runPlaneStrainBiotConsolidation({
      ...model,
      timeStepsSeconds: [1, 3, 2],
    })).toThrow(/timeStepsSeconds\.2 must be strictly increasing/);
    expect(() => runPlaneStrainBiotConsolidation({
      ...model,
      timeStepsSeconds: [1, 2, 30],
    })).toThrow(/step growth ratio must not exceed 8/);
    expect(() => runPlaneStrainBiotConsolidation({
      ...model,
      porePressureBoundaryConditions: [
        { nodeId: 'n-0-0', porePressureKpa: 0 },
        { nodeId: 'n-0-0', porePressureKpa: 1 },
      ],
    })).toThrow(/Conflicting pore-pressure boundary condition/);
    expect(() => runPlaneStrainBiotConsolidation({
      ...model,
      initialPorePressureKpa: -1,
    })).toThrow(/initialPorePressureKpa must be a finite non-negative number/);
    expect(() => runPlaneStrainBiotConsolidation({
      ...model,
      nodalFluxes: [{ nodeId: 'n-1-1', flowM3PerS: -1e-3 }],
    })).toThrow(/extraction-driven suction is unsupported/i);
  });

  it('reproduces a prescribed affine displacement patch at every Gauss point', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 1,
      divisionsY: 1,
      materialId: 'soil',
    });
    const elasticModulusKpa = 30_000;
    const poissonRatio = 0.3;
    const exx = 0.001;
    const eyy = -0.0002;
    const gammaXy = 0.0003;
    const factor = elasticModulusKpa / ((1 + poissonRatio) * (1 - 2 * poissonRatio));

    const result = runPlaneStrainQuad4Assembly({
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{ id: 'soil', elasticModulusKpa, poissonRatio }],
      boundaryConditions: mesh.nodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const, valueM: exx * node.xM + gammaXy * node.yM },
        { nodeId: node.id, dof: 'uy' as const, valueM: eyy * node.yM },
      ]),
    });

    expect(result.schemaVersion).toBe('fem-plane-strain-assembly-result.v1');
    expect(result.method).toBe('quad4-plane-strain-linear-elastic-global-assembly');
    expect(result.freeDofCount).toBe(0);
    expect(result.constrainedDofCount).toBe(8);
    expect(result.elements[0].areaM2).toBe(2);
    expect(result.reactionBalanceRatio).toBeCloseTo(1, 12);
    expect(result.converged).toBe(true);
    expect(result.strainEnergyKnM).toBeGreaterThan(0);

    for (const point of result.elements[0].gaussPoints) {
      expect(point.strain[0]).toBeCloseTo(exx, 12);
      expect(point.strain[1]).toBeCloseTo(eyy, 12);
      expect(point.strain[2]).toBeCloseTo(gammaXy, 12);
      expect(point.stressKpa[0]).toBeCloseTo(factor * ((1 - poissonRatio) * exx + poissonRatio * eyy), 8);
      expect(point.stressKpa[1]).toBeCloseTo(factor * (poissonRatio * exx + (1 - poissonRatio) * eyy), 8);
      expect(point.stressKpa[2]).toBeCloseTo(factor * ((1 - 2 * poissonRatio) / 2) * gammaXy, 8);
    }
  });

  it('reproduces an affine displacement patch on a skewed quadrilateral', () => {
    const exx = 0.0008;
    const eyy = -0.0001;
    const gammaXy = 0.00025;
    const result = runPlaneStrainQuad4Assembly({
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: [
        { id: 'n1', xM: 0, yM: 0 },
        { id: 'n2', xM: 2, yM: 0 },
        { id: 'n3', xM: 2.4, yM: 1 },
        { id: 'n4', xM: 0.4, yM: 1 },
      ],
      elements: [{ id: 'e1', nodeIds: ['n1', 'n2', 'n3', 'n4'], materialId: 'soil' }],
      materials: [{ id: 'soil', elasticModulusKpa: 28_000, poissonRatio: 0.27 }],
      boundaryConditions: [
        { nodeId: 'n1', dof: 'ux', valueM: 0 },
        { nodeId: 'n1', dof: 'uy', valueM: 0 },
        { nodeId: 'n2', dof: 'ux', valueM: exx * 2 },
        { nodeId: 'n2', dof: 'uy', valueM: 0 },
        { nodeId: 'n3', dof: 'ux', valueM: exx * 2.4 + gammaXy },
        { nodeId: 'n3', dof: 'uy', valueM: eyy },
        { nodeId: 'n4', dof: 'ux', valueM: exx * 0.4 + gammaXy },
        { nodeId: 'n4', dof: 'uy', valueM: eyy },
      ],
    });

    for (const point of result.elements[0].gaussPoints) {
      expect(point.detJ).toBeGreaterThan(0);
      expect(point.strain[0]).toBeCloseTo(exx, 12);
      expect(point.strain[1]).toBeCloseTo(eyy, 12);
      expect(point.strain[2]).toBeCloseTo(gammaXy, 12);
    }
    expect(result.reactionBalanceRatio).toBeCloseTo(1, 12);
    expect(result.converged).toBe(true);
  });

  it('solves a loaded rectangular mesh with free residual and reaction equilibrium checks', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 2,
      divisionsY: 1,
      materialId: 'soil',
    });
    const topNodes = mesh.nodes.filter((node) => node.yM === 1);
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);

    const result = runPlaneStrainQuad4Assembly({
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{ id: 'soil', elasticModulusKpa: 25_000, poissonRatio: 0.28 }],
      boundaryConditions: bottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      nodalLoads: topNodes.map((node) => ({ nodeId: node.id, fyKn: -10 })),
    });

    const totalReactionY = result.nodes.reduce((sum, node) => sum + node.rxnYKn, 0);

    expect(result.freeDofCount).toBeGreaterThan(0);
    expect(result.maxFreeResidualKn).toBeLessThanOrEqual(result.policy.forceBalanceTolerance);
    expect(result.residualNormRatio).toBeLessThanOrEqual(result.policy.forceBalanceTolerance);
    expect(result.reactionBalanceRatio).toBeGreaterThan(0.999);
    expect(totalReactionY).toBeCloseTo(30, 6);
    expect(Math.min(...topNodes.map((node) => result.nodes.find((resultNode) => resultNode.id === node.id)?.uyM ?? 0)))
      .toBeLessThan(0);
    expect(result.converged).toBe(true);
  });

  it('matches the linear elastic Quad4 solve when Drucker-Prager strength is not mobilized', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 2,
      divisionsY: 1,
      materialId: 'soil',
    });
    const topNodes = mesh.nodes.filter((node) => node.yM === 1);
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);
    const model: FemPlaneStrainModel = {
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 25_000,
        poissonRatio: 0.28,
        frictionAngleDeg: 35,
        cohesionKpa: 10_000,
        dilationAngleDeg: 0,
      }],
      boundaryConditions: bottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      nodalLoads: topNodes.map((node) => ({ nodeId: node.id, fyKn: -5 })),
    };

    const linear = runPlaneStrainQuad4Assembly(model);
    const nonlinear = runPlaneStrainDruckerPragerLoadSteps(model);

    expect(nonlinear.schemaVersion).toBe('fem-plane-strain-drucker-prager-result.v1');
    expect(nonlinear.method).toBe('quad4-plane-strain-drucker-prager-modified-newton');
    expect(nonlinear.converged).toBe(true);
    expect(nonlinear.plasticGaussPointCount).toBe(0);
    expect(nonlinear.maxEquivalentPlasticStrain).toBe(0);
    expect(nonlinear.reactionBalanceRatio).toBeGreaterThan(0.999);
    for (const linearNode of linear.nodes) {
      const nonlinearNode = nonlinear.nodes.find((node) => node.id === linearNode.id)!;
      expect(nonlinearNode.uxM).toBeCloseTo(linearNode.uxM, 10);
      expect(nonlinearNode.uyM).toBeCloseTo(linearNode.uyM, 10);
      expect(nonlinearNode.rxnYKn).toBeCloseTo(linearNode.rxnYKn, 6);
    }
  });

  it('matches dense Drucker-Prager load-step results with the opt-in sparse CG backend', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 2,
      divisionsY: 1,
      materialId: 'soil',
    });
    const topNodes = mesh.nodes.filter((node) => node.yM === 1);
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);
    const model: FemPlaneStrainModel = {
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 25_000,
        poissonRatio: 0.28,
        frictionAngleDeg: 35,
        cohesionKpa: 10_000,
        dilationAngleDeg: 0,
      }],
      boundaryConditions: bottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      nodalLoads: topNodes.map((node) => ({ nodeId: node.id, fyKn: -5 })),
    };

    const dense = runPlaneStrainDruckerPragerLoadSteps(model, { linearSolver: 'dense-gaussian' });
    const sparse = runPlaneStrainDruckerPragerLoadSteps(model, {
      linearSolver: 'sparse-csr-cg',
      linearSolverTolerance: 1e-10,
      linearSolverMaxIterations: 80,
    });

    expect(sparse.linearSolver).toBe('sparse-csr-cg');
    expect(sparse.nonlinearAlgorithm).toBe('modified-newton');
    expect(sparse.globalTangent).toBe('elastic');
    expect(sparse.materialIntegration).toBe('total-strain-drucker-prager-projection');
    expect(sparse.converged).toBe(true);
    expect(sparse.reactionBalanceRatio).toBeGreaterThan(0.999);
    expect(sparse.loadSteps.every((step) => step.linearSolver === 'sparse-csr-cg')).toBe(true);
    expect(sparse.loadSteps.every((step) => step.linearSolverAudits.every((audit) => audit.converged))).toBe(true);
    expect(sparse.loadSteps.some((step) => step.linearIterations > 0)).toBe(true);
    for (const denseNode of dense.nodes) {
      const sparseNode = sparse.nodes.find((node) => node.id === denseNode.id)!;
      expect(sparseNode.uxM).toBeCloseTo(denseNode.uxM, 8);
      expect(sparseNode.uyM).toBeCloseTo(denseNode.uyM, 8);
      expect(sparseNode.rxnYKn).toBeCloseTo(denseNode.rxnYKn, 5);
    }
  });

  it('solves oversized nonlinear evidence meshes only through the experimental sparse backend', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 20,
      heightM: 19,
      divisionsX: 20,
      divisionsY: 19,
      materialId: 'soil',
    });
    const topNodes = mesh.nodes.filter((node) => node.yM === 19);
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);
    const model: FemPlaneStrainModel = {
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 30_000,
        poissonRatio: 0.3,
        frictionAngleDeg: 35,
        cohesionKpa: 1_000_000,
        dilationAngleDeg: 0,
      }],
      boundaryConditions: bottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      nodalLoads: topNodes.map((node) => ({ nodeId: node.id, fyKn: -1 })),
    };

    expect(model.nodes.length * 2).toBeGreaterThan(800);
    expect(() => runPlaneStrainDruckerPragerLoadSteps(model)).toThrow(/dense assembly is capped/);

    const sparse = runPlaneStrainDruckerPragerLoadSteps(model, {
      loadStepFractions: [1],
      linearSolver: 'sparse-csr-cg',
      linearSolverTolerance: 1e-8,
      linearSolverMaxIterations: 2_000,
    });

    expect(sparse.dofCount).toBeGreaterThan(800);
    expect(sparse.linearSolver).toBe('sparse-csr-cg');
    expect(sparse.converged).toBe(true);
    expect(sparse.loadSteps).toHaveLength(1);
    expect(sparse.loadSteps[0].linearIterations).toBeGreaterThan(0);
    expect(sparse.loadSteps[0].linearResidualNormRatio).toBeLessThanOrEqual(1e-8);
    expect(sparse.residualNormRatio).toBeLessThanOrEqual(sparse.policy.forceBalanceTolerance);
    expect(sparse.reactionBalanceRatio).toBeGreaterThan(0.999);
    expect(sparse.limitations.join(' ')).toMatch(/experimental CSR Conjugate Gradient/i);
  });

  it('projects a prescribed shear patch to Drucker-Prager yield at Gauss points', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 1,
      divisionsY: 1,
      materialId: 'soil',
    });
    const gammaXy = 0.02;
    const result = runPlaneStrainDruckerPragerLoadSteps({
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 30_000,
        poissonRatio: 0.3,
        frictionAngleDeg: 30,
        cohesionKpa: 5,
        dilationAngleDeg: 0,
      }],
      boundaryConditions: mesh.nodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const, valueM: gammaXy * node.yM },
        { nodeId: node.id, dof: 'uy' as const, valueM: 0 },
      ]),
    });

    expect(result.converged).toBe(true);
    expect(result.freeDofCount).toBe(0);
    expect(result.plasticGaussPointCount).toBe(4);
    expect(result.maxYieldResidualRatio).toBeLessThanOrEqual(result.policy.residualTolerance);
    expect(result.maxEquivalentPlasticStrain).toBeGreaterThan(0);
    for (const point of result.elements[0].gaussPoints) {
      expect(point.state).toBe('plastic');
      expect(point.strain[2]).toBeCloseTo(gammaXy, 12);
      expect(point.yieldResidualRatio).toBeLessThanOrEqual(result.policy.residualTolerance);
      expect(point.compressionPositivePrincipalStressKpa[0]).toBeGreaterThan(0);
      expect(point.stressKpa[2]).toBeGreaterThan(0);
    }
  });

  it('runs staged nonlinear plane-strain load steps with monotonic settlement and reaction balance', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 2,
      divisionsY: 1,
      materialId: 'soil',
    });
    const topNodes = mesh.nodes.filter((node) => node.yM === 1);
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);
    const result = runPlaneStrainDruckerPragerLoadSteps({
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 25_000,
        poissonRatio: 0.28,
        frictionAngleDeg: 32,
        cohesionKpa: 5,
        dilationAngleDeg: 0,
      }],
      boundaryConditions: bottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      nodalLoads: topNodes.map((node) => ({ nodeId: node.id, fyKn: -30 })),
    }, {
      loadStepFractions: [0.25, 0.5, 0.75, 1],
    });

    const topSettlements = topNodes.map((node) => result.nodes.find((resultNode) => resultNode.id === node.id)?.uyM ?? 0);

    expect(result.converged).toBe(true);
    expect(result.status).toBe('converged');
    expect(result.loadSteps).toHaveLength(4);
    expect(result.loadSteps.every((step) => step.converged)).toBe(true);
    expect(result.loadSteps.every((step) => step.terminationReason === 'converged')).toBe(true);
    expect(result.loadSteps.every((step) => step.residualHistory.length === step.iterations + 1)).toBe(true);
    expect(result.loadSteps.at(-1)?.loadFactor).toBe(1);
    expect(result.loadSteps.at(-1)?.plasticGaussPointCount).toBeGreaterThan(0);
    expect(result.loadSteps.at(-1)?.residualHistory.at(-1)?.converged).toBe(true);
    expect(result.plasticGaussPointCount).toBeGreaterThan(0);
    expect(result.maxEquivalentPlasticStrain).toBeGreaterThan(0);
    expect(result.residualNormRatio).toBeLessThanOrEqual(result.policy.forceBalanceTolerance);
    expect(result.reactionBalanceRatio).toBeGreaterThan(1 - 3 * result.policy.forceBalanceTolerance);
    expect(Math.min(...topSettlements)).toBeLessThan(0);
    for (let index = 1; index < result.loadSteps.length; index += 1) {
      expect(result.loadSteps[index].maxEquivalentPlasticStrain)
        .toBeGreaterThanOrEqual(result.loadSteps[index - 1].maxEquivalentPlasticStrain);
    }
  });

  it('fails closed when nonlinear plane-strain load steps exceed the iteration budget', () => {
    const mesh = buildPlaneStrainRectangularMesh({
      widthM: 2,
      heightM: 1,
      divisionsX: 2,
      divisionsY: 1,
      materialId: 'soil',
    });
    const topNodes = mesh.nodes.filter((node) => node.yM === 1);
    const bottomNodes = mesh.nodes.filter((node) => node.yM === 0);
    const result = runPlaneStrainDruckerPragerLoadSteps({
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: mesh.nodes,
      elements: mesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 25_000,
        poissonRatio: 0.28,
        frictionAngleDeg: 32,
        cohesionKpa: 2,
        dilationAngleDeg: 0,
      }],
      boundaryConditions: bottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      nodalLoads: topNodes.map((node) => ({ nodeId: node.id, fyKn: -60 })),
      policy: {
        schemaVersion: 'fem-convergence-policy.v1',
        residualTolerance: 1e-14,
        forceBalanceTolerance: 1e-14,
        porePressureMassBalanceTolerance: 1e-3,
        maxIterations: 1,
        minAcceptedSteps: 1,
      },
    }, {
      loadStepFractions: [1],
    });

    expect(result.converged).toBe(false);
    expect(result.status).toBe('nonconverged');
    expect(result.failure).toMatchObject({
      step: 1,
      loadFactor: 1,
      terminationReason: 'max_iterations',
    });
    expect(result.loadSteps[0].converged).toBe(false);
    expect(result.loadSteps[0].residualHistory).toHaveLength(2);
    expect(result.loadSteps[0].residualHistory.at(-1)?.converged).toBe(false);
    expect(result.limitations.join(' ')).toMatch(/fail-closed/i);
  });

  it('keeps nonlinear plane-strain evidence out of the production-ready gate', () => {
    const report = assessFemProductionReadiness();

    expect(report.productionReady).toBe(false);
    expect(report.status).toBe('blocked');
    expect(report.releasePositioning).toContain('not a full production-grade nonlinear geotechnical FEM solver yet');
  });

  it('rejects duplicate identifiers, invalid loads, conflicting supports, bad connectivity, and singular systems', () => {
    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      nodes: [
        { id: 'n1', xM: 0, yM: 0 },
        { id: 'n1', xM: 1, yM: 0 },
        { id: 'n3', xM: 1, yM: 1 },
        { id: 'n4', xM: 0, yM: 1 },
      ],
    }))).toThrow(/Duplicate node id/);

    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      materials: [
        { id: 'soil', elasticModulusKpa: 30_000, poissonRatio: 0.3 },
        { id: 'soil', elasticModulusKpa: 40_000, poissonRatio: 0.25 },
      ],
    }))).toThrow(/Duplicate material id/);

    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      elements: [
        { id: 'e1', nodeIds: ['n1', 'n2', 'n3', 'n4'], materialId: 'soil' },
        { id: 'e1', nodeIds: ['n1', 'n2', 'n3', 'n4'], materialId: 'soil' },
      ],
    }))).toThrow(/Duplicate element id/);

    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      elements: [{ id: 'e1', nodeIds: ['n1', 'n2', 'n2', 'n4'], materialId: 'soil' }],
    }))).toThrow(/duplicate node references/i);

    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      nodalLoads: [{ nodeId: 'n3', fyKn: Number.NaN }],
    }))).toThrow(/nodal load n3\.fyKn must be finite/);

    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      boundaryConditions: [
        { nodeId: 'n1', dof: 'ux', valueM: 0 },
        { nodeId: 'n1', dof: 'ux', valueM: 0.001 },
      ],
    }))).toThrow(/Conflicting boundary condition/);

    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      elements: [{ id: 'e1', nodeIds: ['n1', 'n4', 'n3', 'n2'], materialId: 'soil' }],
    }))).toThrow(/non-positive Jacobian/);

    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      nodalLoads: {} as any,
    }))).toThrow(/nodalLoads must be an array/);

    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      policy: {
        schemaVersion: 'fem-convergence-policy.v1',
        residualTolerance: 1e-6,
        forceBalanceTolerance: Number.POSITIVE_INFINITY,
        porePressureMassBalanceTolerance: 1e-3,
        maxIterations: 40,
        minAcceptedSteps: 3,
      },
    }))).toThrow(/policy\.forceBalanceTolerance must be a finite positive number/);

    expect(() => runPlaneStrainQuad4Assembly(baseModel({
      boundaryConditions: [{ nodeId: 'n1', dof: 'ux' }],
    }))).toThrow(/insufficient displacement constraints/);

    const oversized = buildPlaneStrainRectangularMesh({
      widthM: 20,
      heightM: 20,
      divisionsX: 20,
      divisionsY: 20,
      materialId: 'soil',
    });
    expect(() => runPlaneStrainQuad4Assembly({
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: oversized.nodes,
      elements: oversized.elements,
      materials: [{ id: 'soil', elasticModulusKpa: 30_000, poissonRatio: 0.3 }],
      boundaryConditions: oversized.nodes
        .filter((node) => node.yM === 0)
        .flatMap((node) => [
          { nodeId: node.id, dof: 'ux' as const },
          { nodeId: node.id, dof: 'uy' as const },
        ]),
    })).toThrow(/dense assembly is capped/);

    expect(() => runPlaneStrainDruckerPragerLoadSteps(baseModel(), {
      loadStepFractions: [0.5, 0.25, 1],
    })).toThrow(/loadStepFractions\.1/);

    expect(() => runPlaneStrainDruckerPragerLoadSteps(baseModel(), {
      linearSolver: 'bad-solver' as any,
    })).toThrow(/linearSolver must be dense-gaussian or sparse-csr-cg/);
  });
});
