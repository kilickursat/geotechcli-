import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface VisionImagePreprocessResult {
  buffer: Buffer;
  mimeType: string;
  transformed: boolean;
  warnings: string[];
  preprocessing: VisionImagePreprocessMetadata;
}

export type VisionImagePreprocessPolicy = 'none' | 'ocr-optimized';

export const VISION_IMAGE_PREPROCESS_METADATA_SCHEMA_VERSION = 1;
export const VISION_IMAGE_PREPROCESS_PIPELINE_VERSION = 'vision-image-preprocess-v2';

export interface VisionPreprocessImageMetadata {
  mimeType: string;
  byteLength: number;
  width?: number;
  height?: number;
}

export interface VisionPreprocessRegionMetadata {
  id: string;
  source: 'preprocessing';
  label: string;
  bbox2d?: [number, number, number, number];
  coverageRatio?: number;
  quality?: VisionPreprocessRegionQualityMetadata;
  asset?: VisionPreprocessRegionAssetMetadata;
}

export interface VisionPreprocessRegionAssetMetadata {
  mimeType: string;
  byteLength: number;
  sha256: string;
  width?: number;
  height?: number;
  normalized?: boolean;
  cacheRelativePath?: string;
  dataBase64?: string;
}

export interface VisionPreprocessDeskewMetadata {
  method: 'projection-profile';
  angleDeg: number;
  confidence: number;
  applied: boolean;
}

export interface VisionPreprocessRegionQualityMetadata {
  score: number;
  darkPixelRatio: number;
  lineDensity: number;
  coverageRatio: number;
  warnings: string[];
}

export interface VisionImagePreprocessQualityMetadata {
  score: number;
  contentCoverageRatio: number;
  darkPixelRatio: number;
  regionCoverageRatio: number;
  regionCount: number;
  cropAssetCount: number;
  deskew: VisionPreprocessDeskewMetadata;
  warnings: string[];
}

export interface VisionImagePreprocessMetadata {
  schemaVersion: typeof VISION_IMAGE_PREPROCESS_METADATA_SCHEMA_VERSION;
  pipelineVersion: string;
  policy: VisionImagePreprocessPolicy;
  transformed: boolean;
  input: VisionPreprocessImageMetadata;
  output: VisionPreprocessImageMetadata;
  operations: string[];
  regions: VisionPreprocessRegionMetadata[];
  quality?: VisionImagePreprocessQualityMetadata;
  warnings: string[];
}

export interface PdfPageRasterRenderResult {
  buffer: Buffer;
  mimeType: 'image/png';
  width: number;
  height: number;
  warnings: string[];
  preprocessing: VisionImagePreprocessMetadata;
}

interface PdfRendererModule {
  getDocument(options: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getViewport(options: { scale: number }): { width: number; height: number };
        render(options: Record<string, unknown>): { promise: Promise<void> };
      }>;
      destroy(): Promise<void>;
    }>;
    destroy(): void;
  };
}

type CanvasLike = {
  width: number;
  height: number;
  getContext(type: '2d'): unknown;
  toBuffer(mimeType: 'image/png'): Buffer;
};

type CreateCanvasLike = (width: number, height: number) => CanvasLike;
type PdfTextContentItem = { str?: string };

const require = createRequire(import.meta.url);

let cachedPdfRendererModule: Promise<PdfRendererModule> | null = null;
let cachedCanvasFactory: Promise<CreateCanvasLike> | null = null;
let cachedStandardFontDataUrl: string | null = null;
let cachedPdfRendererUrl: string | null = null;
let cachedCanvasModuleUrl: string | null = null;

