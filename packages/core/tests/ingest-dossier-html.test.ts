import { describe, expect, it } from 'vitest';

import { buildIngestDossier } from '../src/report/ingest-dossier.js';
import { renderIngestDossierAsHtml } from '../src/report/html.js';
import type { GeotechDocumentIngestResult } from '../src/ingest/geotech-document.js';

function makeGeotechResult(
  overrides?: Partial<GeotechDocumentIngestResult>,
): GeotechDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'geotech-document',
    generatedAt: '2026-04-22T00:00:00.000Z',
    source: {
      filePath: 'Geotechnical-Report.pdf',
      fileName: 'Geotechnical-Report.pdf',
      inputKind: 'pdf',
      totalPages: 6,
      successfulPages: 5,
      failedPages: 1,
      segmentation: {
        mode: 'segmented-parent',
        pageRange: [1, 102],
        effectivePageLimit: 60,
        segmentCount: 2,
        segments: [
          {
            segmentIndex: 1,
            segmentCount: 2,
            startPage: 1,
            endPage: 60,
            pageCount: 60,
            effectivePageCost: 60,
            status: 'completed',
            completedPages: 60,
            failedPages: 0,
            durationMs: 90000,
          },
          {
            segmentIndex: 2,
            segmentCount: 2,
            startPage: 61,
            endPage: 102,
            pageCount: 42,
            effectivePageCost: 42,
            status: 'completed',
            completedPages: 31,
            failedPages: 1,
            durationMs: 70000,
          },
        ],
      },
    },
    inspection: null,
    inspectionSummary: {
      pageClassificationCounts: {
        'digital-text': 3,
        'image-only': 2,
        mixed: 1,
      },
      imageHeavyPageCount: 2,
      ocrRecoveredPageCount: 2,
    },
    documentClass: 'site-investigation-report',
    title: 'Geotechnical Investigation - Proposed School Campus',
    summary: 'Clay, weathered shale, and laboratory parameters were extracted from the engineering packet.',
    materials: [
      { kind: 'soil', description: 'stiff clay', uscsSymbol: 'CL', lithology: null },
      { kind: 'rock', description: 'weathered shale', uscsSymbol: null, lithology: 'shale' },
    ],
    classifications: [
      { system: 'USCS', value: 'CL', context: 'stiff clay layer' },
      { system: 'RMR', value: '58', context: 'weathered shale' },
    ],
    parameters: [
      { name: 'cohesion', valueText: '25', numericValue: 25, unit: 'kPa', material: 'stiff clay', context: 'triaxial test' },
      { name: 'ucs', valueText: '42', numericValue: 42, unit: 'MPa', material: 'weathered shale', context: 'rock strength test' },
    ],
    risks: ['Weathered shale durability should be verified before final design adoption.'],
    recommendations: ['Confirm representative sampling before final design.'],
    contentChunks: [
      {
        chunkId: 'chunk-1',
        pageRange: [2, 3],
        headingAncestry: ['Subsurface Conditions'],
        scope: 'section',
        sectionType: 'subsurface-profile',
        significance: 93,
        text: 'Stiff clay transitions to weathered shale at depth with laboratory strength testing in the appendix.',
        sourcePages: [2, 3],
      },
    ],
    pageAudits: [
      {
        pageNumber: 2,
        classification: 'digital-text',
        sourceKind: 'pdf-page',
        parseStatus: 'parsed',
        confidence: 92,
        warnings: [],
        textHintSource: 'native-text',
        materialCount: 1,
        classificationCount: 1,
        parameterCount: 1,
        providerPath: 'text-only',
      },
      {
        pageNumber: 5,
        classification: 'image-only',
        sourceKind: 'raster-image',
        parseStatus: 'partial',
        confidence: 58,
        warnings: ['Page 5 timed out and should be reviewed manually.'],
        textHintSource: 'vision-ocr',
        materialCount: 1,
        classificationCount: 1,
        parameterCount: 1,
        providerPath: 'image-multimodal',
      },
    ],
    pageFailures: ['Page 5: Hosted beta request timed out after 150s.'],
    warnings: ['Recovered OCR hints should be spot-checked.'],
    reviewFindings: [
      {
        severity: 'review',
        scope: 'page',
        message: 'Page 5 timed out and needs a manual check.',
        pageNumber: 5,
      },
      {
        severity: 'advisory',
        scope: 'document',
        message: 'Recovered OCR hints should be spot-checked.',
      },
    ],
    reviewReasons: ['Page 5 timed out and needs a manual check.'],
    parseStatus: 'partial',
    confidence: 81,
    reviewRequired: true,
    canAutoProceed: false,
    ...overrides,
  };
}

describe('ingest dossier HTML', () => {
  it('builds a dossier with engineering tables, findings, and page cards', () => {
    const result = makeGeotechResult();

    const dossier = buildIngestDossier(result, {
      sourceLabel: 'School packet - April 2026',
      storedReview: {
        projectId: 'demo-project',
        datasetName: 'ingest-review:school-packet',
        reviewId: 'review-1',
        createdAt: '2026-04-22T01:00:00.000Z',
      },
      approval: {
        datasetName: 'ingest-review-approval:school-packet',
        approvedAt: '2026-04-22T02:00:00.000Z',
        approvedBy: 'Lead reviewer',
        rationale: 'Reviewed against the signed packet.',
      },
    });

    expect(dossier.title).toBe('Geotechnical Investigation - Proposed School Campus');
    expect(dossier.sourceLabel).toBe('School packet - April 2026');
    expect(dossier.badges.some((badge) => badge.label === 'Document class' && badge.value === 'site-investigation-report')).toBe(true);
    expect(dossier.metrics.some((metric) => metric.label === 'Parameters' && metric.value === '2')).toBe(true);
    expect(dossier.findings[0]?.label).toBe('Needs review');
    expect(dossier.tables.some((table) => table.title === 'Engineering parameters')).toBe(true);
    expect(dossier.tables.some((table) => table.title === 'Segment execution')).toBe(true);
    expect(dossier.pageCards).toHaveLength(2);
    expect(dossier.pageCards[1]?.warnings[0]).toContain('Page 5 timed out');
    expect(dossier.storedReview?.datasetName).toBe('ingest-review:school-packet');
    expect(dossier.approval?.approvedBy).toBe('Lead reviewer');
    expect(dossier.footerNotes.some((note) => /Segmented execution used 2 linked packet/i.test(note))).toBe(true);
  });

  it('renders a self-contained HTML dossier with escaped engineering content', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'Clay < shale > profile & lab data.',
      warnings: ['Recovered OCR hints should be spot-checked & verified.'],
    }), {
      storedReview: {
        projectId: 'demo-project',
        datasetName: 'ingest-review:school-packet',
        reviewId: 'review-1',
      },
    });

    const html = renderIngestDossierAsHtml(dossier);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('geotechCLI ingest dossier');
    expect(html).toContain('Engineering parameters');
    expect(html).toContain('Segment execution');
    expect(html).toContain('Page map');
    expect(html).toContain('Stored review');
    expect(html).toContain('Clay &lt; shale &gt; profile &amp; lab data.');
    expect(html).toContain('Recovered OCR hints should be spot-checked.');
    expect(html).toContain('not engineering sign-off');
    expect(html).toContain('geotechCLI v');
  });
});
