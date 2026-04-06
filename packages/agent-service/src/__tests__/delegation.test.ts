import { describe, it, expect, vi } from "vitest";
import { createDelegateToTool } from "../services/tools/delegate-to.js";
import { createHandBackTool } from "../services/tools/hand-back.js";
import type { ToolContext } from "../services/tools/types.js";
import type { AgentConfig } from "../types.js";

function makeAgent(id: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id,
    name: id.replace(/-/g, " "),
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "Test agent.",
    avatar: { emoji: "🤖", color: "#6c5ce7" },
    ...overrides,
  };
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv-1",
    res: { write: vi.fn() } as any,
    db: {
      setActiveAgent: vi.fn(),
      addDelegationMessage: vi.fn(),
    } as any,
    agents: new Map<string, AgentConfig>([
      ["main-agent", makeAgent("main-agent", { delegates: ["schedule-agent"] })],
      ["schedule-agent", makeAgent("schedule-agent")],
    ]),
    ...overrides,
  };
}

describe("delegate_to tool", () => {
  it("has correct tool definition", () => {
    const tool = createDelegateToTool(["schedule-agent"]);
    expect(tool.name).toBe("delegate_to");
    expect(tool.definition.name).toBe("delegate_to");
  });

  it("delegates to valid agent and returns delegation marker", async () => {
    const ctx = makeContext();
    const tool = createDelegateToTool(["schedule-agent"]);
    const result = await tool.execute(
      { agent_id: "schedule-agent", context: "Schedule a meeting" },
      ctx
    );
    expect(result).toContain("[DELEGATION]");
    expect(ctx.db.setActiveAgent).toHaveBeenCalledWith("conv-1", "schedule-agent");
    expect(ctx.db.addDelegationMessage).toHaveBeenCalledWith("conv-1", {
      type: "delegation_start",
      from: "main-agent",
      to: "schedule-agent",
      context: "Schedule a meeting",
    });
  });

  it("returns error for invalid delegate target", async () => {
    const ctx = makeContext();
    const tool = createDelegateToTool(["schedule-agent"]);
    const result = await tool.execute(
      { agent_id: "unknown-agent", context: "Do something" },
      ctx
    );
    expect(result).toContain("Error");
    expect(result).toContain("schedule-agent");
    expect(ctx.db.setActiveAgent).not.toHaveBeenCalled();
  });

  it("returns error for agent not in agents map", async () => {
    const ctx = makeContext();
    ctx.agents.delete("schedule-agent");
    const tool = createDelegateToTool(["schedule-agent"]);
    const result = await tool.execute(
      { agent_id: "schedule-agent", context: "Schedule" },
      ctx
    );
    expect(result).toContain("Error");
  });

  it("sends delegation_start SSE event", async () => {
    const ctx = makeContext();
    const tool = createDelegateToTool(["schedule-agent"]);
    await tool.execute(
      { agent_id: "schedule-agent", context: "Schedule a meeting" },
      ctx
    );
    const writeCall = (ctx.res.write as any).mock.calls[0][0] as string;
    expect(writeCall).toContain("event: delegation_start");
    expect(writeCall).toContain("schedule-agent");
  });
});

describe("hand_back tool", () => {
  it("has correct tool definition", () => {
    const tool = createHandBackTool();
    expect(tool.name).toBe("hand_back");
    expect(tool.definition.name).toBe("hand_back");
  });

  it("resets active_agent and returns delegation marker", async () => {
    const ctx = makeContext();
    const tool = createHandBackTool();
    const result = await tool.execute(
      { summary: "Meeting booked at 2pm" },
      ctx
    );
    expect(result).toContain("[DELEGATION]");
    expect(ctx.db.setActiveAgent).toHaveBeenCalledWith("conv-1", null);
    expect(ctx.db.addDelegationMessage).toHaveBeenCalledWith("conv-1", {
      type: "delegation_end",
      from: "schedule-agent",
      to: "main-agent",
      summary: "Meeting booked at 2pm",
    });
  });

  it("sends delegation_end SSE event", async () => {
    const ctx = makeContext();
    const tool = createHandBackTool();
    await tool.execute({ summary: "Done" }, ctx);
    const writeCall = (ctx.res.write as any).mock.calls[0][0] as string;
    expect(writeCall).toContain("event: delegation_end");
  });
});
