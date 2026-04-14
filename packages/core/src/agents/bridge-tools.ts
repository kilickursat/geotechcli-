import { toolRegistry, type ToolResult } from './tools.js';
import { execSync } from 'node:child_process';
import { validateReadPath, validateShellCommand } from './sandbox.js';

// ---------------------------------------------------------------------------
// PLAXIS Remote Scripting API
// ---------------------------------------------------------------------------

async function plaxisRequest(
  endpoint: string,
  method: string,
  body?: unknown,
  port = 10000,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  try {
    const res = await fetch(`http://localhost:${port}${endpoint}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, data: null, error: `PLAXIS returned ${res.status}` };
    const data = await res.json().catch(() => res.text());
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false, data: null,
      error: `Cannot reach PLAXIS at localhost:${port}. Ensure PLAXIS is running with Remote Scripting enabled.`,
    };
  }
}

toolRegistry.register(
  {
    name: 'plaxis_execute',
    description: 'Send a Python command to a running PLAXIS 2D/3D instance via Remote Scripting API.',
    parameters: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', description: 'Python command for PLAXIS' },
        port: { type: 'number', description: 'PLAXIS scripting server port', default: 10000 },
      },
    },
  },
  async (args): Promise<ToolResult> => {
    const command = String(args.command);
    const port = (args.port as number) ?? 10000;

    const dangerous = ['import os', 'import sys', 'subprocess', 'exec(', 'eval(', '__import__', 'shutil', 'rmtree', 'open(', 'write(', 'unlink'];
    if (dangerous.some((d) => command.toLowerCase().includes(d))) {
      return { success: false, data: null, summary: '', error: 'Command blocked: contains potentially dangerous operations.' };
    }

    const result = await plaxisRequest('/commands', 'POST', { commands: [command] }, port);
    if (!result.ok) return { success: false, data: null, summary: '', error: result.error ?? 'PLAXIS command failed' };

    return {
      success: true,
      data: result.data,
      summary: `PLAXIS executed: ${command.slice(0, 60)} → ${JSON.stringify(result.data).slice(0, 120)}`,
    };
  },
);

toolRegistry.register(
  {
    name: 'plaxis_get_results',
    description: 'Extract calculation results from a PLAXIS model.',
    parameters: {
      type: 'object',
      required: ['phase', 'resultType'],
      properties: {
        phase: { type: 'string', description: 'Phase name (e.g. "Phase_1")' },
        resultType: { type: 'string', enum: ['displacement', 'stress', 'force', 'plastic_points', 'pore_pressure', 'factor_of_safety'] },
        location: { type: 'string', description: 'Specific point or node' },
        port: { type: 'number', default: 10000 },
      },
    },
  },
  (args): ToolResult => {
    const phase = String(args.phase);
    const resultType = String(args.resultType);
    const resultCommands: Record<string, string> = {
      displacement: `g_i.getresults(g_i.${phase}, g_i.ResultTypes.Soil.Utot, 'max')`,
      stress: `g_i.getresults(g_i.${phase}, g_i.ResultTypes.Soil.SigmaXXeff, 'min')`,
      force: `g_i.getresults(g_i.${phase}, g_i.ResultTypes.Plate.M2D, 'max')`,
      plastic_points: `g_i.getresults(g_i.${phase}, g_i.ResultTypes.Soil.PlasticPointStatus, 'count')`,
      pore_pressure: `g_i.getresults(g_i.${phase}, g_i.ResultTypes.Soil.PExcess, 'max')`,
      factor_of_safety: `g_i.getresults(g_i.${phase}, g_i.ResultTypes.Soil.SumMsf, 'max')`,
    };
    const cmd = resultCommands[resultType];
    if (!cmd) return { success: false, data: null, summary: '', error: `Unknown result type: ${resultType}` };
    return {
      success: true,
      data: { phase, resultType, command: cmd },
      summary: `PLAXIS result query: ${resultType} from ${phase}`,
    };
  },
);

toolRegistry.register(
  {
    name: 'flac3d_execute',
    description: 'Generate a FISH/command-line instruction for FLAC3D. Commands are generated for manual execution.',
    parameters: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', description: 'FLAC command or FISH code' },
        port: { type: 'number', default: 5000 },
      },
    },
  },
  (args): ToolResult => {
    const command = String(args.command);
    return {
      success: true,
      data: { command, port: (args.port as number) ?? 5000 },
      summary: `FLAC3D command queued: ${command.slice(0, 80)}`,
    };
  },
);

toolRegistry.register(
  {
    name: 'rocscience_execute',
    description: 'Generate a Python command for Rocscience RS2/RS3/Slide scripting API.',
    parameters: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', description: 'Python command for Rocscience' },
        software: { type: 'string', enum: ['rs2', 'rs3', 'slide', 'slide2'], default: 'rs2' },
        port: { type: 'number', default: 8080 },
      },
    },
  },
  (args): ToolResult => {
    const command = String(args.command);
    return {
      success: true,
      data: { command, software: args.software ?? 'rs2', port: (args.port as number) ?? 8080 },
      summary: `Rocscience ${args.software ?? 'RS2'} command queued: ${command.slice(0, 80)}`,
    };
  },
);

// ---------------------------------------------------------------------------
// Shell command execution (sandboxed via sandbox.ts)
// ---------------------------------------------------------------------------

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

    // SANDBOX: validate command through centralized sandbox
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
      const shown = truncated ? lines.slice(0, 100).join('\n') + '\n... (truncated)' : output.trim();

      return {
        success: true,
        data: { command, cwd, output: shown, lines: lines.length },
        summary: `Executed: ${command} → ${lines.length} lines output`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      return { success: false, data: null, summary: '', error: `Command failed: ${msg}` };
    }
  },
);
