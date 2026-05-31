import type {
  LLMConfig,
  ProviderCapabilities,
  ProviderCapabilityProfileId,
  ProviderContextStrategy,
} from '../llm/types.js';
import { resolveProviderCapabilityProfile } from '../llm/capabilities.js';

export type AgentOperatingTask =
  | 'single-agent'
  | 'project-workflow-router'
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
  profile: ProviderCapabilityProfileId;
  likelyFreeRoute: boolean;
  contextStrategy: ProviderContextStrategy;
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
  const capabilityProfile = resolveProviderCapabilityProfile(config);
  const capabilities = capabilityProfile.capabilities;
  const modelId = capabilityProfile.modelId;
  const visionModelId = capabilityProfile.visionModelId;
  const profile = capabilityProfile.id;
  const likelyFreeRoute = capabilityProfile.likelyFreeRoute;
  const contextStrategy = capabilityProfile.contextStrategy;
  const reviewGates = capabilityProfile.reviewGates;
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
    'This contract makes hosted defaults, BYOK paid models, free routed providers, Hugging Face-compatible backends, and local OpenAI-compatible models work against the same GeotechCLI behavior.',
    '',
    ...coreRules.map((rule) => `- ${rule}`),
    ...freeRouteRules.map((rule) => `- ${rule}`),
    `- ${taskRule}`,
  ].join('\n');
}

function taskSpecificRule(task: AgentOperatingTask): string {
  switch (task) {
    case 'project-workflow-router':
      return 'Project workflow router task: select and sequence only allowed deterministic GeotechCLI workflows; never invent engineering conclusions, calculations, FEM results, OCR results, or visualization data.';
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
