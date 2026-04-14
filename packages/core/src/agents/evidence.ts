import { randomUUID } from 'node:crypto';

import { saveNamedDataset, loadProject } from '../storage/index.js';
import {
  ensureScenarioCaseFile,
  loadLatestScenarioArtifacts,
  saveScenarioCaseFile,
} from './case-file.js';
import type {
  ArtifactSource,
  AssumptionsPayload,
  EvidenceClass,
  EvidenceRecord,
  EvidenceReference,
  GroundModelPayload,
  ResultsPayload,
  ScenarioArtifact,
  ScenarioArtifactType,
} from './contracts.js';

const EVIDENCE_KIND = 'scenario-evidence';

function nowIso(): string {
  return new Date().toISOString();
}

function evidenceDatasetName(scenarioId: string, evidenceId: string): string {
  return `scenario-evidence:${scenarioId}:${evidenceId}`;
}

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase();
}

function evidenceKey(
  classValue: EvidenceClass,
  label: string,
  source: string,
): string {
  return `${normalizeKeyPart(classValue)}|${normalizeKeyPart(label)}|${normalizeKeyPart(source)}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isEvidenceReference(value: unknown): value is EvidenceReference {
  return Boolean(value)
    && typeof value === 'object'
    && 'evidenceId' in (value as Record<string, unknown>)
    && 'class' in (value as Record<string, unknown>)
    && 'label' in (value as Record<string, unknown>)
    && 'source' in (value as Record<string, unknown>);
}

function collectNestedEvidenceRefs(value: unknown): EvidenceReference[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNestedEvidenceRefs(item));
  }

  const record = value as Record<string, unknown>;
  const ownRefs = Array.isArray(record.evidenceRefs)
    ? record.evidenceRefs.filter((item): item is EvidenceReference => isEvidenceReference(item))
    : [];

  return [
    ...ownRefs,
    ...Object.values(record).flatMap((item) => collectNestedEvidenceRefs(item)),
  ];
}

function uniqueEvidenceRefs(refs: EvidenceReference[]): EvidenceReference[] {
  const seen = new Set<string>();
  const output: EvidenceReference[] = [];

  for (const ref of refs) {
    const key = `${ref.evidenceId}|${ref.class}|${ref.label}|${ref.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ref);
  }

  return output;
}

function toEvidenceRef(record: EvidenceRecord): EvidenceReference {
  return {
    evidenceId: record.evidenceId,
    class: record.class,
    label: record.label,
    source: record.source,
    ...(record.summary ? { summary: record.summary } : {}),
  };
}

function artifactDatasetName(
  scenarioId: string,
  artifactType: ScenarioArtifactType,
  version: number,
): string {
  return `scenario-artifact:${scenarioId}:${artifactType}:v${version}`;
}

export interface PersistEvidenceRecordOptions {
  projectId: string;
  scenarioId: string;
  class: EvidenceClass;
  label: string;
  source: string;
  summary?: string;
  detail?: string;
  tags?: string[];
  linkedArtifactIds?: string[];
  provenanceSource: ArtifactSource;
  metadata?: Record<string, unknown>;
  evidenceId?: string;
}

export function loadEvidenceRecord(
  projectId: string,
  scenarioId: string,
  evidenceId: string,
): EvidenceRecord | null {
  const project = loadProject(projectId);
  const direct = project.namedDatasets[evidenceDatasetName(scenarioId, evidenceId)]?.data;
  if (direct && typeof direct === 'object') {
    return direct as EvidenceRecord;
  }

  const prefix = `scenario-evidence:${scenarioId}:`;
  for (const [name, dataset] of Object.entries(project.namedDatasets)) {
    if (!name.startsWith(prefix)) continue;
    const data = dataset.data;
    if (data && typeof data === 'object' && (data as EvidenceRecord).evidenceId === evidenceId) {
      return data as EvidenceRecord;
    }
  }

  return null;
}

export function listEvidenceRecords(
  projectId: string,
  scenarioId: string,
): EvidenceRecord[] {
  const project = loadProject(projectId);
  const prefix = `scenario-evidence:${scenarioId}:`;

  return Object.entries(project.namedDatasets)
    .filter(([name]) => name.startsWith(prefix))
    .map(([, dataset]) => dataset.data)
    .filter((value): value is EvidenceRecord => Boolean(value) && typeof value === 'object')
    .sort((left, right) => (
      left.class.localeCompare(right.class)
      || left.label.localeCompare(right.label)
      || left.source.localeCompare(right.source)
    ));
}

