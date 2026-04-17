import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ChartSpec, VisualizationSource } from '../util/viz.js';

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

function openInBrowser(filePath: string): boolean {
  if (process.env.GEOTECHCLI_PLOT_NO_OPEN === '1') {
    return false;
  }

  const target = pathToFileURL(filePath).href;

  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', target], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return true;
    }

    if (process.platform === 'darwin') {
      const child = spawn('open', [target], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return true;
    }

    const child = spawn('xdg-open', [target], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
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
      --bg: #07111d;
      --bg-panel: rgba(10, 17, 29, 0.78);
      --bg-panel-strong: rgba(8, 14, 24, 0.96);
      --bg-soft: rgba(15, 23, 42, 0.72);
      --line: rgba(148, 163, 184, 0.16);
      --line-strong: rgba(125, 211, 252, 0.22);
      --text: #e6edf8;
      --muted: #93a4bb;
      --accent: #2dd4bf;
      --accent-alt: #60a5fa;
      --accent-warm: #f59e0b;
      --shadow: 0 24px 80px rgba(2, 8, 23, 0.45);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top right, rgba(45, 212, 191, 0.12), transparent 22rem),
        radial-gradient(circle at top left, rgba(96, 165, 250, 0.12), transparent 20rem),
        linear-gradient(180deg, #081220 0%, #040a12 100%);
      color: var(--text);
      font-family: "Aptos", "Segoe UI Variable", "Segoe UI", sans-serif;
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
      background: linear-gradient(135deg, rgba(12, 19, 31, 0.9), rgba(7, 12, 21, 0.78));
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
      font-size: clamp(32px, 4vw, 54px);
      line-height: 1.02;
      letter-spacing: -0.04em;
      font-weight: 650;
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
      background: rgba(255, 255, 255, 0.02);
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
      backdrop-filter: blur(18px);
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
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(15, 23, 42, 0.46);
      color: var(--text);
      text-align: left;
      cursor: pointer;
      transition: 180ms ease;
    }

    .chart-button:hover {
      transform: translateY(-1px);
      border-color: rgba(96, 165, 250, 0.35);
      background: rgba(15, 23, 42, 0.72);
    }

    .chart-button.active {
      border-color: rgba(45, 212, 191, 0.45);
      background:
        linear-gradient(135deg, rgba(45, 212, 191, 0.12), rgba(96, 165, 250, 0.1)),
        rgba(12, 18, 29, 0.92);
      box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.1);
    }

    .chart-button strong {
      display: block;
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
      border: 1px solid rgba(45, 212, 191, 0.28);
      background: rgba(45, 212, 191, 0.08);
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
      box-shadow: 0 0 16px rgba(45, 212, 191, 0.55);
    }

    #chartHost {
      min-height: 540px;
      height: 62vh;
      border-radius: 24px;
      overflow: hidden;
      border: 1px solid rgba(96, 165, 250, 0.16);
      background:
        linear-gradient(180deg, rgba(8, 13, 22, 0.94), rgba(6, 11, 18, 0.88)),
        radial-gradient(circle at top, rgba(96, 165, 250, 0.1), transparent 18rem);
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
      background: rgba(255, 255, 255, 0.02);
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
      font-size: 14px;
      line-height: 1.5;
      font-weight: 620;
      color: var(--text);
      word-break: break-word;
    }

    .note-panel {
      padding: 16px 18px;
      border-radius: 20px;
      border: 1px solid rgba(245, 158, 11, 0.18);
      background: rgba(245, 158, 11, 0.06);
      color: #f9d787;
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
    const palette = ['#2dd4bf', '#60a5fa', '#f59e0b', '#fb7185', '#a78bfa', '#22c55e'];
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
          symbolSize: series.style === 'scatter' ? 9 : 7,
          lineStyle: {
            width: 2.6,
            shadowBlur: 14,
            shadowColor: palette[index % palette.length] + '55'
          },
          itemStyle: {
            color: palette[index % palette.length]
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
        showSymbol: series.values.length <= 40,
        symbolSize: 7,
        lineStyle: {
          width: 2.6,
          shadowBlur: 14,
          shadowColor: palette[index % palette.length] + '55'
        },
        itemStyle: {
          color: palette[index % palette.length]
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
          top: 10,
          right: 18,
          textStyle: {
            color: '#a9b6c7',
            fontSize: 12
          }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross',
            label: {
              backgroundColor: '#09111d'
            }
          },
          backgroundColor: 'rgba(3, 8, 16, 0.94)',
          borderColor: 'rgba(96, 165, 250, 0.26)',
          borderWidth: 1,
          textStyle: {
            color: '#e6edf8'
          },
          padding: [10, 12],
          extraCssText: 'box-shadow:0 18px 48px rgba(2,8,23,0.48);border-radius:14px;'
        },
        grid: {
          top: 68,
          right: 28,
          bottom: 82,
          left: 72
        },
        toolbox: {
          right: 18,
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
            borderColor: '#7dd3fc'
          }
        },
        xAxis: {
          type: chart.xScale === 'log10' ? 'log' : 'value',
          name: chart.xLabel,
          nameLocation: 'middle',
          nameGap: 42,
          min: chart.xDomain ? chart.xDomain[0] : null,
          max: chart.xDomain ? chart.xDomain[1] : null,
          axisLabel: {
            color: '#90a2b7'
          },
          nameTextStyle: {
            color: '#cdd8e7',
            fontWeight: 600
          },
          axisLine: {
            lineStyle: {
              color: 'rgba(148,163,184,0.26)'
            }
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(148,163,184,0.10)'
            }
          },
          minorSplitLine: chart.xScale === 'log10'
            ? {
                show: true,
                lineStyle: {
                  color: 'rgba(148,163,184,0.06)'
                }
              }
            : undefined
        },
        yAxis: {
          type: 'value',
          name: chart.yLabel,
          nameGap: 54,
          inverse: Boolean(chart.invertY),
          min: chart.yDomain ? chart.yDomain[0] : null,
          max: chart.yDomain ? chart.yDomain[1] : null,
          axisLabel: {
            color: '#90a2b7'
          },
          nameTextStyle: {
            color: '#cdd8e7',
            fontWeight: 600
          },
          axisLine: {
            lineStyle: {
              color: 'rgba(148,163,184,0.26)'
            }
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(148,163,184,0.10)'
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
          },
          {
            type: 'slider',
            bottom: 22,
            height: 14,
            borderColor: 'rgba(148,163,184,0.12)',
            fillerColor: 'rgba(45,212,191,0.16)',
            backgroundColor: 'rgba(15,23,42,0.52)',
            textStyle: {
              color: '#6c7d92'
            }
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
        chart.xLabel + ' on X',
        chart.yLabel + ' on Y',
        chart.xScale === 'log10' ? 'logarithmic X scale' : 'linear X scale',
        chart.invertY ? 'inverted Y axis' : 'standard Y axis'
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

  const opened = options.open === false ? false : openInBrowser(outputPath);

  return {
    htmlPath: outputPath,
    opened,
  };
}
