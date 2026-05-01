import { extname } from 'node:path';
import {
  countDocumentPdfPages,
  readDocumentPdfPageInputs,
  readDocumentVisionInput,
  type DocumentInputKind,
  type DocumentPdfPageInput,
  type DocumentVisionInput,
  type PdfDocumentInspection,
} from '@geotechcli/core';

export const HOSTED_BETA_REQUEST_LIMIT_BYTES = 8 * 1024 * 1024;
const HOSTED_BETA_REQUEST_MARGIN_BYTES = 32 * 1024;
export const HOSTED_BETA_REQUEST_SAFE_BYTES =
  HOSTED_BETA_REQUEST_LIMIT_BYTES - HOSTED_BETA_REQUEST_MARGIN_BYTES;

export type VisionFileKind = DocumentInputKind;
export type StructuredOutputKind = 'text' | 'pdf' | 'docx';
export type VisionInput = DocumentVisionInput;
export type VisionPdfPageInput = DocumentPdfPageInput;

export interface HostedBetaVisionRequestDetails {
  prompt: string;
  systemPrompt: string;
  imageBase64: string;
  mimeType: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export function readVisionInput(filePath: string): VisionInput {
  return readDocumentVisionInput(filePath);
}

export async function countPdfPages(filePath: string): Promise<number> {
  return countDocumentPdfPages(filePath);
}

export async function readVisionPdfPageInputs(
  filePath: string,
  options?: {
    inspection?: PdfDocumentInspection | null;
    preferExtractedPageImages?: boolean;
    forceRasterImages?: boolean;
  },
): Promise<VisionPdfPageInput[]> {
  return readDocumentPdfPageInputs(filePath, options);
}

export function estimateHostedBetaVisionBodyBytes(details: HostedBetaVisionRequestDetails): number {
  const body = {
    messages: [
      {
        role: 'system' as const,
        content: details.systemPrompt,
      },
      {
        role: 'user' as const,
        content: [
          {
            type: 'image_url' as const,
            image_url: {
              url: `data:${details.mimeType};base64,${details.imageBase64}`,
            },
          },
          {
            type: 'text' as const,
            text: details.prompt,
          },
        ],
      },
    ],
    model: details.model,
    temperature: details.temperature,
    maxTokens: details.maxTokens,
    jsonMode: details.jsonMode ?? false,
  };

  return Buffer.byteLength(JSON.stringify(body), 'utf8');
}

function normalizeStructuredOutputKind(value: string | undefined): StructuredOutputKind {
  switch ((value ?? '').toLowerCase()) {
    case 'pdf':
      return 'pdf';
    case 'docx':
      return 'docx';
    default:
      return 'text';
  }
}

export function resolveStructuredOutputTarget(options: {
  outputPath?: string;
  requestedFormat?: string;
  defaultBaseName: string;
}): {
  outputPath: string;
  kind: StructuredOutputKind;
  warning?: string;
} {
  const requestedKind = normalizeStructuredOutputKind(options.requestedFormat);
  const requestedFormat = options.requestedFormat?.toLowerCase();

  if (!options.outputPath) {
    const outputPath =
      requestedKind === 'text'
        ? `${options.defaultBaseName}.md`
        : `${options.defaultBaseName}.${requestedKind}`;

    return {
      outputPath,
      kind: requestedKind,
    };
  }

  const ext = extname(options.outputPath).toLowerCase();
  const extKind =
    ext === '.pdf'
      ? 'pdf'
      : ext === '.docx'
        ? 'docx'
        : ext === '.md' || ext === '.markdown' || ext === '.txt'
          ? 'text'
          : null;

  if (extKind) {
    const warning =
      requestedFormat && requestedKind !== extKind
        ? `Output path extension ${ext} overrides requested format ${requestedFormat}.`
        : undefined;

    return {
      outputPath: options.outputPath,
      kind: extKind,
      warning,
    };
  }

  if (requestedKind === 'text') {
    return {
      outputPath: options.outputPath,
      kind: 'text',
    };
  }

  return {
    outputPath: options.outputPath.endsWith(`.${requestedKind}`)
      ? options.outputPath
      : `${options.outputPath}.${requestedKind}`,
    kind: requestedKind,
    warning: `Output path extension is not recognized. Using .${requestedKind} for the requested format.`,
  };
}

export function formatByteSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
