import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadAgents } from "../services/agent-loader.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("loadAgents", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("loads a valid agent config from a markdown file", () => {
    const md = `---
name: Test Bot
model: claude-sonnet-4-20250514
maxTokens: 512
temperature: 0.5
---

You are a test bot.`;
    fs.writeFileSync(path.join(tmpDir, "test-bot.md"), md);
    const agents = loadAgents(tmpDir);
    expect(agents.size).toBe(1);
    const agent = agents.get("test-bot");
    expect(agent).toBeDefined();
    expect(agent!.id).toBe("test-bot");
    expect(agent!.name).toBe("Test Bot");
    expect(agent!.model).toBe("claude-sonnet-4-20250514");
    expect(agent!.maxTokens).toBe(512);
    expect(agent!.temperature).toBe(0.5);
    expect(agent!.systemPrompt).toBe("You are a test bot.");
    expect(agent!.topicBoundaries).toBeUndefined();
  });

  it("applies default values for optional fields", () => {
    const md = `---
name: Minimal Bot
model: claude-haiku-4-5-20251001
---

Hello.`;
    fs.writeFileSync(path.join(tmpDir, "minimal.md"), md);
    const agents = loadAgents(tmpDir);
    const agent = agents.get("minimal")!;
    expect(agent.maxTokens).toBe(1024);
    expect(agent.temperature).toBe(1.0);
  });

  it("parses topicBoundaries when present", () => {
    const md = `---
name: Guarded Bot
model: claude-sonnet-4-20250514
topicBoundaries:
  allowed:
    - "coding"
  blocked:
    - "politics"
  boundaryMessage: "Stay on topic."
---

You are guarded.`;
    fs.writeFileSync(path.join(tmpDir, "guarded.md"), md);
    const agents = loadAgents(tmpDir);
    const agent = agents.get("guarded")!;
    expect(agent.topicBoundaries).toEqual({
      allowed: ["coding"],
      blocked: ["politics"],
      boundaryMessage: "Stay on topic.",
    });
  });

  it("skips files missing required 'name' field", () => {
    const md = `---
model: claude-sonnet-4-20250514
---

No name.`;
    fs.writeFileSync(path.join(tmpDir, "bad.md"), md);
    const agents = loadAgents(tmpDir);
    expect(agents.size).toBe(0);
  });

  it("skips files missing required 'model' field", () => {
    const md = `---
name: No Model Bot
---

No model.`;
    fs.writeFileSync(path.join(tmpDir, "bad.md"), md);
    const agents = loadAgents(tmpDir);
    expect(agents.size).toBe(0);
  });

  it("returns empty map when directory is missing", () => {
    const agents = loadAgents("/nonexistent/path/agents");
    expect(agents.size).toBe(0);
  });

  it("returns empty map when directory is empty", () => {
    const agents = loadAgents(tmpDir);
    expect(agents.size).toBe(0);
  });

  it("only reads .md files", () => {
    fs.writeFileSync(path.join(tmpDir, "readme.txt"), "not an agent");
    const md = `---
name: Real Agent
model: claude-sonnet-4-20250514
---

Real.`;
    fs.writeFileSync(path.join(tmpDir, "real.md"), md);
    const agents = loadAgents(tmpDir);
    expect(agents.size).toBe(1);
    expect(agents.has("real")).toBe(true);
  });
});
