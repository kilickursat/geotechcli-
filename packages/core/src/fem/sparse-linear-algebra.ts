export interface FemSparseTriplet {
  row: number;
  col: number;
  value: number;
}

export interface FemSparseCsrMatrix {
  schemaVersion: 'fem-sparse-csr-matrix.v1';
  rowCount: number;
  colCount: number;
  rowPointers: number[];
  columnIndices: number[];
  values: number[];
  nonzeroCount: number;
  duplicateTripletCount: number;
  droppedEntryCount: number;
}

export interface FemSparseCsrBuildInput {
  rowCount: number;
  colCount: number;
  triplets: readonly FemSparseTriplet[];
  dropTolerance?: number;
}

export interface FemCsrConjugateGradientOptions {
  tolerance?: number;
  maxIterations?: number;
  initialGuess?: readonly number[];
  preconditioner?: 'jacobi' | 'none';
}

export interface FemCsrConjugateGradientResult {
  schemaVersion: 'fem-csr-conjugate-gradient-result.v1';
  solution: number[];
  converged: boolean;
  iterations: number;
  tolerance: number;
  maxIterations: number;
  initialResidualNorm: number;
  finalResidualNorm: number;
  residualNormRatio: number;
  rhsNorm: number;
  correctionNorm: number;
  preconditioner: 'jacobi' | 'none';
  failureReason?: 'zero_or_negative_preconditioner_diagonal' | 'singular_or_indefinite_matrix' | 'max_iterations';
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function vectorNorm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

export function buildCsrFromTriplets(input: FemSparseCsrBuildInput): FemSparseCsrMatrix {
  assertPositiveInteger(input.rowCount, 'rowCount');
  assertPositiveInteger(input.colCount, 'colCount');
  if (!Array.isArray(input.triplets)) throw new Error('triplets must be an array.');
  const dropTolerance = input.dropTolerance ?? 0;
  if (!Number.isFinite(dropTolerance) || dropTolerance < 0) {
    throw new Error('dropTolerance must be a finite non-negative number.');
  }

  const rows = Array.from({ length: input.rowCount }, () => new Map<number, number>());
  let duplicateTripletCount = 0;
  let droppedEntryCount = 0;

  for (const [index, triplet] of input.triplets.entries()) {
    assertNonNegativeInteger(triplet.row, `triplets.${index}.row`);
    assertNonNegativeInteger(triplet.col, `triplets.${index}.col`);
    if (triplet.row >= input.rowCount) throw new Error(`triplets.${index}.row is outside rowCount.`);
    if (triplet.col >= input.colCount) throw new Error(`triplets.${index}.col is outside colCount.`);
    assertFinite(triplet.value, `triplets.${index}.value`);
    if (Math.abs(triplet.value) <= dropTolerance) {
      droppedEntryCount += 1;
      continue;
    }
    const row = rows[triplet.row];
    const existing = row.get(triplet.col);
    if (existing != null) duplicateTripletCount += 1;
    row.set(triplet.col, (existing ?? 0) + triplet.value);
  }

  const rowPointers = new Array<number>(input.rowCount + 1).fill(0);
  const columnIndices: number[] = [];
  const values: number[] = [];
  for (let rowIndex = 0; rowIndex < input.rowCount; rowIndex += 1) {
    const rowEntries = Array.from(rows[rowIndex].entries())
      .filter(([, value]) => Math.abs(value) > dropTolerance)
      .sort(([left], [right]) => left - right);
    for (const [col, value] of rowEntries) {
      columnIndices.push(col);
      values.push(value);
    }
    rowPointers[rowIndex + 1] = columnIndices.length;
  }

  return {
    schemaVersion: 'fem-sparse-csr-matrix.v1',
    rowCount: input.rowCount,
    colCount: input.colCount,
    rowPointers,
    columnIndices,
    values,
    nonzeroCount: values.length,
    duplicateTripletCount,
    droppedEntryCount,
  };
}

export function csrMatVec(matrix: FemSparseCsrMatrix, vector: readonly number[]): number[] {
  if (matrix.schemaVersion !== 'fem-sparse-csr-matrix.v1') {
    throw new Error('matrix.schemaVersion must be fem-sparse-csr-matrix.v1.');
  }
  if (vector.length !== matrix.colCount) {
    throw new Error(`CSR vector length ${vector.length} does not match matrix colCount ${matrix.colCount}.`);
  }
  if (matrix.rowPointers.length !== matrix.rowCount + 1) {
    throw new Error('CSR rowPointers length is inconsistent with rowCount.');
  }
  if (matrix.columnIndices.length !== matrix.values.length) {
    throw new Error('CSR columnIndices length must match values length.');
  }
  const output = new Array<number>(matrix.rowCount).fill(0);
  for (let row = 0; row < matrix.rowCount; row += 1) {
    const start = matrix.rowPointers[row];
    const end = matrix.rowPointers[row + 1];
    if (start > end || start < 0 || end > matrix.values.length) {
      throw new Error(`CSR rowPointers are invalid at row ${row}.`);
    }
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const col = matrix.columnIndices[index];
      if (!Number.isInteger(col) || col < 0 || col >= matrix.colCount) {
        throw new Error(`CSR column index ${index} is outside matrix colCount.`);
      }
      const value = matrix.values[index];
      assertFinite(value, `matrix.values.${index}`);
      sum += value * vector[col];
    }
    output[row] = sum;
  }
  return output;
}

