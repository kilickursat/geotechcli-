import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { PDFDocument } from 'pdf-lib';

export const HOSTED_BETA_REQUEST_LIMIT_BYTES = 8 * 1024 * 1024;
const HOSTED_BETA_REQUEST_MARGIN_BYTES = 32 * 1024;
export const HOSTED_BETA_REQUEST_SAFE_BYTES =
  HOSTED_BETA_REQUEST_LIMIT_BYTES - HOSTED_BETA_REQUEST_MARGIN_BYTES;

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export type VisionFileKind = 'image' | 'pdf' | 'unknown';
export type StructuredOutputKind = 'text' | 'pdf' | 'docx';

export interface VisionInput {
  base64: string;
  mimeType: string;
  fileBytes: number;
  filePath: string;
  ext: string;
  kind: VisionFileKind;
}

export interface VisionPdfPageInput extends VisionInput {
  pageNumber: number;
  totalPages: number;
}

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
  const buffer = readFileSync(filePath);
  const ext = extname(filePath).slice(1).toLowerCase();
  const kind: VisionFileKind = ext === 'pdf' ? 'pdf' : MIME_TYPES[ext] ? 'image' : 'unknown';

  return {
    base64: buffer.toString('base64'),
    mimeType: MIME_TYPES[ext] ?? 'image/png',
    fileBytes: buffer.length,
    filePath,
    ext,
    kind,
  };
}

export async function readVisionPdfPageInputs(filePath: string): Promise<VisionPdfPageInput[]> {
  const buffer = readFileSync(filePath);
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const totalPages = source.getPageCount();
  const pageInputs: VisionPdfPageInput[] = [];

  for (let index = 0; index < totalPages; index++) {
    const pageDoc = await PDFDocument.create();
    const [copiedPage] = await pageDoc.copyPages(source, [index]);
    pageDoc.addPage(copiedPage);
    const pageBytes = await pageDoc.save();
    const pageBuffer = Buffer.from(pageBytes);

    pageInputs.push({
      base64: pageBuffer.toString('base64'),
      mimeType: 'application/pdf',
      fileBytes: pageBuffer.length,
      filePath,
      ext: 'pdf',
      kind: 'pdf',
      pageNumber: index + 1,
      totalPages,
    });
  }

  return pageInputs;
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
