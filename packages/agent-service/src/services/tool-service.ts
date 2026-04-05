import type Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "./tools/types.js";
import type { AgentConfig } from "../types.js";
import { BrowserManager } from "./tools/browser-manager.js";
import { createBrowseUrlTool } from "./tools/browse-url.js";

export class ToolService {
  private tools = new Map<string, Tool>();
  private browserManager: BrowserManager;

  constructor() {
    this.browserManager = new BrowserManager();
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  registerDefaults(): void {
    this.register(createBrowseUrlTool(this.browserManager));
  }

  getToolsForAgent(agent: AgentConfig): Anthropic.Messages.Tool[] {
    if (!agent.tools || agent.tools.length === 0) {
      return [];
    }

    return agent.tools
      .map((name) => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined)
      .map((tool) => tool.definition);
  }

  async execute(toolName: string, input: unknown): Promise<string> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return `Error: Tool "${toolName}" is not registered.`;
    }
    return tool.execute(input);
  }

  async shutdown(): Promise<void> {
    await this.browserManager.close();
  }
}
