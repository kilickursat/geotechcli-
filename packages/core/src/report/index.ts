import type { LLMConfig } from '../llm/types.js';
import { generateText } from '../llm/router.js';

export { renderReportAsPdf } from './pdf.js';
export { renderReportAsDocx } from './docx.js';

export interface ReportSection {
  title: string;
  content: string;
}

export interface GeneratedReport {
  title: string;
  sections: ReportSection[];
  fullMarkdown: string;
  latencyMs: number;
}

export async function generateReport(
  analysisData: Record<string, unknown>,
  options: {
    type: 'borehole' | 'site-investigation' | 'tunnel-design' | 'foundation' | 'slope' | 'custom';
    projectName?: string;
    location?: string;
    author?: string;
    additionalNotes?: string;
    language?: string;
  },
  config: LLMConfig,
): Promise<GeneratedReport> {
  const dataStr = JSON.stringify(analysisData, null, 2);

  const prompt = `Generate a professional geotechnical engineering report based on this analysis data:

${dataStr}

Report requirements:
- Type: ${options.type}
- Project: ${options.projectName ?? 'Unnamed Project'}
- Location: ${options.location ?? 'Not specified'}
- Language: ${options.language ?? 'English'}
${options.additionalNotes ? `- Notes: ${options.additionalNotes}` : ''}

Structure the report in standard geotechnical format with these sections:
1. Executive Summary
2. Introduction & Scope
3. Site Description & Geology
4. Investigation / Analysis Methods
5. Results & Interpretation
6. Engineering Parameters
7. Conclusions & Recommendations

Output the report as clean markdown. Include tables where appropriate. Use proper geotechnical terminology and reference applicable standards.`;

  const response = await generateText(prompt, config, {
    systemPrompt: `You are a senior geotechnical engineer writing professional reports. Your reports are technically precise, well-structured, and suitable for submission to clients and regulatory bodies. Use standard formatting: numbered sections, tables for parameters, clear recommendations with supporting evidence.`,
    temperature: 0.3,
    maxTokens: 4096,
  });

  // Parse sections from markdown
  const sections: ReportSection[] = [];
  const sectionRegex = /^#{1,3}\s+(.+)$/gm;
  let lastIndex = 0;
  let lastTitle = 'Preamble';
  let match: RegExpExecArray | null;

  const text = response.text;

  while ((match = sectionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const content = text.slice(lastIndex, match.index).trim();
      if (content) {
        sections.push({ title: lastTitle, content });
      }
    }
    lastTitle = match[1];
    lastIndex = match.index + match[0].length;
  }

  // Last section
  if (lastIndex < text.length) {
    sections.push({ title: lastTitle, content: text.slice(lastIndex).trim() });
  }

  return {
    title: `${options.type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Report — ${options.projectName ?? 'Unnamed'}`,
    sections,
    fullMarkdown: response.text,
    latencyMs: response.latencyMs,
  };
}
