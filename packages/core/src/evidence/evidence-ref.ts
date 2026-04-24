export type EvidenceSourceType =
  | 'workspace-file'
  | 'tabular-cell'
  | 'pdf-page'
  | 'image-region'
  | 'ingest-result'
  | 'manual-entry';

export type EvidenceMethod =
  | 'workspace-schema'
  | 'csv-sample'
  | 'xlsx-sample'
  | 'ags-signature'
  | 'pdf-text'
  | 'vision'
  | 'manual';

export interface EvidenceLocation {
  filePath: string;
  absolutePath?: string;
  sheetName?: string;
  pageNumber?: number;
  rowNumber?: number;
  columnName?: string;
  cellRef?: string;
}

export interface EvidenceRef {
  id: string;
  sourceType: EvidenceSourceType;
  sourcePath: string;
  location: EvidenceLocation;
  method: EvidenceMethod;
  confidence: number;
  rawValue?: string | number | boolean | null;
  normalizedValue?: string | number | boolean | null;
  unit?: string;
  warnings: string[];
}

export interface EvidenceBoundValue<T = string | number | boolean | null> {
  value: T;
  unit?: string;
  evidenceIds: string[];
  confidence: number;
  warnings: string[];
}

export function normalizeEvidenceConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.2;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}
