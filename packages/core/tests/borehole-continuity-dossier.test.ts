import { describe, expect, it } from 'vitest';

import { buildIngestDossier } from '../src/report/ingest-dossier.js';
import type { BoreholeDocumentIngestResult } from '../src/ingest/geotech-extract.js';

const continuityNote =
  'Trimmed 0.20 m page-break overlap at 18.00 m so 18.00–24.00 m follows 12.00–18.00 m.';

function layer(depthFrom: number, depthTo: number, description: string, uscsSymbol: string | null = null) {
  return { depthFrom, depthTo, description, uscsSymbol, sptN: null, waterContent: null, notes: null };
}

function makeResult(): BoreholeDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'borehole-log',
    generatedAt: '2026-06-08T00:00:00.000Z',
    source: { fileName: 'bh.pdf', inputKind: 'pdf', totalPages: 2, successfulPages: 2, failedPages: 0 },
    inspection: null,
    inspectionSummary: null,
    boreholes: [
      {
        boreholeId: 'BH1',
        totalDepth: 31,
        waterTableDepth: null,
        layers: [
          layer(0, 6, 'Made ground'),
          layer(6, 12, 'Dense sand', 'SP'),
          layer(12, 18, 'Stiff clay', 'CL'),
          layer(18, 24, 'Stiff clay', 'CL'),
          layer(24, 31, 'Rock'),
        ],
        summary: 'BH1 recovered made ground over sand, clay, and rock.',
        location: null,
        groundElevation: null,
        dateDrilled: null,
        drillingMethod: null,
        projectName: null,
        continuationDepth: null,
        pageNumber: 1,
        totalPages: 2,
        rawLLMText: '{}',
        latencyMs: 1,
        parseStatus: 'parsed',
        confidence: 88,
        warnings: [continuityNote],
        canAutoProceed: true,
      },
    ],
    pageAudits: [],
    pageFailures: [],
    warnings: [continuityNote],
    reviewFindings: [
      {
        code: 'continuity_repair_applied',
        severity: 'advisory',
        scope: 'borehole',
        message: continuityNote,
        boreholeId: 'BH1',
      },
    ],
    reviewReasons: [],
    reviewRequired: false,
    confidence: 88,
    canAutoProceed: true,
  };
}

describe('ingest dossier surfaces borehole continuity', () => {
  it('adds a continuity note to the stratigraphy profile and an advisory finding', () => {
    const dossier = buildIngestDossier(makeResult());

    expect(
      dossier.boreholeProfile?.notes.some((note) => /continuity repair/i.test(note)),
    ).toBe(true);

    const advisory = dossier.findings.find((group) => group.severity === 'advisory');
    expect(advisory).toBeDefined();
    expect(advisory?.items.some((item) => /overlap/i.test(item))).toBe(true);
  });

  it('does not add a continuity note when there are no continuity findings', () => {
    const result = makeResult();
    result.reviewFindings = [];
    result.warnings = [];
    result.boreholes[0]!.warnings = [];

    const dossier = buildIngestDossier(result);

    expect(
      dossier.boreholeProfile?.notes.some((note) => /continuity/i.test(note)),
    ).toBe(false);
  });
});
