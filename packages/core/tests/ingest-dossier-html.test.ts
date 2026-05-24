import { describe, expect, it } from 'vitest';

import {
  buildIntegratedAgentReviewFromProjectSession,
  buildIntegratedReviewModel,
  buildIntegratedSourcePagesFromLayout,
} from '../src/report/integrated-review-model.js';
import { buildIngestDossier } from '../src/report/ingest-dossier.js';
import { renderIngestDossierAsHtml } from '../src/report/html.js';
import type { BoreholeDocumentIngestResult } from '../src/ingest/geotech-extract.js';
import type { GeotechDocumentIngestResult } from '../src/ingest/geotech-document.js';
import type { ProjectAgentSession } from '../src/storage/index.js';

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
    confidenceBreakdown: {
      schemaVersion: 1,
      overall: 81,
      extractionConfidence: 76,
      engineeringCompleteness: 62,
      traceabilityScore: 100,
      corroborationScore: 75,
      readinessScore: 71,
      pageEvidenceConfidence: 75,
      methodCoverage: {
        nativeTextPages: 1,
        layoutOcrPages: 0,
        visualReasoningPages: 1,
        directVisualPages: 0,
      },
      missingCriticalData: ['groundwater level', 'SPT N-values', 'RQD', 'friction angle'],
      reviewGates: ['partial-pages-remain'],
      notes: ['Confidence is provider-neutral workflow trust, not a model self-score.'],
    },
    reviewRequired: true,
    canAutoProceed: false,
    ...overrides,
  };
}

