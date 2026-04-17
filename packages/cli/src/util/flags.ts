import type { Command } from 'commander';
import { GLOBAL_FLAG_DEFINITIONS } from '@geotechcli/core';

export interface GlobalFlags {
  json: boolean;
  plot: boolean;
  saveHtml?: string;
  openInteractivePlot?: boolean;
  verbose: boolean;
  quiet: boolean;
  dryRun: boolean;
  output?: string;
  noColor: boolean;
}

export function addGlobalFlags(cmd: Command): Command {
  let current = cmd;
  for (const flag of GLOBAL_FLAG_DEFINITIONS) {
    if (flag.option.includes('<')) {
      current = current.option(flag.option, flag.description);
    } else {
      current = current.option(flag.option, flag.description);
    }
  }
  return current;
}

export function getGlobalFlags(opts: Record<string, unknown>): GlobalFlags {
  return {
    json: Boolean(opts.json),
    plot: Boolean(opts.plot),
    saveHtml: opts.saveHtml as string | undefined,
    openInteractivePlot:
      typeof opts.open === 'boolean'
        ? opts.open
        : undefined,
    verbose: Boolean(opts.verbose),
    quiet: Boolean(opts.quiet),
    dryRun: Boolean(opts.dryRun),
    output: opts.output as string | undefined,
    noColor: Boolean(opts.noColor),
  };
}
