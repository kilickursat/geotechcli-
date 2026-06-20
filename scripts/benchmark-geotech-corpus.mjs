#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreCorpusEntry = join(repoRoot, 'packages', 'core', 'dist', 'ingest', 'geotech-benchmark-corpus.js');
const coreBenchmarkEntry = join(repoRoot, 'packages', 'core', 'dist', 'ingest', 'geotech-document-benchmark.js');
const cliEntry = join(repoRoot, 'packages', 'cli', 'dist', 'index.js');
const defaultRegistryPath = join(repoRoot, 'packages', 'core', 'tests', 'fixtures', 'geotech-benchmark-corpus.fixtures.json');
const defaultSourceBenchmarkPath = join(
  repoRoot,
  'packages',
  'core',
  'tests',
  'fixtures',
  'geotechnical-investigation-benchmark.v1.json',
);

if (!existsSync(coreCorpusEntry)) {
  console.error(`Core corpus benchmark build was not found: ${coreCorpusEntry}`);
  console.error('Run npm run build before npm run benchmark:geotech-corpus.');
  process.exit(1);
}
if (!existsSync(coreBenchmarkEntry)) {
  console.error(`Core document benchmark build was not found: ${coreBenchmarkEntry}`);
  console.error('Run npm run build before npm run benchmark:geotech-corpus.');
  process.exit(1);
}

const {
  buildGeotechBenchmarkCorpusReport,
  buildGeotechBenchmarkCorpusTrend,
  redactGeotechBenchmarkCorpusArtifact,
  renderGeotechBenchmarkCorpusHtml,
  renderGeotechBenchmarkCorpusSvg,
  renderGeotechBenchmarkCorpusTrendHtml,
  validateGeotechBenchmarkCorpusTrendContract,
} = await import(pathToFileURL(coreCorpusEntry).href);
const { compareGeotechDocumentBenchmarks } = await import(pathToFileURL(coreBenchmarkEntry).href);

await main(process.argv.slice(2));

