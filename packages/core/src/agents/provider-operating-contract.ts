import type { LLMConfig, ProviderCapabilities } from '../llm/types.js';
import { resolveProviderCapabilities } from '../llm/capabilities.js';

export type AgentOperatingTask =
  | 'single-agent'
  | 'swarm-interpretation'
  | 'swarm-simulation'
  | 'swarm-review'
  | 'swarm-orchestrator'
  | 'legacy-orchestrator'
  | 'specialist-agent';

export interface ProviderOperatingContract {
  provider: LLMConfig['provider'];
  modelId: string | null;
  visionModelId: string | null;
  capabilities: ProviderCapabilities;
  profile: 'hosted-default' | 'direct-zai' | 'premium-byok' | 'open-byok' | 'unknown';
  likelyFreeRoute: boolean;
  contextStrategy: 'full' | 'compact' | 'micro';
  reviewGates: string[];
  prompt: string;
}

export interface BuildProviderOperatingContractOptions {
  task?: AgentOperatingTask;
  compact?: boolean;
}

export function buildProviderOperatingContract(
  config: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>,
  options: BuildProviderOperatingContractOptions = {},
): ProviderOperatingContract {
  const capabilities = resolveProviderCapabilities(config);
  const modelId = normalizeModel(config.modelId);
  const visionModelId = normalizeModel(config.visionModelId);
  const profile = resolveProfile(config.provider);
  const likelyFreeRoute = isLikelyFreeRoute(modelId) || isLikelyFreeRoute(visionModelId);
  const contextStrategy = likelyFreeRoute
    ? 'micro'
    : profile === 'open-byok'
      ? 'compact'
      : 'full';
  const reviewGates = buildReviewGates(capabilities, likelyFreeRoute, contextStrategy);
  const prompt = renderProviderOperatingPrompt({
    provider: config.provider,
    modelId,
    visionModelId,
    capabilities,
    profile,
    likelyFreeRoute,
    contextStrategy,
    reviewGates,
    task: options.task ?? 'single-agent',
    compact: options.compact === true,
  });

  return {
    provider: config.provider,
    modelId,
    visionModelId,
    capabilities,
    profile,
    likelyFreeRoute,
    contextStrategy,
    reviewGates,
    prompt,
  };
}

export function buildProviderOperatingPrompt(
  config: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>,
  options: BuildProviderOperatingContractOptions = {},
): string {
  return buildProviderOperatingContract(config, options).prompt;
}

function resolveProfile(provider: LLMConfig['provider']): ProviderOperatingContract['profile'] {
  switch (provider) {
    case 'hosted-beta':
      return 'hosted-default';
    case 'zhipu':
      return 'direct-zai';
    case 'openai':
    case 'anthropic':
      return 'premium-byok';
    case 'openai-compatible':
    case 'huggingface':
      return 'open-byok';
    default:
      return 'unknown';
  }
}

function buildReviewGates(
  capabilities: ProviderCapabilities,
  likelyFreeRoute: boolean,
  contextStrategy: ProviderOperatingContract['contextStrategy'],
): string[] {
  return [
    capabilities.text ? null : 'text-generation-unavailable',
    capabilities.visionImages ? null : 'image-understanding-unavailable',
    capabilities.nativePdfDocuments ? null : 'native-pdf-unavailable-use-preprocessed-evidence',
    capabilities.jsonMode ? null : 'strict-json-unavailable-validate-output',
    likelyFreeRoute ? 'free-route-capacity-and-feature-variance' : null,
    contextStrategy !== 'full' ? 'compact-context-required' : null,
  ].filter((value): value is string => value != null);
}

