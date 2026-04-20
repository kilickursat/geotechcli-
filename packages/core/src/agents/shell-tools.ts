import { execSync } from 'node:child_process';

import { toolRegistry, type ToolResult } from './tools.js';
import { validateReadPath, validateShellCommand } from './sandbox.js';

toolRegistry.register(
  {
    name: 'run_command',
    description: 'Execute a safe, read-only shell command. Only allows: ls, cat, head, tail, wc, find, grep, file, stat, du, pwd, echo. Disabled by default in strong beta unless explicitly enabled.',
    parameters: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory' },
      },
    },
  },
  (args): ToolResult => {
    if (process.env.GEOTECHCLI_ENABLE_RUN_COMMAND !== '1') {
      return {
        success: false,
        data: null,
        summary: '',
        error: 'run_command is disabled by default in strong beta. Set GEOTECHCLI_ENABLE_RUN_COMMAND=1 to opt in.',
      };
    }

    const command = String(args.command);
    const check = validateShellCommand(command);
    if (!check.safe) {
      return { success: false, data: null, summary: '', error: check.error! };
    }

    try {
      const cwdCheck = validateReadPath(args.cwd ? String(args.cwd) : process.cwd());
      if (!cwdCheck.safe) {
        return { success: false, data: null, summary: '', error: cwdCheck.error! };
      }

      const cwd = cwdCheck.resolved;
      const output = execSync(command, {
        cwd,
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const lines = output.trim().split('\n');
      const truncated = lines.length > 100;
      const shown = truncated ? `${lines.slice(0, 100).join('\n')}\n... (truncated)` : output.trim();

      return {
        success: true,
        data: { command, cwd, output: shown, lines: lines.length },
        summary: `Executed: ${command} · ${lines.length} lines output`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      return { success: false, data: null, summary: '', error: `Command failed: ${msg}` };
    }
  },
);