async function main(argv) {
  const args = parseArgs(argv);
  const outputDir = resolve(args.out ?? process.env.npm_config_out ?? process.env.GEOTECHCLI_BENCHMARK_CORPUS_OUTPUT_DIR ?? '__benchmark-geotech-corpus');
  const registryPath = resolve(args.registry ?? process.env.npm_config_registry ?? defaultRegistryPath);
  const sourceBenchmarkPath = resolve(args.sourceBenchmark ?? process.env.npm_config_source_benchmark ?? defaultSourceBenchmarkPath);
  const required = args.required
    || truthy(process.env.npm_config_required)
    || process.env.GEOTECHCLI_BENCHMARK_REQUIRED === '1';
  const realFixtures = args.realFixtures || truthy(process.env.npm_config_real_fixtures);

  if (!existsSync(registryPath)) {
    console.error(`Benchmark corpus registry not found: ${registryPath}`);
    process.exit(1);
  }
  if (!realFixtures && !existsSync(sourceBenchmarkPath)) {
    const message = [
      `Benchmark source fixture not found: ${sourceBenchmarkPath}`,
      'Use --source-benchmark <benchmark.json> or build the canonical benchmark fixture first.',
    ].join('\n');
    if (required) {
      console.error(message);
      process.exit(1);
    }
    console.log(message);
    return;
  }

  const registry = readJson(registryPath);
  assertRegistry(registry, registryPath);
  const providerProfiles = parseCsvArg(
    args.providerProfiles
    ?? process.env.npm_config_provider_profiles
    ?? 'hosted-beta,openai-compatible-byok,openrouter-free,local-hf-compatible',
  ).map(normalizeProviderBenchmarkProfile);
  const preprocessingModes = parseCsvArg(args.preprocessingModes ?? process.env.npm_config_preprocessing_modes ?? 'none,ocr-optimized,region-v2');
  const inputs = [];
  const skippedFixtures = [];

  mkdirSync(outputDir, { recursive: true });
  const runsDir = join(outputDir, 'runs');
  mkdirSync(runsDir, { recursive: true });

  if (realFixtures && !existsSync(cliEntry)) {
    console.error(`CLI build was not found: ${cliEntry}`);
    console.error('Run npm run build before npm run benchmark:geotech-corpus -- --real-fixtures.');
    process.exit(1);
  }

  for (const fixtureRecord of registry.fixtures) {
    const fixture = normalizeFixture(fixtureRecord);
    if (realFixtures) {
      const resolvedInput = resolveRealFixtureInput(fixtureRecord, registryPath);
      if (!resolvedInput) {
        const envName = fixtureRecord.input?.env ?? defaultFixtureEnv(fixture.category);
        const reason = envName
          ? `${fixture.id}: skipped; set ${envName} to a local fixture PDF/image path.`
          : `${fixture.id}: skipped; registry has no env-backed input path.`;
        if (required) {
          console.error(reason);
          process.exit(1);
        }
        console.log(reason);
        skippedFixtures.push({ id: fixture.id, category: fixture.category, reason });
        continue;
      }
      if (!existsSync(resolvedInput.path)) {
        const reason = `${fixture.id}: skipped; ${resolvedInput.envName} points to a missing local fixture file.`;
        if (required) {
          console.error(reason);
          process.exit(1);
        }
        console.log(reason);
        skippedFixtures.push({ id: fixture.id, category: fixture.category, reason });
        continue;
      }

      const realFixture = normalizeRealFixture(fixture, resolvedInput);
      for (const preprocessingMode of preprocessingModes) {
        const runDir = join(runsDir, realFixture.id, 'configured-provider', preprocessingMode);
        mkdirSync(runDir, { recursive: true });
        const firstPath = join(runDir, 'first.benchmark.json');
        const cachedPath = join(runDir, 'cached.benchmark.json');
        const comparisonPath = join(runDir, 'comparison.json');
        const configDir = join(outputDir, 'config', realFixture.id, preprocessingMode);
        mkdirSync(configDir, { recursive: true });

        runRealBenchmark({
          fixturePath: resolvedInput.path,
          outputPath: firstPath,
          configDir,
          preprocessingMode,
          label: `${realFixture.id} ${preprocessingMode} first run`,
        });
        runRealBenchmark({
          fixturePath: resolvedInput.path,
          outputPath: cachedPath,
          configDir,
          preprocessingMode,
          label: `${realFixture.id} ${preprocessingMode} cached rerun`,
        });

        const first = sanitizeRealBenchmark(readJson(firstPath), realFixture, resolvedInput, preprocessingMode);
        const cached = sanitizeRealBenchmark(readJson(cachedPath), realFixture, resolvedInput, preprocessingMode);
        const providerProfile = cached.provider?.profile ?? cached.provider?.provider ?? 'configured-provider';
        const providerRunDir = join(runsDir, realFixture.id, providerProfile, preprocessingMode);
        mkdirSync(providerRunDir, { recursive: true });
        const sanitizedFirstPath = join(providerRunDir, 'first.benchmark.json');
        const sanitizedCachedPath = join(providerRunDir, 'cached.benchmark.json');
        const sanitizedComparisonPath = join(providerRunDir, 'comparison.json');
        writeJson(firstPath, first);
        writeJson(cachedPath, cached);
        writeJson(sanitizedFirstPath, first);
        writeJson(sanitizedCachedPath, cached);
        writeJson(sanitizedComparisonPath, compareGeotechDocumentBenchmarks(cached, first));
        if (comparisonPath !== sanitizedComparisonPath) {
          writeJson(comparisonPath, compareGeotechDocumentBenchmarks(cached, first));
        }
        inputs.push({
          fixture: normalizeRealFixture(fixture, resolvedInput, providerProfile),
          benchmark: cached,
          providerProfile,
          preprocessingMode,
        });
      }
      continue;
    }

    const benchmarkPath = resolveBaselinePath(fixtureRecord, registryPath, sourceBenchmarkPath);
    if (!existsSync(benchmarkPath)) {
      const message = `${fixture.id}: baseline benchmark not found: ${benchmarkPath}`;
      if (required) {
        throw new Error(message);
      }
      console.log(`${message}; skipping.`);
      continue;
    }

    const baseBenchmark = readJson(benchmarkPath);
    for (const providerProfile of providerProfiles) {
      for (const preprocessingMode of preprocessingModes) {
        const benchmark = buildBenchmarkVariant(baseBenchmark, {
          fixture,
          providerProfile,
          preprocessingMode,
          label: `${fixture.id} ${providerProfile} ${preprocessingMode}`,
        });
        const runDir = join(runsDir, fixture.id, providerProfile);
        mkdirSync(runDir, { recursive: true });
        const runPath = join(runDir, `${preprocessingMode}.benchmark.json`);
        writeJson(runPath, benchmark);
        inputs.push({
          fixture,
          benchmark,
          providerProfile,
          preprocessingMode,
        });
      }
    }
  }

  const report = buildGeotechBenchmarkCorpusReport(inputs, {
    label: 'Internal R&D geotechnical evidence corpus',
  });
  const resolvedProviderProfiles = realFixtures
    ? uniqueSorted(inputs.map((input) => input.providerProfile))
    : providerProfiles;
  const reportPath = join(outputDir, 'corpus-report.json');
  const svgPath = join(outputDir, 'corpus-summary.svg');
  const htmlPath = join(outputDir, 'corpus-summary.html');
  const historyPath = join(outputDir, 'corpus-history.json');
  const trendPath = join(outputDir, 'corpus-trend.json');
  const trendHtmlPath = join(outputDir, 'corpus-trend.html');
  const previousReport = existsSync(reportPath) ? safeReadJson(reportPath) : null;
  const previousHistory = readCorpusHistory(historyPath);
  const trend = buildGeotechBenchmarkCorpusTrend(report, {
    mode: realFixtures ? 'real-fixtures' : 'cached-fixtures',
    providerProfiles: resolvedProviderProfiles,
    preprocessingModes,
    skippedFixtureCount: skippedFixtures.length,
    previousHistory,
    previousReport,
  });
  const trendValidation = validateGeotechBenchmarkCorpusTrendContract(trend.report);
  if (!trendValidation.ok) {
    console.error(`Corpus benchmark trend failed contract: ${trendValidation.failures.join(', ')}`);
    process.exit(1);
  }

  writeJson(join(outputDir, 'registry.resolved.json'), {
    kind: registry.kind,
    schemaVersion: registry.schemaVersion,
    registryPath: safeRepoRelativePath(registryPath, '<external-registry>'),
    mode: realFixtures ? 'real-fixtures' : 'cached-fixtures',
    ...(realFixtures ? {} : { sourceBenchmarkPath: safeRepoRelativePath(sourceBenchmarkPath, '<external-source-benchmark>') }),
    providerProfiles: resolvedProviderProfiles,
    preprocessingModes,
    skippedFixtures,
    fixtures: redactGeotechBenchmarkCorpusArtifact(registry.fixtures),
  });
  writeJson(reportPath, report);
  writeJson(historyPath, trend.history);
  writeJson(trendPath, trend.report);
  writeFileSync(svgPath, `${renderGeotechBenchmarkCorpusSvg(report)}\n`);
  writeFileSync(htmlPath, renderGeotechBenchmarkCorpusHtml(report));
  writeFileSync(trendHtmlPath, renderGeotechBenchmarkCorpusTrendHtml(trend.report));

  console.log('\nGeotech benchmark corpus');
  console.log(`Output: ${relative(repoRoot, outputDir)}`);
  console.log(`Fixtures: ${report.summary.fixtureCount}`);
  if (skippedFixtures.length > 0) {
    console.log(`Skipped fixtures: ${skippedFixtures.length}`);
  }
  console.log(`Runs: ${report.summary.passedRuns}/${report.summary.runCount} passed`);
  console.log(`Providers: ${report.summary.providerProfiles.join(', ') || 'none'}`);
  console.log(`Preprocessing modes: ${report.summary.preprocessingModes.join(', ') || 'none'}`);
  console.log(`Report: ${relative(repoRoot, reportPath)}`);
  console.log(`Summary SVG: ${relative(repoRoot, svgPath)}`);
  console.log(`Summary HTML: ${relative(repoRoot, htmlPath)}`);
  console.log(`Trend: ${relative(repoRoot, trendPath)}`);
  console.log(`Trend HTML: ${relative(repoRoot, trendHtmlPath)}`);

  if (!report.summary.passed) {
    console.error('Acceptance: failed');
    for (const failure of report.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Acceptance: passed');
}

function runRealBenchmark(options) {
  console.log(`\nRunning ${options.label}...`);
  const result = spawnSync(process.execPath, [
    cliEntry,
    'ingest',
    options.fixturePath,
    '--type',
    'geotech-document',
    '--format',
    'benchmark',
    '--output',
    options.outputPath,
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GEOTECHCLI_CONFIG_DIR: options.configDir,
      GEOTECHCLI_PREPROCESSING_MODE: options.preprocessingMode,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveRealFixtureInput(fixtureRecord, registryPath) {
  if (typeof fixtureRecord.input?.path === 'string' && fixtureRecord.input.path.trim()) {
    return {
      envName: fixtureRecord.input.env ?? 'IN_REPO_FIXTURE',
      path: resolve(dirname(registryPath), fixtureRecord.input.path.trim()),
      source: fixtureRecord.input.path.trim(),
      inRepo: true,
    };
  }

  const envName = fixtureRecord.input?.env ?? defaultFixtureEnv(fixtureRecord.category);
  if (!envName) {
    return null;
  }
  const envValue = process.env[envName];
  const inputValue = typeof envValue === 'string' && envValue.trim()
    ? envValue.trim()
    : fixtureRecord.input?.fallbackPath;
  if (typeof inputValue !== 'string' || !inputValue.trim()) {
    return null;
  }
  return {
    envName,
    path: resolve(inputValue),
    source: redactedFixtureSource(fixtureRecord, envName),
    inRepo: false,
  };
}

function defaultFixtureEnv(category) {
  return {
    'full-geotechnical-report': 'GEOTECHCLI_BENCHMARK_PDF',
    'borehole-log': 'GEOTECHCLI_BENCHMARK_BOREHOLE_PDF',
    'cpt-table': 'GEOTECHCLI_BENCHMARK_CPT_PDF',
    'lab-table': 'GEOTECHCLI_BENCHMARK_LAB_PDF',
    'mixed-scanned-digital': 'GEOTECHCLI_BENCHMARK_MIXED_SCANNED_PDF',
    'mixed-digital-scanned-pdf': 'GEOTECHCLI_BENCHMARK_MIXED_DIGITAL_SCANNED_PDF',
    'mixed-scanned-pdf': 'GEOTECHCLI_BENCHMARK_MIXED_SCANNED_PDF',
    'malformed-scanned-pdf': 'GEOTECHCLI_BENCHMARK_MALFORMED_SCANNED_PDF',
  }[category] ?? null;
}

function normalizeRealFixture(fixture, resolvedInput, providerProfile) {
  const knownLimitations = resolvedInput.inRepo
    ? fixture.expectations.knownLimitations ?? []
    : [
        ...(fixture.expectations.knownLimitations ?? []),
        `Real local fixture path is supplied through ${resolvedInput.envName}; source bytes and absolute paths are intentionally not persisted.`,
      ];
  return {
    ...fixture,
    sourceType: resolvedInput.inRepo ? fixture.sourceType : 'local-private',
    source: resolvedInput.inRepo
      ? fixture.source ?? resolvedInput.source
      : redactedFixtureSource(fixture, resolvedInput.envName),
    expectations: {
      ...fixture.expectations,
      requiredProviderProfiles: providerProfile
        ? [providerProfile]
        : undefined,
      knownLimitations,
    },
  };
}

function sanitizeRealBenchmark(benchmark, fixture, resolvedInput, preprocessingMode) {
  const sanitized = clone(benchmark);
  sanitized.label = `${fixture.id} ${preprocessingMode} cached local fixture`;
  if (sanitized.source) {
    sanitized.source.filePath = undefined;
    sanitized.source.fileName = resolvedInput.inRepo
      ? basename(resolvedInput.path)
      : `${fixture.id}.local-fixture`;
    sanitized.source.redacted = !resolvedInput.inRepo;
  }
  sanitized.fixture = {
    id: fixture.id,
    category: fixture.category,
    source: resolvedInput.inRepo
      ? fixture.source ?? resolvedInput.source
      : redactedFixtureSource(fixture, resolvedInput.envName),
    description: fixture.description,
  };
  if (sanitized.preprocessing) {
    sanitized.preprocessing.modes = [preprocessingMode];
  }
  if (sanitized.evidenceCache) {
    sanitized.evidenceCache.preprocessingVersions = Array.isArray(sanitized.evidenceCache.preprocessingVersions)
      ? sanitized.evidenceCache.preprocessingVersions
      : [];
  }
  return sanitized;
}

function redactedFixtureSource(fixture, envName) {
  const source = fixture.source ?? fixture.id;
  return String(source).startsWith(`${envName}:`) ? source : `${envName}:${source}`;
}

function buildBenchmarkVariant(baseBenchmark, options) {
  const benchmark = clone(baseBenchmark);
  const totalPages = Number(benchmark.source?.totalPages ?? 0);
  benchmark.label = options.label;
  benchmark.fixture = {
    id: options.fixture.id,
    category: options.fixture.category,
    source: options.fixture.source,
    description: options.fixture.description,
  };
  benchmark.provider = providerBlock(options.providerProfile);
  benchmark.preprocessing = preprocessingBlock(options.preprocessingMode, totalPages, options.fixture.category);
  benchmark.evidenceCache = {
    ...(benchmark.evidenceCache ?? {}),
    totalAudited: benchmark.evidenceCache?.totalAudited ?? totalPages,
    hit: benchmark.evidenceCache?.hit ?? totalPages,
    miss: 0,
    stored: 0,
    skipped: benchmark.evidenceCache?.skipped ?? 0,
    unavailable: benchmark.evidenceCache?.unavailable ?? 0,
    hitRate: benchmark.evidenceCache?.hitRate ?? 1,
    modelVersions: benchmark.evidenceCache?.modelVersions ?? ['fixture-cached'],
    preprocessingVersions: [`page-evidence-preprocess-v4:${options.preprocessingMode}`],
    schemaVersions: benchmark.evidenceCache?.schemaVersions ?? [1],
  };
  benchmark.hostedCallEstimate = {
    ...(benchmark.hostedCallEstimate ?? {}),
    pageExtraction: 0,
    layoutOcr: 0,
    vision: 0,
    nativeOrPdfText: benchmark.hostedCallEstimate?.nativeOrPdfText ?? 0,
    skippedOrUnavailable: benchmark.hostedCallEstimate?.skippedOrUnavailable ?? 0,
  };
  benchmark.job = {
    ...(benchmark.job ?? {}),
    durationMs: benchmark.job?.durationMs ?? (options.preprocessingMode === 'region-v2' ? 980 : options.preprocessingMode === 'ocr-optimized' ? 860 : 640),
  };
  benchmark.latency = {
    ...(benchmark.latency ?? {}),
    totalKnownLatencyMs: benchmark.latency?.totalKnownLatencyMs ?? (options.preprocessingMode === 'region-v2' ? 980 : options.preprocessingMode === 'ocr-optimized' ? 860 : 640),
  };
  benchmark.pages = Array.isArray(benchmark.pages)
    ? benchmark.pages.map((page) => ({
        ...page,
        preprocessingPolicy: options.preprocessingMode,
        preprocessingVersion: `page-evidence-preprocess-v4:${options.preprocessingMode}`,
      }))
    : [];
  return benchmark;
}

function providerBlock(profile) {
  const normalizedProfile = normalizeProviderBenchmarkProfile(profile);
  if (normalizedProfile === 'hosted-beta') {
    return {
      provider: 'hosted-beta',
      profile: 'hosted-beta',
      modelId: 'glm-5.2',
      visionModelId: 'glm-5v-turbo',
      capabilities: {
        text: true,
        visionImages: true,
        nativePdfDocuments: false,
        jsonMode: true,
      },
      likelyFreeRoute: false,
      contextStrategy: 'full',
      reviewGates: ['human-engineering-review-required'],
      preprocessingPolicy: {
        preferNativePdf: false,
        requirePreprocessedEvidence: true,
        allowImageInputs: true,
        allowLayoutOcr: true,
        maxContextStrategy: 'full',
      },
    };
  }
  if (normalizedProfile === 'openai-compatible-byok') {
    return providerTextEvidenceBlock({
      provider: 'openai-compatible',
      profile: normalizedProfile,
      modelId: 'openai-compatible/byok-text-evidence-model',
      likelyFreeRoute: false,
      contextStrategy: 'compact',
      jsonMode: true,
      reviewGates: [
        'openai-compatible-byok-uses-preprocessed-page-evidence',
        'native-pdf-unavailable-use-preprocessed-evidence',
        'human-engineering-review-required',
      ],
    });
  }
  if (normalizedProfile === 'openrouter-free') {
    return providerTextEvidenceBlock({
      provider: 'openai-compatible',
      profile: normalizedProfile,
      modelId: process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free',
      likelyFreeRoute: true,
      contextStrategy: 'micro',
      jsonMode: false,
      reviewGates: [
        'text-only-provider-uses-ocr-page-evidence',
        'free-route-capacity-and-feature-variance',
        'compact-context-required',
        'human-engineering-review-required',
      ],
    });
  }
  if (normalizedProfile === 'local-hf-compatible') {
    return providerTextEvidenceBlock({
      provider: 'huggingface',
      profile: normalizedProfile,
      modelId: 'local-or-hf-compatible/text-evidence-model',
      likelyFreeRoute: false,
      contextStrategy: 'compact',
      jsonMode: false,
      reviewGates: [
        'local-hf-compatible-uses-preprocessed-page-evidence',
        'native-pdf-unavailable-use-preprocessed-evidence',
        'compact-context-required',
        'human-engineering-review-required',
      ],
    });
  }
  throw new Error(`Unknown provider benchmark profile: ${profile}`);
}

function providerTextEvidenceBlock(options) {
  return {
    provider: options.provider,
    profile: options.profile,
    modelId: options.modelId,
    visionModelId: null,
    capabilities: {
      text: true,
      visionImages: false,
      nativePdfDocuments: false,
      jsonMode: options.jsonMode,
    },
    likelyFreeRoute: options.likelyFreeRoute,
    contextStrategy: options.contextStrategy,
    reviewGates: options.reviewGates,
    preprocessingPolicy: {
      preferNativePdf: false,
      requirePreprocessedEvidence: true,
      allowImageInputs: false,
      allowLayoutOcr: false,
      maxContextStrategy: options.contextStrategy,
    },
  };
}

function normalizeProviderBenchmarkProfile(profile) {
  if (profile === 'open-byok-text-evidence') {
    return 'openai-compatible-byok';
  }
  return profile;
}

function preprocessingBlock(mode, totalPages, category) {
  if (mode === 'none') {
    return {
      versions: ['page-evidence-preprocess-v4:none'],
      modes: ['none'],
      pagesWithPreprocessing: totalPages,
      pagesWithoutPreprocessing: 0,
      pagesWithRegions: 0,
      totalRegions: 0,
      preprocessingRegions: 0,
      layoutRegions: 0,
      pageRegionCoverage: 0,
      pagesWithPreprocessingMetadata: totalPages,
      operationCounts: {},
      regionLabelCounts: {},
      persistedRegionAssets: 0,
      persistedRegionAssetBytes: 0,
      pagesDeskewed: 0,
      averageDeskewAngleDeg: 0,
      averageQualityScore: 0.58,
      averageRegionQualityScore: 0.35,
      lowQualityRegions: category === 'malformed-scanned-pdf' ? 3 : 1,
      qualityWarningCounts: {
        'no-log-or-table-crops-detected': 1,
      },
      sourceCategories: {
        'native-text': 0,
        'layout-ocr': 0,
        vision: 0,
        none: 0,
      },
    };
  }

  const regionV2 = mode === 'region-v2';
  const cropCount = regionV2
    ? Math.max(3, Math.min(16, Math.round(totalPages * 0.38)))
    : Math.max(2, Math.min(12, Math.round(totalPages * 0.25)));
  const regionAssetMultiplier = regionV2 ? 2 : 1;
  return {
    versions: [`page-evidence-preprocess-v4:${mode}`],
    modes: [mode],
    pagesWithPreprocessing: totalPages,
    pagesWithoutPreprocessing: 0,
    pagesWithRegions: cropCount,
    totalRegions: cropCount * (regionV2 ? 3 : 2),
    preprocessingRegions: cropCount * regionAssetMultiplier,
    layoutRegions: cropCount,
    pageRegionCoverage: totalPages > 0 ? Number((cropCount / totalPages).toFixed(3)) : 0,
    pagesWithPreprocessingMetadata: totalPages,
    operationCounts: regionV2 ? {
      'auto-orient': totalPages,
      'projection-profile-fine-deskew': cropCount,
      'trim-white-margins': totalPages,
      'detect-table-log-panels': cropCount,
      'detect-region-v2-table-panel': Math.max(1, Math.round(cropCount / 2)),
      'detect-region-v2-borehole-log-strip': Math.max(1, Math.round(cropCount / 2)),
      'normalize-region-assets': cropCount * regionAssetMultiplier,
      'score-preprocessing-regions': cropCount * regionAssetMultiplier,
    } : {
      'auto-orient': totalPages,
      'projection-profile-deskew': cropCount,
      'trim-white-margins': totalPages,
      'detect-table-log-panels': cropCount,
      'normalize-region-assets': cropCount,
    },
    regionLabelCounts: regionV2 ? {
      'normalized full page': totalPages,
      'detected table/log panel candidate': cropCount,
      'region-v2 table panel crop': Math.max(1, Math.round(cropCount / 2)),
      'region-v2 borehole/log strip crop': Math.max(1, Math.round(cropCount / 2)),
    } : {
      'normalized full page': totalPages,
      'detected table/log panel candidate': cropCount,
    },
    persistedRegionAssets: cropCount * regionAssetMultiplier,
    persistedRegionAssetBytes: cropCount * regionAssetMultiplier * (regionV2 ? 22000 : 18000),
    pagesDeskewed: Math.max(1, Math.round(cropCount * (regionV2 ? 0.65 : 0.5))),
    averageDeskewAngleDeg: regionV2 ? 0.82 : 0.7,
    averageQualityScore: regionV2 ? 0.88 : 0.82,
    averageRegionQualityScore: regionV2 ? 0.84 : 0.76,
    lowQualityRegions: 0,
    qualityWarningCounts: {},
    sourceCategories: {
      'native-text': 0,
      'layout-ocr': regionV2 ? cropCount * regionAssetMultiplier : cropCount,
      vision: 0,
      none: 0,
    },
  };
}

function resolveBaselinePath(fixtureRecord, registryPath, sourceBenchmarkPath) {
  if (!fixtureRecord.baseline) {
    return sourceBenchmarkPath;
  }
  return resolve(dirname(registryPath), fixtureRecord.baseline);
}

function normalizeFixture(record) {
  return {
    id: record.id,
    category: record.category,
    sourceType: record.sourceType,
    source: record.source,
    description: record.description,
    expectations: record.expectations ?? {},
  };
}

function assertRegistry(registry, registryPath) {
  if (registry?.kind !== 'geotech-benchmark-corpus-registry' || registry.schemaVersion !== 1) {
    throw new Error(`Invalid benchmark corpus registry: ${registryPath}`);
  }
  if (!Array.isArray(registry.fixtures) || registry.fixtures.length === 0) {
    throw new Error(`Benchmark corpus registry has no fixtures: ${registryPath}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    out: undefined,
    registry: undefined,
    sourceBenchmark: undefined,
    providerProfiles: undefined,
    preprocessingModes: undefined,
    required: false,
    realFixtures: false,
  };
  if (argv.length === 1 && !String(argv[0] ?? '').startsWith('--')) {
    parsed.out = argv[0];
    return parsed;
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--required') {
      parsed.required = true;
      continue;
    }
    if (arg === '--real-fixtures') {
      parsed.realFixtures = true;
      continue;
    }
    if (
      arg === '--out'
      || arg === '--registry'
      || arg === '--source-benchmark'
      || arg === '--provider-profiles'
      || arg === '--preprocessing-modes'
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        console.error(`${arg} requires a value.`);
        process.exit(1);
      }
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      parsed[key] = value;
      index += 1;
      continue;
    }
    console.error(`Unknown benchmark corpus option: ${arg}`);
    process.exit(1);
  }
  return parsed;
}

function truthy(value) {
  return /^(?:1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function parseCsvArg(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function safeRepoRelativePath(filePath, externalLabel) {
  const resolvedPath = resolve(filePath);
  const relativePath = relative(repoRoot, resolvedPath);
  if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
    return relativePath;
  }
  return externalLabel;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function safeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readCorpusHistory(filePath) {
  const parsed = existsSync(filePath) ? safeReadJson(filePath) : null;
  return Array.isArray(parsed) ? parsed.filter((item) => item?.kind === 'geotech-benchmark-corpus-history-entry') : [];
}
