import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();

vi.mock('../src/llm/router.js', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

import { extractGeotechDocumentFactsFromText } from '../src/vision/geotech-document.js';

describe('extractGeotechDocumentFactsFromText', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  it('short-circuits to deterministic extraction for strong text-bearing pages', async () => {
    const insight = await extractGeotechDocumentFactsFromText(
      'Ground investigation summary. Firm CLAY was encountered over weathered SHALE. USCS CL. Cohesion 25 kPa. Review settlement during detailed design.',
      { provider: 'hosted-beta', apiKey: '' } as any,
      { pageNumber: 2, totalPages: 8, pageClassification: 'digital-text' },
    );

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(insight.summary).toBeTruthy();
    expect(insight.parameters.some((parameter) => parameter.name === 'cohesion')).toBe(true);
    expect(insight.materials.length).toBeGreaterThan(0);
    expect(insight.warnings.join(' ')).toMatch(/skipped model extraction/i);
    expect(insight.parseStatus).toBe('parsed');
  });

  it('still calls the model for weak or ambiguous text', async () => {
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        documentClass: 'site-investigation-report',
        summary: 'Weak project text was resolved with model assistance.',
        materials: [],
        classifications: [],
        parameters: [],
        risks: [],
        recommendations: [],
        confidence: 76,
        warnings: [],
      }),
      latencyMs: 11,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'test-model',
      provider: 'hosted-beta',
    });

    const insight = await extractGeotechDocumentFactsFromText(
      'Project information and location only.',
      { provider: 'hosted-beta', apiKey: '' } as any,
      { pageNumber: 1, totalPages: 8, pageClassification: 'digital-text' },
    );

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(insight.summary).toContain('model assistance');
    expect(insight.documentClass).toBe('site-investigation-report');
  });

  it('short-circuits chain-of-custody laboratory pages without a model call', async () => {
    const insight = await extractGeotechDocumentFactsFromText(
      'PARACEL LABORATORIES LTD Chain of Custody Parcel ID 2250463 Required Analysis VOCs PAHs pH Sample ID BH102 S01 BH103 S01 Analytical Laboratory Results.',
      { provider: 'hosted-beta', apiKey: '' } as any,
      { pageNumber: 19, totalPages: 102, pageClassification: 'image-only' },
    );

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(insight.documentClass).toBe('lab-report');
    expect(insight.summary).toMatch(/chain of custody|analytical laboratory/i);
    expect(insight.warnings.join(' ')).toMatch(/skipped model extraction/i);
    expect(insight.parseStatus).toBe('partial');
  });

  it('short-circuits certificate-of-analysis laboratory tables without a model call', async () => {
    const insight = await extractGeotechDocumentFactsFromText(
      'Certificate of Analysis Method Quality Control Spike Analyte Result Reporting Limit Units Source Result %REC Notes Benzene ND Ethylbenzene ND Toluene ND Paracel Laboratories Ltd.',
      { provider: 'hosted-beta', apiKey: '' } as any,
      { pageNumber: 87, totalPages: 102, pageClassification: 'mixed' },
    );

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(insight.documentClass).toBe('lab-report');
    expect(insight.summary).toMatch(/certificate of analysis|analyte/i);
    expect(insight.warnings.join(' ')).toMatch(/skipped model extraction/i);
  });

  it('short-circuits text-heavy engineering recommendation pages when deterministic extraction finds strong parameters', async () => {
    const insight = await extractGeotechDocumentFactsFromText(
      'Backfill around the building should consist of non-frost susceptible granular material. Below hardscaped areas, all backfill material should be compacted to a minimum of 98% of its Standard Proctor Maximum Dry Density (SPMDD) to 1 m below the hardscape base and 100% thereafter. Elsewhere, all backfill should be compacted to 95% of its SPMDD. A modulus of subgrade reaction of 30 MPa/m is recommended for slabs on grade. Materials should be placed in lifts generally not greater than 0.2 m loose lifts.',
      { provider: 'hosted-beta', apiKey: '' } as any,
      { pageNumber: 22, totalPages: 102, pageClassification: 'mixed' },
    );

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(insight.parameters.some((parameter) => parameter.name === 'relativeCompaction')).toBe(true);
    expect(insight.parameters.some((parameter) => parameter.name === 'modulusSubgradeReaction')).toBe(true);
    expect(insight.warnings.join(' ')).toMatch(/skipped model extraction/i);
    expect(insight.parseStatus).toBe('parsed');
  });

  it('falls back to deterministic extraction when the text model call times out', async () => {
    generateTextMock.mockRejectedValue(new Error('Hosted beta request timed out after 120s.'));

    const insight = await extractGeotechDocumentFactsFromText(
      'Geotechnical laboratory review summary. Review the sampling plan and verify the site conditions before reuse decisions are finalized.',
      { provider: 'hosted-beta', apiKey: '' } as any,
      { pageNumber: 23, totalPages: 102, pageClassification: 'mixed' },
    );

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(insight.summary).toBeTruthy();
    expect(insight.warnings.join(' ')).toMatch(/used deterministic fallback/i);
    expect(insight.parseStatus).toBe('partial');
  });
});
