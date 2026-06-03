import { describe, expect, it } from 'vitest';

import {
  buildCsrFromTriplets,
  csrMatVec,
  solveCsrConjugateGradient,
} from '../src/fem/index.js';

describe('FEM sparse linear algebra utilities', () => {
  it('builds deterministic CSR from unordered duplicate triplets and matches dense matvec', () => {
    const matrix = buildCsrFromTriplets({
      rowCount: 3,
      colCount: 3,
      triplets: [
        { row: 1, col: 2, value: -1 },
        { row: 0, col: 0, value: 2 },
        { row: 2, col: 2, value: 3 },
        { row: 1, col: 0, value: -1 },
        { row: 0, col: 1, value: -1 },
        { row: 1, col: 1, value: 4 },
        { row: 0, col: 0, value: 2 },
        { row: 2, col: 1, value: -1 },
      ],
    });

    expect(matrix.schemaVersion).toBe('fem-sparse-csr-matrix.v1');
    expect(matrix.rowPointers).toEqual([0, 2, 5, 7]);
    expect(matrix.columnIndices).toEqual([0, 1, 0, 1, 2, 1, 2]);
    expect(matrix.values).toEqual([4, -1, -1, 4, -1, -1, 3]);
    expect(matrix.nonzeroCount).toBe(7);
    expect(matrix.duplicateTripletCount).toBe(1);
    expect(csrMatVec(matrix, [1, 2, -1])).toEqual([2, 8, -5]);
  });

  it('solves a symmetric positive definite system with audited CG convergence', () => {
    const matrix = buildCsrFromTriplets({
      rowCount: 3,
      colCount: 3,
      triplets: [
        { row: 0, col: 0, value: 4 },
        { row: 0, col: 1, value: -1 },
        { row: 1, col: 0, value: -1 },
        { row: 1, col: 1, value: 4 },
        { row: 1, col: 2, value: -1 },
        { row: 2, col: 1, value: -1 },
        { row: 2, col: 2, value: 3 },
      ],
    });

    const solved = solveCsrConjugateGradient(matrix, [2, 8, -5], {
      tolerance: 1e-10,
      maxIterations: 20,
    });

    expect(solved.schemaVersion).toBe('fem-csr-conjugate-gradient-result.v1');
    expect(solved.converged).toBe(true);
    expect(solved.iterations).toBeGreaterThan(0);
    expect(solved.residualNormRatio).toBeLessThanOrEqual(1e-10);
    expect(solved.solution[0]).toBeCloseTo(1, 9);
    expect(solved.solution[1]).toBeCloseTo(2, 9);
    expect(solved.solution[2]).toBeCloseTo(-1, 9);
  });

  it('rejects invalid sparse inputs and fails closed on an unusable preconditioner', () => {
    expect(() => buildCsrFromTriplets({
      rowCount: 1,
      colCount: 1,
      triplets: [{ row: 1, col: 0, value: 1 }],
    })).toThrow(/outside rowCount/);

    expect(() => buildCsrFromTriplets({
      rowCount: 1,
      colCount: 1,
      triplets: [{ row: 0, col: 0, value: Number.NaN }],
    })).toThrow(/must be finite/);

    const singular = buildCsrFromTriplets({
      rowCount: 1,
      colCount: 1,
      triplets: [],
    });
    expect(() => csrMatVec(singular, [1, 2])).toThrow(/vector length/);

    const solved = solveCsrConjugateGradient(singular, [1], {
      tolerance: 1e-10,
      maxIterations: 3,
    });
    expect(solved.converged).toBe(false);
    expect(solved.failureReason).toBe('zero_or_negative_preconditioner_diagonal');
  });
});