function saveEvidenceDataset(
  projectId: string,
  scenarioId: string,
  record: EvidenceRecord,
  source = 'evidence',
): string {
  const datasetName = evidenceDatasetName(scenarioId, record.evidenceId);
  saveNamedDataset(projectId, {
    name: datasetName,
    kind: EVIDENCE_KIND,
    data: record,
    source,
  });
  return datasetName;
}

export function persistEvidenceRecord(
  options: PersistEvidenceRecordOptions,
): EvidenceRecord {
  const caseFile = ensureScenarioCaseFile(options.projectId, options.scenarioId, options.scenarioId);
  const key = evidenceKey(options.class, options.label, options.source);
  const existingDatasetName = caseFile.evidenceIndex[key];

  if (existingDatasetName) {
    const project = loadProject(options.projectId);
    const existing = project.namedDatasets[existingDatasetName]?.data;
    if (existing && typeof existing === 'object') {
      const merged: EvidenceRecord = {
        ...(existing as EvidenceRecord),
        summary: (existing as EvidenceRecord).summary ?? options.summary,
        detail: (existing as EvidenceRecord).detail ?? options.detail,
        tags: uniqueStrings([
          ...((existing as EvidenceRecord).tags ?? []),
          ...(options.tags ?? []),
        ]),
        linkedArtifactIds: uniqueStrings([
          ...((existing as EvidenceRecord).linkedArtifactIds ?? []),
          ...(options.linkedArtifactIds ?? []),
        ]),
        metadata: {
          ...((existing as EvidenceRecord).metadata ?? {}),
          ...(options.metadata ?? {}),
        },
      };

      saveEvidenceDataset(options.projectId, options.scenarioId, merged, options.provenanceSource.agent);
      return merged;
    }
  }

  const record: EvidenceRecord = {
    evidenceId: options.evidenceId ?? randomUUID(),
    projectId: options.projectId,
    scenarioId: options.scenarioId,
    class: options.class,
    label: options.label,
    source: options.source,
    summary: options.summary,
    detail: options.detail,
    tags: uniqueStrings(options.tags ?? []),
    linkedArtifactIds: uniqueStrings(options.linkedArtifactIds ?? []),
    provenance: {
      createdAt: nowIso(),
      derivedFrom: [...(options.linkedArtifactIds ?? [])],
      source: options.provenanceSource,
    },
    metadata: options.metadata,
  };

  const datasetName = saveEvidenceDataset(
    options.projectId,
    options.scenarioId,
    record,
    options.provenanceSource.agent,
  );

  saveScenarioCaseFile(
    options.projectId,
    options.scenarioId,
    {
      ...caseFile,
      evidenceDatasetRefs: uniqueStrings([...(caseFile.evidenceDatasetRefs ?? []), datasetName]),
      evidenceIndex: {
        ...(caseFile.evidenceIndex ?? {}),
        [key]: datasetName,
      },
    },
    options.provenanceSource.agent,
  );

  return record;
}

function inferFromGroundModel(
  payload: GroundModelPayload,
  artifact: ScenarioArtifact<'ground-model'>,
): Array<Omit<PersistEvidenceRecordOptions, 'projectId' | 'scenarioId' | 'provenanceSource'>> {
  const output: Array<Omit<PersistEvidenceRecordOptions, 'projectId' | 'scenarioId' | 'provenanceSource'>> = [];

  if (payload.summary) {
    output.push({
      class: 'Derived',
      label: 'Ground model summary',
      source: 'artifact:ground-model',
      summary: payload.summary,
      tags: ['ground-model'],
      linkedArtifactIds: [artifact.artifactId],
      metadata: { artifactType: artifact.artifactType, version: artifact.version },
    });
  }

  for (const stratum of payload.strata ?? []) {
    output.push({
      class: 'Derived',
      label: `Stratum ${stratum.fromM}m-${stratum.toM}m: ${stratum.material}`,
      source: 'artifact:ground-model',
      summary: stratum.description ?? stratum.material,
      detail: stratum.uscsSymbol ? `USCS: ${stratum.uscsSymbol}` : undefined,
      tags: ['ground-model', 'stratum'],
      linkedArtifactIds: [artifact.artifactId],
      metadata: {
        fromM: stratum.fromM,
        toM: stratum.toM,
        material: stratum.material,
        uscsSymbol: stratum.uscsSymbol,
      },
    });
  }

  return output;
}

function inferFromAssumptions(
  payload: AssumptionsPayload,
  artifact: ScenarioArtifact<'assumptions'>,
): Array<Omit<PersistEvidenceRecordOptions, 'projectId' | 'scenarioId' | 'provenanceSource'>> {
  return (payload.assumptions ?? []).map((assumption) => ({
    class: 'Assumed',
    label: assumption.statement,
    source: 'artifact:assumptions',
    summary: assumption.basis,
    detail: `Impact: ${assumption.impact}`,
    tags: ['assumption', assumption.category],
    linkedArtifactIds: [artifact.artifactId],
    metadata: {
      category: assumption.category,
      impact: assumption.impact,
    },
  }));
}

