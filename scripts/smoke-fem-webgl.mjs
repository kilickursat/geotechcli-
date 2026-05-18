import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    caseName: 'auto',
    demo: undefined,
    html: undefined,
    manifest: undefined,
    out: '__fem-webgl-smoke',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const value = argv[index + 1];
    if (item === '--case') {
      args.caseName = value;
      index += 1;
    } else if (item === '--demo') {
      args.demo = value;
      index += 1;
    } else if (item === '--html') {
      args.html = value;
      index += 1;
    } else if (item === '--manifest') {
      args.manifest = value;
      index += 1;
    } else if (item === '--out') {
      args.out = value;
      index += 1;
    }
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function inferCase(manifest, requested) {
  if (requested && requested !== 'auto') return requested;
  if (manifest.analysisCase?.objective === 'foundation_settlement') return 'raft';
  if (manifest.analysisCase?.objective === 'excavation_deformation') return 'excavation';
  if (manifest.analysisCase?.objective === 'tunnel_volume_loss_settlement') return 'tunnel';
  return 'auto';
}

async function generateDemoArtifacts(demo, outDir) {
  const cliPath = resolve('packages/cli/dist/index.js');
  assert(existsSync(cliPath), `Built CLI not found at ${cliPath}. Run npm run build first.`);
  const html = resolve(outDir, `${demo}.html`);
  const manifest = resolve(outDir, `${demo}.manifest.json`);
  await execFileAsync(process.execPath, [
    cliPath,
    'fem',
    'demo',
    demo,
    '--experimental',
    '--save-html',
    html,
    '--output',
    manifest,
    '--no-open',
    '--json',
  ], { maxBuffer: 10 * 1024 * 1024 });
  return { html, manifest };
}

function commonManifestChecks(manifest) {
  assert(manifest.schemaVersion === 'fem-result-manifest.v0', 'manifest schema mismatch');
  assert(manifest.analysisCase?.experimental === true, 'manifest case is not experimental');
  assert(manifest.backend?.deterministic === true, 'backend is not deterministic');
  assert(manifest.envelope?.reactionBalanceRatio === 1, 'reaction balance mismatch');
  assert(Array.isArray(manifest.visualization?.base), 'visualization base missing');
  assert(Array.isArray(manifest.visualization?.disp), 'visualization disp missing');
  assert(Array.isArray(manifest.visualization?.color), 'visualization color missing');
  assert(Array.isArray(manifest.visualization?.tri), 'visualization triangles missing');
  assert(Array.isArray(manifest.visualization?.edge), 'visualization edges missing');
  if (manifest.resultFields != null) assert(Array.isArray(manifest.resultFields), 'resultFields must be an array');
  if (manifest.steps != null) assert(Array.isArray(manifest.steps), 'steps must be an array');
  if (manifest.datasets != null) assert(Array.isArray(manifest.datasets), 'datasets must be an array');
}

