import { Router } from "express";
import type { Request, Response } from "express";
import { loadAgents, saveAgent, deleteAgent } from "../services/agent-loader.js";
import type { AgentConfig } from "../types.js";
import type { ToolService } from "../services/tool-service.js";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function createAgentsRouter(agents: Map<string, AgentConfig>, agentsDir: string, toolService?: ToolService): Router {
  const router = Router();

  function refreshAgents(): void {
    const updated = loadAgents(agentsDir);
    agents.clear();
    for (const [k, v] of updated) {
      agents.set(k, v);
    }
  }

  router.get("/", (_req: Request, res: Response) => {
    const list = [...agents.values()].map((a) => ({
      id: a.id, name: a.name, model: a.model, avatar: a.avatar, hasGuardrails: !!a.topicBoundaries, delegates: a.delegates ?? [],
    }));
    res.json(list);
  });

  // GET /agents/tools - List available tools (must be before /:id)
  router.get("/tools", (_req: Request, res: Response) => {
    const tools = toolService ? toolService.getAvailableTools() : [];
    res.json(tools);
  });

  router.get("/:id", (req: Request, res: Response) => {
    const agent = agents.get(req.params.id);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    res.json(agent);
  });

  router.post("/", (req: Request, res: Response) => {
    const { name, systemPrompt, model, maxTokens, temperature, avatar, topicBoundaries, delegates, tools } = req.body;
    if (!name || typeof name !== "string" || name.trim() === "") { res.status(400).json({ error: "name is required" }); return; }
    if (!systemPrompt || typeof systemPrompt !== "string" || systemPrompt.trim() === "") { res.status(400).json({ error: "systemPrompt is required" }); return; }
    const temp = temperature ?? 0.7;
    if (typeof temp !== "number" || temp < 0 || temp > 1) { res.status(400).json({ error: "temperature must be between 0 and 1" }); return; }
    const tokens = maxTokens ?? 1024;
    if (typeof tokens !== "number" || tokens < 1 || tokens > 4096) { res.status(400).json({ error: "maxTokens must be between 1 and 4096" }); return; }
    const id = slugify(name);
    if (agents.has(id)) { res.status(409).json({ error: "Agent with this name already exists" }); return; }
    const config: AgentConfig = {
      id, name: name.trim(), model: model || "claude-sonnet-4-20250514",
      maxTokens: tokens, temperature: temp, systemPrompt: systemPrompt.trim(),
      avatar: { emoji: avatar?.emoji || "🤖", color: avatar?.color || "#6c5ce7" },
      topicBoundaries: topicBoundaries || undefined,
      delegates: delegates || undefined,
      tools: tools || undefined,
    };
    saveAgent(agentsDir, id, config);
    refreshAgents();
    res.status(201).json(agents.get(id));
  });

  router.put("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!agents.has(id)) { res.status(404).json({ error: "Agent not found" }); return; }
    const { name, systemPrompt, model, maxTokens, temperature, avatar, topicBoundaries, delegates, tools } = req.body;
    if (!name || typeof name !== "string" || name.trim() === "") { res.status(400).json({ error: "name is required" }); return; }
    if (!systemPrompt || typeof systemPrompt !== "string" || systemPrompt.trim() === "") { res.status(400).json({ error: "systemPrompt is required" }); return; }
    const existing = agents.get(id)!;
    const config: AgentConfig = {
      id, name: name.trim(), model: model || existing.model,
      maxTokens: maxTokens ?? existing.maxTokens, temperature: temperature ?? existing.temperature,
      systemPrompt: systemPrompt.trim(),
      avatar: { emoji: avatar?.emoji || existing.avatar.emoji, color: avatar?.color || existing.avatar.color },
      topicBoundaries: topicBoundaries || undefined,
      delegates: delegates || undefined,
      tools: tools || undefined,
    };
    saveAgent(agentsDir, id, config);
    refreshAgents();
    res.json(agents.get(id));
  });

  router.delete("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!agents.has(id)) { res.status(404).json({ error: "Agent not found" }); return; }
    deleteAgent(agentsDir, id);
    refreshAgents();
    res.status(204).send();
  });

  return router;
}