async function loadSharp(): Promise<any | null> {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function readImageMetadata(
  sharp: any | null,
  buffer: Uint8Array | Buffer,
  mimeType: string,
): Promise<VisionPreprocessImageMetadata> {
  const base = {
    mimeType,
    byteLength: Buffer.byteLength(Buffer.from(buffer)),
  };
  if (!sharp) {
    return base;
  }

  try {
    const metadata = await sharp(Buffer.from(buffer), { pages: 1 }).metadata();
    return {
      ...base,
      ...(Number.isFinite(metadata.width) ? { width: metadata.width } : {}),
      ...(Number.isFinite(metadata.height) ? { height: metadata.height } : {}),
    };
  } catch {
    return base;
  }
}

function buildPreprocessingMetadata(input: {
  policy: VisionImagePreprocessPolicy;
  transformed: boolean;
  input: VisionPreprocessImageMetadata;
  output: VisionPreprocessImageMetadata;
  operations: string[];
  regions?: VisionPreprocessRegionMetadata[];
  quality?: VisionImagePreprocessQualityMetadata;
  warnings: string[];
}): VisionImagePreprocessMetadata {
  const regions = input.regions?.length
    ? input.regions
    : [{
        id: input.transformed ? 'normalized-full-page' : 'original-full-page',
        source: 'preprocessing' as const,
        label: input.transformed ? 'normalized full page' : 'original full page',
        bbox2d: [0, 0, 1, 1] as [number, number, number, number],
        coverageRatio: 1,
      }];
  return {
    schemaVersion: VISION_IMAGE_PREPROCESS_METADATA_SCHEMA_VERSION,
    pipelineVersion: VISION_IMAGE_PREPROCESS_PIPELINE_VERSION,
    policy: input.policy,
    transformed: input.transformed,
    input: input.input,
    output: input.output,
    operations: [...new Set(input.operations.map((operation) => operation.trim()).filter(Boolean))],
    regions,
    ...(input.quality ? { quality: input.quality } : {}),
    warnings: [...new Set(input.warnings.map((warning) => warning.trim()).filter(Boolean))],
  };
}

export function resolveVisionImagePreprocessPolicy(
  value: string | null | undefined = process.env.GEOTECHCLI_PREPROCESSING_MODE,
): VisionImagePreprocessPolicy {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'none' ? 'none' : 'ocr-optimized';
}

interface RawPreprocessImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
  rowDarkCounts: number[];
  colDarkCounts: number[];
  darkCount: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DEFAULT_DESKEW: VisionPreprocessDeskewMetadata = {
  method: 'projection-profile',
  angleDeg: 0,
  confidence: 0,
  applied: false,
};

async function readRawPreprocessImage(sharp: any, buffer: Buffer): Promise<RawPreprocessImage | null> {
  const { data, info } = await sharp(buffer, { pages: 1 })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = Number(info.width);
  const height = Number(info.height);
  const channels = Number(info.channels) || 1;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32) {
    return null;
  }

  const darkThreshold = 238;
  const rowDarkCounts = new Array<number>(height).fill(0);
  const colDarkCounts = new Array<number>(width).fill(0);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let darkCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const value = data[offset] ?? 255;
      if (value < darkThreshold) {
        rowDarkCounts[y] += 1;
        colDarkCounts[x] += 1;
        darkCount += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return {
    data,
    width,
    height,
    channels,
    rowDarkCounts,
    colDarkCounts,
    darkCount,
    minX,
    minY,
    maxX,
    maxY,
  };
}

async function estimateDeskewCorrection(
  sharp: any,
  buffer: Buffer,
): Promise<VisionPreprocessDeskewMetadata> {
  try {
    const raw = await readRawPreprocessImage(sharp, buffer);
    if (!raw || raw.darkCount < 80 || raw.maxX <= raw.minX || raw.maxY <= raw.minY) {
      return DEFAULT_DESKEW;
    }

    const points: Array<[number, number]> = [];
    const targetSamples = 75000;
    const stride = Math.max(1, Math.ceil(Math.sqrt((raw.width * raw.height) / targetSamples)));
    for (let y = raw.minY; y <= raw.maxY; y += stride) {
      for (let x = raw.minX; x <= raw.maxX; x += stride) {
        const value = raw.data[(y * raw.width + x) * raw.channels] ?? 255;
        if (value < 210) {
          points.push([x - raw.width / 2, y - raw.height / 2]);
        }
      }
    }
    if (points.length < 80) {
      return DEFAULT_DESKEW;
    }

    let bestAngle = 0;
    let bestScore = -Infinity;
    let secondBestScore = -Infinity;
    for (let angle = -4; angle <= 4.0001; angle += 0.25) {
      const radians = (angle * Math.PI) / 180;
      const sin = Math.sin(radians);
      const cos = Math.cos(radians);
      const rowBins = new Map<number, number>();
      const colBins = new Map<number, number>();
      for (const [x, y] of points) {
        const rotatedX = x * cos - y * sin;
        const rotatedY = x * sin + y * cos;
        const rowBin = Math.round(rotatedY / 2);
        const colBin = Math.round(rotatedX / 2);
        rowBins.set(rowBin, (rowBins.get(rowBin) ?? 0) + 1);
        colBins.set(colBin, (colBins.get(colBin) ?? 0) + 1);
      }
      let score = 0;
      for (const count of rowBins.values()) {
        score += count * count;
      }
      for (const count of colBins.values()) {
        score += count * count;
      }
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestAngle = angle;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    const confidence = bestScore > 0
      ? clampRatio((bestScore - Math.max(0, secondBestScore)) / bestScore * 8)
      : 0;
    const applied = Math.abs(bestAngle) >= 0.35 && (confidence >= 0.01 || Math.abs(bestAngle) >= 1);
    return {
      method: 'projection-profile',
      angleDeg: roundAngle(applied ? bestAngle : 0),
      confidence: roundRatio(confidence),
      applied,
    };
  } catch {
    return DEFAULT_DESKEW;
  }
}

async function detectPreprocessingRegions(
  sharp: any,
  buffer: Buffer,
): Promise<VisionPreprocessRegionMetadata[]> {
  const regions: VisionPreprocessRegionMetadata[] = [{
    id: 'normalized-full-page',
    source: 'preprocessing',
    label: 'normalized full page',
    bbox2d: [0, 0, 1, 1],
    coverageRatio: 1,
  }];

  try {
    const raw = await readRawPreprocessImage(sharp, buffer);
    if (!raw || raw.darkCount === 0 || raw.maxX <= raw.minX || raw.maxY <= raw.minY) {
      return scorePreprocessRegions(raw, regions);
    }

    const contentRegion = buildRegionFromPixels(
      'content-bounding-box',
      'detected content bounding box',
      raw.minX,
      raw.minY,
      raw.maxX,
      raw.maxY,
      raw.width,
      raw.height,
    );
    if (contentRegion.coverageRatio != null && contentRegion.coverageRatio < 0.96) {
      regions.push(contentRegion);
    }

    const panelRegions = buildTableLogPanelCandidates(raw);
    for (const region of panelRegions) {
      if (!regions.some((existing) => regionOverlap(existing, region) > 0.88)) {
        regions.push(region);
      }
    }

    return scorePreprocessRegions(raw, regions);
  } catch {
    return regions;
  }
}

function buildTableLogPanelCandidates(raw: RawPreprocessImage): VisionPreprocessRegionMetadata[] {
  const rowThreshold = Math.max(24, Math.round(raw.width * 0.07));
  const colThreshold = Math.max(24, Math.round(raw.height * 0.055));
  const heavyRows = raw.rowDarkCounts
    .map((count, index) => ({ count, index }))
    .filter((row) => row.count >= rowThreshold)
    .map((row) => row.index);
  const heavyCols = raw.colDarkCounts
    .map((count, index) => ({ count, index }))
    .filter((col) => col.count >= colThreshold)
    .map((col) => col.index);

  if (heavyRows.length < 4 || heavyCols.length < 3) {
    return [];
  }

  const rowSpan = mergeLineClusters(groupContiguous(heavyRows, Math.max(3, Math.round(raw.height * 0.004))), Math.round(raw.height * 0.18))
    .reduce<{ start: number; end: number; count: number } | null>((span, group) => {
      if (!span) return { ...group };
      return {
        start: Math.min(span.start, group.start),
        end: Math.max(span.end, group.end),
        count: span.count + group.count,
      };
    }, null);
  const colClusters = mergeLineClusters(groupContiguous(heavyCols, Math.max(3, Math.round(raw.width * 0.004))), Math.round(raw.width * 0.14))
    .filter((cluster) => cluster.count >= 3 || cluster.end - cluster.start >= raw.width * 0.08);
  if (!rowSpan || colClusters.length === 0) {
    return [];
  }

  const full = buildRegionFromPixels(
    'table-log-panel-candidate',
    'detected table/log panel candidate',
    Math.min(...heavyCols),
    Math.min(...heavyRows),
    Math.max(...heavyCols),
    Math.max(...heavyRows),
    raw.width,
    raw.height,
    8,
  );

  const candidates = [full];
  for (const [index, cluster] of colClusters.entries()) {
    const width = cluster.end - cluster.start;
    const height = rowSpan.end - rowSpan.start;
    const coverage = (width * height) / Math.max(1, raw.width * raw.height);
    if (coverage < 0.025 || coverage > 0.98) {
      continue;
    }
    const tall = height / Math.max(1, width) >= 1.35;
    candidates.push(buildRegionFromPixels(
      tall ? `borehole-log-panel-candidate-${index + 1}` : `table-log-panel-candidate-${index + 2}`,
      tall ? 'detected borehole/log strip candidate' : 'detected table/log panel candidate',
      cluster.start,
      rowSpan.start,
      cluster.end,
      rowSpan.end,
      raw.width,
      raw.height,
      10,
    ));
  }

  const deduped: VisionPreprocessRegionMetadata[] = [];
  for (const candidate of candidates) {
    const coverage = candidate.coverageRatio ?? 0;
    if (coverage < 0.025 || coverage > 0.98) {
      continue;
    }
    if (!deduped.some((existing) => regionOverlap(existing, candidate) > 0.88)) {
      deduped.push(candidate);
    }
  }
  return deduped.slice(0, 5);
}

function scorePreprocessRegions(
  raw: RawPreprocessImage | null,
  regions: VisionPreprocessRegionMetadata[],
): VisionPreprocessRegionMetadata[] {
  if (!raw) {
    return regions;
  }
  return regions.map((region) => ({
    ...region,
    quality: scoreRegionQuality(raw, region),
  }));
}

async function attachRegionAssets(
  sharp: any,
  buffer: Buffer,
  regions: VisionPreprocessRegionMetadata[],
): Promise<VisionPreprocessRegionMetadata[]> {
  const metadata = await readImageMetadata(sharp, buffer, 'image/png');
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 16 || height < 16) {
    return regions;
  }

  const cropped = await Promise.all(regions.map(async (region) => {
    if (!region.bbox2d || region.id === 'normalized-full-page') {
      return region;
    }
    const left = Math.max(0, Math.floor(region.bbox2d[0] * width));
    const top = Math.max(0, Math.floor(region.bbox2d[1] * height));
    const right = Math.min(width, Math.ceil(region.bbox2d[2] * width));
    const bottom = Math.min(height, Math.ceil(region.bbox2d[3] * height));
    const cropWidth = Math.max(0, right - left);
    const cropHeight = Math.max(0, bottom - top);
    if (cropWidth < 16 || cropHeight < 16) {
      return region;
    }

    try {
      const crop = await sharp(buffer, { pages: 1 })
        .extract({
          left,
          top,
          width: cropWidth,
          height: cropHeight,
        })
        .resize({
          width: 1400,
          height: 1400,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
      const cropMetadata = await readImageMetadata(sharp, crop, 'image/png');
      return {
        ...region,
        asset: {
          mimeType: 'image/png',
          byteLength: crop.length,
          sha256: createHash('sha256').update(crop).digest('hex'),
          ...(cropMetadata.width != null ? { width: cropMetadata.width } : {}),
          ...(cropMetadata.height != null ? { height: cropMetadata.height } : {}),
          normalized: true,
          dataBase64: crop.toString('base64'),
        },
      };
    } catch {
      return region;
    }
  }));

  return cropped;
}

async function scoreImagePreprocessQuality(
  sharp: any,
  buffer: Buffer,
  regions: VisionPreprocessRegionMetadata[],
  deskew: VisionPreprocessDeskewMetadata,
): Promise<VisionImagePreprocessQualityMetadata> {
  try {
    const raw = await readRawPreprocessImage(sharp, buffer);
    if (!raw) {
      return {
        score: 0,
        contentCoverageRatio: 0,
        darkPixelRatio: 0,
        regionCoverageRatio: 0,
        regionCount: 0,
        cropAssetCount: 0,
        deskew,
        warnings: ['image-quality-unavailable'],
      };
    }

    const pageArea = Math.max(1, raw.width * raw.height);
    const darkPixelRatio = raw.darkCount / pageArea;
    const contentCoverageRatio = raw.maxX > raw.minX && raw.maxY > raw.minY
      ? ((raw.maxX - raw.minX + 1) * (raw.maxY - raw.minY + 1)) / pageArea
      : 0;
    const cropRegions = regions.filter((region) => region.id !== 'normalized-full-page' && region.id !== 'original-full-page');
    const regionCoverageRatio = Math.min(1, cropRegions.reduce((sum, region) => sum + (region.coverageRatio ?? 0), 0));
    const cropAssetCount = cropRegions.filter((region) => region.asset).length;
    const warnings = [
      darkPixelRatio < 0.002 ? 'very-low-content-density' : null,
      contentCoverageRatio < 0.03 ? 'low-page-content-coverage' : null,
      contentCoverageRatio > 0.97 ? 'content-nearly-full-page' : null,
      cropRegions.length === 0 ? 'no-log-or-table-crops-detected' : null,
      cropRegions.some((region) => (region.quality?.score ?? 1) < 0.45) ? 'low-quality-region-crop' : null,
    ].filter((value): value is string => value != null);
    let score = 0.45;
    score += Math.min(0.2, darkPixelRatio * 3);
    score += contentCoverageRatio >= 0.03 && contentCoverageRatio <= 0.97 ? 0.12 : 0;
    score += Math.min(0.12, regionCoverageRatio * 0.45);
    score += Math.min(0.08, cropRegions.length * 0.02);
    score += cropAssetCount > 0 ? 0.08 : 0;
    score += deskew.applied ? 0.04 : 0;
    score -= Math.min(0.18, warnings.length * 0.045);

    return {
      score: roundRatio(score),
      contentCoverageRatio: roundRatio(contentCoverageRatio),
      darkPixelRatio: roundRatio(darkPixelRatio),
      regionCoverageRatio: roundRatio(regionCoverageRatio),
      regionCount: cropRegions.length,
      cropAssetCount,
      deskew,
      warnings,
    };
  } catch {
    return {
      score: 0,
      contentCoverageRatio: 0,
      darkPixelRatio: 0,
      regionCoverageRatio: 0,
      regionCount: 0,
      cropAssetCount: 0,
      deskew,
      warnings: ['image-quality-scoring-failed'],
    };
  }
}

function buildRegionFromPixels(
  id: string,
  label: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  width: number,
  height: number,
  padding = 4,
): VisionPreprocessRegionMetadata {
  const left = clampRatio((minX - padding) / width);
  const top = clampRatio((minY - padding) / height);
  const right = clampRatio((maxX + 1 + padding) / width);
  const bottom = clampRatio((maxY + 1 + padding) / height);
  const area = Math.max(0, right - left) * Math.max(0, bottom - top);
  return {
    id,
    source: 'preprocessing',
    label,
    bbox2d: [roundRatio(left), roundRatio(top), roundRatio(right), roundRatio(bottom)],
    coverageRatio: roundRatio(area),
  };
}

function scoreRegionQuality(
  raw: RawPreprocessImage,
  region: VisionPreprocessRegionMetadata,
): VisionPreprocessRegionQualityMetadata {
  const bbox = region.bbox2d ?? [0, 0, 1, 1];
  const left = Math.max(0, Math.floor(bbox[0] * raw.width));
  const top = Math.max(0, Math.floor(bbox[1] * raw.height));
  const right = Math.min(raw.width, Math.ceil(bbox[2] * raw.width));
  const bottom = Math.min(raw.height, Math.ceil(bbox[3] * raw.height));
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const area = Math.max(1, width * height);
  let dark = 0;
  let rowHits = 0;
  let colHits = 0;

  for (let y = top; y < bottom; y += 1) {
    let rowDark = 0;
    for (let x = left; x < right; x += 1) {
      const value = raw.data[(y * raw.width + x) * raw.channels] ?? 255;
      if (value < 238) {
        dark += 1;
        rowDark += 1;
      }
    }
    if (width > 0 && rowDark / width >= 0.18) {
      rowHits += 1;
    }
  }

  for (let x = left; x < right; x += 1) {
    let colDark = 0;
    for (let y = top; y < bottom; y += 1) {
      const value = raw.data[(y * raw.width + x) * raw.channels] ?? 255;
      if (value < 238) {
        colDark += 1;
      }
    }
    if (height > 0 && colDark / height >= 0.12) {
      colHits += 1;
    }
  }

  const darkPixelRatio = dark / area;
  const lineDensity = Math.min(1, (rowHits + colHits) / Math.max(1, width + height));
  const coverageRatio = Math.max(0, Math.min(1, region.coverageRatio ?? area / Math.max(1, raw.width * raw.height)));
  const warnings = [
    darkPixelRatio < 0.002 ? 'low-region-content-density' : null,
    coverageRatio < 0.02 ? 'small-region-coverage' : null,
    coverageRatio > 0.98 ? 'region-covers-full-page' : null,
    region.id.includes('table') || region.id.includes('log')
      ? lineDensity < 0.004 ? 'weak-table-line-structure' : null
      : null,
  ].filter((value): value is string => value != null);
  let score = 0.35;
  score += Math.min(0.25, darkPixelRatio * 4);
  score += Math.min(0.25, lineDensity * 35);
  score += coverageRatio >= 0.02 && coverageRatio <= 0.95 ? 0.12 : 0;
  score -= Math.min(0.16, warnings.length * 0.04);

  return {
    score: roundRatio(score),
    darkPixelRatio: roundRatio(darkPixelRatio),
    lineDensity: roundRatio(lineDensity),
    coverageRatio: roundRatio(coverageRatio),
    warnings,
  };
}

function groupContiguous(values: number[], maxGap = 1): Array<{ start: number; end: number; count: number }> {
  if (values.length === 0) {
    return [];
  }
  const sorted = [...new Set(values)].sort((left, right) => left - right);
  const groups: Array<{ start: number; end: number; count: number }> = [];
  let start = sorted[0]!;
  let end = start;
  let count = 1;
  for (const value of sorted.slice(1)) {
    if (value - end <= maxGap + 1) {
      end = value;
      count += 1;
      continue;
    }
    groups.push({ start, end, count });
    start = value;
    end = value;
    count = 1;
  }
  groups.push({ start, end, count });
  return groups;
}

function mergeLineClusters(
  groups: Array<{ start: number; end: number; count: number }>,
  maxGap: number,
): Array<{ start: number; end: number; count: number }> {
  if (groups.length === 0) {
    return [];
  }
  const merged: Array<{ start: number; end: number; count: number }> = [];
  let current = { ...groups[0]! };
  for (const group of groups.slice(1)) {
    if (group.start - current.end <= maxGap) {
      current = {
        start: current.start,
        end: group.end,
        count: current.count + group.count,
      };
      continue;
    }
    merged.push(current);
    current = { ...group };
  }
  merged.push(current);

  return merged;
}

function regionOverlap(left: VisionPreprocessRegionMetadata, right: VisionPreprocessRegionMetadata): number {
  if (!left.bbox2d || !right.bbox2d) {
    return 0;
  }
  const x1 = Math.max(left.bbox2d[0], right.bbox2d[0]);
  const y1 = Math.max(left.bbox2d[1], right.bbox2d[1]);
  const x2 = Math.min(left.bbox2d[2], right.bbox2d[2]);
  const y2 = Math.min(left.bbox2d[3], right.bbox2d[3]);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const leftArea = Math.max(0, left.bbox2d[2] - left.bbox2d[0]) * Math.max(0, left.bbox2d[3] - left.bbox2d[1]);
  const rightArea = Math.max(0, right.bbox2d[2] - right.bbox2d[0]) * Math.max(0, right.bbox2d[3] - right.bbox2d[1]);
  const union = leftArea + rightArea - intersection;
  return union > 0 ? intersection / union : 0;
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundAngle(value: number): number {
  return Math.round(value * 100) / 100;
}

async function loadPdfRendererModule(): Promise<PdfRendererModule> {
  if (!cachedPdfRendererUrl) {
    const pdfjsPackagePath = require.resolve('pdfjs-dist/package.json');
    cachedPdfRendererUrl = pathToFileURL(
      join(dirname(pdfjsPackagePath), 'legacy', 'build', 'pdf.mjs'),
    ).href;
  }

  cachedPdfRendererModule ??= import(cachedPdfRendererUrl) as Promise<PdfRendererModule>;
  return cachedPdfRendererModule;
}

async function loadCanvasFactory(): Promise<CreateCanvasLike> {
  if (!cachedCanvasModuleUrl) {
    const canvasSpecifier = ['@napi-rs', 'canvas'].join('/');
    cachedCanvasModuleUrl = pathToFileURL(require.resolve(canvasSpecifier)).href;
  }

  cachedCanvasFactory ??= import(/* webpackIgnore: true */ cachedCanvasModuleUrl)
    .then((mod) => (mod.createCanvas ?? mod.default?.createCanvas) as CreateCanvasLike);
  return cachedCanvasFactory;
}

function resolvePdfStandardFontDataUrl(): string {
  if (cachedStandardFontDataUrl) {
    return cachedStandardFontDataUrl;
  }

  const pdfjsPackagePath = require.resolve('pdfjs-dist/package.json');
  cachedStandardFontDataUrl = `${join(dirname(pdfjsPackagePath), 'standard_fonts').replaceAll('\\', '/')}/`;
  return cachedStandardFontDataUrl;
}

export async function encodeRawRasterToPng(
  pixels: Uint8Array,
  details: { width: number; height: number; channels: number },
): Promise<Buffer> {
  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error('sharp is unavailable for raw raster encoding.');
  }

  return sharp(Buffer.from(pixels), {
    raw: {
      width: details.width,
      height: details.height,
      channels: details.channels,
    },
  })
    .png()
    .toBuffer();
}

export async function preprocessVisionImageBuffer(
  buffer: Uint8Array,
  mimeType: string,
  policy: VisionImagePreprocessPolicy = resolveVisionImagePreprocessPolicy(),
): Promise<VisionImagePreprocessResult> {
  if (policy === 'none') {
    const input = await readImageMetadata(null, buffer, mimeType);
    const metadata = buildPreprocessingMetadata({
      policy,
      transformed: false,
      input,
      output: input,
      operations: [],
      warnings: [],
    });
    return {
      buffer: Buffer.from(buffer),
      mimeType,
      transformed: false,
      warnings: [],
      preprocessing: metadata,
    };
  }

  const sharp = await loadSharp();
  const input = await readImageMetadata(sharp, buffer, mimeType);
  if (!sharp) {
    const warnings = ['Image preprocessing skipped because sharp is unavailable in this runtime.'];
    return {
      buffer: Buffer.from(buffer),
      mimeType,
      transformed: false,
      warnings,
      preprocessing: buildPreprocessingMetadata({
        policy,
        transformed: false,
        input,
        output: input,
        operations: [],
        warnings,
      }),
    };
  }

  try {
    let working = await sharp(Buffer.from(buffer), { pages: 1 })
      .rotate()
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();
    const operations = [
      'auto-orient',
      'flatten-white-background',
    ];
    const deskew = await estimateDeskewCorrection(sharp, working);
    if (deskew.applied) {
      working = await sharp(working, { pages: 1 })
        .rotate(deskew.angleDeg, { background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
      operations.push(`deskew-angle-${deskew.angleDeg.toFixed(2)}deg`);
    } else {
      operations.push('deskew-not-applied');
    }

    const output = await sharp(working, { pages: 1 })
      .trim({
        background: '#ffffff',
        threshold: 10,
      })
      .resize({
        width: 1800,
        height: 1800,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
    const outputMetadata = await readImageMetadata(sharp, output, 'image/png');
    operations.push(
      'trim-white-margins-threshold-10',
      'resize-inside-1800-no-enlarge',
      'grayscale',
      'normalize-contrast',
      'sharpen',
      'encode-png',
    );
    let regions = await detectPreprocessingRegions(sharp, output);
    if (regions.some((region) => region.id === 'content-bounding-box')) {
      operations.push('detect-content-bounding-box');
    }
    if (regions.some((region) => region.id.startsWith('table-log-panel-candidate'))) {
      operations.push('detect-table-log-panel-candidate');
    }
    if (regions.some((region) => region.id.startsWith('borehole-log-panel-candidate'))) {
      operations.push('detect-borehole-log-panel-candidate');
    }
    if (regions.filter((region) => region.id.includes('panel-candidate')).length > 1) {
      operations.push('detect-multiple-table-log-candidates');
    }
    regions = await attachRegionAssets(sharp, output, regions);
    if (regions.some((region) => region.asset)) {
      operations.push('persist-region-crop-assets');
      operations.push('normalize-region-crop-assets');
    }
    if (regions.some((region) => region.quality)) {
      operations.push('score-preprocessing-regions');
    }
    const quality = await scoreImagePreprocessQuality(sharp, output, regions, deskew);

    return {
      buffer: output,
      mimeType: 'image/png',
      transformed: true,
      warnings: [],
      preprocessing: buildPreprocessingMetadata({
        policy,
        transformed: true,
        input,
        output: outputMetadata,
        operations,
        regions,
        quality,
        warnings: [],
      }),
    };
  } catch (error) {
    const warnings = [
      `Image preprocessing skipped: ${error instanceof Error ? error.message : String(error)}`,
    ];
    return {
      buffer: Buffer.from(buffer),
      mimeType,
      transformed: false,
      warnings,
      preprocessing: buildPreprocessingMetadata({
        policy,
        transformed: false,
        input,
        output: input,
        operations: [],
        warnings,
      }),
    };
  }
}

export async function renderPdfPageToImageBuffer(
  buffer: Uint8Array,
  pageNumber = 1,
  options?: {
    scale?: number;
    preprocessPolicy?: VisionImagePreprocessPolicy;
  },
): Promise<PdfPageRasterRenderResult | null> {
  const renderer = await loadPdfRendererModule();
  const createCanvas = await loadCanvasFactory();
  const loadingTask = renderer.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    standardFontDataUrl: resolvePdfStandardFontDataUrl(),
  });

  let pdfDocument:
    | {
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getViewport(options: { scale: number }): { width: number; height: number };
        render(options: Record<string, unknown>): { promise: Promise<void> };
      }>;
      destroy(): Promise<void>;
    }
    | null = null;

  try {
    pdfDocument = await loadingTask.promise;
    if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      return null;
    }

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: options?.scale ?? 1.5 });
    const canvas = createCanvas(
      Math.max(1, Math.ceil(viewport.width)),
      Math.max(1, Math.ceil(viewport.height)),
    );
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const renderedBuffer = canvas.toBuffer('image/png');
    const preprocessed = await preprocessVisionImageBuffer(
      renderedBuffer,
      'image/png',
      options?.preprocessPolicy ?? resolveVisionImagePreprocessPolicy(),
    );

    return {
      buffer: preprocessed.buffer,
      mimeType: 'image/png',
      width: canvas.width,
      height: canvas.height,
      warnings: preprocessed.warnings,
      preprocessing: preprocessed.preprocessing,
    };
  } finally {
    try {
      if (pdfDocument) {
        await pdfDocument.destroy();
      } else {
        loadingTask.destroy();
      }
    } catch {
      // Ignore renderer cleanup errors.
    }
  }
}

export async function extractPdfPageTextFromBuffer(
  buffer: Uint8Array,
  pageNumber = 1,
): Promise<string | null> {
  const renderer = await loadPdfRendererModule();
  const loadingTask = renderer.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    standardFontDataUrl: resolvePdfStandardFontDataUrl(),
  });

  let pdfDocument:
    | {
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items?: PdfTextContentItem[] }>;
      }>;
      destroy(): Promise<void>;
    }
    | null = null;

  try {
    pdfDocument = await loadingTask.promise as unknown as {
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items?: PdfTextContentItem[] }>;
      }>;
      destroy(): Promise<void>;
    };
    if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      return null;
    }

    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = Array.isArray(textContent.items) ? textContent.items : [];
    const text = items
      .map((item) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text || null;
  } finally {
    try {
      await pdfDocument?.destroy();
    } catch {
      // Ignore cleanup failures from pdfjs during fallback extraction.
    }
    loadingTask.destroy();
  }
}
