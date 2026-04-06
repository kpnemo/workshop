import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { CopilotService } from "../services/copilot-service.js";
import type { AvailableToolInfo } from "../services/copilot-service.js";
import { loadAgents, saveAgent } from "../services/agent-loader.js";
import type { AgentConfig } from "../types.js";

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function startSSE(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

function writeSSE(res: Response, event: string, data: object) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createCopilotRouter(
  agents: Map<string, AgentConfig>,
  agentsDir: string,
  availableTools: AvailableToolInfo[]
): Router {
  const router = Router();

  function refreshAgents(): void {
    const updated = loadAgents(agentsDir);
    agents.clear();
    for (const [k, v] of updated) agents.set(k, v);
  }

  router.post("/chat", async (req: Request, res: Response) => {
    const { messages, mode, agentId } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required and must not be empty" });
      return;
    }

    if (mode !== "create" && mode !== "edit") {
      res.status(400).json({ error: "mode must be 'create' or 'edit'" });
      return;
    }

    if (mode === "edit" && !agentId) {
      res.status(400).json({ error: "agentId is required for edit mode" });
      return;
    }

    if (mode === "edit" && !agents.has(agentId)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const copilotService = new CopilotService(agents, availableTools);
    const systemPrompt = copilotService.buildSystemPrompt(mode, agentId);

    const claudeMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    startSSE(res);

    try {
      const stream = getClient().messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: claudeMessages,
      });

      let fullResponse = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullResponse += event.delta.text;
          writeSSE(res, "delta", { text: event.delta.text });
        }
      }

      const extracted = copilotService.extractAgentConfig(fullResponse);
      if (extracted) {
        const id = mode === "edit" && agentId ? agentId : slugify(extracted.name);

        const config: AgentConfig = {
          id,
          name: extracted.name,
          model: extracted.model,
          maxTokens: extracted.maxTokens,
          temperature: extracted.temperature,
          systemPrompt: extracted.systemPrompt,
          avatar: extracted.avatar,
          tools: extracted.tools,
          delegates: extracted.delegates,
          topicBoundaries: extracted.topicBoundaries,
        };

        saveAgent(agentsDir, id, config);
        refreshAgents();

        const eventType = mode === "edit" ? "agent_updated" : "agent_created";
        writeSSE(res, eventType, { agentId: id, agentName: extracted.name });
      }

      writeSSE(res, "done", {});
      res.end();
    } catch (err) {
      console.error("[copilot] Stream error:", err);
      writeSSE(res, "error", { message: "Copilot service error" });
      writeSSE(res, "done", {});
      res.end();
    }
  });

  return router;
}
