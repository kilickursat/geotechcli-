import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { ChartSpec, VisualizationSource } from '../util/viz.js';
import { openFileInBrowser } from './browser.js';

const require = createRequire(import.meta.url);

type PlotMode = 'browser' | 'terminal';

interface BrowserSeriesChart {
  id: string;
  title: string;
  note: string | null;
  kind: 'series';
  xLabel: string;
  yLabel: string;
  xScale: 'linear' | 'log10';
  invertY: boolean;
  xDomain: [number, number] | null;
  yDomain: [number, number] | null;
  xValues: number[];
  series: Array<{ label: string; values: number[] }>;
}

interface BrowserXYChart {
  id: string;
  title: string;
  note: string | null;
  kind: 'xy';
  xLabel: string;
  yLabel: string;
  xScale: 'linear' | 'log10';
  invertY: boolean;
  xDomain: [number, number] | null;
  yDomain: [number, number] | null;
  series: Array<{
    label: string;
    style: 'line' | 'scatter';
    points: Array<{ x: number; y: number }>;
  }>;
}

type BrowserChart = BrowserSeriesChart | BrowserXYChart;

interface BrowserPayload {
  headline: string;
  sourceLabel: string;
  sourceType: string;
  activeChartId: string | null;
  charts: BrowserChart[];
}

export interface InteractivePlotOptions {
  headline?: string;
  sourceLabel?: string;
  outputPath?: string;
  focusChartId?: string;
  open?: boolean;
}

export interface InteractivePlotResult {
  htmlPath: string;
  opened: boolean;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'plot';
}

function serializeChart(chart: ChartSpec): BrowserChart {
  if (chart.kind === 'xy') {
    return {
      id: chart.id,
      title: chart.title,
      note: chart.note ?? null,
      kind: 'xy',
      xLabel: chart.xLabel,
      yLabel: chart.yLabel,
      xScale: chart.xScale ?? 'linear',
      invertY: Boolean(chart.invertY),
      xDomain: chart.xDomain ?? null,
      yDomain: chart.yDomain ?? null,
      series: (chart.xySeries ?? []).map((series) => ({
        label: series.label,
        style: series.style ?? 'line',
        points: series.points
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
          .map((point) => ({ x: point.x, y: point.y })),
      })),
    };
  }

  return {
    id: chart.id,
    title: chart.title,
    note: chart.note ?? null,
    kind: 'series',
    xLabel: chart.xLabel,
    yLabel: chart.yLabel,
    xScale: chart.xScale ?? 'linear',
    invertY: Boolean(chart.invertY),
    xDomain: chart.xDomain ?? null,
    yDomain: chart.yDomain ?? null,
    xValues: (chart.xValues ?? []).filter((value) => Number.isFinite(value)),
    series: (chart.series ?? []).map((values, index) => ({
      label: chart.labels?.[index] ?? `Series ${index + 1}`,
      values: values.filter((value) => Number.isFinite(value)),
    })),
  };
}

function serializePayload(
  source: VisualizationSource,
  options: InteractivePlotOptions,
): BrowserPayload {
  const charts = source.charts.map(serializeChart);

  return {
    headline: options.headline ?? 'Interactive Plot Viewer',
    sourceLabel: options.sourceLabel ?? source.sourceName,
    sourceType: source.sourceType.toUpperCase(),
    activeChartId:
      options.focusChartId && charts.some((chart) => chart.id === options.focusChartId)
        ? options.focusChartId
        : charts[0]?.id ?? null,
    charts,
  };
}

function serializeForHtml(payload: BrowserPayload): string {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function getEChartsBundle(): string {
  const path = require.resolve('echarts/dist/echarts.min.js');
  return readFileSync(path, 'utf-8');
}

function getOutputPath(sourceName: string, outputPath?: string): string {
  if (outputPath) {
    return resolve(outputPath);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'geotechcli-plot-'));
  return join(tempDir, `${slugify(sourceName)}.html`);
}

