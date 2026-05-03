import type { LLMConfig, LLMProvider } from '../llm/types.js';
import { GEOTECHCLI_VERSION } from '../meta/index.js';
import { sanitizeUpstreamError } from '../llm/util.js';

export type GlmOcrLayoutElementLabel = 'image' | 'text' | 'formula' | 'table' | 'unknown';

export interface GlmOcrLayoutElement {
  index: number | null;
  label: GlmOcrLayoutElementLabel;
  bbox2d: [number, number, number, number] | null;
  content: string;
  height: number | null;
  width: number | null;
}

export interface GlmOcrLayoutPage {
  pageNumber: number;
  width: number | null;
  height: number | null;
  elements: GlmOcrLayoutElement[];
  text: string;
  tables: string[];
  formulas: string[];
  images: string[];
}

export interface GlmOcrLayoutResult {
  provider: LLMProvider;
  model: string;
  markdown: string;
  text: string;
  pages: GlmOcrLayoutPage[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  warnings: string[];
}

export interface ParseDocumentLayoutOptions {
  startPageId?: number;
  endPageId?: number;
  returnCropImages?: boolean;
  needLayoutVisualization?: boolean;
  userId?: string;
}

interface LayoutParsingResponse {
  model?: string;
  md_results?: string;
  layout_details?: unknown[][];
  data_info?: {
    pages?: Array<{ width?: number; height?: number }>;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    detail?: string;
  };
}

const DEFAULT_ZHIPU_API_BASE_URL = 'https://api.z.ai/api/paas/v4';
const DEFAULT_HOSTED_BETA_PROXY_URL = 'https://beta.geotechcli.com/api/proxy';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveHostedLayoutProxyUrl(config: LLMConfig): string {
  const baseUrl =
    config.baseUrl?.trim()
    || process.env.GEOTECHCLI_PROXY_URL?.trim()
    || DEFAULT_HOSTED_BETA_PROXY_URL;
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith('/layout') ? normalized : `${normalized}/layout`;
}

function resolveDirectLayoutParsingUrl(config: LLMConfig): string {
  const explicitUrl = process.env.ZHIPU_LAYOUT_PARSING_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }
  const baseUrl = normalizeBaseUrl(
    config.baseUrl?.trim()
    || process.env.ZHIPU_API_BASE_URL?.trim()
    || process.env.ZAI_API_BASE_URL?.trim()
    || DEFAULT_ZHIPU_API_BASE_URL,
  );
  return `${baseUrl}/layout_parsing`;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLabel(value: unknown): GlmOcrLayoutElementLabel {
  return value === 'image' || value === 'text' || value === 'formula' || value === 'table'
    ? value
    : 'unknown';
}

function normalizeBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }
  const values = value.map(asNumber);
  return values.every((entry) => entry != null)
    ? values as [number, number, number, number]
    : null;
}

function normalizeElement(value: unknown): GlmOcrLayoutElement | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const content = typeof record.content === 'string' ? record.content.trim() : '';
  if (!content) {
    return null;
  }
  return {
    index: asNumber(record.index),
    label: normalizeLabel(record.label),
    bbox2d: normalizeBbox(record.bbox_2d),
    content,
    height: asNumber(record.height),
    width: asNumber(record.width),
  };
}

function normalizePages(data: LayoutParsingResponse): GlmOcrLayoutPage[] {
  const details = Array.isArray(data.layout_details) ? data.layout_details : [];
  return details.map((rawPage, index) => {
    const elements = Array.isArray(rawPage)
      ? rawPage.flatMap((entry) => {
        const normalized = normalizeElement(entry);
        return normalized ? [normalized] : [];
      })
      : [];
    const pageInfo = data.data_info?.pages?.[index];
    return {
      pageNumber: index + 1,
      width: asNumber(pageInfo?.width) ?? elements.find((entry) => entry.width != null)?.width ?? null,
      height: asNumber(pageInfo?.height) ?? elements.find((entry) => entry.height != null)?.height ?? null,
      elements,
      text: elements
        .filter((entry) => entry.label === 'text')
        .map((entry) => entry.content)
        .join('\n')
        .trim(),
      tables: elements
        .filter((entry) => entry.label === 'table')
        .map((entry) => entry.content),
      formulas: elements
        .filter((entry) => entry.label === 'formula')
        .map((entry) => entry.content),
      images: elements
        .filter((entry) => entry.label === 'image')
        .map((entry) => entry.content),
    };
  });
}