function caseManifestChecks(manifest, caseName) {
  commonManifestChecks(manifest);
  if (caseName === 'raft') {
    assert(manifest.analysisCase?.objective === 'foundation_settlement', 'not a raft/foundation manifest');
    assert(manifest.mesh?.nodes === 1183, 'unexpected raft node count');
    assert(manifest.mesh?.elements === 864, 'unexpected raft element count');
    assert(Number.isFinite(manifest.envelope?.maxSettlementMm), 'raft settlement is not finite');
    assert(manifest.resultFields?.some((field) => field.id === 'vertical_settlement'), 'missing raft result field metadata');
  } else if (caseName === 'excavation') {
    assert(manifest.analysisCase?.objective === 'excavation_deformation', 'not an excavation manifest');
    assert(manifest.mesh?.nodes === 1989, 'unexpected excavation node count');
    assert(manifest.mesh?.elements === 1536, 'unexpected excavation element count');
    assert(manifest.envelope?.stageCount === 3, 'excavation stage count mismatch');
    assert(Number.isFinite(manifest.envelope?.maxWallDeflectionMm), 'wall deflection is not finite');
    assert(manifest.visualization?.frames?.length === 9, 'expected three fields across three stages');
    assert(manifest.steps?.length === 3, 'expected three result steps');
    assert(manifest.datasets?.length >= 9, 'expected result datasets for staged frames');
  } else if (caseName === 'tunnel') {
    assert(manifest.analysisCase?.objective === 'tunnel_volume_loss_settlement', 'not a tunnel volume-loss manifest');
    assert(manifest.backend?.id === 'builtin-tunnel-volume-loss-demo', 'unexpected tunnel backend');
    assert(manifest.mesh?.nodes === 1615, 'unexpected tunnel node count');
    assert(manifest.mesh?.elements === 1152, 'unexpected tunnel element count');
    assert(Number.isFinite(manifest.envelope?.maxSurfaceSettlementMm), 'tunnel surface settlement is not finite');
    assert(Number.isFinite(manifest.envelope?.volumeLossPercent), 'tunnel volume loss is not finite');
    assert(Number.isFinite(manifest.envelope?.troughWidthM), 'tunnel trough width is not finite');
    assert(manifest.resultFields?.some((field) => field.id === 'surface_settlement'), 'missing tunnel result field metadata');
    assert(manifest.steps?.map((step) => step.id).includes('final'), 'missing tunnel final step metadata');
  }
}

async function assertCanvas(page, viewportName) {
  const probe = await page.locator('#glcanvas').evaluate((canvas) => {
    const renderer = document.body.dataset.renderer || 'unknown';
    let pixels;
    let width = canvas.width;
    let height = canvas.height;
    if (renderer === 'webgl') {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { ok: false, renderer, reason: 'no webgl context' };
      width = gl.drawingBufferWidth;
      height = gl.drawingBufferHeight;
      pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else {
      const ctx = canvas.getContext('2d');
      if (!ctx) return { ok: false, renderer, reason: 'no 2d context' };
      pixels = ctx.getImageData(0, 0, width, height).data;
    }
    let bright = 0;
    let distinct = 0;
    let previous = -1;
    for (let index = 0; index < pixels.length; index += 32) {
      const value = pixels[index] + pixels[index + 1] + pixels[index + 2];
      if (value > 100) bright += 1;
      if (value !== previous) distinct += 1;
      previous = value;
    }
    return { ok: bright > 20 && distinct > 5, renderer, bright, distinct, width, height };
  });
  assert(probe.ok, `${viewportName}: canvas looked blank (${JSON.stringify(probe)})`);
  return probe;
}

async function assertScaleLabel(page, expected) {
  await page.locator('#scaleLabel').waitFor();
  const actual = (await page.locator('#scaleLabel').textContent())?.trim();
  assert(actual === expected, `${expected} scale label should be active, received ${actual ?? 'empty'}`);
}

async function assertViewer({ browser, htmlPath, manifest, caseName, outDir, viewportName, width, height }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/i.test(url)) externalRequests.push(url);
  });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#glcanvas');
    const renderer = document.body.dataset.renderer;
    return canvas && canvas.width > 0 && canvas.height > 0 && renderer && renderer !== 'initializing';
  });
  await page.getByText('Experimental deterministic FEM preview').waitFor();
  await page.getByText('Validation status').waitFor();
  await page.getByText('REVIEW', { exact: true }).waitFor();

  if (caseName === 'raft') {
    await page.getByText('Experimental screening demo only; not a design model.').waitFor();
    await page.locator('#scale').fill('240');
    await assertScaleLabel(page, '240x');
    await page.getByRole('button', { name: '60x' }).click();
    await assertScaleLabel(page, '60x');
    await page.locator('#wire').click();
    await page.locator('#patch').click();
    await page.getByRole('button', { name: 'Reset view' }).click();
    await assertScaleLabel(page, '120x');
  } else if (caseName === 'excavation') {
    await page.getByText('Experimental 3D FEM staged excavation deformation demo').waitFor();
    await page.locator('#fieldSelect').selectOption('horizontal_displacement');
    await page.locator('#stageSlider').fill('0');
    await page.getByText('Stage 1 - excavate to 2.5 m').waitFor();
    await assertCanvas(page, `${viewportName}-stage-1-horizontal`);
    await page.locator('#fieldSelect').selectOption('wall_deflection_proxy');
    await page.locator('#stageSlider').fill('2');
    await page.getByText('Stage 3 - excavate to 8.0 m, two support levels active').waitFor();
    await page.getByText('Wall deflection proxy color').waitFor();
  } else if (caseName === 'tunnel') {
    await page.getByText('Experimental 3D tunnel volume-loss settlement preview').waitFor();
    await page.getByText('Tunnel surface settlement color').waitFor();
    await page.locator('#stats').getByText('Volume loss', { exact: true }).waitFor();
    await page.locator('#stats').getByText('Trough width i', { exact: true }).waitFor();
    await page.locator('#scale').fill('180');
    await assertScaleLabel(page, '180x');
    await page.getByRole('button', { name: '60x' }).click();
    await assertScaleLabel(page, '60x');
  }

  const probe = await assertCanvas(page, viewportName);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    canvasWidth: document.querySelector('#glcanvas')?.clientWidth ?? 0,
    canvasHeight: document.querySelector('#glcanvas')?.clientHeight ?? 0,
  }));
  assert(overflow.scrollWidth <= overflow.clientWidth + 2, `${viewportName}: horizontal overflow ${JSON.stringify(overflow)}`);
  assert(overflow.canvasWidth > 0 && overflow.canvasHeight > 0, `${viewportName}: canvas collapsed`);
  await page.screenshot({ path: resolve(outDir, `${caseName}-${viewportName}.png`), fullPage: false });
  await page.close();

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join('; ')}`);
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join('; ')}`);
  assert(externalRequests.length === 0, `external requests found: ${externalRequests.join(', ')}`);
  return probe;
}

