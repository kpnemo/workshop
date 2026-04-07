import type Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolContext } from "./tools/types.js";
import type { AgentConfig } from "../types.js";
import { BrowserManager } from "./tools/browser-manager.js";
import { createBrowseUrlTool } from "./tools/browse-url.js";
import { createAssignAgentTool } from "./tools/assign-agent.js";
import { createDelegateToTool } from "./tools/delegate-to.js";
import { createHandBackTool } from "./tools/hand-back.js";

export interface DelegationOptions {
  isMainAgent?: boolean;
  isActiveDelegate?: boolean;
}

export class ToolService {
  private tools = new Map<string, Tool>();
  private browserManager: BrowserManager;

  constructor() {
    this.browserManager = new BrowserManager();
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getAvailableTools(): Array<{ name: string; description: string }> {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.definition.description ?? "",
    }));
  }

  registerDefaults(): void {
    this.register(createBrowseUrlTool(this.browserManager));
    this.register(createAssignAgentTool());
  }

  getToolsForAgent(
    agent: AgentConfig,
    delegationOptions?: DelegationOptions
  ): Anthropic.Messages.Tool[] {
    const definitions: Anthropic.Messages.Tool[] = [];

    if (agent.tools && agent.tools.length > 0) {
      for (const name of agent.tools) {
        if (name === "assign_agent" && agent.id !== "router") continue;
        const tool = this.tools.get(name);
        if (tool) {
          definitions.push(tool.definition);
        }
      }
    }

    if (delegationOptions?.isMainAgent && agent.delegates && agent.delegates.length > 0) {
      const delegateTool = createDelegateToTool(agent.delegates);
      definitions.push(delegateTool.definition);
    }

    if (delegationOptions?.isActiveDelegate) {
      const handBackTool = createHandBackTool();
      definitions.push(handBackTool.definition);
    }

    return definitions;
  }

  async execute(toolName: string, input: unknown, context?: ToolContext): Promise<string> {
    if (toolName === "delegate_to" && context) {
      const conv = context.db.getConversation(context.conversationId);
      if (conv) {
        const mainAgent = context.agents.get(conv.agentId);
        if (mainAgent?.delegates) {
          const tool = createDelegateToTool(mainAgent.delegates);
          return tool.execute(input, context);
        }
      }
    }

    if (toolName === "hand_back" && context) {
      const tool = createHandBackTool();
      return tool.execute(input, context);
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      return `Error: Tool "${toolName}" is not registered.`;
    }
    return tool.execute(input, context);
  }

  async shutdown(): Promise<void> {
    await this.browserManager.close();
  }
}
