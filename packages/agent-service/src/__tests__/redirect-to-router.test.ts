import { describe, it, expect, beforeEach } from "vitest";
import { createRedirectToRouterTool } from "../services/tools/redirect-to-router.js";
import { Database } from "../services/database.js";
import type { AgentConfig } from "../types.js";

function makeAgents(): Map<string, AgentConfig> {
  const map = new Map<string, AgentConfig>();
  map.set("router", { id: "router", name: "Auto", model: "m", maxTokens: 1, temperature: 1, systemPrompt: "", avatar: { emoji: "✨", color: "#000" } });
  map.set("travel-agent", { id: "travel-agent", name: "Travel", model: "m", maxTokens: 1, temperature: 1, systemPrompt: "", avatar: { emoji: "🤖", color: "#000" } });
  return map;
}

function makeContext(db: Database, agents: Map<string, AgentConfig>) {
  const writes: string[] = [];
  const res = { write: (s: string) => writes.push(s) } as any;
  return { ctx: { conversationId: "c1", res, db, agents }, writes };
}

describe("redirect_to_router tool", () => {
  let db: Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.createUser("u1", "a@b.com", "x");
    db.createConversation("c1", "travel-agent", "u1");
  });

  it("flips agentId to router, persists a banner, emits SSE, returns [REDIRECT]", async () => {
    const agents = makeAgents();
    const tool = createRedirectToRouterTool();
    const { ctx, writes } = makeContext(db, agents);

    const result = await tool.execute({ reason: "weather isn't my scope" }, ctx);

    expect(result).toBe('[REDIRECT] Redirected to router with reason: "weather isn\'t my scope"');
    expect(db.getConversation("c1")!.agentId).toBe("router");

    const conv = db.getConversation("c1")!;
    const banner = conv.messages.find((m) => m.delegationMeta?.type === "redirect_to_router");
    expect(banner).toBeDefined();
    expect(banner!.delegationMeta!.from).toBe("travel-agent");
    expect(banner!.delegationMeta!.to).toBe("router");

    const sse = writes.join("");
    expect(sse).toContain("event: redirect_to_router");
    expect(sse).toContain('"from":"travel-agent"');
    expect(sse).toContain('"to":"router"');
    expect(sse).toContain('"agentName":"Auto"');
    expect(sse).toContain('"reason":"weather isn\'t my scope"');
  });

  it("rejects redirect from the router itself", async () => {
    const agents = makeAgents();
    const tool = createRedirectToRouterTool();
    db.setAgentId("c1", "router");
    const { ctx } = makeContext(db, agents);
    const result = await tool.execute({ reason: "x" }, ctx);
    expect(result).toContain("Error");
    expect(result).toContain("Cannot redirect to router from router");
    expect(db.getConversation("c1")!.agentId).toBe("router");
  });

  it("requires reason", async () => {
    const agents = makeAgents();
    const tool = createRedirectToRouterTool();
    const { ctx } = makeContext(db, agents);
    const result = await tool.execute({}, ctx);
    expect(result).toContain("Error");
    expect(result).toContain("reason");
  });

  it("requires context", async () => {
    const tool = createRedirectToRouterTool();
    const result = await tool.execute({ reason: "x" }, undefined);
    expect(result).toContain("Error");
    expect(result).toContain("context");
  });

  it("falls back to agentName 'Auto' when the router agent is missing from the agents map", async () => {
    const agents = new Map<string, AgentConfig>();
    agents.set("travel-agent", { id: "travel-agent", name: "Travel", model: "m", maxTokens: 1, temperature: 1, systemPrompt: "", avatar: { emoji: "🤖", color: "#000" } });
    // Intentionally omit the router entry.

    const tool = createRedirectToRouterTool();
    const { ctx, writes } = makeContext(db, agents);

    const result = await tool.execute({ reason: "test" }, ctx);

    expect(result).toBe('[REDIRECT] Redirected to router with reason: "test"');
    expect(writes.join("")).toContain('"agentName":"Auto"');
  });
});
