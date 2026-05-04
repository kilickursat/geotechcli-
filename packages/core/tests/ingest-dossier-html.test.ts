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
    synthesis: {
      takeaways: ['The report indicates stiff clay over weathered shale with laboratory strength values.'],
      groundModel: ['Stiff clay transitions to weathered shale at depth.'],
      keyParameters: ['Cohesion 25 kPa for stiff clay; UCS 42 MPa for weathered shale.'],
      interpretation: ['Strength parameters should be verified against source pages before design adoption.'],
      limitations: ['Page 5 requires manual review.'],
      sourcePages: [2, 5],
    },
    contentChunks: [
      {
        chunkId: 'chunk-1',
        pageRange: [2, 3],
        headingAncestry: ['Subsurface Conditions'],
        scope: 'section',
        sectionType: 'ground-model',
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
    expect(dossier.tables.some((table) => table.title === 'Key engineering parameters')).toBe(true);
    expect(dossier.tables.some((table) => table.title === 'Segment execution')).toBe(true);
    expect(dossier.tables.map((table) => table.title).slice(0, 3)).toEqual([
      'Key engineering parameters',
      'Material observations',
      'Classifications',
    ]);
    expect(dossier.pageCards).toHaveLength(2);
    expect(dossier.pageCards[0]?.stageBadges).toEqual(['native text', 'GLM-5.1 synthesis']);
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
    expect(html).toContain('Geotechnical Intelligence Report');
    expect(html).not.toContain('Geotechnical Intelligence Dossier');
    expect(html).toContain('AI-assisted extraction, verification, and engineering interpretation from geotechnical reports.');
    expect(html).toContain('Engineering Parameters');
    expect(html).toContain('Key engineering parameters');
    expect(html).toContain('Segment execution');
    expect(html).toContain('Source Evidence');
    expect(html).toContain('Processing Audit');
    expect(html).toContain('Approve Extraction');
    expect(html).toContain('Ask Geotech Agent');
    expect(html).toContain('Stored review');
    expect(html).toContain('Clay &lt; shale &gt; profile &amp; lab data.');
    expect(html).toContain('Recovered OCR hints should be spot-checked.');
    expect(html).toContain('not engineering sign-off');
    expect(html).toContain('geotechCLI v');
  });

  it('renders extraction overview, page audit matrix, and cleaned summary text', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'ClayLayer2UCS42MPa and frictionAngle32deg.',
      parameters: [
        { name: 'unitWeight', valueText: '18kN/m3', numericValue: 18, unit: 'kN/m3', material: 'silty sand', context: 'allowableBearingPressure35t/m2 strength2kg/cm2 permeability1e-6m/s' },
      ],
    }));
    const pageAudit = dossier.tables.find((table) => table.title === 'Page audit matrix');
    const parameters = dossier.tables.find((table) => table.title === 'Key engineering parameters');

    expect(dossier.summary).toBe('Clay Layer 2 UCS 42 MPa and friction Angle 32 deg.');
    expect(pageAudit?.columns).toEqual(['Page', 'Class', 'Status', 'Confidence', 'Source', 'Cache', 'Signals', 'Warnings']);
    expect(pageAudit?.rows).toContainEqual(['2', 'digital-text', 'parsed', '92%', 'native-text', '-', '1 material, 1 class, 1 parameter', '-']);
    expect(pageAudit?.rows).toContainEqual(['5', 'image-only', 'partial', '58%', 'vision-ocr', '-', '1 material, 1 class, 1 parameter', '1']);
    expect(parameters?.rows).toContainEqual(['Index/lab', 'unit Weight', '18 kN/m3', 'kN/m3', 'silty sand', '-', '81%', 'allowable Bearing Pressure 35 t/m2 strength 2 kg/cm2 permeability 1 e-6 m/s']);

    const html = renderIngestDossierAsHtml(dossier);

    expect(html).toContain('<strong>Processing Audit</strong>');
    expect(html).toContain('Model stages, page audit matrix, warnings, and operational details');
    expect(html).toContain('<h2>Page audit matrix</h2>');
    expect(html).toContain('Per-page extraction status, source path, cache reuse, retained signal counts, and warning volume.');
    expect(html).toContain('<details class="audit-drawer" id="processing-audit">');
    expect(html).toContain('class="chip stage-chip"');
    expect(html).toContain('Needs review?');
    expect(html).toContain('Evidence snippet');
    expect(html).toContain('Visual extraction used');
    expect(html.indexOf('<h2>Key engineering parameters</h2>')).toBeLessThan(html.indexOf('<h2>Page audit matrix</h2>'));
    expect(html).toContain('Clay Layer 2 UCS 42 MPa and friction Angle 32 deg.');
    expect(html).not.toContain('ClayLayer2UCS42MPa');
    expect(html).toContain('18 kN/m3');
    expect(html).toContain('35 t/m2');
    expect(html).toContain('2 kg/cm2');
    expect(html).toContain('1 e-6 m/s');
    expect(html).toContain('native-text');
    expect(html).toContain('vision-ocr');
    expect(html).toContain('GLM-5.1 synthesis');
    expect(html.indexOf('GLM-5.1 synthesis')).toBeGreaterThan(html.indexOf('Processing Audit'));
  });

  it('prefers attributed parameter source pages before context regex fallback', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      parameters: [
        { name: 'unitWeight', valueText: '18', numericValue: 18, unit: 'kN/m3', material: 'silty sand', context: 'lab summary without explicit page', sourcePages: [4, 2, 2] },
        { name: 'cohesion', valueText: '25', numericValue: 25, unit: 'kPa', material: 'stiff clay', context: 'triaxial test on page 5' },
      ],
    }));

    const parameters = dossier.tables.find((table) => table.title === 'Key engineering parameters');
    expect(parameters?.rows).toContainEqual(['Index/lab', 'unit Weight', '18', 'kN/m3', 'silty sand', '2, 4', '81%', 'lab summary without explicit page']);
    expect(parameters?.rows).toContainEqual(['Strength', 'cohesion', '25', 'kPa', 'stiff clay', '5', '81%', 'triaxial test on page 5']);
    expect(dossier.trustItems.find((item) => item.item === 'unit Weight')?.sourcePage).toBe('2, 4');
    expect(dossier.trustItems.find((item) => item.item === 'cohesion')?.sourcePage).toBe('5');
  });

  it('renders a conceptual borehole stratigraphy profile when borehole IDs and depths are retained', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1, BH2, and BH3 were drilled to 10.00 m with weathered rock at depth.',
      parameters: [
        { name: 'depth', valueText: '10.00 m', numericValue: 10, unit: 'm', material: 'BH1', context: 'Page 27 borehole log' },
        { name: 'depth', valueText: '10.00 m', numericValue: 10, unit: 'm', material: 'BH2', context: 'Page 27 borehole log' },
        { name: 'depth', valueText: '10.00 m', numericValue: 10, unit: 'm', material: 'BH3', context: 'Page 27 borehole log' },
      ],
    }));

    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.boreholeProfile?.columns.map((column) => column.boreholeId)).toEqual(['BH1', 'BH2', 'BH3']);
    expect(html).toContain('<svg class="borehole-profile"');
    expect(html).toContain('BH1');
    expect(html).toContain('BH2');
    expect(html).toContain('BH3');
    expect(html).toContain('Dashed layer boundaries indicate missing or unverified stratum intervals.');
  });

  it('builds a conceptual profile from retained inspection and chunk evidence when parameters omit depth rows', () => {
    const scheduleText = [
      'Schedule of boreholes is tabulated below.',
      'Bore Hole No. Terminating Depth (m) Water Table below EGL (m)',
      'BH - 1 10.00 Not found',
      'BH - 2 10.00 Not found',
      'BH - 3 10.00 Not found',
      'The boring was carried out up to maximum depth of 10.00 m.',
    ].join('\n');
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'Foundation parameters were extracted, but borehole schedule details came from retained page text.',
      materials: [
        { kind: 'rock', description: 'rock', uscsSymbol: null, lithology: null },
        { kind: 'groundwater', description: 'water table', uscsSymbol: null, lithology: null },
      ],
      parameters: [
        { name: 'sptN', valueText: '15', numericValue: 15, unit: 'blows/ft', material: 'BH-3', context: 'Depth 1.5, footing table' },
      ],
      inspection: {
        kind: 'pdf-document-inspection',
        totalPages: 2,
        pages: [
          {
            pageNumber: 2,
            totalPages: 2,
            classification: 'digital-text',
            extractedText: scheduleText,
            normalizedText: scheduleText,
            normalizedArtifact: { nativeText: scheduleText },
          },
        ],
      } as any,
      contentChunks: [
        {
          chunkId: 'page-22',
          pageRange: [22, 22],
          headingAncestry: ['Conclusion'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 90,
          text: 'Around BH - 1, hard clayey silt at top followed by a weathered rock layer. Around BH - 2, hard clayey silt followed by a very dense silty sand layer. Around BH - 3, medium dense to dense silty sand continues up to terminating depth.',
          sourcePages: [22],
        },
      ],
    }));

    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.boreholeProfile?.maxDepth).toBe(10);
    expect(dossier.boreholeProfile?.columns.map((column) => column.boreholeId)).toEqual(['BH1', 'BH2', 'BH3']);
    expect(dossier.boreholeProfile?.columns[0]?.layers.length).toBeGreaterThan(0);
    expect(html).toContain('<svg class="borehole-profile"');
    expect(html).toContain('TD 10.00 m');
    expect(html).toContain('Use source logs before treating the profile as design-grade stratigraphy.');
  });
});