function compactLayoutText(markdown: string, pages: GlmOcrLayoutPage[]): string {
  const layoutText = pages
    .map((page) => [
      `Page ${page.pageNumber}`,
      page.text,
      ...page.tables.map((table, index) => `Table ${index + 1}:\n${table}`),
      ...page.formulas.map((formula, index) => `Formula ${index + 1}: ${formula}`),
    ].filter(Boolean).join('\n'))
    .join('\n\n')
    .trim();

  return (markdown.trim() || layoutText).replace(/\s+\n/g, '\n').trim();
}

function createDataUri(base64: string, mimeType: string): string {
  return base64.startsWith('data:')
    ? base64
    : `data:${mimeType};base64,${base64.replace(/\s+/g, '')}`;
}

function createRequestBody(
  documentBase64: string,
  mimeType: string,
  options: ParseDocumentLayoutOptions | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: 'glm-ocr',
    file: createDataUri(documentBase64, mimeType),
    mimeType,
  };
  if (options?.startPageId != null) body.startPageId = options.startPageId;
  if (options?.endPageId != null) body.endPageId = options.endPageId;
  if (options?.returnCropImages === true) body.returnCropImages = true;
  if (options?.needLayoutVisualization === true) body.needLayoutVisualization = true;
  if (options?.userId) body.userId = options.userId;
  return body;
}

function createDirectRequestBody(
  documentBase64: string,
  mimeType: string,
  options: ParseDocumentLayoutOptions | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: 'glm-ocr',
    file: createDataUri(documentBase64, mimeType),
  };
  if (options?.startPageId != null) body.start_page_id = options.startPageId;
  if (options?.endPageId != null) body.end_page_id = options.endPageId;
  if (options?.returnCropImages === true) body.return_crop_images = true;
  if (options?.needLayoutVisualization === true) body.need_layout_visualization = true;
  if (options?.userId) body.user_id = options.userId;
  return body;
}

export function supportsGlmOcrLayoutParsing(config: LLMConfig): boolean {
  return config.provider === 'hosted-beta' || config.provider === 'zhipu';
}

export async function parseDocumentLayoutWithGlmOcr(
  documentBase64: string,
  mimeType: string,
  config: LLMConfig,
  options?: ParseDocumentLayoutOptions,
): Promise<GlmOcrLayoutResult> {
  if (!supportsGlmOcrLayoutParsing(config)) {
    throw new Error(`GLM-OCR layout parsing is not available for provider ${config.provider}.`);
  }
  if (config.provider === 'zhipu' && !config.apiKey.trim()) {
    throw new Error('Z.ai API key is required for direct GLM-OCR layout parsing.');
  }

  const isHostedBeta = config.provider === 'hosted-beta';
  const url = isHostedBeta
    ? resolveHostedLayoutProxyUrl(config)
    : resolveDirectLayoutParsingUrl(config);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (isHostedBeta) {
    headers['X-Geotech-Client'] = 'geotechcli';
    headers['X-Geotech-Client-Version'] = GEOTECHCLI_VERSION;
    headers['X-Geotech-Call-Type'] = 'layout';
    if (config.apiKey.trim()) {
      headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }
  } else {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  }

  const body = isHostedBeta
    ? createRequestBody(documentBase64, mimeType, options)
    : createDirectRequestBody(documentBase64, mimeType, options);
  const start = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeout ?? 150_000),
  });

  let responseText = '';
  let data: LayoutParsingResponse = {};
  try {
    responseText = await response.text();
    data = responseText ? (JSON.parse(responseText) as LayoutParsingResponse) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const rawMessage = data.error?.message ?? data.error?.detail ?? responseText ?? 'Unknown GLM-OCR error.';
    throw new Error(`GLM-OCR layout parsing failed (${response.status}): ${sanitizeUpstreamError(rawMessage)}`);
  }

  const pages = normalizePages(data);
  const markdown = typeof data.md_results === 'string' ? data.md_results : '';
  return {
    provider: config.provider,
    model: data.model ?? 'GLM-OCR',
    markdown,
    text: compactLayoutText(markdown, pages),
    pages,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
    latencyMs: Date.now() - start,
    warnings: pages.length === 0 && !markdown.trim()
      ? ['GLM-OCR returned no layout elements or Markdown text.']
      : [],
  };
}
