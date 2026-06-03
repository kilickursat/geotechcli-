import { describe, expect, it } from 'vitest';

import {
  buildPlaneStrainRectangularMesh,
  assessFemProductionReadiness,
  runPlaneStrainBiotConsolidation,
  runPlaneStrainDruckerPragerLoadSteps,
  runPlaneStrainQuad4Assembly,
  runPlaneStrainSteadySeepage,
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
    expect(result.displacementDofCount).toBe(mesh.nodes.length * 2);
    expect(result.porePressureDofCount).toBe(mesh.nodes.length);
    expect(result.freeDisplacementDofCount).toBeGreaterThan(0);
    expect(result.freePorePressureDofCount).toBeGreaterThan(0);
    expect(result.coupledUnknownCount).toBe(result.freeDisplacementDofCount + result.freePorePressureDofCount);
    expect(result.timeSteps).toHaveLength(3);
    expect(result.converged).toBe(true);
    expect(result.maxFreeResidualKn).toBeLessThanOrEqual(result.policy.forceBalanceTolerance);
    expect(result.massBalanceErrorRatio).toBeLessThanOrEqual(result.policy.porePressureMassBalanceTolerance);
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
      timeStepsSeconds: [1],
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
      timeStepsSeconds: [2, 1],
    })).toThrow(/timeStepsSeconds\.1 must be strictly increasing/);
    expect(() => runPlaneStrainBiotConsolidation({
      ...model,
      porePressureBoundaryConditions: [
        { nodeId: 'n-0-0', porePressureKpa: 0 },
        { nodeId: 'n-0-0', porePressureKpa: 1 },
      ],
    })).toThrow(/Conflicting pore-pressure boundary condition/);
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
    expect(result.loadSteps).toHaveLength(4);
    expect(result.loadSteps.every((step) => step.converged)).toBe(true);
    expect(result.loadSteps.at(-1)?.loadFactor).toBe(1);
    expect(result.loadSteps.at(-1)?.plasticGaussPointCount).toBeGreaterThan(0);
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
  });
});
