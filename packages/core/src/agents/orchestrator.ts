import type { LLMConfig, CompletionResponse } from '../llm/types.js';
import { generateText } from '../llm/router.js';
import {
  buildProprietaryInternalsRefusal,
  getProprietaryInternalsPromptRules,
  isProprietaryInternalsRequest,
} from './proprietary-internals.js';

export interface AgentLog {
  agent: string;
  message: string;
  type: 'thought' | 'action' | 'result' | 'error';
  timestamp: number;
}

interface AgentDefinition {
  name: string;
  tag: string;
  systemPrompt: string;
}

function withProprietaryRules(basePrompt: string): string {
  return `${basePrompt}\n\nSecurity rules:\n${getProprietaryInternalsPromptRules()}`;
}

const AGENTS: AgentDefinition[] = [
  {
    name: 'Geo Agent',
    tag: '@geo-agent',
    systemPrompt: withProprietaryRules(`You are a specialist geotechnical engineer. You analyze soil mechanics, rock mechanics, bearing capacity, settlement, classification (USCS, AASHTO), and site investigation data. Provide precise numerical answers with standard references (Terzaghi, Meyerhof, Lambe & Whitman). Always state assumptions and applicable standards.`),
  },
  {
    name: 'Tunnel Agent',
    tag: '@tunnel-agent',
    systemPrompt: withProprietaryRules(`You are a specialist tunnel engineer. You advise on NATM/conventional tunneling, TBM selection and performance, support design (shotcrete, rockbolts, steel sets), convergence-confinement method, lining design, and underground space planning. Reference Bieniawski, Barton, Hoek-Brown, and AFTES/ITA guidelines.`),
  },
  {
    name: 'Hydro Agent',
    tag: '@hydro-agent',
    systemPrompt: withProprietaryRules(`You are a specialist hydrogeologist. You analyze groundwater flow, seepage, dewatering design, pore pressure prediction, permeability testing interpretation (Lugeon, slug tests), and contamination transport. Reference Darcy's law, flow net theory, and Theis/Cooper-Jacob solutions.`),
  },
  {
    name: 'Seismic Agent',
    tag: '@seismic-agent',
    systemPrompt: withProprietaryRules(`You are a specialist seismic/earthquake engineer. You analyze liquefaction triggering (Boulanger & Idriss, Seed & Idriss), seismic site response, ground motion parameters, dynamic soil properties, and earthquake-induced settlement and lateral spreading. Reference NCEER, Eurocode 8, and ASCE 7.`),
  },
  {
    name: 'Slope Agent',
    tag: '@slope-agent',
    systemPrompt: withProprietaryRules(`You are a specialist slope stability engineer. You perform limit equilibrium analysis (Bishop, Spencer, Morgenstern-Price), evaluate landslide risk, design retaining structures, and analyze reinforced slopes and soil nails. Reference Duncan & Wright, FHWA guidelines.`),
  },
  {
    name: 'Foundation Agent',
    tag: '@foundation-agent',
    systemPrompt: withProprietaryRules(`You are a specialist foundation engineer. You design shallow and deep foundations, analyze pile capacity (static and dynamic), evaluate group effects, design pile caps, and perform serviceability checks. Reference API RP 2GEO, FHWA, and relevant building codes.`),
  },
];

const ORCHESTRATOR_SYSTEM = `You are the geotechCLI Orchestrator. You decompose complex geotechnical engineering tasks into sub-tasks for specialized agents.

Available agents:
${AGENTS.map((a) => `- ${a.tag}: ${a.name}`).join('\n')}

Instructions:
${getProprietaryInternalsPromptRules()}
1. Analyze the user's task and determine which agent(s) to call.
2. To call an agent, output EXACTLY this JSON block:
\`\`\`json
{"action":"call_agent","agent":"@geo-agent","query":"your specific question"}
\`\`\`
3. Call one agent at a time. Wait for results before proceeding.
4. After gathering all needed information, write a final comprehensive engineering report in markdown. Do NOT include any JSON block in the final report.
5. Always include numerical results, applicable standards, and recommendations.`;

export async function runMultiAgentTask(
  task: string,
  config: LLMConfig,
  onLog: (log: AgentLog) => void,
  maxIterations = 6,
): Promise<string> {
  if (isProprietaryInternalsRequest(task)) {
    onLog({
      agent: 'Orchestrator',
      message: 'Blocked proprietary internals disclosure request.',
      type: 'error',
      timestamp: Date.now(),
    });
    return buildProprietaryInternalsRefusal();
  }

  onLog({
    agent: 'Orchestrator',
    message: `Planning: "${task}"`,
    type: 'thought',
    timestamp: Date.now(),
  });

  let conversationHistory = `Task: ${task}\n\n`;
  let finalReport = '';

  for (let i = 0; i < maxIterations; i++) {
    let response: CompletionResponse;
    try {
      response = await generateText(conversationHistory, config, {
        systemPrompt: ORCHESTRATOR_SYSTEM,
        temperature: 0.3,
        maxTokens: 2048,
      });
    } catch (err) {
      onLog({
        agent: 'System',
        message: `LLM error: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
        timestamp: Date.now(),
      });
      throw err;
    }

    const text = response.text;

    // Check for agent call JSON block
    const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```/);

    if (jsonMatch) {
      try {
        const action = JSON.parse(jsonMatch[1]);

        if (action.action === 'call_agent' && action.agent && action.query) {
          const agentDef = AGENTS.find((a) => a.tag === action.agent);
          if (!agentDef) {
            conversationHistory += `\nOrchestrator:\n${text}\n\nError: Unknown agent "${action.agent}". Available: ${AGENTS.map((a) => a.tag).join(', ')}\n\n`;
            continue;
          }

          onLog({
            agent: 'Orchestrator',
            message: `Delegating to ${agentDef.name}: "${action.query}"`,
            type: 'action',
            timestamp: Date.now(),
          });

          const agentResponse = await generateText(action.query, config, {
            systemPrompt: agentDef.systemPrompt,
            temperature: 0.2,
            maxTokens: 2048,
          });

          const result = agentResponse.text;

          onLog({
            agent: agentDef.name,
            message: result.slice(0, 200) + (result.length > 200 ? '...' : ''),
            type: 'result',
            timestamp: Date.now(),
          });

          conversationHistory += `\nOrchestrator:\n${text}\n\nResult from ${agentDef.name}:\n${result}\n\nContinue analysis. Call another agent or provide final report.\n`;
        }
      } catch {
        conversationHistory += `\nOrchestrator:\n${text}\n\nError: Invalid JSON. Please output valid JSON for agent calls.\n`;
      }
    } else {
      // No JSON block — this is the final report
      finalReport = text;
      onLog({
        agent: 'Orchestrator',
        message: 'Final report synthesized.',
        type: 'thought',
        timestamp: Date.now(),
      });
      break;
    }
  }

  if (!finalReport) {
    onLog({
      agent: 'Orchestrator',
      message: 'Max iterations reached. Synthesizing partial findings.',
      type: 'thought',
      timestamp: Date.now(),
    });

    const fallback = await generateText(
      conversationHistory + '\n\nProvide the final report now based on all gathered information.',
      config,
      { systemPrompt: ORCHESTRATOR_SYSTEM, maxTokens: 3000 },
    );
    finalReport = fallback.text;
  }

  return finalReport;
}
