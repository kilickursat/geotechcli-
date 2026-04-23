export { calculateBearingCapacity, type BearingCapacityResult, type BearingCapacityInput } from './bearing-capacity.js';
export {
  parseCoordinateText,
  buildBoreholeLocation,
  detectCoordinateReferenceSystem,
  transformCoordinatesToWGS84,
  type CoordinateAxis,
  type CoordinateReferenceSystemDetectionInput,
  type CoordinateTransformInput,
  type BoreholeLocationInput,
} from './coordinates.js';
export { classifyUSCS, classifyRMR89, classifyQSystem, type USCSResult, type RMR89Result, type QSystemResult } from './classification.js';
export { calculateLiquefaction, type LiquefactionResult } from './liquefaction.js';
export {
  calculateConsolidation,
  calculateSchmertmann,
  calculatePeckSettlement,
  type ConsolidationInput,
  type ConsolidationResult,
  type SchmertmannInput,
  type SchmertmannResult,
  type PeckSettlementInput,
  type PeckSettlementResult,
} from './settlement.js';
export { predictTBMPerformance, selectTBMType, predictCutterWear } from './tunnel/index.js';
export { calculatePileCapacity, type PileCapacityResult, type PileCapacityInput } from './pile-capacity.js';
export { calculateSlopeStability, type SlopeStabilityResult, type SlopeStabilityInput } from './slope-stability.js';
export { calculateLateralEarthPressure, type LateralEarthPressureResult, type LateralEarthPressureInput } from './lateral-earth-pressure.js';
export {
  calculateDupuitSeepage,
  calculateFlowNetSeepage,
  type DupuitSeepageInput,
  type FlowNetSeepageInput,
  type SeepageResult,
} from './seepage.js';

