import type { AgentConfig } from "../types.js";

export interface AvailableToolInfo {
  name: string;
  description: string;
}

export interface ExtractedAgentConfig {
  name: string;
  systemPrompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
  avatar: { emoji: string; color: string };
  tools?: string[];
  delegates?: string[];
  topicBoundaries?: {
    allowed: string[];
    blocked: string[];
    boundaryMessage: string;
  };
}

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_AVATAR = { emoji: "🤖", color: "#6c5ce7" };

export class CopilotService {
  constructor(
    private agents: Map<string, AgentConfig>,
    private availableTools: AvailableToolInfo[]
  ) {}

  buildSystemPrompt(mode: "create" | "edit", agentId?: string): string {
    const sections: string[] = [];

    // Base instructions
    sections.push(`You are an Agent Copilot that helps users create and edit AI agent configurations.
Your job is to understand what kind of agent the user wants and produce a well-crafted agent configuration.

## Interview Style
- Start by understanding what the user wants naturally
- Extract as much config as you can from their description
- Ask targeted follow-up questions ONLY for missing or ambiguous fields
- Be conversational, not robotic — don't list all fields at once
- Always confirm with the user before outputting the final config

When you have gathered enough information to define an agent, output the configuration in a fenced code block using the \`agent-config\` language tag:

\`\`\`agent-config
{
  "name": "Agent Name",
  "systemPrompt": "The agent's system prompt...",
  "model": "${DEFAULT_MODEL}",
  "maxTokens": ${DEFAULT_MAX_TOKENS},
  "temperature": ${DEFAULT_TEMPERATURE}
}
\`\`\`

Required fields: \`name\`, \`systemPrompt\`
Optional fields: \`model\`, \`maxTokens\`, \`temperature\`, \`tools\`, \`avatar\``);

    // Existing agents section
    if (this.agents.size > 0) {
      const agentLines = [...this.agents.entries()].map(([id, agent]) => {
        const parts = [`- ${id} ("${agent.name}") — model: ${agent.model}`];
        if (agent.tools && agent.tools.length > 0) {
          parts.push(`tools: ${agent.tools.join(", ")}`);
        }
        if (agent.delegates && agent.delegates.length > 0) {
          parts.push(`delegates to: ${agent.delegates.join(", ")}`);
        }
        return parts.join(" | ");
      });
      sections.push(`## Existing Agents

The following agents already exist in the system:

${agentLines.join("\n")}`);
    }

    // Available tools section
    if (this.availableTools.length > 0) {
      const toolLines = this.availableTools.map((t) => `- **${t.name}**: ${t.description}`);
      sections.push(`## Available Tools

These tools can be assigned to agents via the \`tools\` array in the config:

${toolLines.join("\n")}`);
    }

    // Edit mode context
    if (mode === "edit" && agentId) {
      const agent = this.agents.get(agentId);
      if (agent) {
        sections.push(`## Editing: ${agent.name} (id: \`${agent.id}\`)

Current configuration:
- **Name**: ${agent.name}
- **Model**: ${agent.model}
- **Max Tokens**: ${agent.maxTokens}
- **Temperature**: ${agent.temperature}
- **System Prompt**: ${agent.systemPrompt}
${agent.tools ? `- **Tools**: ${agent.tools.join(", ")}` : ""}

The user wants to modify this agent. Ask what they'd like to change, then output the full updated config.`);
      }
    }

    return sections.join("\n\n");
  }

  extractAgentConfig(text: string): ExtractedAgentConfig | null {
    const match = text.match(/```agent-config\s*\n([\s\S]*?)```/);
    if (!match) {
      return null;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      return null;
    }

    // Validate required fields
    if (typeof parsed.name !== "string" || !parsed.name) {
      return null;
    }
    if (typeof parsed.systemPrompt !== "string" || !parsed.systemPrompt) {
      return null;
    }

    // Apply defaults for optional fields
    const model = typeof parsed.model === "string" ? parsed.model : DEFAULT_MODEL;
    const maxTokens = typeof parsed.maxTokens === "number" ? parsed.maxTokens : DEFAULT_MAX_TOKENS;
    const temperature = typeof parsed.temperature === "number" ? parsed.temperature : DEFAULT_TEMPERATURE;

    const avatar = {
      emoji: (parsed.avatar as any)?.emoji || "🤖",
      color: (parsed.avatar as any)?.color || "#6c5ce7",
    };

    const result: ExtractedAgentConfig = {
      name: parsed.name,
      systemPrompt: parsed.systemPrompt,
      model,
      maxTokens,
      temperature,
      avatar,
    };

    if (Array.isArray(parsed.tools)) {
      result.tools = parsed.tools.filter((t): t is string => typeof t === "string");
    }

    if (Array.isArray(parsed.delegates)) {
      result.delegates = parsed.delegates.filter((d): d is string => typeof d === "string");
    }

    if (
      parsed.topicBoundaries &&
      typeof parsed.topicBoundaries === "object"
    ) {
      const tb = parsed.topicBoundaries as Record<string, unknown>;
      if (
        Array.isArray(tb.allowed) &&
        Array.isArray(tb.blocked) &&
        typeof tb.boundaryMessage === "string"
      ) {
        result.topicBoundaries = {
          allowed: tb.allowed.filter((x): x is string => typeof x === "string"),
          blocked: tb.blocked.filter((x): x is string => typeof x === "string"),
          boundaryMessage: tb.boundaryMessage,
        };
      }
    }

    return result;
  }
}
