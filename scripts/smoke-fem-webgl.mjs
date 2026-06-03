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
    allowFallback: process.env.GEOTECH_FEM_ALLOW_CANVAS_FALLBACK === '1',
    forceFallback: false,
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
    } else if (item === '--allow-fallback') {
      args.allowFallback = true;
    } else if (item === '--force-fallback') {
      args.allowFallback = true;
      args.forceFallback = true;
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
  if (manifest.analysisCase?.objective === 'staged_settlement_consolidation') return 'consolidation';
  if (manifest.analysisCase?.objective === 'seepage_groundwater_coupling') return 'biot';
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
  } else if (caseName === 'consolidation') {
    assert(manifest.analysisCase?.objective === 'staged_settlement_consolidation', 'not a staged consolidation manifest');
    assert(manifest.backend?.id === 'builtin-staged-consolidation-1d', 'unexpected consolidation backend');
    assert(manifest.mesh?.nodes === 715, 'unexpected consolidation node count');
    assert(manifest.mesh?.elements === 480, 'unexpected consolidation element count');
    assert(manifest.envelope?.stageCount === 3, 'consolidation stage count mismatch');
    assert(Number.isFinite(manifest.envelope?.finalSettlementMm), 'consolidation final settlement is not finite');
    assert(Number.isFinite(manifest.envelope?.finalDegreeOfConsolidation), 'consolidation degree is not finite');
    assert(Number.isFinite(manifest.envelope?.maxExcessPorePressureKpa), 'consolidation pore pressure is not finite');
    assert(manifest.resultFields?.some((field) => field.id === 'final_degree_of_consolidation'), 'missing consolidation result field metadata');
    assert(manifest.steps?.length === 3, 'expected three consolidation result steps');
    assert(manifest.datasets?.filter((dataset) => dataset.source === 'visualization.frame').length === 3, 'expected staged consolidation frame datasets');
  } else if (caseName === 'biot') {
    assert(manifest.analysisCase?.objective === 'seepage_groundwater_coupling', 'not a Biot seepage manifest');
    assert(manifest.backend?.id === 'builtin-biot-up-plane-strain-v0', 'unexpected Biot backend');
    assert(manifest.mesh?.nodes === 34, 'unexpected Biot node count');
    assert(manifest.mesh?.elements === 16, 'unexpected Biot element count');
    assert(manifest.mesh?.elementType === 'quad4_plane_strain', 'unexpected Biot element type');
    assert(Number.isFinite(manifest.envelope?.maxExcessPorePressureKpa), 'Biot excess pore pressure is not finite');
    assert(manifest.envelope?.porePressureMassBalanceErrorRatio <= 1e-6, 'Biot mass balance exceeds tolerance');
    assert(manifest.biotTransientAcceptance?.accepted === true, 'Biot transient acceptance missing or not accepted');
    assert(manifest.biotTransientAcceptance?.acceptedStepCount === manifest.envelope?.timeStepCount, 'Biot accepted step count mismatch');
    assert(Array.isArray(manifest.biotTransientAcceptance?.blockerCodes) && manifest.biotTransientAcceptance.blockerCodes.length === 0, 'Biot acceptance blockers present');
    assert(manifest.resultFields?.some((field) => field.id === 'excess_pore_pressure'), 'missing Biot pore-pressure field metadata');
    assert(manifest.steps?.map((step) => step.id).includes('final'), 'missing Biot final step metadata');
    assert(manifest.datasets?.some((dataset) => dataset.source === 'visualization.scalar-frame'), 'missing Biot scalar frame dataset');
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
    let signature = 2166136261;
    for (let index = 0; index < pixels.length; index += 32) {
      const value = pixels[index] + pixels[index + 1] + pixels[index + 2];
      if (value > 100) bright += 1;
      if (value !== previous) distinct += 1;
      previous = value;
      signature ^= value + pixels[index + 3];
      signature = Math.imul(signature, 16777619) >>> 0;
    }
    return {
      ok: (bright > 20 && distinct > 5) || (bright > 6 && distinct > 12),
      renderer,
      bright,
      distinct,
      width,
      height,
      signature,
    };
  });
  assert(probe.ok, `${viewportName}: canvas looked blank (${JSON.stringify(probe)})`);
  return probe;
}

