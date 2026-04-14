#!/usr/bin/env node

import { Command } from 'commander';
import { GEOTECHCLI_VERSION } from '@geotechcli/core';
import { banner } from './ui/terminal.js';
import { registerBearingCommand } from './commands/bearing.js';
import { registerLiquefactionCommand } from './commands/liquefaction.js';
import { registerClassifyCommand } from './commands/classify.js';
import { registerConfigCommand } from './commands/config.js';
import { registerStatusCommand } from './commands/status.js';
import { registerTunnelCommands } from './commands/tunnel.js';
import { registerExportCommand } from './commands/export.js';
import { registerBridgeCommand } from './commands/bridge.js';
import { registerPileCommand } from './commands/pile.js';
import { registerSlopeCommand } from './commands/slope.js';
import { registerRetainingCommand } from './commands/retaining.js';
import { registerSettlementCommands } from './commands/settlement.js';
import { registerSeepageCommand } from './commands/seepage.js';
import { registerVizCommand } from './commands/viz.js';
import {
  registerVisionCommand,
  registerAIClassifyCommand,
  registerGBRCommand,
  registerAgentCommand,
  registerReportCommand,
  registerChatCommand,
} from './commands/ai.js';

const program = new Command();

program
  .name('geotech')
  .description('AI-native CLI for geotechnical engineering with hosted GLM beta access')
  .version(GEOTECHCLI_VERSION, '-v, --version');

program.addHelpText('beforeAll', () => {
  banner();
  return '';
});

// ---------------------------------------------------------------------------
// Deterministic geo commands (always free, works offline)
// ---------------------------------------------------------------------------
registerBearingCommand(program);
registerLiquefactionCommand(program);
registerClassifyCommand(program);
registerPileCommand(program);
registerSlopeCommand(program);
registerRetainingCommand(program);
registerSettlementCommands(program);

// Seepage
registerSeepageCommand(program);
registerVizCommand(program);

// Tunnel engineering
registerTunnelCommands(program);

// ---------------------------------------------------------------------------
// AI-assisted commands (strong beta defaults to the hosted GLM gateway)
// ---------------------------------------------------------------------------
registerVisionCommand(program);
registerAIClassifyCommand(program);
registerGBRCommand(program);
registerAgentCommand(program);
registerReportCommand(program);
registerChatCommand(program);

// Export & Bridge
registerExportCommand(program);
registerBridgeCommand(program);

// System
registerConfigCommand(program);
registerStatusCommand(program);

// Show banner when invoked with no arguments
if (process.argv.length <= 2) {
  banner();
}

// ---------------------------------------------------------------------------
// Error handling — never leak API keys in stack traces
// ---------------------------------------------------------------------------
program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof Error) {
    if ('exitCode' in err && (err as any).exitCode === 0) {
      process.exit(0);
    }
    const msg = err.message.replace(
      /(?:Bearer |sk-|zhipu-|api[_-]?key[=: ]*)[^\s"'\]},]*/gi,
      '***REDACTED***',
    );
    console.error(`\n  Error: ${msg}\n`);
    process.exit(1);
  }
}
