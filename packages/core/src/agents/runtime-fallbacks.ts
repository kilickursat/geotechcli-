import type { LLMConfig } from '../llm/types.js';
import {
  buildGeotechnicalFallbackAnswer,
  buildGeotechnicalPreflightAnswer,
} from './intake.js';

export type HostedFallbackMode = 'temporary' | 'warming_timeout';

export function isHostedBetaUnavailable(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('provider is busy') ||
    normalized.includes('rate limit') ||
    normalized.includes('timed out') ||
    normalized.includes('upstream request failed') ||
    normalized.includes('retry in about') ||
    normalized.includes('hosted beta ai request failed') ||
    normalized.includes('hosted beta upstream returned no content') ||
    normalized.includes('empty completion') ||
    normalized.includes('fetch failed')
  );
}

export function getHostedFallbackMode(message: string): HostedFallbackMode {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('timed out') ||
    normalized.includes('timeout budget') ||
    normalized.includes('warming up') ||
    normalized.includes('modal.com gpu')
  ) {
    return 'warming_timeout';
  }
  return 'temporary';
}

function extractNumericValue(query: string, pattern: RegExp): number | null {
  const match = query.match(pattern);
  return match ? Number(match[1]) : null;
}

export function buildDeterministicPreflightAnswer(
  userQuery: string,
  config: LLMConfig,
  sessionContext?: Record<string, unknown>,
): string | null {
  return buildGeotechnicalPreflightAnswer(userQuery, config, sessionContext);
}

export function buildDeterministicFallbackAnswer(
  userQuery: string,
  sessionContext?: Record<string, unknown>,
  mode: HostedFallbackMode = 'temporary',
): string {
  const normalized = userQuery.toLowerCase();
  const fallbackLead =
    mode === 'warming_timeout'
      ? 'Hosted model on Modal.com GPU is warming up or exceeded the current timeout budget, so the agent switched to deterministic fallback reasoning instead of returning no analysis.'
      : 'Hosted beta was temporarily unavailable, so the agent switched to deterministic fallback reasoning instead of returning no analysis.';

  const intakeFallback = buildGeotechnicalFallbackAnswer(userQuery, sessionContext);
  if (intakeFallback) {
    return intakeFallback;
  }

  if (/(tbm|epb|slurry|shield|tunnel boring)/.test(normalized)) {
    const rpm = extractNumericValue(normalized, /(\d+(?:\.\d+)?)\s*rpm/);
    const thrust = extractNumericValue(normalized, /(\d+(?:\.\d+)?)\s*k\s*n/);
    const diameter =
      extractNumericValue(normalized, /(\d+(?:\.\d+)?)\s*m\s*(?:diameter|tbm|tunnel)/) ??
      extractNumericValue(normalized, /(\d+(?:\.\d+)?)\s*m\b/);
    const hasSoftGround = /(clay|silt|sand|soft ground|soft soil)/.test(normalized);
    const hasRockInputs = /(ucs|rqd|cai|joint spacing|jointspacing)/.test(normalized);

    const lines = [
      fallbackLead,
      '',
      'Engineering assessment:',
    ];

    if (hasSoftGround || normalized.includes('epb')) {
      lines.push('- The ground description points to soft-ground tunnelling, so EPB remains the appropriate screening-level machine class.');
    }
    if (rpm != null) {
      lines.push(`- Provided cutterhead speed: ${rpm} rpm.`);
    }
    if (thrust != null) {
      lines.push(`- Provided thrust: ${thrust} kN.`);
    }

    lines.push('');
    lines.push('Deterministic limitation:');

    if (diameter == null) {
      lines.push('- Tunnel / TBM diameter is not provided, which is required for any defensible advance-rate estimate.');
    }
    if (hasSoftGround && !hasRockInputs) {
      lines.push('- The current built-in TBM performance engine in geotechCLI is a rock disc-cutter model requiring diameter, UCS, and RQD-type inputs. It does not yet include a validated EPB-in-clay penetration model.');
    } else if (!hasRockInputs) {
      lines.push('- The current built-in TBM performance engine needs rock-mechanics inputs such as UCS and RQD before it can calculate penetration rate.');
    }
    lines.push('- RPM and thrust alone are not sufficient for a validated penetration-rate calculation in soft ground without diameter plus material/operational parameters.');
    lines.push('');
    lines.push('Next best deterministic path in geotechCLI:');
    lines.push('- Use `geotech tunnel tbm-select --diameter <m> --ground soft_ground` for a machine-class recommendation.');
    lines.push('- Use `geotech tunnel tbm-predict --diameter <m> --ucs <MPa> --rqd <percent> ...` only for the existing rock-TBM predictor.');
    lines.push('- If you want EPB soft-ground penetration screening in-clay, that needs a new validated deterministic model to be added to the toolset.');

    return lines.join('\n');
  }

  return [
    mode === 'warming_timeout'
      ? 'Hosted model on Modal.com GPU is warming up or exceeded the current timeout budget, and this request does not currently have a direct deterministic fallback in geotechCLI.'
      : 'Hosted beta was temporarily unavailable, and this request does not currently have a direct deterministic fallback in geotechCLI.',
    'Retry shortly, or reformulate the task as one of the built-in deterministic commands so the CLI can continue without the hosted model.',
  ].join('\n\n');
}
