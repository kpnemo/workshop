import { describe, it, expect } from "vitest";
import { CopilotService } from "../services/copilot-service.js";
import type { AgentConfig } from "../types.js";

const makeAgent = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "test-agent",
  name: "Test Agent",
  model: "claude-sonnet-4-20250514",
  maxTokens: 1024,
  temperature: 1.0,
  systemPrompt: "You are a test agent.",
  avatar: { emoji: "🤖", color: "#6c5ce7" },
  ...overrides,
});

describe("CopilotService", () => {
  describe("buildSystemPrompt", () => {
    it("includes base instructions", () => {
      const service = new CopilotService(new Map(), []);
      const prompt = service.buildSystemPrompt("create");
      expect(prompt).toContain("Agent Copilot");
      expect(prompt).toContain("agent-config");
      expect(prompt).toContain("Interview Style");
      expect(prompt.length).toBeGreaterThan(100);
    });

    it("includes existing agent summaries", () => {
      const agents = new Map<string, AgentConfig>([
        ["support-bot", makeAgent({ id: "support-bot", name: "Support Bot", systemPrompt: "Help users.", tools: ["browse_url"], delegates: ["weather-agent"] })],
        ["weather-agent", makeAgent({ id: "weather-agent", name: "Weather Agent", systemPrompt: "Report weather." })],
      ]);
      const service = new CopilotService(agents, []);
      const prompt = service.buildSystemPrompt("create");
      expect(prompt).toContain("Support Bot");
      expect(prompt).toContain("Weather Agent");
      expect(prompt).toContain("support-bot");
      expect(prompt).toContain("weather-agent");
      expect(prompt).toContain("claude-sonnet-4-20250514");
      expect(prompt).toContain("tools: browse_url");
      expect(prompt).toContain("delegates to: weather-agent");
    });

    it("includes available tools", () => {
      const tools = [
        { name: "browse_url", description: "Browse a URL and return content" },
        { name: "run_code", description: "Execute code in a sandbox" },
      ];
      const service = new CopilotService(new Map(), tools);
      const prompt = service.buildSystemPrompt("create");
      expect(prompt).toContain("browse_url");
      expect(prompt).toContain("run_code");
      expect(prompt).toContain("Browse a URL and return content");
    });

    it("includes target agent config in edit mode", () => {
      const agents = new Map<string, AgentConfig>([
        ["support-bot", makeAgent({ id: "support-bot", name: "Support Bot", systemPrompt: "Help users with issues." })],
      ]);
      const service = new CopilotService(agents, []);
      const prompt = service.buildSystemPrompt("edit", "support-bot");
      expect(prompt).toContain("Support Bot");
      expect(prompt).toContain("Help users with issues.");
      // Should indicate edit mode context
      expect(prompt).toContain("support-bot");
    });
  });

  describe("extractAgentConfig", () => {
    it("extracts valid config", () => {
      const text = `Here is your agent:

\`\`\`agent-config
{
  "name": "My Bot",
  "systemPrompt": "You are a helpful bot.",
  "model": "claude-haiku-4-5-20251001",
  "maxTokens": 512,
  "temperature": 0.7
}
\`\`\`

The agent is ready.`;
      const service = new CopilotService(new Map(), []);
      const result = service.extractAgentConfig(text);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("My Bot");
      expect(result!.systemPrompt).toBe("You are a helpful bot.");
      expect(result!.model).toBe("claude-haiku-4-5-20251001");
      expect(result!.maxTokens).toBe(512);
      expect(result!.temperature).toBe(0.7);
    });

    it("returns null for no block", () => {
      const service = new CopilotService(new Map(), []);
      const result = service.extractAgentConfig("Here is some text without a config block.");
      expect(result).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      const text = `\`\`\`agent-config
{ this is not valid json
\`\`\``;
      const service = new CopilotService(new Map(), []);
      const result = service.extractAgentConfig(text);
      expect(result).toBeNull();
    });

    it("returns null for missing required fields", () => {
      const textMissingName = `\`\`\`agent-config
{ "systemPrompt": "You are a bot." }
\`\`\``;
      const textMissingSystemPrompt = `\`\`\`agent-config
{ "name": "My Bot" }
\`\`\``;
      const service = new CopilotService(new Map(), []);
      expect(service.extractAgentConfig(textMissingName)).toBeNull();
      expect(service.extractAgentConfig(textMissingSystemPrompt)).toBeNull();
    });

    it("applies defaults for optional fields", () => {
      const text = `\`\`\`agent-config
{
  "name": "Minimal Bot",
  "systemPrompt": "You are minimal."
}
\`\`\``;
      const service = new CopilotService(new Map(), []);
      const result = service.extractAgentConfig(text);
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-sonnet-4-20250514");
      expect(result!.maxTokens).toBe(1024);
      expect(result!.temperature).toBe(0.7);
      expect(result!.avatar).toEqual({ emoji: "🤖", color: "#6c5ce7" });
    });
  });
});
