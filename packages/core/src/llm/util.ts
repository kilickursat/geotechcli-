// ---------------------------------------------------------------------------
// Upstream error sanitizer — ensures all error messages shown to CLI users
// are in English, regardless of what the upstream LLM provider returns.
// Covers legacy Zhipu/Z.AI Chinese errors and generic upstream failures.
// ---------------------------------------------------------------------------

const UPSTREAM_ERROR_MAP: Record<string, string> = {
  // Legacy Zhipu / Z.AI known error strings (Chinese → English)
  '图片输入格式/解析错误': 'Image input format or parsing error. Use PNG or JPG (avoid raw PDFs).',
  '请求参数错误': 'Invalid request parameters sent to the AI provider.',
  '模型不存在': 'The requested AI model does not exist on the provider.',
  '超出最大输入长度': 'Input exceeds the maximum token length. Try a shorter prompt or smaller image.',
  '系统繁忙': 'The AI provider service is currently busy. Please try again shortly.',
  '余额不足': 'The hosted beta AI account has insufficient credits. Contact support.',
  '访问受限': 'Access to the AI provider is currently restricted.',
  '内容过滤': 'The request was blocked by the AI provider content filter.',
  '图片大小超限': 'Image size exceeds the provider limit. Resize the image and try again.',
  '不支持的图片格式': 'Unsupported image format. Use PNG or JPG.',
  '无效的API密钥': 'Invalid API key configured on the hosted beta server.',
};

/**
 * CJK Unicode ranges: CJK Unified Ideographs, CJK Symbols, Fullwidth forms,
 * Hiragana, Katakana, Hangul.
 */
const CJK_PATTERN = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;

/**
 * Sanitize an upstream LLM provider error message so that only English text
 * is ever shown to CLI users.
 *
 * 1. Direct map lookup for known Zhipu error strings.
 * 2. CJK character detection → generic English replacement.
 * 3. Otherwise return the original string unchanged.
 */
export function sanitizeUpstreamError(raw: string | undefined | null): string {
  if (!raw) return 'The AI provider returned an unspecified error.';

  const trimmed = raw.trim();

  // Direct known-error lookup (exact match)
  if (UPSTREAM_ERROR_MAP[trimmed]) {
    return UPSTREAM_ERROR_MAP[trimmed];
  }

  // Partial match — check if any known Chinese key is a substring
  for (const [key, translation] of Object.entries(UPSTREAM_ERROR_MAP)) {
    if (trimmed.includes(key)) {
      return translation;
    }
  }

  // Detect any CJK characters in the string
  if (CJK_PATTERN.test(trimmed)) {
    return 'The AI provider returned a non-English error. The image format or request may be unsupported. Try a PNG or JPG image file.';
  }

  return trimmed;
}
