import type Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import type { Database } from "../database.js";
import type { AgentConfig } from "../../types.js";
import type { FileService } from "../file-service.js";

export interface ToolContext {
  conversationId: string;
  res: Response;
  db: Database;
  agents: Map<string, AgentConfig>;
  userId?: string;
  fileService?: FileService;
}

export interface Tool {
  name: string;
  definition: Anthropic.Messages.Tool;
  execute(input: unknown, context?: ToolContext): Promise<string>;
}
