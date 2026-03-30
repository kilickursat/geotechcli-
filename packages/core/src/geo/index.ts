export { calculateBearingCapacity, type BearingCapacityResult, type BearingCapacityInput } from './bearing-capacity.js';
export { classifyUSCS, classifyRMR89, classifyQSystem, type USCSResult, type RMR89Result, type QSystemResult } from './classification.js';
export { calculateLiquefaction, type LiquefactionResult } from './liquefaction.js';
export {
  calculateConsolidation,
  calculateSchmertmann,
  calculatePeckSettlement,
  type ConsolidationResult,
  type SchmertmannResult,
  type PeckSettlementResult,
} from './settlement.js';
export { predictTBMPerformance, selectTBMType, predictCutterWear } from './tunnel/index.js';
export { calculatePileCapacity, type PileCapacityResult, type PileCapacityInput } from './pile-capacity.js';
export { calculateSlopeStability, type SlopeStabilityResult, type SlopeStabilityInput } from './slope-stability.js';
export { calculateLateralEarthPressure, type LateralEarthPressureResult, type LateralEarthPressureInput } from './lateral-earth-pressure.js';
