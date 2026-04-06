import type Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import type { Database } from "../database.js";
import type { AgentConfig } from "../../types.js";

export interface ToolContext {
  conversationId: string;
  res: Response;
  db: Database;
  agents: Map<string, AgentConfig>;
}

export interface Tool {
  name: string;
  definition: Anthropic.Messages.Tool;
  execute(input: unknown, context?: ToolContext): Promise<string>;
}
