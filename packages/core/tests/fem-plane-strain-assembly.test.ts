import { describe, expect, it } from 'vitest';

import {
  buildPlaneStrainRectangularMesh,
  runPlaneStrainQuad4Assembly,
  type FemPlaneStrainModel,
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
  });
});