function buildHtml(payload: BrowserPayload): string {
  const embeddedPayload = serializeForHtml(payload);
  const echartsSource = getEChartsBundle();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${payload.headline}</title>
  <style>
    :root {
      --bg: #f6f9fe;
      --bg-panel: rgba(255, 255, 255, 0.92);
      --bg-panel-strong: rgba(255, 255, 255, 0.98);
      --bg-soft: rgba(244, 247, 252, 0.96);
      --line: rgba(20, 86, 240, 0.10);
      --line-strong: rgba(20, 86, 240, 0.18);
      --text: #1d2736;
      --muted: #5e6b7b;
      --accent: #1456f0;
      --accent-alt: #3daeff;
      --accent-warm: #ea5ec1;
      --shadow: 0 18px 48px rgba(28, 48, 86, 0.10);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top right, rgba(61, 174, 255, 0.16), transparent 20rem),
        radial-gradient(circle at top left, rgba(234, 94, 193, 0.10), transparent 18rem),
        linear-gradient(180deg, #fbfdff 0%, #f2f6fb 100%);
      color: var(--text);
      font-family: "DM Sans", "Segoe UI Variable", "Segoe UI", sans-serif;
    }

    .shell {
      max-width: 1480px;
      margin: 0 auto;
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 22px;
      min-height: 100vh;
    }

    .masthead {
      display: grid;
      gap: 16px;
      padding: 22px 24px;
      border: 1px solid var(--line-strong);
      border-radius: 24px;
      background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 251, 255, 0.94)),
        radial-gradient(circle at top right, rgba(61, 174, 255, 0.08), transparent 14rem);
      box-shadow: var(--shadow);
      animation: rise 420ms ease-out both;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 11px;
      font-weight: 700;
    }

    .eyebrow::before {
      content: "";
      width: 42px;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--accent));
    }

    .headline {
      margin: 0;
      font-family: "Outfit", "Segoe UI Variable", "Segoe UI", sans-serif;
      font-size: clamp(32px, 4vw, 54px);
      line-height: 1.08;
      letter-spacing: -0.04em;
      font-weight: 600;
    }

    .subhead {
      margin: 0;
      color: var(--muted);
      max-width: 72ch;
      font-size: 15px;
      line-height: 1.7;
    }

    .summary-strip {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }

    .summary-card {
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.92);
    }

    .summary-card span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 8px;
      font-weight: 700;
    }

    .summary-card strong {
      display: block;
      font-family: "Outfit", "Segoe UI Variable", "Segoe UI", sans-serif;
      font-size: 16px;
      color: var(--text);
      font-weight: 620;
      word-break: break-word;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
      gap: 20px;
      min-height: 0;
      flex: 1;
    }

    .sidebar,
    .canvas {
      border-radius: 24px;
      border: 1px solid var(--line);
      background: var(--bg-panel);
      box-shadow: var(--shadow);
    }

    .sidebar {
      padding: 22px 18px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      animation: rise 520ms ease-out both;
    }

    .section-label {
      margin: 0;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 11px;
      font-weight: 700;
    }

    .chart-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .chart-button {
      padding: 14px 15px;
      border-radius: 20px;
      border: 1px solid var(--line);
      background: rgba(249, 251, 255, 0.98);
      color: var(--text);
      text-align: left;
      cursor: pointer;
      transition: 180ms ease;
    }

    .chart-button:hover {
      transform: translateY(-1px);
      border-color: rgba(61, 174, 255, 0.32);
      background: rgba(255, 255, 255, 1);
    }

    .chart-button.active {
      border-color: rgba(20, 86, 240, 0.26);
      background:
        linear-gradient(135deg, rgba(20, 86, 240, 0.06), rgba(61, 174, 255, 0.10)),
        rgba(255, 255, 255, 0.98);
      box-shadow: inset 0 0 0 1px rgba(20, 86, 240, 0.06);
    }

    .chart-button strong {
      display: block;
      font-family: "Outfit", "Segoe UI Variable", "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
      margin-bottom: 5px;
      font-weight: 620;
    }

    .chart-button span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
    }

    .hint {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
      margin: 0;
    }

    .canvas {
      padding: 18px;
      display: grid;
      gap: 14px;
      animation: rise 620ms ease-out both;
    }

    .canvas-header {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 8px 4px 0;
    }

    .canvas-header h2 {
      margin: 0 0 6px;
      font-family: "Outfit", "Segoe UI Variable", "Segoe UI", sans-serif;
      font-size: clamp(22px, 2.6vw, 34px);
      line-height: 1.08;
      letter-spacing: -0.03em;
      font-weight: 640;
    }

    .canvas-header p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.7;
      max-width: 64ch;
    }

    .status-chip {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 999px;
      border: 1px solid rgba(20, 86, 240, 0.18);
      background: rgba(20, 86, 240, 0.06);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .status-chip::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 14px rgba(20, 86, 240, 0.28);
    }

    #chartHost {
      min-height: 540px;
      height: 62vh;
      border-radius: 22px;
      overflow: hidden;
      border: 1px solid rgba(20, 86, 240, 0.10);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.98)),
        radial-gradient(circle at top, rgba(61, 174, 255, 0.08), transparent 18rem);
    }

    .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
    }

    .detail-card {
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.96);
    }

    .detail-card span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 8px;
      font-weight: 700;
    }

    .detail-card strong {
      display: block;
      font-family: "Outfit", "Segoe UI Variable", "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.5;
      font-weight: 620;
      color: var(--text);
      word-break: break-word;
    }

    .note-panel {
      padding: 16px 18px;
      border-radius: 20px;
      border: 1px solid rgba(234, 94, 193, 0.14);
      background: rgba(234, 94, 193, 0.05);
      color: #6f2b59;
      font-size: 13px;
      line-height: 1.75;
    }

    @media (max-width: 1080px) {
      .workspace {
        grid-template-columns: 1fr;
      }

      #chartHost {
        height: 54vh;
      }
    }

    @media (max-width: 720px) {
      .shell {
        padding: 14px;
      }

      .masthead,
      .sidebar,
      .canvas {
        border-radius: 20px;
      }

      .canvas-header {
        flex-direction: column;
      }

      #chartHost {
        min-height: 360px;
        height: 48vh;
      }
    }

    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="masthead">
      <div class="eyebrow">geotechCLI plot studio</div>
      <h1 class="headline">${payload.headline}</h1>
      <p class="subhead">Interactive engineering plots with zoom, pan, image export, and chart-to-chart switching. Shift + mouse wheel zooms horizontally, and touchpad or mouse drag pans across the active chart.</p>
      <div class="summary-strip">
        <div class="summary-card">
          <span>Source</span>
          <strong id="sourceLabel"></strong>
        </div>
        <div class="summary-card">
          <span>Format</span>
          <strong id="sourceType"></strong>
        </div>
        <div class="summary-card">
          <span>Charts</span>
          <strong id="chartCount"></strong>
        </div>
        <div class="summary-card">
          <span>Active</span>
          <strong id="activeChartName"></strong>
        </div>
      </div>
    </section>

    <section class="workspace">
      <aside class="sidebar">
        <h2 class="section-label">Chart catalog</h2>
        <div id="chartList" class="chart-list"></div>
        <h2 class="section-label">Controls</h2>
        <p class="hint">Use the viewer tools to save a PNG, reset zoom, and inspect exact values. Each chart keeps geotechnical axis labels and depth inversion where the source marked it.</p>
      </aside>

      <section class="canvas">
        <div class="canvas-header">
          <div>
            <h2 id="chartTitle"></h2>
            <p id="chartSubtitle"></p>
          </div>
          <div class="status-chip">interactive render</div>
        </div>
        <div id="chartHost"></div>
        <div id="chartMetrics" class="details-grid"></div>
        <div id="chartNote" class="note-panel"></div>
      </section>
    </section>
  </div>

  <script>${echartsSource}</script>
  <script>
    const payload = ${embeddedPayload};
    const palette = ['#1456f0', '#3daeff', '#ea5ec1', '#ff8a4c', '#2f9b76', '#8f6ef5'];
    const sourceLabel = document.getElementById('sourceLabel');
    const sourceType = document.getElementById('sourceType');
    const chartCount = document.getElementById('chartCount');
    const activeChartName = document.getElementById('activeChartName');
    const chartList = document.getElementById('chartList');
    const chartTitle = document.getElementById('chartTitle');
    const chartSubtitle = document.getElementById('chartSubtitle');
    const chartMetrics = document.getElementById('chartMetrics');
    const chartNote = document.getElementById('chartNote');
    const chartHost = document.getElementById('chartHost');
    const instance = echarts.init(chartHost, null, { renderer: 'canvas' });

    sourceLabel.textContent = payload.sourceLabel;
    sourceType.textContent = payload.sourceType;
    chartCount.textContent = String(payload.charts.length);

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]);
    }

    function numberOrDash(value) {
      return typeof value === 'number' && Number.isFinite(value)
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : 'auto';
    }

    function buildSeries(chart) {
      if (chart.kind === 'xy') {
        return chart.series.map((series, index) => ({
          type: series.style === 'scatter' ? 'scatter' : 'line',
          name: series.label,
          data: series.points.map((point) => [point.x, point.y]),
          smooth: series.style !== 'scatter',
          showSymbol: series.style === 'scatter' || series.points.length <= 40,
          symbolSize: series.style === 'scatter' ? 8 : 6,
          lineStyle: {
            width: 2.4,
            shadowBlur: 8,
            shadowColor: palette[index % palette.length] + '22'
          },
          itemStyle: {
            color: palette[index % palette.length],
            borderColor: '#ffffff',
            borderWidth: 1
          },
          emphasis: {
            focus: 'series'
          }
        }));
      }

      return chart.series.map((series, index) => ({
        type: 'line',
        name: series.label,
        data: series.values.map((value, pointIndex) => [chart.xValues[pointIndex] ?? pointIndex + 1, value]),
        smooth: true,
        showSymbol: series.values.length <= 32,
        symbolSize: 6,
        lineStyle: {
          width: 2.4,
          shadowBlur: 8,
          shadowColor: palette[index % palette.length] + '22'
        },
        itemStyle: {
          color: palette[index % palette.length],
          borderColor: '#ffffff',
          borderWidth: 1
        },
        emphasis: {
          focus: 'series'
        }
      }));
    }

    function buildOption(chart) {
      return {
        backgroundColor: 'transparent',
        animationDuration: 480,
        color: palette,
        legend: {
          type: 'scroll',
          top: 10,
          left: 18,
          right: 112,
          textStyle: {
            color: '#4f5f72',
            fontSize: 12,
            fontWeight: 500
          },
          pageIconColor: '#1456f0',
          pageIconInactiveColor: 'rgba(20, 86, 240, 0.24)',
          pageTextStyle: {
            color: '#5e6b7b'
          }
        },
        tooltip: {
          trigger: 'axis',
          confine: true,
          axisPointer: {
            type: 'cross',
            label: {
              backgroundColor: '#1456f0',
              color: '#ffffff'
            },
            lineStyle: {
              color: 'rgba(20, 86, 240, 0.20)'
            }
          },
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          borderColor: 'rgba(20, 86, 240, 0.14)',
          borderWidth: 1,
          textStyle: {
            color: '#1d2736'
          },
          padding: [10, 12],
          extraCssText: 'box-shadow:0 16px 42px rgba(28,48,86,0.12);border-radius:14px;'
        },
        grid: {
          top: 84,
          right: 24,
          bottom: 46,
          left: 66,
          containLabel: true
        },
        toolbox: {
          top: 10,
          right: 18,
          itemGap: 12,
          itemSize: 15,
          feature: {
            saveAsImage: {
              title: 'Save PNG',
              pixelRatio: 2
            },
            restore: {
              title: 'Reset'
            }
          },
          iconStyle: {
            borderColor: '#1456f0'
          }
        },
        xAxis: {
          type: chart.xScale === 'log10' ? 'log' : 'value',
          name: chart.xLabel,
          nameLocation: 'middle',
          nameGap: 34,
          min: chart.xDomain ? chart.xDomain[0] : null,
          max: chart.xDomain ? chart.xDomain[1] : null,
          axisLabel: {
            color: '#5e6b7b',
            margin: 12,
            hideOverlap: true
          },
          nameTextStyle: {
            color: '#32465a',
            fontWeight: 600,
            fontSize: 12
          },
          axisLine: {
            lineStyle: {
              color: 'rgba(20, 86, 240, 0.14)'
            }
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(20, 86, 240, 0.08)'
            }
          },
          minorSplitLine: chart.xScale === 'log10'
            ? {
                show: true,
                lineStyle: {
                  color: 'rgba(20, 86, 240, 0.04)'
                }
              }
            : undefined
        },
        yAxis: {
          type: 'value',
          name: chart.yLabel,
          nameGap: 42,
          inverse: Boolean(chart.invertY),
          min: chart.yDomain ? chart.yDomain[0] : null,
          max: chart.yDomain ? chart.yDomain[1] : null,
          axisLabel: {
            color: '#5e6b7b',
            margin: 10,
            hideOverlap: true
          },
          nameTextStyle: {
            color: '#32465a',
            fontWeight: 600,
            fontSize: 12
          },
          axisLine: {
            lineStyle: {
              color: 'rgba(20, 86, 240, 0.14)'
            }
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(20, 86, 240, 0.08)'
            }
          }
        },
        dataZoom: [
          {
            type: 'inside',
            zoomOnMouseWheel: 'shift',
            moveOnMouseMove: true
          },
          {
            type: 'inside',
            orient: 'vertical'
          }
        ],
        series: buildSeries(chart)
      };
    }

    function buildMetric(label, value) {
      return '<div class="detail-card"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function buildChartSummary(chart) {
      const seriesCount = chart.series.length;
      const pointCount = chart.kind === 'xy'
        ? chart.series.reduce((total, series) => total + series.points.length, 0)
        : chart.series.reduce((total, series) => total + series.values.length, 0);

      chartMetrics.innerHTML = [
        buildMetric('Series', String(seriesCount)),
        buildMetric('Points', String(pointCount)),
        buildMetric('X range', chart.xDomain ? numberOrDash(chart.xDomain[0]) + ' to ' + numberOrDash(chart.xDomain[1]) : 'auto'),
        buildMetric('Y range', chart.yDomain ? numberOrDash(chart.yDomain[0]) + ' to ' + numberOrDash(chart.yDomain[1]) : 'auto'),
        buildMetric('X scale', chart.xScale === 'log10' ? 'logarithmic' : 'linear'),
        buildMetric('Y direction', chart.invertY ? 'inverted' : 'standard')
      ].join('');
    }

    function buildChartSubtitle(chart) {
      const parts = [
        chart.xScale === 'log10' ? 'logarithmic X scale' : 'linear X scale',
        chart.invertY ? 'inverted depth view' : 'standard axis direction',
        chart.series.length + ' plotted series'
      ];
      return parts.join(' | ');
    }

    let activeIndex = Math.max(
      0,
      payload.charts.findIndex((chart) => chart.id === payload.activeChartId)
    );

    function renderCatalog() {
      chartList.innerHTML = '';

      payload.charts.forEach((chart, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chart-button';
        if (index === activeIndex) {
          button.classList.add('active');
        }
        button.innerHTML =
          '<strong>' + escapeHtml(chart.title) + '</strong>' +
          '<span>' + escapeHtml(chart.kind === 'xy' ? 'XY chart' : 'Series chart') + '</span>';
        button.addEventListener('click', () => {
          activeIndex = index;
          renderActiveChart();
          renderCatalog();
        });
        chartList.appendChild(button);
      });
    }

    function renderActiveChart() {
      const chart = payload.charts[activeIndex];
      if (!chart) {
        return;
      }

      activeChartName.textContent = chart.title;
      chartTitle.textContent = chart.title;
      chartSubtitle.textContent = buildChartSubtitle(chart);
      chartNote.textContent = chart.note || 'No additional engineering note was attached to this chart.';
      buildChartSummary(chart);
      instance.setOption(buildOption(chart), true);
    }

    renderCatalog();
    renderActiveChart();

    window.addEventListener('resize', () => instance.resize());
  </script>
</body>
</html>`;
}

export function getPreferredPlotMode(): PlotMode {
  const explicit = (process.env.GEOTECHCLI_PLOT_MODE ?? '').trim().toLowerCase();

  if (explicit === 'ascii' || explicit === 'terminal' || explicit === 'text') {
    return 'terminal';
  }

  if (explicit === 'browser' || explicit === 'interactive' || explicit === 'html') {
    return 'browser';
  }

  return process.env.CI ? 'terminal' : 'browser';
}

export function shouldUseBrowserPlots(options?: { terminal?: boolean }): boolean {
  return !options?.terminal && getPreferredPlotMode() === 'browser';
}

export function renderInteractiveVisualization(
  source: VisualizationSource,
  options: InteractivePlotOptions = {},
): InteractivePlotResult {
  const payload = serializePayload(source, options);
  const html = buildHtml(payload);
  const outputPath = getOutputPath(source.sourceName, options.outputPath);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, 'utf-8');

  const opened = options.open === false
    ? false
    : openFileInBrowser(outputPath, { disabledEnvVar: 'GEOTECHCLI_PLOT_NO_OPEN' });

  return {
    htmlPath: outputPath,
    opened,
  };
}
