import type {
  GroundModel,
  GroundModelBorehole,
  GroundModelMap,
  GroundModelMapPoint,
  GroundModelParameter,
  GroundModelStratum,
} from '../ground-model/index.js';
import type { ProjectManifest, WorkspaceFileEntry } from './manifest.js';
import { normalizeLithology } from '../geo/lithology.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function percent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function renderMetric(label: string, value: string | number): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function formatCoordinate(point: GroundModelMapPoint): string {
  return point.coordinateType === 'geographic'
    ? `${point.latitude?.toFixed(6) ?? '-'}, ${point.longitude?.toFixed(6) ?? '-'}`
    : `${point.easting?.toFixed(2) ?? '-'}, ${point.northing?.toFixed(2) ?? '-'}`;
}

function renderGroundModelMapSvg(map: GroundModelMap): string {
  if (!map.extent || map.points.length === 0) {
    return '<p class="empty">No plottable GroundModel coordinates were detected.</p>';
  }

  const width = 760;
  const height = 380;
  const pad = 56;
  const plotWidth = width - pad * 2;
  const plotHeight = height - pad * 2;
  const scaleX = (x: number) => pad + ((x - map.extent!.minX) / map.extent!.width) * plotWidth;
  const scaleY = (y: number) => height - pad - ((y - map.extent!.minY) / map.extent!.height) * plotHeight;
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const x = pad + ratio * plotWidth;
    const y = pad + ratio * plotHeight;
    const xValue = map.extent!.minX + ratio * map.extent!.width;
    const yValue = map.extent!.maxY - ratio * map.extent!.height;
    return `
      <line x1="${x.toFixed(2)}" y1="${pad}" x2="${x.toFixed(2)}" y2="${height - pad}" stroke="#d8dfdc" stroke-width="1" />
      <line x1="${pad}" y1="${y.toFixed(2)}" x2="${width - pad}" y2="${y.toFixed(2)}" stroke="#d8dfdc" stroke-width="1" />
      <text x="${x.toFixed(2)}" y="${height - 20}" text-anchor="middle" fill="#64706b" font-size="10">${escapeHtml(xValue.toFixed(map.coordinateType === 'geographic' ? 5 : 0))}</text>
      <text x="18" y="${(y + 4).toFixed(2)}" fill="#64706b" font-size="10">${escapeHtml(yValue.toFixed(map.coordinateType === 'geographic' ? 5 : 0))}</text>
    `;
  }).join('');

  const points = map.points.map((point, index) => {
    const x = scaleX(point.x);
    const y = scaleY(point.y);
    const labelOffset = index % 2 === 0 ? -10 : 20;
    return `
      <g class="map-point">
        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="7" fill="#006b5a" stroke="#ffffff" stroke-width="2">
          <title>${escapeHtml(`${point.label} | ${formatCoordinate(point)} | evidence ${point.sourceEvidenceIds.join(', ') || '-'}`)}</title>
        </circle>
        <text x="${x.toFixed(2)}" y="${(y + labelOffset).toFixed(2)}" text-anchor="middle" fill="#17201d" font-size="11" font-weight="700">${escapeHtml(point.label)}</text>
      </g>
    `;
  }).join('');

  const xLabel = map.coordinateType === 'geographic' ? 'Longitude' : 'Easting';
  const yLabel = map.coordinateType === 'geographic' ? 'Latitude' : 'Northing';

  return `
    <div class="map-shell">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="GroundModel plan map">
        <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#ffffff" />
        <rect x="${pad}" y="${pad}" width="${plotWidth}" height="${plotHeight}" fill="#f8faf9" stroke="#b8c4bf" />
        ${gridLines}
        ${points}
        <text x="${width / 2}" y="${height - 4}" text-anchor="middle" fill="#64706b" font-size="11">${escapeHtml(xLabel)}</text>
        <text x="14" y="${height / 2}" transform="rotate(-90 14 ${height / 2})" text-anchor="middle" fill="#64706b" font-size="11">${escapeHtml(yLabel)}</text>
      </svg>
    </div>
  `;
}