function inferFromResults(
  payload: ResultsPayload,
  artifact: ScenarioArtifact<'results'>,
): Array<Omit<PersistEvidenceRecordOptions, 'projectId' | 'scenarioId' | 'provenanceSource'>> {
  return (payload.records ?? []).map((record) => ({
    class: 'Computed',
    label: record.label,
    source: `artifact:${record.toolName || 'results'}`,
    summary: record.interpretation,
    detail: record.metrics.length > 0
      ? record.metrics
        .map((metric) => `${metric.name}: ${metric.value}${metric.units ? ` ${metric.units}` : ''}`)
        .join('; ')
      : undefined,
    tags: ['results', record.toolName],
    linkedArtifactIds: [artifact.artifactId],
    metadata: {
      toolName: record.toolName,
      method: record.method,
      metricCount: record.metrics.length,
    },
  }));
}

function inferArtifactEvidence(
  artifact: ScenarioArtifact,
): Array<Omit<PersistEvidenceRecordOptions, 'projectId' | 'scenarioId' | 'provenanceSource'>> {
  switch (artifact.artifactType) {
    case 'ground-model':
      return inferFromGroundModel(
        artifact.payload as GroundModelPayload,
        artifact as ScenarioArtifact<'ground-model'>,
      );
    case 'assumptions':
      return inferFromAssumptions(
        artifact.payload as AssumptionsPayload,
        artifact as ScenarioArtifact<'assumptions'>,
      );
    case 'results':
      return inferFromResults(
        artifact.payload as ResultsPayload,
        artifact as ScenarioArtifact<'results'>,
      );
    default:
      return [];
  }
}

function persistArtifactEvidenceRefs(
  projectId: string,
  scenarioId: string,
  artifact: ScenarioArtifact,
  refs: EvidenceReference[],
): void {
  const mergedArtifact: ScenarioArtifact = {
    ...artifact,
    evidenceRefs: uniqueEvidenceRefs([...(artifact.evidenceRefs ?? []), ...refs]),
  };

  saveNamedDataset(projectId, {
    name: artifactDatasetName(scenarioId, artifact.artifactType, artifact.version),
    kind: 'scenario-artifact',
    data: mergedArtifact,
    source: mergedArtifact.provenance.source.agent,
  });
}

export function persistArtifactEvidence(
  projectId: string,
  scenarioId: string,
  artifact: ScenarioArtifact,
): EvidenceRecord[] {
  const explicitRefs = uniqueEvidenceRefs([
    ...(artifact.evidenceRefs ?? []),
    ...collectNestedEvidenceRefs(artifact.payload),
  ]);

  const persisted: EvidenceRecord[] = explicitRefs.map((reference) =>
    persistEvidenceRecord({
      projectId,
      scenarioId,
      evidenceId: reference.evidenceId,
      class: reference.class,
      label: reference.label,
      source: reference.source,
      summary: reference.summary,
      linkedArtifactIds: [artifact.artifactId],
      provenanceSource: artifact.provenance.source,
      metadata: { artifactType: artifact.artifactType, version: artifact.version, explicit: true },
    }),
  );

  for (const inferred of inferArtifactEvidence(artifact)) {
    persisted.push(
      persistEvidenceRecord({
        projectId,
        scenarioId,
        provenanceSource: artifact.provenance.source,
        ...inferred,
      }),
    );
  }

  const refs = uniqueEvidenceRefs(persisted.map(toEvidenceRef));
  if (refs.length > 0) {
    persistArtifactEvidenceRefs(projectId, scenarioId, artifact, refs);
  }

  return persisted;
}

export function persistCaseFileEvidence(
  projectId: string,
  scenarioId: string,
): EvidenceRecord[] {
  const artifacts = loadLatestScenarioArtifacts(projectId, scenarioId);
  const persisted: EvidenceRecord[] = [];

  for (const artifact of Object.values(artifacts)) {
    if (!artifact) continue;
    persisted.push(...persistArtifactEvidence(projectId, scenarioId, artifact));
  }

  const byId = new Map<string, EvidenceRecord>();
  for (const record of persisted) {
    byId.set(record.evidenceId, record);
  }

  return [...byId.values()].sort((left, right) => (
    left.class.localeCompare(right.class)
    || left.label.localeCompare(right.label)
    || left.source.localeCompare(right.source)
  ));
}
