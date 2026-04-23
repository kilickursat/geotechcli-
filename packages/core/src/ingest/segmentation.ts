import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import type { PdfDocumentInspection, PdfPageClassification, PdfPageInspection } from './pdf.js';

export const HOSTED_BETA_EFFECTIVE_PAGE_LIMIT = 60;

export interface PdfPageRange {
  startPage: number;
  endPage: number;
}

export interface PdfSegmentRange extends PdfPageRange {
  pageCount: number;
  effectivePageCost: number;
}

export type IngestSegmentationMode = 'single' | 'segmented-parent' | 'segment-child';
export type IngestSegmentStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export interface IngestSegmentSummary extends PdfSegmentRange {
  segmentIndex: number;
  segmentCount: number;
  childJobId?: string;
  status?: IngestSegmentStatus;
  completedPages?: number;
  failedPages?: number;
  durationMs?: number;
}

export interface IngestSegmentationSummary {
  mode: IngestSegmentationMode;
  pageRange: [number, number];
  effectivePageLimit?: number;
  segmentCount?: number;
  segmentIndex?: number;
  parentJobId?: string;
  segments?: IngestSegmentSummary[];
}

export function pageWeightForClassification(classification: PdfPageClassification | null | undefined): number {
  return classification === 'image-only' || classification === 'text-unreadable' ? 2 : 1;
}

function cloneInspectionPage(
  page: PdfPageInspection,
  rebasedPageNumber: number,
  rebasedTotalPages: number,
): PdfPageInspection {
  return {
    ...page,
    pageNumber: rebasedPageNumber,
    totalPages: rebasedTotalPages,
    normalizedArtifact: {
      ...page.normalizedArtifact,
      pageNumber: rebasedPageNumber,
    },
  };
}

export function enumeratePdfPageNumbers(range: PdfPageRange): number[] {
  return Array.from({ length: Math.max(0, range.endPage - range.startPage + 1) }, (_, index) => range.startPage + index);
}

export function slicePdfInspectionToRange(
  inspection: PdfDocumentInspection | null | undefined,
  range: PdfPageRange,
  options?: { rebasePageNumbers?: boolean },
): PdfDocumentInspection | null {
  if (!inspection) {
    return null;
  }

  const selectedPages = inspection.pages
    .filter((page) => page.pageNumber >= range.startPage && page.pageNumber <= range.endPage)
    .sort((left, right) => left.pageNumber - right.pageNumber);

  const totalPages = selectedPages.length;
  const rebased = options?.rebasePageNumbers === true;
  const pages = selectedPages.map((page, index) =>
    rebased
      ? cloneInspectionPage(page, index + 1, totalPages)
      : {
          ...page,
          totalPages,
          normalizedArtifact: {
            ...page.normalizedArtifact,
          },
        },
  );

  return {
    ...inspection,
    totalPages,
    pages,
  };
}

function classifyCutPreference(page: PdfPageInspection): number {
  const normalizedText = page.normalizedText.toLowerCase();
  const headingHints = page.normalizedArtifact.headingHints.map((heading) => heading.toLowerCase());
  const hasSectionBreakCue =
    headingHints.length > 0
    || /\b(section|appendix|figure|plate|borehole|laboratory|classification|recommendation|discussion|summary)\b/i.test(page.normalizedText);

  if (page.classification === 'empty') {
    return 100;
  }
  if (page.classification === 'graphics-only') {
    return 90;
  }
  if (page.classification === 'image-only' && normalizedText.length === 0) {
    return 80;
  }
  if (/\bappendix\b/.test(normalizedText) || /\bfigure\b/.test(normalizedText) || /\bplate\b/.test(normalizedText)) {
    return 75;
  }
  if (/\btable of contents\b/.test(normalizedText) || /\bcover\b/.test(normalizedText) || /\bproject\b/.test(normalizedText)) {
    return 70;
  }
  if (hasSectionBreakCue) {
    return 60;
  }
  return 0;
}

export function buildHostedBetaPdfSegments(
  inspection: PdfDocumentInspection,
  effectivePageLimit = HOSTED_BETA_EFFECTIVE_PAGE_LIMIT,
  range?: PdfPageRange,
): PdfSegmentRange[] {
  const selectedPages = range
    ? inspection.pages.filter((page) => page.pageNumber >= range.startPage && page.pageNumber <= range.endPage)
    : inspection.pages;

  if (selectedPages.length === 0) {
    return [];
  }

  const segments: PdfSegmentRange[] = [];
  let cursor = 0;

  while (cursor < selectedPages.length) {
    let effectiveCost = 0;
    let endIndex = cursor - 1;

    while (endIndex + 1 < selectedPages.length) {
      const nextPage = selectedPages[endIndex + 1]!;
      const nextWeight = pageWeightForClassification(nextPage.classification);
      if (endIndex >= cursor && effectiveCost + nextWeight > effectivePageLimit) {
        break;
      }
      effectiveCost += nextWeight;
      endIndex += 1;
      if (effectiveCost >= effectivePageLimit) {
        break;
      }
    }

    if (endIndex < cursor) {
      endIndex = cursor;
      effectiveCost = pageWeightForClassification(selectedPages[cursor]!.classification);
    }

    let chosenEndIndex = endIndex;
    let bestScore = -1;

    if (endIndex !== selectedPages.length - 1) {
      const searchStartIndex = Math.max(cursor, endIndex - 5);
      for (let candidate = endIndex; candidate >= searchStartIndex; candidate -= 1) {
        const page = selectedPages[candidate]!;
        const score = classifyCutPreference(page);
        if (score > bestScore) {
          bestScore = score;
          chosenEndIndex = candidate;
        }
        if (score >= 80) {
          break;
        }
      }

      if (bestScore <= 0) {
        chosenEndIndex = endIndex;
      }
    }

    let chosenEffectiveCost = 0;
    for (let index = cursor; index <= chosenEndIndex; index += 1) {
      chosenEffectiveCost += pageWeightForClassification(selectedPages[index]!.classification);
    }

    segments.push({
      startPage: selectedPages[cursor]!.pageNumber,
      endPage: selectedPages[chosenEndIndex]!.pageNumber,
      pageCount: chosenEndIndex - cursor + 1,
      effectivePageCost: chosenEffectiveCost,
    });
    cursor = chosenEndIndex + 1;
  }

  return segments;
}

export async function writePdfPageSubset(
  sourceFilePath: string,
  range: PdfPageRange,
  outputPath: string,
): Promise<void> {
  const pageNumbers = enumeratePdfPageNumbers(range);
  const sourceBytes = readFileSync(sourceFilePath);
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const subset = await PDFDocument.create();

  for (const pageNumber of pageNumbers) {
    const [copiedPage] = await subset.copyPages(source, [pageNumber - 1]);
    subset.addPage(copiedPage);
  }

  const outputBytes = await subset.save();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(outputBytes));
}