function makeBoreholeResult(
  overrides?: Partial<BoreholeDocumentIngestResult>,
): BoreholeDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'borehole-log',
    generatedAt: '2026-04-23T00:00:00.000Z',
    source: {
      filePath: 'Borehole-Logs.pdf',
      fileName: 'Borehole-Logs.pdf',
      inputKind: 'pdf',
      totalPages: 2,
      successfulPages: 2,
      failedPages: 0,
    },
    inspection: null,
    inspectionSummary: {
      pageClassificationCounts: { 'image-only': 1, 'digital-text': 1 },
      imageHeavyPageCount: 1,
      nativeTextPageCount: 1,
      degradedPageCount: 0,
      ocrRecoveredPageCount: 1,
    },
    boreholes: [
      {
        boreholeId: 'BH-01',
        totalDepth: 8,
        waterTableDepth: 2.4,
        layers: [
          {
            depthFrom: 0,
            depthTo: 2,
            description: 'Made ground and brown silty clay',
            uscsSymbol: 'CL',
            sptN: 12,
            waterContent: 18,
            notes: null,
          },
          {
            depthFrom: 2,
            depthTo: 8,
            description: 'Dense sand with gravel',
            uscsSymbol: 'SP',
            sptN: 28,
            waterContent: null,
            notes: null,
          },
        ],
        summary: 'BH-01 recovered made ground over dense sand.',
        location: {
          boreholeId: 'BH-01',
          crs: { kind: 'projected', code: 'EPSG:32633', source: 'explicit', confidence: 0.86 },
          projected: { easting: 542315.6, northing: 4237761.4 },
          raw: { rawCoordinateText: 'E 542315.6 N 4237761.4' },
        },
        groundElevation: 12.5,
        dateDrilled: '2026-04-20',
        drillingMethod: 'Rotary wash',
        projectName: 'School Campus',
        continuationDepth: null,
        pageNumber: 1,
        totalPages: 2,
        rawLLMText: '{}',
        latencyMs: 1200,
        parseStatus: 'parsed',
        confidence: 88,
        warnings: [],
        canAutoProceed: true,
      },
      {
        boreholeId: 'BH-02',
        totalDepth: 7,
        waterTableDepth: null,
        layers: [
          {
            depthFrom: 0,
            depthTo: 3,
            description: 'Soft clay',
            uscsSymbol: 'CL',
            sptN: 6,
            waterContent: 24,
            notes: null,
          },
          {
            depthFrom: 3,
            depthTo: 7,
            description: 'Weathered sandstone',
            uscsSymbol: null,
            sptN: null,
            waterContent: null,
            notes: 'weak rock',
          },
        ],
        summary: 'BH-02 recovered soft clay over weathered sandstone.',
        location: {
          boreholeId: 'BH-02',
          crs: { kind: 'projected', code: 'EPSG:32633', source: 'explicit', confidence: 0.84 },
          projected: { easting: 542355.2, northing: 4237780.5 },
          raw: { rawCoordinateText: 'E 542355.2 N 4237780.5' },
        },
        groundElevation: 12.2,
        dateDrilled: '2026-04-21',
        drillingMethod: 'Rotary wash',
        projectName: 'School Campus',
        continuationDepth: null,
        pageNumber: 2,
        totalPages: 2,
        rawLLMText: '{}',
        latencyMs: 1300,
        parseStatus: 'partial',
        confidence: 82,
        warnings: ['Rock weathering descriptor requires review.'],
        canAutoProceed: false,
      },
    ],
    pageAudits: [
      {
        pageNumber: 1,
        detectedBoreholeId: 'BH-01',
        assignedGroup: 'BH-01',
        classification: 'digital-text',
        textHintSource: 'native-text',
        parseStatus: 'parsed',
        confidence: 91,
        continuationDepth: null,
        warnings: [],
      },
      {
        pageNumber: 2,
        detectedBoreholeId: 'BH-02',
        assignedGroup: 'BH-02',
        classification: 'image-only',
        textHintSource: 'vision-ocr',
        parseStatus: 'partial',
        confidence: 76,
        continuationDepth: null,
        warnings: ['Image-heavy page.'],
      },
    ],
    pageFailures: [],
    warnings: ['Borehole log page 2 needs reviewer confirmation.'],
    reviewFindings: [
      {
        code: 'image-heavy-page',
        severity: 'review',
        scope: 'page',
        message: 'Borehole log page 2 needs reviewer confirmation.',
        pageNumber: 2,
        boreholeId: 'BH-02',
      },
    ],
    reviewReasons: ['Borehole log page 2 needs reviewer confirmation.'],
    reviewRequired: true,
    confidence: 85,
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
    expect(dossier.metrics.some((metric) =>
      metric.label === 'Review confidence'
      && metric.value === '81%'
      && /pages avg/i.test(metric.detail ?? '')
      && /traceability/i.test(metric.detail ?? ''),
    )).toBe(true);
    expect(dossier.confidenceBreakdown?.map((item) => item.label)).toEqual([
      'Workflow confidence',
      'Page evidence',
      'Source traceability',
      'Review gates',
      'Engineering completeness',
    ]);
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

  it('builds a GroundModel for borehole-log ingest so the integrated review uses coordinates, SPT, groundwater, and evidence', () => {
    const dossier = buildIngestDossier(makeBoreholeResult(), {
      sourceLabel: 'Borehole log packet',
    });
    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.documentType).toBe('borehole-log');
    expect(dossier.boreholeProfile?.columns.map((column) => column.boreholeId)).toEqual(['BH-01', 'BH-02']);
    expect(dossier.groundModel?.stats.boreholes).toBe(2);
    expect(dossier.groundModel?.stats.strata).toBe(4);
    expect(dossier.groundModel?.stats.sptTests).toBe(3);
    expect(dossier.groundModel?.stats.groundwaterObservations).toBe(1);
    expect(dossier.groundModel?.stats.parameters).toBe(2);
    expect(dossier.groundModel?.stats.evidenceRefs).toBeGreaterThanOrEqual(10);
    expect(dossier.groundModel?.coordinateSystem).toMatchObject({ kind: 'local-grid', crs: 'EPSG:32633' });
    expect(dossier.groundModel?.map?.summary.boreholePoints).toBe(2);
    expect(dossier.groundModel?.evidence.some((ref) => ref.method === 'pdf-text')).toBe(true);
    expect(dossier.groundModel?.evidence.some((ref) => ref.method === 'vision')).toBe(true);
    expect(dossier.groundModel?.warnings.some((warning) => /SPT depth.*inferred/i.test(warning))).toBe(true);

    expect(html).toContain('geotechCLI Integrated Vision + Geospatial Review');
    expect(html).toContain('Boreholes</div>');
    expect(html).toContain('EPSG:32633');
    expect(html).toContain('Map-ready borehole view');
    expect(html).toContain('data-borehole-target="BH1"');
    expect(html).toContain('data-borehole-target="BH2"');
    expect(html).toContain('BH-01');
    expect(html).toContain('BH-02');
    expect(html).toContain('N12 at 1.00 m');
    expect(html).toContain('N28 at 5.00 m');
    expect(html).toContain('GWL at 2.40 m');
    expect(html).toContain('waterContent');
    expect(html).toContain('Integrated extraction JSON');
    expect(html).toContain('data-region-mode="reconstructed"');
    expect(html).not.toContain('Geotechnical Intelligence Report');
  });

  it('renders WGS84-only borehole locations as source map markers', () => {
    const base = makeBoreholeResult();
    const dossier = buildIngestDossier({
      ...base,
      boreholes: base.boreholes.map((borehole, index) => ({
        ...borehole,
        location: {
          boreholeId: borehole.boreholeId,
          crs: { kind: 'geographic', code: 'EPSG:4326', source: 'explicit', confidence: 0.84 },
          wgs84: {
            latitude: 35.681 + index * 0.001,
            longitude: 139.767 + index * 0.001,
          },
          raw: { rawCoordinateText: `${35.681 + index * 0.001}, ${139.767 + index * 0.001}` },
        },
      })),
    }, {
      sourceLabel: 'Borehole log packet',
    });
    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.groundModel?.coordinateSystem).toMatchObject({ kind: 'geographic', crs: 'EPSG:4326' });
    expect(dossier.groundModel?.map?.summary.boreholePoints).toBe(2);
    expect(html).toContain('Source coordinates retained in EPSG:4326');
    expect(html).not.toContain('No validated borehole coordinates were available for map rendering.');
    expect(html).not.toContain('Schematic borehole alignment from recovered report boreholes');
    expect(html).toContain('BH-01');
    expect(html).toContain('BH-02');
  });

  it('renders GLM-OCR layout regions as the source page when bbox evidence is supplied', () => {
    const result = makeBoreholeResult();
    const baselineDossier = buildIngestDossier(result, { sourceLabel: 'Borehole log packet' });
    const baselineModel = buildIntegratedReviewModel(baselineDossier);
    const borehole = baselineModel.boreholes[0]!;
    const sourcePages = buildIntegratedSourcePagesFromLayout([
      {
        pageNumber: 1,
        width: 1000,
        height: 2000,
        text: 'BH-01 Made ground and brown silty clay SPT N=12',
        tables: [],
        formulas: [],
        images: [],
        elements: [
          {
            index: 1,
            label: 'text',
            bbox2d: [80, 120, 410, 180],
            content: 'Borehole BH-01',
            width: 1000,
            height: 2000,
          },
          {
            index: 2,
            label: 'table',
            bbox2d: [100, 200, 220, 260],
            content: '0.00-2.00 m Made ground and brown silty clay',
            width: 1000,
            height: 2000,
          },
        ],
      },
    ], {
      sourcePath: 'Borehole-Logs.pdf',
      links: [
        {
          pageNumber: 1,
          elementIndex: 1,
          evidenceId: borehole.evidenceIds[0]!,
          type: 'header',
          label: 'Borehole header',
          confidence: 0.88,
        },
        {
          pageNumber: 1,
          elementIndex: 2,
          evidenceId: borehole.strata[0]!.evidenceId,
          type: 'strata',
          label: 'Strata interval',
          confidence: 0.86,
        },
      ],
    });
    const dossier = buildIngestDossier(result, {
      sourceLabel: 'Borehole log packet',
      sourcePages,
    });

    const model = buildIntegratedReviewModel(dossier);
    const html = renderIngestDossierAsHtml(dossier);

    expect(model.sourcePages[0]?.regions).toHaveLength(2);
    expect(model.boreholes[0]?.strata[0]?.sourceRegion).toMatchObject({
      evidenceId: borehole.strata[0]!.evidenceId,
      bbox: [100, 200, 220, 260],
    });
    expect(html).toContain('data-region-mode="layout"');
    expect(html).toContain('data-region-id="layout-p1-r2"');
    expect(html).toContain('left:10.000%;top:10.000%;width:12.000%;height:3.000%');
    expect(html).toContain('GLM-OCR layout regions linked');
  });

  it('builds integrated source pages automatically from retained GLM-OCR page audit layouts', () => {
    const result = makeBoreholeResult();
    result.pageAudits[0] = {
      ...result.pageAudits[0]!,
      textHintSource: 'glm-ocr',
      layoutPages: [{
        pageNumber: 1,
        width: 1000,
        height: 2000,
        text: 'BH-01 Made ground and brown silty clay',
        tables: [],
        formulas: [],
        images: [],
        elements: [
          {
            index: 2,
            label: 'table',
            bbox2d: [100, 200, 220, 260],
            content: '0.00-2.00 m Made ground and brown silty clay',
            width: 1000,
            height: 2000,
          },
        ],
      }],
    };

    const dossier = buildIngestDossier(result, {
      sourceLabel: 'Borehole log packet',
    });
    const model = buildIntegratedReviewModel(dossier);
    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.sourcePages?.[0]?.regions[0]).toMatchObject({
      evidenceId: model.boreholes[0]!.strata[0]!.evidenceId,
      method: 'glm-ocr-layout',
      bbox: [100, 200, 220, 260],
    });
    expect(model.boreholes[0]?.strata[0]?.sourceRegion?.method).toBe('glm-ocr-layout');
    expect(html).toContain('data-region-mode="layout"');
  });

  it('keeps layout region ids unique when GLM-OCR repeats element indexes', () => {
    const sourcePages = buildIntegratedSourcePagesFromLayout([
      {
        pageNumber: 1,
        width: 1000,
        height: 2000,
        text: 'Repeated index layout.',
        tables: [],
        formulas: [],
        images: [],
        elements: [
          {
            index: 1,
            label: 'text',
            bbox2d: [80, 120, 410, 180],
            content: 'Borehole BH-01',
            width: 1000,
            height: 2000,
          },
          {
            index: 1,
            label: 'table',
            bbox2d: [100, 200, 220, 260],
            content: '0.00-2.00 m Made ground and brown silty clay',
            width: 1000,
            height: 2000,
          },
        ],
      },
    ]);

    const ids = sourcePages[0]!.regions.map((region) => region.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['layout-p1-r1', 'layout-p1-r2']);
  });

  it('does not bind a stale layout element index by broad content fallback', () => {
    const targetEvidenceId = 'doc-ev-stale';
    const sourcePages = buildIntegratedSourcePagesFromLayout([
      {
        pageNumber: 1,
        width: 1000,
        height: 2000,
        text: 'Clay row.',
        tables: [],
        formulas: [],
        images: [],
        elements: [
          {
            index: 1,
            label: 'table',
            bbox2d: [100, 200, 220, 260],
            content: '0.00-2.00 m stiff clay',
            width: 1000,
            height: 2000,
          },
        ],
      },
    ], {
      links: [{
        pageNumber: 1,
        elementIndex: 99,
        contentIncludes: 'clay',
        evidenceId: targetEvidenceId,
      }],
    });

    expect(sourcePages[0]?.regions.find((region) => region.evidenceId === targetEvidenceId)).toBeUndefined();
    expect(sourcePages[0]?.regions.map((region) => region.evidenceId)).toContain('layout-p1-r1');
  });

  it('normalizes ratio GLM-OCR bbox coordinates before rendering source regions', () => {
    const sourcePages = buildIntegratedSourcePagesFromLayout([
      {
        pageNumber: 1,
        width: null,
        height: null,
        text: 'SPT N = 12',
        tables: ['| Depth | SPT |'],
        formulas: [],
        images: [],
        elements: [
          {
            index: 1,
            label: 'table',
            bbox2d: [0.1, 0.2, 0.8, 0.4],
            content: '| Depth | SPT |\n| 2m | 12 |',
            width: 612,
            height: 792,
          },
        ],
      },
    ]);

    const bbox = sourcePages[0]?.regions[0]?.bbox;
    const dossier = buildIngestDossier(makeBoreholeResult(), { sourcePages });
    const html = renderIngestDossierAsHtml(dossier);

    expect(sourcePages[0]?.width).toBeGreaterThan(10);
    expect(sourcePages[0]?.height).toBeGreaterThan(10);
    expect(bbox?.[0]).toBeCloseTo(61.2);
    expect(bbox?.[1]).toBeCloseTo(158.4);
    expect(bbox?.[2]).toBeCloseTo(489.6);
    expect(bbox?.[3]).toBeCloseTo(316.8);
    expect(html).not.toContain('aspect-ratio:1/0');
  });

  it('promotes evidence-location bbox metadata into integrated source regions', () => {
    const dossier = buildIngestDossier(makeBoreholeResult(), {
      sourceLabel: 'Borehole log packet',
    });
    const baselineModel = buildIntegratedReviewModel(dossier);
    const evidenceId = baselineModel.boreholes[0]!.strata[0]!.evidenceId;
    const ref = dossier.groundModel!.evidence.find((entry) => entry.id === evidenceId)!;
    ref.location = {
      ...ref.location,
      bbox: [100, 200, 220, 260],
      pageWidth: 1000,
      pageHeight: 2000,
      bboxUnits: 'page',
      layoutElementIndex: 4,
      layoutLabel: 'table',
    };

    const model = buildIntegratedReviewModel(dossier);
    const html = renderIngestDossierAsHtml(dossier);

    expect(model.sourcePages[0]?.regions[0]).toMatchObject({
      evidenceId,
      bbox: [100, 200, 220, 260],
      method: 'pdf-text',
    });
    expect(model.boreholes[0]?.strata[0]?.sourceRegion?.evidenceId).toBe(evidenceId);
    expect(html).toContain('data-region-mode="layout"');
    expect(html).toContain('left:10.000%;top:10.000%;width:12.000%;height:3.000%');
  });

  it('prefers GLM-OCR source pages over stale evidence bbox metadata for the same evidence ID', () => {
    const result = makeBoreholeResult();
    const baselineDossier = buildIngestDossier(result, { sourceLabel: 'Borehole log packet' });
    const baselineModel = buildIntegratedReviewModel(baselineDossier);
    const evidenceId = baselineModel.boreholes[0]!.strata[0]!.evidenceId;
    const ref = baselineDossier.groundModel!.evidence.find((entry) => entry.id === evidenceId)!;
    ref.location = {
      ...ref.location,
      bbox: [10, 10, 20, 20],
      pageWidth: 1000,
      pageHeight: 2000,
      bboxUnits: 'page',
    };
    baselineDossier.sourcePages = buildIntegratedSourcePagesFromLayout([
      {
        pageNumber: 1,
        width: 1000,
        height: 2000,
        text: 'Made ground and brown silty clay',
        tables: [],
        formulas: [],
        images: [],
        elements: [
          {
            index: 7,
            label: 'table',
            bbox2d: [120, 240, 360, 320],
            content: '0.00-2.00 m Made ground and brown silty clay',
            width: 1000,
            height: 2000,
          },
        ],
      },
    ], {
      links: [{
        pageNumber: 1,
        elementIndex: 7,
        evidenceId,
        type: 'strata',
        confidence: 0.9,
      }],
    });

    const model = buildIntegratedReviewModel(baselineDossier);

    expect(model.boreholes[0]?.strata[0]?.sourceRegion?.bbox).toEqual([120, 240, 360, 320]);
    expect(model.boreholes[0]?.strata[0]?.sourceRegion?.method).toBe('glm-ocr-layout');
  });

  it('ignores invalid persisted source pages and falls back to reconstructed source overlays', () => {
    const dossier = buildIngestDossier(makeBoreholeResult(), {
      sourceLabel: 'Borehole log packet',
      sourcePages: [{
        pageNumber: 0,
        width: 0,
        height: 0,
        sourcePath: 'bad-layout',
        method: 'glm-ocr-layout',
        regions: [{
          id: 'bad-region',
          evidenceId: 'bad-region',
          pageNumber: 0,
          type: 'strata',
          label: 'Bad region',
          text: 'BH-01 bad region',
          bbox: [0, 0, 0, 0],
          confidence: 0.9,
          method: 'glm-ocr-layout',
          status: 'accepted',
        }],
      }],
    });

    const model = buildIntegratedReviewModel(dossier);
    const html = renderIngestDossierAsHtml(dossier);

    expect(model.sourcePages).toHaveLength(0);
    expect(html).toContain('data-region-mode="reconstructed"');
    expect(html).not.toContain('data-region-mode="layout"');
    expect(html).not.toContain('Infinity%');
    expect(html).not.toContain('NaN%');
  });

  it('renders single/swarm agent reviews as provenance without inventing boreholes', () => {
    const swarmSession: ProjectAgentSession = {
      id: 'agent-session-1',
      mode: 'swarm',
      query: 'Review the extracted borehole evidence.',
      answer: 'Reviewer found the extraction usable after checking the source pages.',
      summary: 'Swarm review of ingest evidence.',
      stepCount: 8,
      tokens: 1420,
      latencyMs: 24000,
      context: {
        deterministicTools: ['load_persisted_ingest_review'],
      },
      metadata: {
        reviewPassed: false,
        corrections: ['Groundwater symbol must remain review-gated.'],
      },
      createdAt: '2026-04-23T02:00:00.000Z',
    };
    const agentReview = buildIntegratedAgentReviewFromProjectSession(swarmSession);
    const dossier = buildIngestDossier(makeGeotechResult({
      materials: [],
      classifications: [],
      parameters: [],
      synthesis: null,
      contentChunks: [],
      summary: 'Agent-only provenance should not create boreholes or strata.',
    }), {
      sourceLabel: 'Agent-reviewed packet',
      agentReviews: [agentReview],
    });

    const model = buildIntegratedReviewModel(dossier);
    const html = renderIngestDossierAsHtml(dossier);

    expect(model.boreholes).toHaveLength(0);
    expect(model.agentReviews).toHaveLength(1);
    expect(model.agentReviews[0]?.title).toBe('Swarm agent review');
    expect(model.agentReviews[0]?.warnings[0]).toContain('did not pass');
    expect(html).toContain('Agents');
    expect(html).toContain('Swarm agent review');
    expect(html).toContain('Groundwater symbol must remain review-gated.');
    expect(html).toContain('&quot;agentReviews&quot;');
    expect(html).not.toContain('A-A Stratigraphic Section Along Borehole Alignment');
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
    expect(html).toContain('geotechCLI Integrated Vision + Geospatial Review');
    expect(html).not.toContain('Geotechnical Intelligence Report');
    expect(html).not.toContain('Geotechnical Intelligence Dossier');
    expect(html).toContain('geotech.integrated_review.v1');
    expect(html).toContain('data-view-target="reviewView"');
    expect(html).toContain('Source report evidence');
    expect(html).toContain('Validated strip log');
    expect(html).toContain('Map + A-A section');
    expect(html).toContain('Validation + JSON');
    expect(html).toContain('Provider-neutral schema');
    expect(html).toContain('Key engineering parameters');
    expect(html).toContain('Segment execution');
    expect(html).not.toContain('Processing Audit');
    expect(html).not.toContain('Approve Extraction');
    expect(html).not.toContain('Ask Geotech Agent');
    expect(html).toContain('review-1');
    expect(html).toContain('Clay &lt; shale &gt; profile &amp; lab data.');
    expect(html).toContain('Recovered OCR hints should be spot-checked.');
    expect(html).toContain('CRS checked before map render');
    expect(html).toContain('<span>geotechCLI</span>');
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

    expect(html).toContain('Page audit matrix');
    expect(html).toContain('Per-page extraction status, source path, cache reuse, retained signal counts, and warning volume.');
    expect(html).toContain('Validation workflow');
    expect(html).toContain('Integrated extraction JSON');
    expect(html).toContain('Vision verification gate');
    expect(html).not.toContain('<details class="audit-drawer" id="processing-audit">');
    expect(html.indexOf('Key engineering parameters')).toBeLessThan(html.indexOf('Page audit matrix'));
    expect(html).toContain('Clay Layer 2 UCS 42 MPa and friction Angle 32 deg.');
    expect(html).not.toContain('ClayLayer2UCS42MPa');
    expect(html).toContain('18 kN/m3');
    expect(html).toContain('35 t/m2');
    expect(html).toContain('2 kg/cm2');
    expect(html).toContain('1 e-6 m/s');
    expect(html).toContain('native-text');
    expect(html).toContain('vision-ocr');
    expect(html).toContain('GLM-5.1 document routing');
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
    expect(html).toContain('A-A Stratigraphic Section');
    expect(html).toContain('BH1');
    expect(html).toContain('BH2');
    expect(html).toContain('BH3');
    expect(html).toContain('Direct log columns are drawn at borehole positions.');
  });

  it('renders GroundModel visual review from PDF report evidence', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1 and BH2 were drilled to 10.00 m with clay, sand, and groundwater observations.',
      parameters: [
        { name: 'depth', valueText: '10.00 m', numericValue: 10, unit: 'm', material: 'BH1', context: 'Page 12 borehole log', sourcePages: [12] },
        { name: 'depth', valueText: '10.00 m', numericValue: 10, unit: 'm', material: 'BH2', context: 'Page 13 borehole log', sourcePages: [13] },
        { name: 'sptN', valueText: '18', numericValue: 18, unit: 'blows/300mm', material: 'BH1', context: 'SPT at depth 3.0 m on page 12', sourcePages: [12] },
        { name: 'liquidLimit', valueText: '42', numericValue: 42, unit: '%', material: 'BH1 clay', context: 'Sample depth 2.5 m on page 14', sourcePages: [14] },
        { name: 'groundwaterDepth', valueText: '2.4 m', numericValue: 2.4, unit: 'm bgl', material: 'BH1', context: 'Water table at 2.4 m on page 12', sourcePages: [12] },
      ],
      contentChunks: [
        {
          chunkId: 'bh1-layers',
          pageRange: [12, 12],
          headingAncestry: ['BH1'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 94,
          text: 'Layer 1 (0.0 m to 2.0 m): stiff clay. Layer 2 (2.0 m to 6.0 m): silty sand. Layer 3 (6.0 m to 10.0 m): weathered rock.',
          sourcePages: [12],
        },
        {
          chunkId: 'bh2-layers',
          pageRange: [13, 13],
          headingAncestry: ['BH2'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 92,
          text: 'Layer 1 (0.0 m to 3.0 m): stiff clay. Layer 2 (3.0 m to 7.0 m): dense sand. Layer 3 (7.0 m to 10.0 m): weathered rock.',
          sourcePages: [13],
        },
      ],
    }));

    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.groundModel?.stats.boreholes).toBe(2);
    expect(dossier.groundModel?.stats.sptTests).toBe(1);
    expect(dossier.groundModel?.stats.groundwaterObservations).toBeGreaterThanOrEqual(1);
    expect(dossier.groundModel?.stats.parameters).toBe(1);
    expect(dossier.groundModel?.evidence.some((ref) => ref.rawValue === '10.00 m')).toBe(false);
    expect(dossier.groundModel?.evidence.every((ref) => ref.method === 'manual')).toBe(true);
    expect(dossier.groundModel?.evidence.some((ref) => ref.warnings.join(' ').includes('not present in retained page audit'))).toBe(true);
    expect(dossier.femDraftCandidates?.map((candidate) => candidate.workflow)).toEqual([
      'fem-foundation-settlement',
      'fem-excavation-deformation',
    ]);
    expect(dossier.femDraftCandidates?.every((candidate) => candidate.canAutoProceed === false)).toBe(true);
    expect(dossier.femDraftCandidates?.every((candidate) => candidate.command.startsWith('geotech fem draft '))).toBe(true);
    expect(dossier.femDraftCandidates?.every((candidate) => !/\bfem run\b/i.test(candidate.command))).toBe(true);
    expect(dossier.femDraftCandidates?.every((candidate) => candidate.draft.recommendedAction === 'collect-inputs')).toBe(true);
    expect(dossier.femDraftCandidates?.every((candidate) => candidate.draft.analysisCase == null)).toBe(true);
    expect(dossier.femDraftCandidates?.[0]?.draft.analysisCase).toBeUndefined();
    expect(dossier.tables.find((table) => table.title === 'FEM draft routing')?.rows[0]).toEqual(expect.arrayContaining([
      'Foundation / raft settlement preview',
      'ready with assumptions',
      expect.stringMatching(/raft length/),
      'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
    ]));
    expect(html).toContain('Source report evidence');
    expect(html).toContain('FEM draft routing');
    expect(html).toContain('Foundation / raft settlement preview');
    expect(html).toContain('geotech fem draft foundation-settlement');
    expect(html).toContain('Validated strip log');
    expect(html).toContain('Extracted fields');
    expect(html).toContain('Professional A-A stratigraphic section');
    expect(html).toContain('Integrated extraction JSON');
    expect(html).toContain('BH1');
    expect(html).toContain('N18 at 3.00 m');
    expect(html).toContain('2.40 m');
    expect(html).toContain('liquid Limit');
    expect(html).toContain('doc-ev-');
  });

  it('renders GroundModel visual review when report evidence has no retained strata', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1 field data includes SPT, groundwater, and index test observations.',
      materials: [],
      classifications: [],
      synthesis: null,
      contentChunks: [],
      parameters: [
        { name: 'sptN', valueText: '21', numericValue: 21, unit: 'blows/300mm', material: 'BH1', context: 'SPT at depth 3.0 m on page 2', sourcePages: [2] },
        { name: 'plasticityIndex', valueText: '18', numericValue: 18, unit: '%', material: 'BH1', context: 'Sample depth 2.5 m on page 2', sourcePages: [2] },
        { name: 'groundwaterDepth', valueText: '1.8 m', numericValue: 1.8, unit: 'm bgl', material: 'BH1', context: 'Water table at 1.8 m on page 2', sourcePages: [2] },
      ],
    }));

    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.boreholeProfile).toBeUndefined();
    expect(dossier.groundModel?.stats.boreholes).toBe(1);
    expect(dossier.groundModel?.stats.strata).toBe(0);
    expect(dossier.groundModel?.stats.sptTests).toBe(1);
    expect(dossier.groundModel?.stats.groundwaterObservations).toBe(1);
    expect(dossier.groundModel?.stats.parameters).toBe(1);
    expect(dossier.groundModel?.evidence.every((ref) => ref.location.pageNumber === 2)).toBe(true);
    expect(dossier.groundModel?.evidence.every((ref) => ref.method === 'pdf-text')).toBe(true);
    expect(html).toContain('geotechCLI Integrated Vision + Geospatial Review');
    expect(html).toContain('A-A section needs at least two boreholes');
    expect(html).toContain('N21 at 3.00 m');
    expect(html).toContain('plasticity Index');
    expect(html).toContain('1.80 m');
  });

  it('does not promote unassigned report SPT rows into fake GroundModel boreholes', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1 field data includes one retained SPT row; other numeric rows lack source context.',
      materials: [],
      classifications: [],
      synthesis: null,
      contentChunks: [],
      parameters: [
        { name: 'sptN', valueText: '21', numericValue: 21, unit: 'blows/300mm', material: 'BH1', context: 'SPT at depth 3.0 m on page 2', sourcePages: [2] },
        { name: 'sptN', valueText: '8', numericValue: 8, unit: null, material: null, context: 'depth 8.0 m', sourcePages: [29] },
      ],
    }));

    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.groundModel?.stats.boreholes).toBe(1);
    expect(dossier.groundModel?.stats.sptTests).toBe(1);
    expect(dossier.groundModel?.boreholes.map((borehole) => borehole.id)).toEqual(['BH1']);
    expect(html).toContain('N21 at 3.00 m');
    expect(html).not.toContain('UNASSIGNED');
  });

  it('does not promote footing-table values as SPT tests in the report GroundModel', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH3 has a foundation recommendation table that must not become an SPT plot.',
      materials: [],
      classifications: [],
      synthesis: null,
      contentChunks: [],
      parameters: [
        { name: 'sptN', valueText: '15', numericValue: 15, unit: 'blows/ft', material: 'BH-3', context: 'Depth 1.5, footing table dimension 2 m x 2 m', sourcePages: [5] },
        { name: 'groundwaterDepth', valueText: '2.4 m', numericValue: 2.4, unit: 'm bgl', material: 'BH-3', context: 'Water table at 2.4 m on page 5', sourcePages: [5] },
      ],
    }));

    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.groundModel?.stats.sptTests ?? 0).toBe(0);
    expect(dossier.groundModel?.stats.groundwaterObservations).toBe(1);
    expect(html).not.toContain('N15');
    expect(html).toContain('2.40 m');
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
    expect(html).toContain('A-A Stratigraphic Section');
    expect(html).toContain('TD 10.0 m');
    expect(html).toContain('Use source logs before treating the profile as design-grade stratigraphy.');
  });

  it('keeps all recovered boreholes in integrated review and renders a schematic map without coordinates', () => {
    const scheduleText = [
      'Schedule of boreholes is tabulated below.',
      'Bore Hole No. Terminating Depth (m) Water Table below EGL (m)',
      'BH - 1 10.00 Not found',
      'BH - 2 10.00 Not found',
      'BH - 3 10.00 Not found',
      'The boring was carried out up to maximum depth of 10.00 m.',
    ].join('\n');
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1, BH2, and BH3 were drilled to 10.00 m. Only BH-3 has tabulated SPT evidence.',
      materials: [
        { kind: 'soil', description: 'hard clayey silt', uscsSymbol: 'CI', lithology: null },
        { kind: 'soil', description: 'medium dense silty sand', uscsSymbol: 'SM', lithology: null },
      ],
      parameters: [
        { name: 'sptN', valueText: '20', numericValue: 20, unit: 'blows/ft', material: 'BH-3', context: 'Depth 2.0 m, SPT row', sourcePages: [5] },
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
          chunkId: 'report-ground-model',
          pageRange: [22, 22],
          headingAncestry: ['Conclusion'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 90,
          text: 'Around BH - 1, hard clayey silt at top followed by weathered rock. Around BH - 2, hard clayey silt followed by very dense silty sand. Around BH - 3, medium dense to dense silty sand continues up to the terminating depth.',
          sourcePages: [22],
        },
      ],
    }));

    const model = buildIntegratedReviewModel(dossier);
    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.boreholeProfile?.columns.map((column) => column.boreholeId)).toEqual(['BH1', 'BH2', 'BH3']);
    expect(dossier.groundModel?.boreholes.map((borehole) => borehole.id)).toEqual(['BH1', 'BH2', 'BH3']);
    expect(model.boreholes.map((borehole) => borehole.id)).toEqual(['BH1', 'BH2', 'BH3']);
    expect(html).toContain('Schematic borehole alignment from recovered report boreholes');
    expect(html).not.toContain('No validated borehole coordinates were available for map rendering.');
    expect(html).toContain('data-borehole-target="BH1"');
    expect(html).toContain('data-borehole-target="BH2"');
    expect(html).toContain('data-borehole-target="BH3"');
    expect(html).toContain('BH1');
    expect(html).toContain('BH2');
    expect(html).toContain('BH3');
    expect(html).toContain('Professional A-A stratigraphic section');
  });

  it('promotes labelled report borehole coordinate text into GroundModel map points', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1 and BH2 were drilled to 10.00 m and reported with projected coordinates.',
      parameters: [],
      contentChunks: [
        {
          chunkId: 'bh1-coordinates',
          pageRange: [3, 3],
          headingAncestry: ['Borehole location schedule'],
          scope: 'table',
          sectionType: 'ground-model',
          significance: 95,
          text: 'BH1 Easting 542315.6 Northing 4237761.4 EPSG:32633. Layer 1 (0.0 m to 2.0 m): stiff clay. Layer 2 (2.0 m to 10.0 m): dense sand.',
          sourcePages: [3],
        },
        {
          chunkId: 'bh2-coordinates',
          pageRange: [3, 3],
          headingAncestry: ['Borehole location schedule'],
          scope: 'table',
          sectionType: 'ground-model',
          significance: 95,
          text: 'BH2 Easting 542355.2 Northing 4237780.5 EPSG:32633. Layer 1 (0.0 m to 3.0 m): soft clay. Layer 2 (3.0 m to 10.0 m): weathered sandstone.',
          sourcePages: [3],
        },
      ],
    }));
    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.groundModel?.coordinateSystem).toMatchObject({ kind: 'local-grid', crs: 'EPSG:32633' });
    expect(dossier.groundModel?.map?.summary.boreholePoints).toBe(2);
    expect(dossier.groundModel?.boreholes.find((borehole) => borehole.id === 'BH1')?.coordinates).toMatchObject({
      easting: 542315.6,
      northing: 4237761.4,
    });
    expect(dossier.groundModel?.boreholes.find((borehole) => borehole.id === 'BH2')?.coordinates).toMatchObject({
      easting: 542355.2,
      northing: 4237780.5,
    });
    expect(html).toContain('Source coordinates retained in EPSG:32633');
    expect(html).not.toContain('Schematic borehole alignment from recovered report boreholes');
  });

  it('promotes compact OCR borehole latitude and longitude text into report map points', () => {
    const page25 = [
      'BORE HOLE NO 1',
      'Latitude (N) - 25.5551',
      'Longitude(E) - 91.8693',
      'Layer 1 (0.0 m to 10.0 m): hard clayey silt and weathered rock.',
      'BOREHOLENO 2 Latitude(N) - 25.5546 Longitude(E) - 91.8703 Layer 1 (0.0 m to 10.0 m): hard clayey silt and very dense silty sand.',
    ].join('\n');
    const page26 = [
      'BOREHOLENO 3',
      'Latitude(N) - 25.5479',
      'Longitude(E) - 91.8742',
      'Layer 1 (0.0 m to 10.0 m): medium dense to dense silty sand.',
    ].join('\n');
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1, BH2, and BH3 were drilled to 10.00 m and report borehole coordinates were retained.',
      parameters: [],
      inspection: {
        kind: 'pdf-document-inspection',
        totalPages: 26,
        pages: [
          {
            pageNumber: 25,
            totalPages: 26,
            classification: 'digital-text',
            extractedText: page25,
            normalizedText: page25,
            normalizedArtifact: { nativeText: page25 },
          },
          {
            pageNumber: 26,
            totalPages: 26,
            classification: 'digital-text',
            extractedText: page26,
            normalizedText: page26,
            normalizedArtifact: { nativeText: page26 },
          },
        ],
      } as any,
      contentChunks: [
        {
          chunkId: 'bh1-coordinate-and-layer',
          pageRange: [25, 25],
          headingAncestry: ['Borehole log BH1'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 95,
          text: page25,
          sourcePages: [25],
        },
        {
          chunkId: 'bh3-coordinate-and-layer',
          pageRange: [26, 26],
          headingAncestry: ['Borehole log BH3'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 95,
          text: page26,
          sourcePages: [26],
        },
      ],
    }));
    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.groundModel?.coordinateSystem).toMatchObject({ kind: 'geographic', crs: 'EPSG:4326' });
    expect(dossier.groundModel?.map?.summary.boreholePoints).toBe(3);
    expect(dossier.groundModel?.boreholes.find((borehole) => borehole.id === 'BH1')?.coordinates).toMatchObject({
      latitude: 25.5551,
      longitude: 91.8693,
    });
    expect(dossier.groundModel?.boreholes.find((borehole) => borehole.id === 'BH2')?.coordinates).toMatchObject({
      latitude: 25.5546,
      longitude: 91.8703,
    });
    expect(dossier.groundModel?.boreholes.find((borehole) => borehole.id === 'BH3')?.coordinates).toMatchObject({
      latitude: 25.5479,
      longitude: 91.8742,
    });
    expect(html).toContain('Source coordinates retained in EPSG:4326');
    expect(html).not.toContain('Schematic borehole alignment from recovered report boreholes');
  });

  it('keeps the integrated map schematic when only some recovered boreholes have coordinates', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1 and BH2 were drilled to 10.00 m, but only BH1 has retained coordinates.',
      parameters: [],
      contentChunks: [
        {
          chunkId: 'bh1-coordinate-and-layer',
          pageRange: [3, 3],
          headingAncestry: ['Borehole log BH1'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 95,
          text: 'BH1 Latitude (N) - 25.5551 Longitude(E) - 91.8693. Layer 1 (0.0 m to 10.0 m): hard clayey silt.',
          sourcePages: [3],
        },
        {
          chunkId: 'bh2-layer-only',
          pageRange: [4, 4],
          headingAncestry: ['Borehole log BH2'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 95,
          text: 'BH2 Layer 1 (0.0 m to 10.0 m): dense silty sand. Borehole coordinates were not recovered.',
          sourcePages: [4],
        },
      ],
    }));
    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.groundModel?.map?.summary.boreholePoints).toBe(1);
    expect(dossier.groundModel?.map?.summary.missingBoreholeCoordinates).toBeGreaterThanOrEqual(1);
    expect(html).toContain('Schematic borehole alignment from recovered report boreholes');
    expect(html).not.toContain('Source coordinates retained in EPSG:4326');
    expect(html).toContain('BH1');
    expect(html).toContain('BH2');
  });

  it('honors southern and western hemisphere labels in report borehole coordinates', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1 was drilled to 10.00 m and report coordinates were retained.',
      parameters: [],
      contentChunks: [
        {
          chunkId: 'bh1-south-west-coordinate',
          pageRange: [3, 3],
          headingAncestry: ['Borehole log BH1'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 95,
          text: 'BORE HOLE NO 1 Latitude (S) - 25.5551 Longitude(W) - 91.8693. Layer 1 (0.0 m to 10.0 m): stiff clay.',
          sourcePages: [3],
        },
      ],
    }));

    expect(dossier.groundModel?.coordinateSystem).toMatchObject({ kind: 'geographic', crs: 'EPSG:4326' });
    expect(dossier.groundModel?.boreholes.find((borehole) => borehole.id === 'BH1')?.coordinates).toMatchObject({
      latitude: -25.5551,
      longitude: -91.8693,
    });
  });

  it('does not promote free-floating report coordinates without a borehole id', () => {
    const dossier = buildIngestDossier(makeGeotechResult({
      summary: 'BH1 was drilled to 10.00 m. The project site centroid was reported separately.',
      parameters: [],
      contentChunks: [
        {
          chunkId: 'site-centroid',
          pageRange: [2, 2],
          headingAncestry: ['Site location'],
          scope: 'section',
          sectionType: 'general',
          significance: 88,
          text: 'Project site centroid Latitude 35.681 Longitude 139.767. This is not a borehole coordinate.',
          sourcePages: [2],
        },
        {
          chunkId: 'bh1-layers',
          pageRange: [4, 4],
          headingAncestry: ['BH1'],
          scope: 'section',
          sectionType: 'ground-model',
          significance: 92,
          text: 'Layer 1 (0.0 m to 3.0 m): stiff clay. Layer 2 (3.0 m to 10.0 m): dense sand.',
          sourcePages: [4],
        },
      ],
    }));
    const html = renderIngestDossierAsHtml(dossier);

    expect(dossier.groundModel?.map?.summary.boreholePoints).toBe(0);
    expect(dossier.groundModel?.boreholes.find((borehole) => borehole.id === 'BH1')?.coordinates).toBeUndefined();
    expect(html).toContain('Schematic borehole alignment from recovered report boreholes');
  });
});