async function waitForRenderFrame(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertCanvasSignatureChanged(page, viewportName, before, reason) {
  await waitForRenderFrame(page);
  const after = await assertCanvas(page, `${viewportName}-${reason}`);
  assert(
    after.signature !== before.signature,
    `${viewportName}: canvas signature did not change after ${reason} (${JSON.stringify({ before, after })})`,
  );
  return after;
}

async function assertScaleLabel(page, expected) {
  await page.locator('#scaleLabel').waitFor();
  const actual = (await page.locator('#scaleLabel').textContent())?.trim();
  assert(actual === expected, `${expected} scale label should be active, received ${actual ?? 'empty'}`);
}

async function assertViewportLabel(page, viewportName, expectedRenderer) {
  await page.locator('#viewportLabel').waitFor();
  const probe = await page.locator('#viewportLabel').evaluate((label) => {
    const rect = label.getBoundingClientRect();
    const parentRect = label.parentElement?.getBoundingClientRect();
    return {
      text: label.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      parentLeft: parentRect?.left ?? 0,
      parentRight: parentRect?.right ?? window.innerWidth,
      parentTop: parentRect?.top ?? 0,
      parentBottom: parentRect?.bottom ?? window.innerHeight,
    };
  });
  assert(probe.text.includes('deformation scale'), `${viewportName}: viewport label did not include deformation scale (${JSON.stringify(probe)})`);
  assert(probe.text.toLowerCase().includes(expectedRenderer.replace(/-/g, ' ')), `${viewportName}: viewport label did not show ${expectedRenderer} renderer state (${JSON.stringify(probe)})`);
  assert(probe.width > 80 && probe.height > 24, `${viewportName}: viewport label collapsed (${JSON.stringify(probe)})`);
  assert(probe.left >= probe.parentLeft - 1, `${viewportName}: viewport label overflowed left (${JSON.stringify(probe)})`);
  assert(probe.right <= probe.parentRight + 1, `${viewportName}: viewport label overflowed right (${JSON.stringify(probe)})`);
  assert(probe.top >= probe.parentTop - 1, `${viewportName}: viewport label overflowed top (${JSON.stringify(probe)})`);
  assert(probe.bottom <= probe.parentBottom + 1, `${viewportName}: viewport label overflowed bottom (${JSON.stringify(probe)})`);
}

async function assertFallbackBanner(page, viewportName, expectedRenderer) {
  const probe = await page.locator('#fallback').evaluate((banner) => {
    const rect = banner.getBoundingClientRect();
    const style = getComputedStyle(banner);
    return {
      text: banner.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      display: style.display,
      visibility: style.visibility,
      width: rect.width,
      height: rect.height,
    };
  });
  if (expectedRenderer === 'canvas2d-fallback') {
    assert(probe.display !== 'none' && probe.visibility !== 'hidden', `${viewportName}: fallback banner was hidden in Canvas fallback mode (${JSON.stringify(probe)})`);
    assert(probe.text.toLowerCase().includes('webgl'), `${viewportName}: fallback banner did not explain WebGL fallback (${JSON.stringify(probe)})`);
    assert(probe.width > 80 && probe.height > 20, `${viewportName}: fallback banner collapsed (${JSON.stringify(probe)})`);
  } else {
    assert(probe.display === 'none', `${viewportName}: fallback banner was visible during WebGL rendering (${JSON.stringify(probe)})`);
  }
}

async function assertControlBounds(page, viewportName) {
  const probe = await page.locator('aside').evaluate((aside) => {
    const asideRect = aside.getBoundingClientRect();
    const selectors = [
      '#scale',
      'button',
      '#fieldSelect',
      '#stageSlider',
      '#wire',
      '#patch',
    ];
    const items = selectors.flatMap((selector) => Array.from(aside.querySelectorAll(selector)));
    return items
      .filter((item) => {
        const style = getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map((item) => {
        const rect = item.getBoundingClientRect();
        return {
          tag: item.tagName.toLowerCase(),
          id: item.id || '',
          text: item.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? '',
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          asideLeft: asideRect.left,
          asideRight: asideRect.right,
          asideTop: asideRect.top,
          asideBottom: asideRect.bottom,
        };
      });
  });
  assert(probe.length >= 5, `${viewportName}: expected FEM controls were not visible (${JSON.stringify(probe)})`);
  for (const item of probe) {
    assert(item.width > 0 && item.height > 0, `${viewportName}: control collapsed (${JSON.stringify(item)})`);
    assert(item.left >= item.asideLeft - 1, `${viewportName}: control overflowed left (${JSON.stringify(item)})`);
    assert(item.right <= item.asideRight + 1, `${viewportName}: control overflowed right (${JSON.stringify(item)})`);
  }
}

async function assertNoInvalidUiText(page, viewportName) {
  const text = await page.locator('body').innerText();
  const invalid = text.match(/\b(?:NaN|Infinity|undefined)\b/i);
  assert(!invalid, `${viewportName}: invalid numeric/UI text appeared in artifact (${invalid?.[0]})`);
}

async function assertFrameControlsMatchManifest(page, manifest, viewportName) {
  const frames = Array.isArray(manifest.visualization?.frames) ? manifest.visualization.frames : [];
  const resultFields = Array.isArray(manifest.resultFields) ? manifest.resultFields : [];
  const steps = Array.isArray(manifest.steps) ? manifest.steps : [];
  if (frames.length === 0) {
    assert(await page.locator('#fieldSelect').count() === 0 || !(await page.locator('#fieldSelect').isVisible()), `${viewportName}: field selector should be hidden without frame data`);
    assert(await page.locator('#stageSlider').count() === 0 || !(await page.locator('#stageSlider').isVisible()), `${viewportName}: stage slider should be hidden without staged frame data`);
    return;
  }

  const expectedFieldIds = [...new Set(frames.map((frame) => frame.field))];
  const fieldOptions = await page.locator('#fieldSelect option').evaluateAll((options) =>
    options.map((option) => ({ value: option.value, label: option.textContent?.trim() ?? '' })),
  );
  if (expectedFieldIds.length > 1) {
    assert(fieldOptions.length === expectedFieldIds.length, `${viewportName}: field option count mismatch (${JSON.stringify({ fieldOptions, expectedFieldIds })})`);
    for (const expected of expectedFieldIds) {
      assert(fieldOptions.some((option) => option.value === expected), `${viewportName}: missing field option ${expected}`);
      const metadataLabel = resultFields.find((field) => field.id === expected)?.label;
      if (metadataLabel) {
        assert(fieldOptions.some((option) => option.value === expected && option.label === metadataLabel), `${viewportName}: field option label did not match manifest metadata for ${expected}`);
      }
    }
  } else {
    const fieldSelectVisible = await page.locator('#fieldSelect').count() > 0 && await page.locator('#fieldSelect').isVisible();
    assert(!fieldSelectVisible || fieldOptions.length === expectedFieldIds.length, `${viewportName}: single-field selector mismatch (${JSON.stringify({ fieldOptions, expectedFieldIds })})`);
  }

  if (steps.length > 1) {
    const sliderProbe = await page.locator('#stageSlider').evaluate((slider) => ({
      min: slider.getAttribute('min'),
      max: slider.getAttribute('max'),
      step: slider.getAttribute('step'),
    }));
    assert(sliderProbe.min === '0', `${viewportName}: stage slider min mismatch (${JSON.stringify(sliderProbe)})`);
    assert(sliderProbe.step === '1', `${viewportName}: stage slider step mismatch (${JSON.stringify(sliderProbe)})`);
    assert(sliderProbe.max === String(Math.max(0, steps.length - 1)), `${viewportName}: stage slider max did not match manifest steps (${JSON.stringify({ sliderProbe, steps: steps.length })})`);
  } else {
    const stageSliderVisible = await page.locator('#stageSlider').count() > 0 && await page.locator('#stageSlider').isVisible();
    assert(!stageSliderVisible, `${viewportName}: single-step stage slider should be hidden`);
  }
}

async function assertViewer({ browser, htmlPath, manifest, caseName, outDir, viewportName, width, height, allowFallback, forceFallback }) {
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

  if (forceFallback) {
    await page.addInitScript(() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, options) {
        if (String(type).toLowerCase().startsWith('webgl')) return null;
        return originalGetContext.call(this, type, options);
      };
    });
  }

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#glcanvas');
    const renderer = document.body.dataset.renderer;
    return canvas && canvas.width > 0 && canvas.height > 0 && renderer && renderer !== 'initializing';
  });
  await page.getByText('Experimental deterministic FEM preview').waitFor();
  await page.getByText('Validation status').waitFor();
  await page.getByText('REVIEW', { exact: true }).waitFor();
  const validationProbe = await page.evaluate(() => {
    const summary = window.__GEOTECH_FEM_RENDER_VALIDATION__;
    return {
      status: summary?.status,
      blockers: summary?.blockers,
      reviewItems: summary?.reviewItems,
      findingCount: Array.isArray(summary?.findings) ? summary.findings.length : -1,
      bodyStatus: document.body.dataset.validationStatus,
      bodyBlockers: document.body.dataset.validationBlockers,
      bodyReviewItems: document.body.dataset.validationReviewItems,
    };
  });
  assert(validationProbe.status === 'review', `${viewportName}: expected render validation status review (${JSON.stringify(validationProbe)})`);
  assert(validationProbe.blockers === 0, `${viewportName}: render validation should have no blockers (${JSON.stringify(validationProbe)})`);
  assert(validationProbe.findingCount >= validationProbe.reviewItems, `${viewportName}: render validation finding count was inconsistent (${JSON.stringify(validationProbe)})`);
  assert(validationProbe.bodyStatus === validationProbe.status, `${viewportName}: body validation status did not match render summary (${JSON.stringify(validationProbe)})`);
  assert(validationProbe.bodyBlockers === String(validationProbe.blockers), `${viewportName}: body blocker count did not match render summary (${JSON.stringify(validationProbe)})`);
  assert(validationProbe.bodyReviewItems === String(validationProbe.reviewItems), `${viewportName}: body review count did not match render summary (${JSON.stringify(validationProbe)})`);
  assert(validationProbe.reviewItems >= manifest.validation.reviewItems, `${viewportName}: render validation lost embedded manifest review findings (${JSON.stringify({ ...validationProbe, manifestReviewItems: manifest.validation.reviewItems })})`);
  await assertFrameControlsMatchManifest(page, manifest, viewportName);
  let interactionProbe = await assertCanvas(page, `${viewportName}-initial`);

  if (caseName === 'raft') {
    await page.getByText('Experimental screening demo only; not a design model.').waitFor();
    await page.locator('#scale').fill('240');
    await assertScaleLabel(page, '240x');
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'raft-scale-240');
    await page.getByRole('button', { name: '60x' }).click();
    await assertScaleLabel(page, '60x');
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'raft-scale-60');
    await page.locator('#wire').click();
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'raft-wire-toggle');
    await page.locator('#patch').click();
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'raft-patch-toggle');
    await page.getByRole('button', { name: 'Reset view' }).click();
    await assertScaleLabel(page, '120x');
    await page.locator('#wire').click();
    await page.locator('#patch').click();
  } else if (caseName === 'excavation') {
    await page.getByText('Experimental 3D FEM staged excavation deformation demo').waitFor();
    await page.locator('#fieldSelect').selectOption('horizontal_displacement');
    await page.locator('#stageSlider').fill('0');
    await page.locator('#stageLabel').getByText('Stage 1 - excavate to 2.5 m', { exact: true }).waitFor();
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'stage-1-horizontal');
    await page.locator('#fieldSelect').selectOption('wall_deflection_proxy');
    await page.locator('#stageSlider').fill('2');
    await page.locator('#stageLabel').getByText('Stage 3 - excavate to 8.0 m, two support levels active', { exact: true }).waitFor();
    await page.getByText('Wall deflection proxy color').waitFor();
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'stage-3-wall-deflection');
  } else if (caseName === 'tunnel') {
    await page.getByText('Experimental 3D tunnel volume-loss settlement preview').waitFor();
    await page.getByText('Tunnel surface settlement color').waitFor();
    await page.locator('#stats').getByText('Volume loss', { exact: true }).waitFor();
    await page.locator('#stats').getByText('Trough width i', { exact: true }).waitFor();
    await page.locator('#scale').fill('180');
    await assertScaleLabel(page, '180x');
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'tunnel-scale-180');
    await page.getByRole('button', { name: '60x' }).click();
    await assertScaleLabel(page, '60x');
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'tunnel-scale-60');
  } else if (caseName === 'consolidation') {
    await page.getByText('Experimental 1D staged settlement consolidation preview').waitFor();
    await page.locator('#stats').getByText('Final consolidation', { exact: true }).waitFor();
    await page.locator('#stats').getByText('Max excess pore pressure', { exact: true }).waitFor();
    await page.locator('#stageSlider').fill('0');
    await page.locator('#stageLabel').getByText('Stage 1 - preload fill', { exact: true }).waitFor();
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'consolidation-stage-1');
    await page.locator('#stageSlider').fill('2');
    await page.locator('#stageLabel').getByText('Stage 3 - service surcharge hold', { exact: true }).waitFor();
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'consolidation-stage-3');
  } else if (caseName === 'biot') {
    await page.getByText('Experimental plane-strain Biot u-p pore-pressure dissipation preview').waitFor();
    await page.locator('#stats').getByText('Max excess pore pressure', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Excess pore pressure color' }).waitFor();
    await page.locator('#scale').fill('180');
    await assertScaleLabel(page, '180x');
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'biot-scale-180');
    await page.locator('#wire').click();
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'biot-wire-toggle');
    await page.locator('#patch').click();
    interactionProbe = await assertCanvasSignatureChanged(page, viewportName, interactionProbe, 'biot-patch-toggle');
  }

  const probe = await assertCanvas(page, viewportName);
  if (forceFallback) {
    assert(probe.renderer === 'canvas2d-fallback', `${viewportName}: expected forced Canvas fallback renderer, received ${probe.renderer}.`);
  } else if (!allowFallback) {
    assert(probe.renderer === 'webgl', `${viewportName}: expected WebGL renderer, received ${probe.renderer}. Use --allow-fallback only when intentionally validating the Canvas fallback path.`);
  }
  await assertViewportLabel(page, viewportName, probe.renderer);
  await assertFallbackBanner(page, viewportName, probe.renderer);
  await assertControlBounds(page, viewportName);
  await assertNoInvalidUiText(page, viewportName);
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