function residual(matrix: FemSparseCsrMatrix, x: readonly number[], rhs: readonly number[]): number[] {
  const ax = csrMatVec(matrix, x);
  return rhs.map((value, index) => value - ax[index]);
}

function diagonal(matrix: FemSparseCsrMatrix): number[] {
  const diag = new Array<number>(matrix.rowCount).fill(0);
  for (let row = 0; row < matrix.rowCount; row += 1) {
    for (let index = matrix.rowPointers[row]; index < matrix.rowPointers[row + 1]; index += 1) {
      if (matrix.columnIndices[index] === row) {
        diag[row] += matrix.values[index];
      }
    }
  }
  return diag;
}

export function solveCsrConjugateGradient(
  matrix: FemSparseCsrMatrix,
  rhs: readonly number[],
  options: FemCsrConjugateGradientOptions = {},
): FemCsrConjugateGradientResult {
  if (matrix.rowCount !== matrix.colCount) {
    throw new Error('Conjugate Gradient requires a square CSR matrix.');
  }
  if (rhs.length !== matrix.rowCount) {
    throw new Error(`CSR rhs length ${rhs.length} does not match matrix rowCount ${matrix.rowCount}.`);
  }
  const tolerance = options.tolerance ?? 1e-10;
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error('tolerance must be a finite positive number.');
  }
  const maxIterations = options.maxIterations ?? Math.max(100, matrix.rowCount * 10);
  assertPositiveInteger(maxIterations, 'maxIterations');
  const preconditioner = options.preconditioner ?? 'jacobi';
  if (preconditioner !== 'jacobi' && preconditioner !== 'none') {
    throw new Error('preconditioner must be jacobi or none.');
  }
  const x = options.initialGuess != null ? [...options.initialGuess] : new Array<number>(rhs.length).fill(0);
  if (x.length !== rhs.length) {
    throw new Error(`initialGuess length ${x.length} does not match rhs length ${rhs.length}.`);
  }
  for (const [index, value] of rhs.entries()) assertFinite(value, `rhs.${index}`);
  for (const [index, value] of x.entries()) assertFinite(value, `initialGuess.${index}`);

  const rhsNorm = Math.max(vectorNorm(rhs), 1);
  let r = residual(matrix, x, rhs);
  const initialResidualNorm = vectorNorm(r);
  if (initialResidualNorm / rhsNorm <= tolerance) {
    return {
      schemaVersion: 'fem-csr-conjugate-gradient-result.v1',
      solution: x,
      converged: true,
      iterations: 0,
      tolerance,
      maxIterations,
      initialResidualNorm,
      finalResidualNorm: initialResidualNorm,
      residualNormRatio: initialResidualNorm / rhsNorm,
      rhsNorm,
      correctionNorm: vectorNorm(x),
      preconditioner,
    };
  }

  const diag = preconditioner === 'jacobi' ? diagonal(matrix) : new Array<number>(matrix.rowCount).fill(1);
  if (preconditioner === 'jacobi' && diag.some((value) => !Number.isFinite(value) || value <= 0)) {
    return {
      schemaVersion: 'fem-csr-conjugate-gradient-result.v1',
      solution: x,
      converged: false,
      iterations: 0,
      tolerance,
      maxIterations,
      initialResidualNorm,
      finalResidualNorm: initialResidualNorm,
      residualNormRatio: initialResidualNorm / rhsNorm,
      rhsNorm,
      correctionNorm: vectorNorm(x),
      preconditioner,
      failureReason: 'zero_or_negative_preconditioner_diagonal',
    };
  }

  let z = r.map((value, index) => value / diag[index]);
  let p = [...z];
  let rz = dot(r, z);
  if (!Number.isFinite(rz) || rz <= 0) {
    return {
      schemaVersion: 'fem-csr-conjugate-gradient-result.v1',
      solution: x,
      converged: false,
      iterations: 0,
      tolerance,
      maxIterations,
      initialResidualNorm,
      finalResidualNorm: initialResidualNorm,
      residualNormRatio: initialResidualNorm / rhsNorm,
      rhsNorm,
      correctionNorm: vectorNorm(x),
      preconditioner,
      failureReason: 'singular_or_indefinite_matrix',
    };
  }

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const ap = csrMatVec(matrix, p);
    const denominator = dot(p, ap);
    if (!Number.isFinite(denominator) || denominator <= 0) {
      const finalResidualNorm = vectorNorm(r);
      return {
        schemaVersion: 'fem-csr-conjugate-gradient-result.v1',
        solution: x,
        converged: false,
        iterations: iteration - 1,
        tolerance,
        maxIterations,
        initialResidualNorm,
        finalResidualNorm,
        residualNormRatio: finalResidualNorm / rhsNorm,
        rhsNorm,
        correctionNorm: vectorNorm(x),
        preconditioner,
        failureReason: 'singular_or_indefinite_matrix',
      };
    }
    const alpha = rz / denominator;
    for (let index = 0; index < x.length; index += 1) {
      x[index] += alpha * p[index];
      r[index] -= alpha * ap[index];
    }
    const finalResidualNorm = vectorNorm(r);
    if (finalResidualNorm / rhsNorm <= tolerance) {
      return {
        schemaVersion: 'fem-csr-conjugate-gradient-result.v1',
        solution: x,
        converged: true,
        iterations: iteration,
        tolerance,
        maxIterations,
        initialResidualNorm,
        finalResidualNorm,
        residualNormRatio: finalResidualNorm / rhsNorm,
        rhsNorm,
        correctionNorm: vectorNorm(x),
        preconditioner,
      };
    }
    z = r.map((value, index) => value / diag[index]);
    const nextRz = dot(r, z);
    if (!Number.isFinite(nextRz) || nextRz <= 0) {
      return {
        schemaVersion: 'fem-csr-conjugate-gradient-result.v1',
        solution: x,
        converged: false,
        iterations: iteration,
        tolerance,
        maxIterations,
        initialResidualNorm,
        finalResidualNorm,
        residualNormRatio: finalResidualNorm / rhsNorm,
        rhsNorm,
        correctionNorm: vectorNorm(x),
        preconditioner,
        failureReason: 'singular_or_indefinite_matrix',
      };
    }
    const beta = nextRz / rz;
    p = z.map((value, index) => value + beta * p[index]);
    rz = nextRz;
  }

  const finalResidualNorm = vectorNorm(r);
  return {
    schemaVersion: 'fem-csr-conjugate-gradient-result.v1',
    solution: x,
    converged: false,
    iterations: maxIterations,
    tolerance,
    maxIterations,
    initialResidualNorm,
    finalResidualNorm,
    residualNormRatio: finalResidualNorm / rhsNorm,
    rhsNorm,
    correctionNorm: vectorNorm(x),
    preconditioner,
    failureReason: 'max_iterations',
  };
}