function renderGroundModelMapSection(map: GroundModelMap | undefined): string {
  if (!map) {
    return '<p class="empty">GroundModel map data was not generated.</p>';
  }

  const pointRows = map.points.map((point) => `<tr>
    <td><code>${escapeHtml(point.label)}</code></td>
    <td>${escapeHtml(point.kind)}</td>
    <td>${escapeHtml(formatCoordinate(point))}</td>
    <td>${escapeHtml(point.coordinateType)}</td>
    <td>${escapeHtml(percent(point.confidence))}</td>
    <td>${escapeHtml(point.sourceEvidenceIds.join(', ') || '-')}</td>
  </tr>`).join('\n');

  return `
    <div class="metrics">
      ${renderMetric('Map Points', map.summary.totalPoints)}
      ${renderMetric('Borehole Points', map.summary.boreholePoints)}
      ${renderMetric('Missing Coords', map.summary.missingBoreholeCoordinates)}
      ${renderMetric('CRS', map.coordinateSystem.crs ?? map.coordinateSystem.kind)}
      ${renderMetric('Avg Confidence', percent(map.summary.averageConfidence))}
    </div>
    ${map.warnings.length > 0 ? `<ul class="list warning map-warnings">${map.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('\n')}</ul>` : ''}
    ${renderGroundModelMapSvg(map)}
    ${pointRows
      ? `<table><thead><tr><th>Point</th><th>Kind</th><th>Coordinate</th><th>Type</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>${pointRows}</tbody></table>`
      : '<p class="empty">No coordinate rows are available for map review.</p>'}
  `;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function materialKind(description: string): string {
  const key = normalizeLithology(description).key;
  if (key === 'bedrock' || key === 'weathered-rock') return 'rock';
  if (key === 'mixed') return 'unknown';
  return key; // organic | gravel | sand | clay | silt | fill
}

function materialColor(kind: string): string {
  switch (kind) {
    case 'fill': return '#9a8065';
    case 'rock': return '#657282';
    case 'gravel': return '#8a9aa4';
    case 'sand': return '#d4a843';
    case 'clay': return '#b87556';
    case 'silt': return '#b9a77a';
    case 'organic': return '#4d3b2e';
    default: return '#aab4b0';
  }
}

function shortLabel(value: string, max = 28): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function groundModelMaxDepth(model: GroundModel): number {
  const depths = [
    ...model.boreholes.flatMap((borehole) => [
      ...borehole.sptTests.map((test) => test.depth),
      ...borehole.strata.flatMap((stratum) => [stratum.topDepth, stratum.bottomDepth]),
      ...borehole.groundwater.map((observation) => observation.depth),
    ]),
    ...model.groundwater.map((observation) => observation.depth),
    ...model.labTests.map((test) => test.depth),
    ...model.parameters.map((parameter) => parameter.depth),
  ].filter((value): value is number => finiteNumber(value) && value >= 0);

  return Math.max(1, ...depths);
}

function stratumTop(stratum: GroundModelStratum, index: number, sorted: GroundModelStratum[]): number {
  if (finiteNumber(stratum.topDepth)) return Math.max(0, stratum.topDepth);
  if (index === 0) return 0;
  return sorted[index - 1]?.bottomDepth ?? sorted[index - 1]?.topDepth ?? 0;
}

function stratumBottom(stratum: GroundModelStratum, index: number, sorted: GroundModelStratum[], maxDepth: number): number {
  if (finiteNumber(stratum.bottomDepth)) return Math.max(0, stratum.bottomDepth);
  const nextTop = sorted.slice(index + 1).find((candidate) => finiteNumber(candidate.topDepth))?.topDepth;
  if (finiteNumber(nextTop)) return nextTop;
  const top = stratumTop(stratum, index, sorted);
  return Math.min(maxDepth, Math.max(top + Math.max(0.5, maxDepth * 0.08), top));
}

function renderBoreholeStripLogs(model: GroundModel): string {
  if (model.boreholes.length === 0) {
    return '<p class="empty">No boreholes are available for strip-log rendering.</p>';
  }

  const maxDepth = groundModelMaxDepth(model);
  const plotHeight = 320;
  const padTop = 36;
  const padBottom = 38;
  const scaleWidth = 58;
  const columnSpacing = 132;
  const width = scaleWidth + model.boreholes.length * columnSpacing + 112;
  const height = padTop + plotHeight + padBottom;
  const yForDepth = (depth: number) => padTop + (Math.max(0, Math.min(maxDepth, depth)) / maxDepth) * plotHeight;
  const depthTicks = Array.from({ length: Math.floor(maxDepth / 2) + 1 }, (_, index) => index * 2)
    .filter((depth) => depth <= maxDepth);
  if (!depthTicks.includes(maxDepth)) depthTicks.push(maxDepth);

  const grid = depthTicks.map((depth) => {
    const y = yForDepth(depth);
    return `
      <line x1="${scaleWidth}" y1="${y.toFixed(2)}" x2="${width - 42}" y2="${y.toFixed(2)}" stroke="#d8dfdc" stroke-width="1" />
      <text x="${scaleWidth - 12}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="#64706b" font-size="10">${escapeHtml(depth.toFixed(depth % 1 === 0 ? 0 : 1))}m</text>
    `;
  }).join('');

  const columns = model.boreholes.map((borehole, index) => {
    const x = scaleWidth + 24 + index * columnSpacing;
    const columnWidth = 58;
    const sortedStrata = [...borehole.strata].sort((left, right) => stratumTop(left, 0, []) - stratumTop(right, 0, []));
    const strataBlocks = sortedStrata.map((stratum, strataIndex) => {
      const top = stratumTop(stratum, strataIndex, sortedStrata);
      const bottom = Math.max(top, stratumBottom(stratum, strataIndex, sortedStrata, maxDepth));
      const y = yForDepth(top);
      const blockHeight = Math.max(6, yForDepth(bottom) - y);
      const kind = materialKind(stratum.description);
      const uncertain = !finiteNumber(stratum.topDepth) || !finiteNumber(stratum.bottomDepth) || stratum.warnings.length > 0;
      return `
        <rect x="${x}" y="${y.toFixed(2)}" width="${columnWidth}" height="${blockHeight.toFixed(2)}" fill="${materialColor(kind)}" stroke="#ffffff" stroke-width="1" ${uncertain ? 'stroke-dasharray="5,3"' : ''}>
          <title>${escapeHtml(`${borehole.id}: ${top.toFixed(2)}-${bottom.toFixed(2)}m | ${stratum.description} | evidence ${stratum.evidenceIds.join(', ') || '-'}`)}</title>
        </rect>
        ${blockHeight > 34 ? `<text x="${x + columnWidth / 2}" y="${(y + Math.min(blockHeight - 10, 18)).toFixed(2)}" text-anchor="middle" fill="#17201d" font-size="9" font-weight="700">${escapeHtml(shortLabel(kind.toUpperCase(), 8))}</text>` : ''}
      `;
    }).join('');

    const sptMarkers = borehole.sptTests.map((test) => {
      const y = yForDepth(test.depth);
      return `
        <circle cx="${x + columnWidth + 14}" cy="${y.toFixed(2)}" r="4" fill="#0b5fff" stroke="#ffffff" stroke-width="1">
          <title>${escapeHtml(`${borehole.id} SPT N=${test.nValue} at ${test.depth}m | evidence ${test.evidenceIds.join(', ') || '-'}`)}</title>
        </circle>
        <text x="${x + columnWidth + 22}" y="${(y + 3).toFixed(2)}" fill="#183d36" font-size="9">N${escapeHtml(test.nValue)}</text>
      `;
    }).join('');

    const groundwaterMarkers = borehole.groundwater.map((observation) => {
      const y = yForDepth(observation.depth);
      return `
        <line x1="${x - 6}" y1="${y.toFixed(2)}" x2="${x + columnWidth + 8}" y2="${y.toFixed(2)}" stroke="#0086c9" stroke-width="2" stroke-dasharray="6,3">
          <title>${escapeHtml(`${borehole.id} groundwater at ${observation.depth}m | evidence ${observation.evidenceIds.join(', ') || '-'}`)}</title>
        </line>
        <text x="${x + columnWidth / 2}" y="${(y - 5).toFixed(2)}" text-anchor="middle" fill="#006b8f" font-size="9" font-weight="700">GWL</text>
      `;
    }).join('');

    return `
      <g>
        <text x="${x + columnWidth / 2}" y="18" text-anchor="middle" fill="#17201d" font-size="12" font-weight="800">${escapeHtml(borehole.id)}</text>
        <rect x="${x}" y="${padTop}" width="${columnWidth}" height="${plotHeight}" fill="#f8faf9" stroke="#64706b" stroke-width="1.2" />
        ${strataBlocks || `<text x="${x + columnWidth / 2}" y="${padTop + plotHeight / 2}" text-anchor="middle" fill="#64706b" font-size="10">No strata</text>`}
        ${groundwaterMarkers}
        ${sptMarkers}
      </g>
    `;
  }).join('');

  const legendItems = [
    ['fill', 'Fill'],
    ['clay', 'Clay'],
    ['silt', 'Silt'],
    ['sand', 'Sand'],
    ['gravel', 'Gravel'],
    ['rock', 'Rock'],
  ].map(([kind, label], index) => {
    const x = scaleWidth + index * 88;
    const y = height - 20;
    return `<g><rect x="${x}" y="${y - 10}" width="14" height="10" fill="${materialColor(kind)}" /><text x="${x + 20}" y="${y}" fill="#64706b" font-size="10">${label}</text></g>`;
  }).join('');

  return `
    <div class="strip-log-shell">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Borehole strip logs">
        <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="#ffffff" />
        ${grid}
        ${columns}
        ${legendItems}
      </svg>
    </div>
  `;
}

function renderSptDepthPlot(model: GroundModel): string {
  const tests = model.boreholes.flatMap((borehole) => borehole.sptTests.map((test) => ({ borehole, test })));
  if (tests.length === 0) {
    return '<p class="empty">No SPT tests are available for depth plotting.</p>';
  }

  const width = 760;
  const height = 340;
  const pad = 54;
  const maxDepth = groundModelMaxDepth(model);
  const maxN = Math.max(1, ...tests.map(({ test }) => test.nValue));
  const xForN = (nValue: number) => pad + (nValue / maxN) * (width - pad * 2);
  const yForDepth = (depth: number) => pad + (depth / maxDepth) * (height - pad * 2);
  const colors = ['#0b5fff', '#006b5a', '#a05a00', '#8a2be2', '#b42318'];
  const boreholeIndex = new Map(model.boreholes.map((borehole, index) => [borehole.id, index]));
  const xTicks = Array.from({ length: 5 }, (_, index) => (maxN / 4) * index);
  const yTicks = Array.from({ length: 5 }, (_, index) => (maxDepth / 4) * index);

  const grid = [
    ...xTicks.map((tick) => {
      const x = xForN(tick);
      return `<line x1="${x.toFixed(2)}" y1="${pad}" x2="${x.toFixed(2)}" y2="${height - pad}" stroke="#d8dfdc" /><text x="${x.toFixed(2)}" y="${height - 18}" text-anchor="middle" fill="#64706b" font-size="10">${escapeHtml(tick.toFixed(0))}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = yForDepth(tick);
      return `<line x1="${pad}" y1="${y.toFixed(2)}" x2="${width - pad}" y2="${y.toFixed(2)}" stroke="#d8dfdc" /><text x="${pad - 12}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="#64706b" font-size="10">${escapeHtml(tick.toFixed(1))}m</text>`;
    }),
  ].join('');

  const points = tests.map(({ borehole, test }) => {
    const x = xForN(test.nValue);
    const y = yForDepth(test.depth);
    const color = colors[(boreholeIndex.get(borehole.id) ?? 0) % colors.length];
    return `
      <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5" fill="${color}" stroke="#ffffff" stroke-width="1.4">
        <title>${escapeHtml(`${borehole.id}: N=${test.nValue}, depth ${test.depth}m, evidence ${test.evidenceIds.join(', ') || '-'}`)}</title>
      </circle>
    `;
  }).join('');

  const legend = model.boreholes
    .filter((borehole) => borehole.sptTests.length > 0)
    .map((borehole, index) => {
      const x = pad + index * 92;
      const color = colors[index % colors.length];
      return `<g><circle cx="${x}" cy="20" r="5" fill="${color}" /><text x="${x + 10}" y="24" fill="#64706b" font-size="10">${escapeHtml(borehole.id)}</text></g>`;
    }).join('');

  return `
    <div class="chart-shell">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="SPT N-value depth plot">
        <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="#ffffff" />
        ${legend}
        <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" fill="#f8faf9" stroke="#b8c4bf" />
        ${grid}
        ${points}
        <text x="${width / 2}" y="${height - 4}" text-anchor="middle" fill="#64706b" font-size="11">SPT N-value</text>
        <text x="14" y="${height / 2}" transform="rotate(-90 14 ${height / 2})" text-anchor="middle" fill="#64706b" font-size="11">Depth (m)</text>
      </svg>
    </div>
  `;
}

function numericLabParameterGroups(model: GroundModel): Array<{ name: string; unit?: string; parameters: GroundModelParameter[] }> {
  const groups = new Map<string, { name: string; unit?: string; parameters: GroundModelParameter[] }>();
  for (const parameter of model.parameters) {
    const value = Number(parameter.value);
    if (!Number.isFinite(value) || !finiteNumber(parameter.depth)) continue;
    const key = `${parameter.name}::${parameter.unit ?? ''}`;
    const group = groups.get(key) ?? { name: parameter.name, unit: parameter.unit, parameters: [] };
    group.parameters.push(parameter);
    groups.set(key, group);
  }
  return [...groups.values()].slice(0, 6);
}

function renderLabParameterCharts(model: GroundModel): string {
  const groups = numericLabParameterGroups(model);
  if (groups.length === 0) {
    return '<p class="empty">No depth-bound numeric lab or design parameters are available for plotting.</p>';
  }

  return `<div class="mini-chart-grid">${groups.map((group) => {
    const width = 330;
    const height = 210;
    const pad = 42;
    const values = group.parameters.map((parameter) => Number(parameter.value));
    const depths = group.parameters.map((parameter) => parameter.depth ?? 0);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const maxDepth = Math.max(groundModelMaxDepth(model), ...depths);
    const valueRange = maxValue === minValue ? 1 : maxValue - minValue;
    const xForValue = (value: number) => pad + ((value - minValue) / valueRange) * (width - pad * 2);
    const yForDepth = (depth: number) => pad + (depth / maxDepth) * (height - pad * 2);
    const points = group.parameters.map((parameter) => {
      const x = xForValue(Number(parameter.value));
      const y = yForDepth(parameter.depth ?? 0);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.5" fill="#006b5a" stroke="#ffffff" stroke-width="1.2"><title>${escapeHtml(`${parameter.name}: ${parameter.value}${parameter.unit ? ` ${parameter.unit}` : ''} at ${parameter.depth}m | ${parameter.boreholeId ?? '-'} | evidence ${parameter.evidenceIds.join(', ') || '-'}`)}</title></circle>`;
    }).join('');
    return `
      <div class="mini-chart">
        <h4>${escapeHtml(group.name)}${group.unit ? ` (${escapeHtml(group.unit)})` : ''}</h4>
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(group.name)} depth plot">
          <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="#ffffff" />
          <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" fill="#f8faf9" stroke="#d8dfdc" />
          ${points}
          <text x="${pad}" y="${height - 13}" fill="#64706b" font-size="9">${escapeHtml(minValue.toFixed(2))}</text>
          <text x="${width - pad}" y="${height - 13}" text-anchor="end" fill="#64706b" font-size="9">${escapeHtml(maxValue.toFixed(2))}</text>
          <text x="12" y="${pad + 4}" fill="#64706b" font-size="9">0m</text>
          <text x="12" y="${height - pad + 4}" fill="#64706b" font-size="9">${escapeHtml(maxDepth.toFixed(1))}m</text>
        </svg>
      </div>
    `;
  }).join('')}</div>`;
}

function renderMonitoringVisualSummary(model: GroundModel): string {
  if (model.monitoringSeries.length === 0 && model.groundwater.length === 0) {
    return '<p class="empty">No monitoring or groundwater series were detected.</p>';
  }

  const rows = [
    ...model.groundwater.map((observation) => `<tr><td>groundwater</td><td>${escapeHtml(observation.boreholeId ?? '-')}</td><td>${escapeHtml(`${observation.depth} m bgl`)}</td><td>${escapeHtml(percent(observation.confidence))}</td><td>${escapeHtml(observation.evidenceIds.join(', ') || '-')}</td></tr>`),
    ...model.monitoringSeries.map((series) => `<tr><td>${escapeHtml(series.kind)}</td><td><code>${escapeHtml(series.sourcePath)}${series.sheetName ? `#${escapeHtml(series.sheetName)}` : ''}</code></td><td>${escapeHtml(`${series.sampleCount} samples`)}</td><td>${escapeHtml(percent(series.confidence))}</td><td>${escapeHtml(series.evidenceIds.join(', ') || '-')}</td></tr>`),
  ];

  return `<table><thead><tr><th>Type</th><th>Source / Borehole</th><th>Observation</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>${rows.join('\n')}</tbody></table>`;
}

function renderGroundModelVisualSection(model: GroundModel | undefined): string {
  if (!model) {
    return '<p class="empty">GroundModel was not generated for visual review.</p>';
  }

  return `
    <div class="subgrid">
      <div>
        <h3>Borehole Strip Logs</h3>
        ${renderBoreholeStripLogs(model)}
      </div>
      <div>
        <h3>SPT N vs Depth</h3>
        ${renderSptDepthPlot(model)}
      </div>
      <div>
        <h3>Lab Parameter Depth Charts</h3>
        ${renderLabParameterCharts(model)}
      </div>
      <div>
        <h3>Groundwater and Monitoring</h3>
        ${renderMonitoringVisualSummary(model)}
      </div>
    </div>
  `;
}

function renderFileRows(files: WorkspaceFileEntry[]): string {
  return files.map((file) => {
    const schema = file.schemas?.[0];
    const schemaText = schema
      ? `${schema.datasetType}${schema.sheetName ? ` / ${schema.sheetName}` : ''}`
      : file.classification.datasetType;
    return `<tr>
      <td><code>${escapeHtml(file.path)}</code></td>
      <td>${escapeHtml(file.classification.kind)}</td>
      <td>${escapeHtml(schemaText)}</td>
      <td>${escapeHtml(file.classification.branches.join(', ') || '-')}</td>
      <td>${escapeHtml(percent(file.classification.confidence))}</td>
      <td>${escapeHtml(formatBytes(file.sizeBytes))}</td>
    </tr>`;
  }).join('\n');
}

function renderSchemaRows(files: WorkspaceFileEntry[]): string {
  const rows = files.flatMap((file) => (file.schemas ?? []).map((schema) => ({
    file,
    schema,
  })));

  if (rows.length === 0) {
    return '<p class="empty">No tabular schemas were sampled in this workspace.</p>';
  }

  return `<table>
    <thead>
      <tr>
        <th>Source</th>
        <th>Schema</th>
        <th>Rows</th>
        <th>Detected Columns</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(({ file, schema }) => {
        const detected = [
          ...schema.detected.depthColumns.map((column) => `depth:${column}`),
          ...schema.detected.coordinateColumns.map((column) => `coord:${column}`),
          ...schema.detected.sptColumns.map((column) => `SPT:${column}`),
          ...schema.detected.cptColumns.map((column) => `CPT:${column}`),
          ...schema.detected.labColumns.map((column) => `lab:${column}`),
          ...schema.detected.monitoringColumns.map((column) => `monitor:${column}`),
        ].slice(0, 8);
        return `<tr>
          <td><code>${escapeHtml(file.path)}${schema.sheetName ? `#${escapeHtml(schema.sheetName)}` : ''}</code></td>
          <td>${escapeHtml(schema.datasetType)} (${escapeHtml(percent(schema.confidence))})</td>
          <td>${escapeHtml(schema.sampledRowCount)}</td>
          <td>${escapeHtml(detected.join(', ') || 'generic numeric/text table')}</td>
        </tr>`;
      }).join('\n')}
    </tbody>
  </table>`;
}

function renderGroundModelSection(manifest: ProjectManifest): string {
  const model = manifest.groundModel;
  if (!model) {
    return '<p class="empty">GroundModel was not generated for this analysis.</p>';
  }

  const boreholeRows = model.boreholes.slice(0, 40).map((borehole) => `<tr>
    <td><code>${escapeHtml(borehole.id)}</code></td>
    <td>${escapeHtml(borehole.coordinates
      ? borehole.coordinates.latitude != null
        ? `${borehole.coordinates.latitude}, ${borehole.coordinates.longitude}`
        : `${borehole.coordinates.easting}, ${borehole.coordinates.northing}`
      : '-')}</td>
    <td>${escapeHtml(borehole.sptTests.length)}</td>
    <td>${escapeHtml(borehole.strata.length)}</td>
    <td>${escapeHtml(borehole.groundwater.length)}</td>
    <td>${escapeHtml(percent(borehole.confidence))}</td>
  </tr>`).join('\n');

  const parameterRows = model.parameters.slice(0, 40).map((parameter) => `<tr>
    <td>${escapeHtml(parameter.name)}</td>
    <td>${escapeHtml(parameter.value)}${parameter.unit ? ` ${escapeHtml(parameter.unit)}` : ''}</td>
    <td>${escapeHtml(parameter.boreholeId ?? '-')}</td>
    <td>${escapeHtml(parameter.sampleId ?? '-')}</td>
    <td>${escapeHtml(parameter.depth ?? '-')}</td>
    <td>${escapeHtml(parameter.evidenceIds.join(', '))}</td>
  </tr>`).join('\n');

  return `
    <div class="metrics">
      ${renderMetric('Boreholes', model.stats.boreholes)}
      ${renderMetric('SPT tests', model.stats.sptTests)}
      ${renderMetric('Lab tests', model.stats.labTests)}
      ${renderMetric('Parameters', model.stats.parameters)}
      ${renderMetric('Evidence refs', model.stats.evidenceRefs)}
      ${renderMetric('Rejected', model.stats.rejectedObservations)}
    </div>
    <div class="subgrid">
      <div>
        <h3>Boreholes</h3>
        ${boreholeRows
          ? `<table><thead><tr><th>ID</th><th>Location</th><th>SPT</th><th>Strata</th><th>GWL</th><th>Confidence</th></tr></thead><tbody>${boreholeRows}</tbody></table>`
          : '<p class="empty">No boreholes were bound to evidence yet.</p>'}
      </div>
      <div>
        <h3>Parameters</h3>
        ${parameterRows
          ? `<table><thead><tr><th>Name</th><th>Value</th><th>BH</th><th>Sample</th><th>Depth</th><th>Evidence</th></tr></thead><tbody>${parameterRows}</tbody></table>`
          : '<p class="empty">No lab or design parameters were bound to evidence yet.</p>'}
      </div>
    </div>
  `;
}

function renderVerifierSection(manifest: ProjectManifest): string {
  const verifier = manifest.verifier;
  if (!verifier) {
    return '<p class="empty">Verifier was not run for this analysis.</p>';
  }

  if (verifier.findings.length === 0) {
    return '<p class="empty">No verifier findings. Evidence-bound data passed the current deterministic checks.</p>';
  }

  return `<table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Code</th>
        <th>Finding</th>
        <th>Evidence</th>
        <th>Recommendation</th>
      </tr>
    </thead>
    <tbody>
      ${verifier.findings.map((finding) => `<tr>
        <td><span class="badge ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span></td>
        <td><code>${escapeHtml(finding.code)}</code></td>
        <td>${escapeHtml(finding.message)}</td>
        <td>${escapeHtml(finding.evidenceIds.join(', ') || '-')}</td>
        <td>${escapeHtml(finding.recommendation ?? '-')}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

function renderCalculationReadinessSection(manifest: ProjectManifest): string {
  const readiness = manifest.verifier?.calculationReadiness;
  if (!readiness) {
    return '<p class="empty">Calculation readiness was not assessed for this analysis.</p>';
  }

  return `
    <div class="metrics">
      ${renderMetric('Ready', readiness.summary.ready)}
      ${renderMetric('With Assumptions', readiness.summary.readyWithAssumptions)}
      ${renderMetric('Blocked', readiness.summary.blocked)}
    </div>
    <table>
      <thead>
        <tr>
          <th>Workflow</th>
          <th>Status</th>
          <th>Score</th>
          <th>Route</th>
          <th>Missing / Assumptions</th>
          <th>Evidence</th>
          <th>Recommendation</th>
        </tr>
      </thead>
      <tbody>
        ${readiness.workflows.map((workflow) => `<tr>
          <td>${escapeHtml(workflow.label)}</td>
          <td><span class="badge ${escapeHtml(workflow.status)}">${escapeHtml(workflow.status.replace(/_/g, ' '))}</span></td>
          <td>${escapeHtml(`${workflow.score}/100`)}</td>
          <td><code>${escapeHtml(workflow.toolName)}</code><br /><small>${escapeHtml(workflow.commandTemplate)}</small></td>
          <td>${escapeHtml(workflow.missing.join(', ') || '-')}</td>
          <td>${escapeHtml(workflow.evidenceIds.join(', ') || '-')}</td>
          <td>${escapeHtml(workflow.recommendation)}${workflow.inputDraft ? `<details><summary>Draft input</summary><pre>${escapeHtml(JSON.stringify(workflow.inputDraft, null, 2))}</pre></details>` : ''}</td>
        </tr>`).join('\n')}
      </tbody>
    </table>
  `;
}

function renderEvidenceRows(manifest: ProjectManifest): string {
  const evidence = manifest.groundModel?.evidence ?? [];
  if (evidence.length === 0) {
    return '<p class="empty">No evidence references were generated.</p>';
  }

  return `<table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Source</th>
        <th>Location</th>
        <th>Value</th>
        <th>Confidence</th>
      </tr>
    </thead>
    <tbody>
      ${evidence.slice(0, 80).map((ref) => `<tr>
        <td><code>${escapeHtml(ref.id)}</code></td>
        <td><code>${escapeHtml(ref.sourcePath)}</code></td>
        <td>${escapeHtml([
          ref.location.sheetName ? `sheet ${ref.location.sheetName}` : '',
          ref.location.rowNumber ? `row ${ref.location.rowNumber}` : '',
          ref.location.columnName ? `col ${ref.location.columnName}` : '',
        ].filter(Boolean).join(', ') || '-')}</td>
        <td>${escapeHtml(ref.normalizedValue ?? ref.rawValue ?? '-')}</td>
        <td>${escapeHtml(percent(ref.confidence))}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

export function renderWorkspaceManifestAsHtml(manifest: ProjectManifest): string {
  const title = 'geotechCLI Workspace Report';
  const fileRows = renderFileRows(manifest.files);
  const warnings = manifest.warnings.slice(0, 20);
  const verifier = manifest.verifier;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17201d;
      --muted: #64706b;
      --line: #d8dfdc;
      --soft: #f3f6f4;
      --accent: #006b5a;
      --warning: #8a4b00;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: #fbfcfb;
      line-height: 1.5;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 40px 22px 64px;
    }
    header {
      border-bottom: 1px solid var(--line);
      padding-bottom: 26px;
      margin-bottom: 28px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1 {
      margin: 6px 0 8px;
      font-size: clamp(30px, 5vw, 56px);
      line-height: 1.02;
      letter-spacing: 0;
    }
    .subhead {
      max-width: 840px;
      color: var(--muted);
      font-size: 17px;
    }
    section {
      border-top: 1px solid var(--line);
      padding: 28px 0;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 20px;
      letter-spacing: 0;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1px;
      background: var(--line);
      border: 1px solid var(--line);
    }
    .metric {
      background: white;
      padding: 16px;
      min-height: 86px;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .metric strong {
      display: block;
      margin-top: 8px;
      font-size: 28px;
      line-height: 1.1;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border: 1px solid var(--line);
      overflow-wrap: anywhere;
    }
    th, td {
      padding: 11px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th {
      color: var(--muted);
      background: var(--soft);
      font-size: 12px;
      font-weight: 700;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      color: #183d36;
    }
    .list {
      margin: 0;
      padding-left: 18px;
      color: var(--ink);
    }
    .list li { margin: 8px 0; }
    .warning { color: var(--warning); }
    .empty { color: var(--muted); }
    h3 {
      margin: 22px 0 10px;
      font-size: 15px;
    }
    .subgrid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 22px;
      margin-top: 20px;
    }
    .badge {
      display: inline-block;
      min-width: 68px;
      padding: 3px 7px;
      border: 1px solid var(--line);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge.blocking { color: #8c1d18; background: #fff0ee; }
    .badge.review { color: #7b4a00; background: #fff7e8; }
    .badge.info { color: #165766; background: #edf8fa; }
    .badge.ready { color: #075e45; background: #eaf8f1; }
    .badge.ready_with_assumptions { color: #7b4a00; background: #fff7e8; min-width: 150px; }
    .badge.blocked { color: #8c1d18; background: #fff0ee; }
    .map-shell {
      margin: 18px 0;
      border: 1px solid var(--line);
      background: white;
      overflow-x: auto;
      border-radius: 12px;
    }
    .map-shell svg {
      display: block;
      min-width: 720px;
      width: 100%;
      height: auto;
    }
    .strip-log-shell,
    .chart-shell {
      margin: 14px 0;
      border: 1px solid var(--line);
      background: white;
      overflow-x: auto;
      border-radius: 12px;
    }
    .strip-log-shell svg,
    .chart-shell svg {
      display: block;
      min-width: 720px;
      width: 100%;
      height: auto;
    }
    .mini-chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
    }
    .mini-chart {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: white;
      overflow: hidden;
    }
    .mini-chart h4 {
      margin: 0;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
      color: var(--muted);
      background: var(--soft);
    }
    .mini-chart svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .map-warnings {
      margin-top: 16px;
    }
    @media (max-width: 720px) {
      main { padding: 26px 14px 46px; }
      table { display: block; overflow-x: auto; }
      th, td { white-space: nowrap; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="eyebrow">geotechCLI analyze</div>
      <h1>Workspace Report</h1>
      <p class="subhead">${escapeHtml(manifest.rootPath)}</p>
    </header>

    <section>
      <h2>Overview</h2>
      <div class="metrics">
        ${renderMetric('Files', manifest.summary.totalFiles)}
        ${renderMetric('Supported', manifest.summary.supportedFiles)}
        ${renderMetric('Tabular', manifest.summary.tabularFiles)}
        ${renderMetric('PDFs', manifest.summary.pdfFiles)}
        ${renderMetric('Branches', manifest.summary.branches.length || '-')}
        ${renderMetric('Skipped', manifest.summary.skippedFiles)}
        ${renderMetric('Verifier', verifier?.status ?? '-')}
        ${renderMetric('Calc Ready', verifier?.calculationReadiness.summary.ready ?? '-')}
      </div>
    </section>

    <section>
      <h2>Detected Branches</h2>
      <p>${escapeHtml(manifest.summary.branches.join(', ') || 'No branch-specific evidence detected yet.')}</p>
    </section>

    <section>
      <h2>Recommended Next Steps</h2>
      <ul class="list">
        ${manifest.summary.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}
      </ul>
    </section>

    <section>
      <h2>File Manifest</h2>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Kind</th>
            <th>Dataset</th>
            <th>Branches</th>
            <th>Confidence</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>${fileRows}</tbody>
      </table>
    </section>

    <section>
      <h2>Tabular Schemas</h2>
      ${renderSchemaRows(manifest.files)}
    </section>

    <section>
      <h2>GroundModel</h2>
      ${renderGroundModelSection(manifest)}
    </section>

    <section>
      <h2>GroundModel Map</h2>
      ${renderGroundModelMapSection(manifest.groundModel?.map)}
    </section>

    <section>
      <h2>GroundModel Visual Review</h2>
      ${renderGroundModelVisualSection(manifest.groundModel)}
    </section>

    <section>
      <h2>Verifier Findings</h2>
      ${renderVerifierSection(manifest)}
    </section>

    <section>
      <h2>Calculation Readiness</h2>
      ${renderCalculationReadinessSection(manifest)}
    </section>

    <section>
      <h2>Evidence Table</h2>
      ${renderEvidenceRows(manifest)}
    </section>

    <section>
      <h2>Warnings</h2>
      ${warnings.length > 0
        ? `<ul class="list warning">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('\n')}</ul>`
        : '<p class="empty">No manifest warnings.</p>'}
    </section>
  </main>
</body>
</html>`;
}
