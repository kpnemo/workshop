import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock playwright so BrowserManager doesn't launch a real browser
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({}),
        close: vi.fn(),
      }),
      close: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    }),
  },
}));

import { ToolService } from "../services/tool-service.js";
import type { Tool } from "../services/tools/types.js";
import type { AgentConfig } from "../types.js";

function makeFakeTool(name: string): Tool {
  return {
    name,
    definition: {
      name,
      description: `A fake ${name} tool`,
      input_schema: { type: "object" as const, properties: {} },
    },
    execute: vi.fn().mockResolvedValue(`${name} result`),
  };
}

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "test-agent",
    name: "Test Agent",
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "You are a test agent.",
    avatar: { emoji: "\u{1F916}", color: "#6c5ce7" },
    ...overrides,
  };
}

describe("ToolService", () => {
  let service: ToolService;

  beforeEach(() => {
    service = new ToolService();
  });

  it("registers and retrieves tools", () => {
    const tool = makeFakeTool("my_tool");
    service.register(tool);

    const agent = makeAgent({ tools: ["my_tool"] });
    const definitions = service.getToolsForAgent(agent);

    expect(definitions).toHaveLength(1);
    expect(definitions[0].name).toBe("my_tool");
  });

  it("returns empty array for agent with no tools field", () => {
    service.register(makeFakeTool("my_tool"));

    const agent = makeAgent(); // no tools field
    const definitions = service.getToolsForAgent(agent);

    expect(definitions).toEqual([]);
  });

  it("returns empty array for agent with empty tools array", () => {
    service.register(makeFakeTool("my_tool"));

    const agent = makeAgent({ tools: [] });
    const definitions = service.getToolsForAgent(agent);

    expect(definitions).toEqual([]);
  });

  it("skips unregistered tool names in agent config", () => {
    service.register(makeFakeTool("real_tool"));

    const agent = makeAgent({ tools: ["real_tool", "nonexistent_tool"] });
    const definitions = service.getToolsForAgent(agent);

    expect(definitions).toHaveLength(1);
    expect(definitions[0].name).toBe("real_tool");
  });

  it("executes a registered tool", async () => {
    const tool = makeFakeTool("my_tool");
    service.register(tool);

    const result = await service.execute("my_tool", { key: "value" });

    expect(tool.execute).toHaveBeenCalledWith({ key: "value" }, undefined);
    expect(result).toBe("my_tool result");
  });

  it("returns error string for unknown tool name", async () => {
    const result = await service.execute("nonexistent", {});

    expect(result).toContain("Error");
    expect(result).toContain("nonexistent");
  });

  it("passes context to tool execute when provided", async () => {
    const tool = makeFakeTool("ctx_tool");
    service.register(tool);

    const context = {
      conversationId: "conv-1",
      res: {} as any,
      db: {} as any,
      agents: new Map(),
    };

    await service.execute("ctx_tool", { key: "value" }, context);
    expect(tool.execute).toHaveBeenCalledWith({ key: "value" }, context);
  });
});

describe("Delegation tool injection", () => {
  let service: ToolService;

  beforeEach(() => {
    service = new ToolService();
  });

  it("injects delegate_to for agent with delegates field (main agent)", () => {
    const agent = makeAgent({
      tools: ["my_tool"],
      delegates: ["schedule-agent"],
    });
    service.register(makeFakeTool("my_tool"));

    const definitions = service.getToolsForAgent(agent, { isMainAgent: true });
    const names = definitions.map((d) => d.name);
    expect(names).toContain("my_tool");
    expect(names).toContain("delegate_to");
    expect(names).not.toContain("hand_back");
  });

  it("injects hand_back for active delegate (not main agent)", () => {
    const agent = makeAgent({ tools: ["my_tool"] });
    service.register(makeFakeTool("my_tool"));

    const definitions = service.getToolsForAgent(agent, { isActiveDelegate: true });
    const names = definitions.map((d) => d.name);
    expect(names).toContain("my_tool");
    expect(names).toContain("hand_back");
    expect(names).not.toContain("delegate_to");
  });

  it("does not inject delegation tools for regular agent", () => {
    const agent = makeAgent({ tools: ["my_tool"] });
    service.register(makeFakeTool("my_tool"));

    const definitions = service.getToolsForAgent(agent);
    const names = definitions.map((d) => d.name);
    expect(names).toEqual(["my_tool"]);
  });
});
