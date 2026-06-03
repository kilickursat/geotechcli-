import { sanitizeUpstreamError } from '../util.js';

export interface ProviderJsonResponse<T> {
  data: T;
  rawText: string;
}

export async function readProviderJsonResponse<T extends object>(
  response: Response,
  providerLabel: string,
): Promise<ProviderJsonResponse<T>> {
  const rawText = await response.text().catch(() => '');
  if (!rawText.trim()) {
    return {
      data: {} as T,
      rawText,
    };
  }

  try {
    return {
      data: JSON.parse(rawText) as T,
      rawText,
    };
  } catch (error) {
    if (response.ok) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${providerLabel} API returned malformed JSON response: ${sanitizeUpstreamError(message)}.`,
      );
    }

    return {
      data: {} as T,
      rawText,
    };
  }
}