async function smokeArtifact({ caseName, html, manifest: manifestPath, outDir, allowFallback, forceFallback }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const inferredCase = inferCase(manifest, caseName);
  caseManifestChecks(manifest, inferredCase);
  const launchArgs = forceFallback
    ? ['--disable-webgl', '--disable-3d-apis']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({
    args: launchArgs,
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
      allowFallback,
      forceFallback,
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
      allowFallback,
      forceFallback,
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
  artifacts.push({ caseName: 'consolidation', ...(await generateDemoArtifacts('consolidation', outDir)) });
  artifacts.push({ caseName: 'biot', ...(await generateDemoArtifacts('biot', outDir)) });
} else if (args.demo === 'raft' || args.demo === 'excavation' || args.demo === 'tunnel' || args.demo === 'consolidation' || args.demo === 'biot') {
  artifacts.push({ caseName: args.demo, ...(await generateDemoArtifacts(args.demo, outDir)) });
} else {
  assert(args.html && args.manifest, 'Usage: node scripts/smoke-fem-webgl.mjs --case <auto|raft|excavation|tunnel|consolidation|biot> --html <file> --manifest <file> --out <dir> [--allow-fallback] [--force-fallback]');
  artifacts.push({
    caseName: args.caseName,
    html: resolve(args.html),
    manifest: resolve(args.manifest),
  });
}

const results = [];
for (const artifact of artifacts) {
  results.push(await smokeArtifact({
    ...artifact,
    outDir,
    allowFallback: args.allowFallback,
    forceFallback: args.forceFallback,
  }));
}

console.log(JSON.stringify({
  ok: true,
  allowFallback: args.allowFallback,
  forceFallback: args.forceFallback,
  outDir,
  results,
}, null, 2));
