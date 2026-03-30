// ---------------------------------------------------------------------------
// Structured Logger — lightweight, zero-dependency
//
// Production: JSON lines (compatible with Datadog, Cloudflare Logpush, etc.)
// Development: Human-readable console output
//
// Usage:
//   import { logger } from '@/lib/logger';
//   logger.info('Request processed', { userId: '...', latencyMs: 42 });
//   logger.error('Upstream failure', { provider: 'zhipu', status: 502 });
//   logger.warn('Rate limit approaching', { remaining: 3, tier: 'free' });
// ---------------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const MIN_LEVEL = IS_PRODUCTION ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

/**
 * Sanitize log context — strip sensitive fields before logging.
 */
function sanitize(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (/api[_-]?key|token|secret|password|authorization|cookie/i.test(key)) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.slice(0, 500) + '...(truncated)';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function log(level: LogLevel, msg: string, context: Record<string, unknown> = {}): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...sanitize(context),
  };

  if (IS_PRODUCTION) {
    // JSON lines format for log aggregators
    const output = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  } else {
    // Human-readable for development
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'info' ? 'ℹ️' : '🔍';
    const contextStr = Object.keys(context).length > 0
      ? ' ' + JSON.stringify(sanitize(context))
      : '';
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[method](`${prefix} [${level.toUpperCase()}] ${msg}${contextStr}`);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};