async function smokeArtifact({ caseName, html, manifest: manifestPath, outDir }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const inferredCase = inferCase(manifest, caseName);
  caseManifestChecks(manifest, inferredCase);
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const desktop = await assertViewer({
      browser,
      htmlPath: html,
      manifest,
      caseName: inferredCase,
      outDir,
      viewportName: 'desktop',
      width: 1440,
      height: 920,
    });
    const mobile = await assertViewer({
      browser,
      htmlPath: html,
      manifest,
      caseName: inferredCase,
      outDir,
      viewportName: 'mobile',
      width: 390,
      height: 844,
    });
    return { caseName: inferredCase, desktopRenderer: desktop.renderer, mobileRenderer: mobile.renderer };
  } finally {
    await browser.close();
  }
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(args.out);
await mkdir(outDir, { recursive: true });

const artifacts = [];
if (args.demo === 'all') {
  artifacts.push({ caseName: 'raft', ...(await generateDemoArtifacts('raft', outDir)) });
  artifacts.push({ caseName: 'excavation', ...(await generateDemoArtifacts('excavation', outDir)) });
  artifacts.push({ caseName: 'tunnel', ...(await generateDemoArtifacts('tunnel', outDir)) });
} else if (args.demo === 'raft' || args.demo === 'excavation' || args.demo === 'tunnel') {
  artifacts.push({ caseName: args.demo, ...(await generateDemoArtifacts(args.demo, outDir)) });
} else {
  assert(args.html && args.manifest, 'Usage: node scripts/smoke-fem-webgl.mjs --case <auto|raft|excavation|tunnel> --html <file> --manifest <file> --out <dir>');
  artifacts.push({
    caseName: args.caseName,
    html: resolve(args.html),
    manifest: resolve(args.manifest),
  });
}

const results = [];
for (const artifact of artifacts) {
  results.push(await smokeArtifact({ ...artifact, outDir }));
}

console.log(JSON.stringify({
  ok: true,
  outDir,
  results,
}, null, 2));