function renderProviderOperatingPrompt(input: {
  provider: LLMConfig['provider'];
  modelId: string | null;
  visionModelId: string | null;
  capabilities: ProviderCapabilities;
  profile: ProviderOperatingContract['profile'];
  likelyFreeRoute: boolean;
  contextStrategy: ProviderOperatingContract['contextStrategy'];
  reviewGates: string[];
  task: AgentOperatingTask;
  compact: boolean;
}): string {
  const capabilityLine = [
    `provider=${input.provider}`,
    `profile=${input.profile}`,
    `model=${input.modelId ?? 'provider-default'}`,
    `visionModel=${input.visionModelId ?? 'provider-default'}`,
    `text=${input.capabilities.text ? 'yes' : 'no'}`,
    `json=${input.capabilities.jsonMode ? 'yes' : 'no'}`,
    `images=${input.capabilities.visionImages ? 'yes' : 'no'}`,
    `nativePdf=${input.capabilities.nativePdfDocuments ? 'yes' : 'no'}`,
    `context=${input.contextStrategy}`,
  ].join('; ');

  const coreRules = [
    'GeotechCLI supplies the geotechnical operating scaffold; the model must follow the scaffold instead of relying on generic guessing.',
    'Use normalized evidence first: DocumentEvidencePacket, GroundModel, EvidenceRef, standards snippets, tool outputs, and review approvals outrank unsupported prose.',
    'Cite source pages/evidence IDs when making report, PDF, image, borehole, lab, or parameter claims.',
    'Treat missing, uncertain, low-confidence, direct-visual-only, or canAutoProceed=false evidence as review-gated. Do not route it into deterministic calculations unless the user explicitly approves the limitation.',
    'Use GeotechCLI tools for calculations, classifications, standards lookup, project memory, ingest, and file operations. Do not invent calculation results.',
    'For FEM, numerical simulation, or advanced soil-structure interaction, the model may plan, route, and review, but result fields and analysis cases must come from GeotechCLI deterministic contracts and validators.',
    'If the provider/model lacks image or native-PDF capability, ask GeotechCLI tools/preprocessing for OCR, page evidence, raster images, or compact packet summaries instead of pretending to inspect the original document.',
    'If strict JSON/tool formatting is weak, keep outputs shorter, use the exact schema shown, and self-check before answering.',
  ];

  const freeRouteRules = input.likelyFreeRoute
    ? [
        'This appears to be a free/open routed model. Prefer smaller steps, compact evidence, simple JSON, and explicit uncertainty over long multi-hop reasoning.',
        'If the upstream route returns empty content, missing image support, or rate limiting, report that provider limitation clearly and continue with deterministic/tool-backed evidence where possible.',
      ]
    : [];

  const taskRule = taskSpecificRule(input.task);
  const reviewGateLine = input.reviewGates.length > 0
    ? `Active provider review gates: ${input.reviewGates.join(', ')}.`
    : 'Active provider review gates: none.';

  if (input.compact) {
    return [
      'Provider operating contract:',
      capabilityLine,
      reviewGateLine,
      ...coreRules.slice(0, 6).map((rule) => `- ${rule}`),
      ...freeRouteRules.map((rule) => `- ${rule}`),
      `- ${taskRule}`,
    ].join('\n');
  }

  return [
    '## PROVIDER-AGNOSTIC GEOTECHCLI OPERATING CONTRACT',
    capabilityLine,
    reviewGateLine,
    '',
    'This contract makes hosted GLM, BYOK paid models, free OpenRouter routes, Hugging Face, and local OpenAI-compatible models work against the same GeotechCLI behavior.',
    '',
    ...coreRules.map((rule) => `- ${rule}`),
    ...freeRouteRules.map((rule) => `- ${rule}`),
    `- ${taskRule}`,
  ].join('\n');
}

function taskSpecificRule(task: AgentOperatingTask): string {
  switch (task) {
    case 'swarm-interpretation':
      return 'Interpretation task: collect and normalize evidence; do not calculate design values from unreviewed extracted data.';
    case 'swarm-simulation':
      return 'Simulation task: only calculate from structured, reviewed, or explicitly assumed inputs; for FEM, prepare and validate an analysis case before any experimental artifact is accepted.';
    case 'swarm-review':
      return 'Review task: reject conclusions that depend on missing source pages, unsupported image claims, impossible parameters, or blocked parse-safety metadata.';
    case 'swarm-orchestrator':
      return 'Orchestrator task: synthesize agent outputs with review status and limitations; never hide provider capability failures.';
    case 'legacy-orchestrator':
      return 'Legacy orchestrator task: delegate narrow questions to specialists and require evidence-bound final recommendations.';
    case 'specialist-agent':
      return 'Specialist task: answer within the assigned geotechnical discipline and distinguish standards, calculations, evidence, and assumptions.';
    case 'single-agent':
    default:
      return 'Single-agent task: use tools and evidence packets before reasoning; ask for missing inputs when the task cannot be safely completed.';
  }
}

function normalizeModel(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isLikelyFreeRoute(value: string | null): boolean {
  return Boolean(value && /(?:^|[:/_-])free(?:$|[:/_-])/i.test(value));
}
