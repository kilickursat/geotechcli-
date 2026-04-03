import metadata from './metadata.json' with { type: 'json' };

export const GEOTECHCLI_VERSION = metadata.version as string;

export const DEFAULT_LLM_PROVIDER = metadata.defaults.provider as
  | 'zhipu'
  | 'openai'
  | 'anthropic'
  | 'openai-compatible'
  | 'huggingface';

export const DEFAULT_LLM_MODEL = metadata.defaults.model as string;
export const DEFAULT_LLM_VISION_MODEL = metadata.defaults.visionModel as string;
export const SUPPORTED_PROXY_MODELS = [...metadata.proxyModels] as string[];

export interface GlobalFlagDefinition {
  key: string;
  option: string;
  description: string;
}

export const GLOBAL_FLAG_DEFINITIONS =
  metadata.globalFlags as GlobalFlagDefinition[];
