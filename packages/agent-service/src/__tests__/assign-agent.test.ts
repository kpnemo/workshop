import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAssignAgentTool } from "../services/tools/assign-agent.js";
import { Database } from "../services/database.js";
import type { AgentConfig } from "../types.js";

function makeAgents(): Map<string, AgentConfig> {
  const map = new Map<string, AgentConfig>();
  map.set("router", { id: "router", name: "Auto", model: "m", maxTokens: 1, temperature: 1, systemPrompt: "", avatar: { emoji: "✨", color: "#000" } });
  map.set("weather-agent", { id: "weather-agent", name: "Weather", model: "m", maxTokens: 1, temperature: 1, systemPrompt: "", avatar: { emoji: "🌤", color: "#000" } });
  return map;
}

function makeContext(db: Database, agents: Map<string, AgentConfig>) {
  const writes: string[] = [];
  const res = { write: (s: string) => writes.push(s) } as any;
  return { ctx: { conversationId: "c1", res, db, agents }, writes };
}

describe("assign_agent tool", () => {
  let db: Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.createUser("u1", "a@b.com", "x");
    db.createConversation("c1", "router", "u1");
  });

  it("assigns a valid agent and emits SSE event", async () => {
    const agents = makeAgents();
    const tool = createAssignAgentTool();
    const { ctx, writes } = makeContext(db, agents);

    const result = await tool.execute({ agent_id: "weather-agent", reason: "user asked about weather" }, ctx);

    expect(result).toBe("[ASSIGNMENT] Assigned to weather-agent");
    expect(db.getConversation("c1")!.agentId).toBe("weather-agent");
    const sse = writes.join("");
    expect(sse).toContain("event: assignment");
    expect(sse).toContain('"to":"weather-agent"');
    expect(sse).toContain('"agentName":"Weather"');
    expect(sse).toContain('"reason":"user asked about weather"');
  });

  it("rejects unknown agent", async () => {
    const agents = makeAgents();
    const tool = createAssignAgentTool();
    const { ctx } = makeContext(db, agents);
    const result = await tool.execute({ agent_id: "nonexistent", reason: "x" }, ctx);
    expect(result).toContain("Error");
    expect(result).toContain("nonexistent");
    expect(db.getConversation("c1")!.agentId).toBe("router");
  });

  it("rejects assignment to router itself", async () => {
    const agents = makeAgents();
    const tool = createAssignAgentTool();
    const { ctx } = makeContext(db, agents);
    const result = await tool.execute({ agent_id: "router", reason: "x" }, ctx);
    expect(result).toContain("Error");
    expect(result).toContain("router");
    expect(db.getConversation("c1")!.agentId).toBe("router");
  });

  it("requires agent_id and reason", async () => {
    const agents = makeAgents();
    const tool = createAssignAgentTool();
    const { ctx } = makeContext(db, agents);
    expect(await tool.execute({ reason: "x" }, ctx)).toContain("Error");
    expect(await tool.execute({ agent_id: "weather-agent" }, ctx)).toContain("Error");
  });
});
