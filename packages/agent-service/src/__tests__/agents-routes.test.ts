import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadAgents } from "../services/agent-loader.js";
import { createAgentsRouter } from "../routes/agents.js";
import type { AgentConfig } from "../types.js";

let tmpDir: string;
let agents: Map<string, AgentConfig>;

function buildApp() {
  agents = loadAgents(tmpDir);
  const app = express();
  app.use(express.json());
  app.use("/agents", createAgentsRouter(agents, tmpDir));
  return app;
}

function makeRequest(
  app: express.Express,
  method: string,
  reqPath: string,
  body?: object
) {
  return new Promise<{ status: number; body: string }>((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const options = { hostname: "127.0.0.1", port, path: reqPath, method, headers };
      const req = http.request(options, (res: any) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode, body: data });
        });
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

function writeSeedAgent(name: string, id: string) {
  const md = `---
name: ${name}
model: claude-sonnet-4-20250514
maxTokens: 1024
temperature: 0.7
avatar:
  emoji: "🤖"
  color: "#6c5ce7"
---

You are ${name}.`;
  fs.writeFileSync(path.join(tmpDir, `${id}.md`), md);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-routes-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe("GET /agents", () => {
  it("returns empty array when no agents exist", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "GET", "/agents");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it("returns agent summaries", async () => {
    writeSeedAgent("Test Bot", "test-bot");
    const app = buildApp();
    const res = await makeRequest(app, "GET", "/agents");
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json).toHaveLength(1);
    expect(json[0]).toEqual({
      id: "test-bot",
      name: "Test Bot",
      model: "claude-sonnet-4-20250514",
      avatar: { emoji: "🤖", color: "#6c5ce7" },
      hasGuardrails: false,
      delegates: [],
    });
  });
});

describe("GET /agents/:id", () => {
  it("returns full agent config", async () => {
    writeSeedAgent("Test Bot", "test-bot");
    const app = buildApp();
    const res = await makeRequest(app, "GET", "/agents/test-bot");
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.id).toBe("test-bot");
    expect(json.systemPrompt).toBe("You are Test Bot.");
  });

  it("returns 404 for unknown agent", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "GET", "/agents/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("POST /agents", () => {
  it("creates a new agent and returns it", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", {
      name: "New Bot",
      systemPrompt: "You are new.",
      model: "claude-sonnet-4-20250514",
      maxTokens: 512,
      temperature: 0.5,
      avatar: { emoji: "🎯", color: "#00b894" },
    });
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.id).toBe("new-bot");
    expect(json.name).toBe("New Bot");
    expect(json.systemPrompt).toBe("You are new.");
    expect(fs.existsSync(path.join(tmpDir, "new-bot.md"))).toBe(true);
    const list = await makeRequest(app, "GET", "/agents");
    expect(JSON.parse(list.body)).toHaveLength(1);
  });

  it("returns 400 when name is missing", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", { systemPrompt: "No name." });
    expect(res.status).toBe(400);
  });

  it("returns 400 when systemPrompt is missing", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", { name: "No Prompt" });
    expect(res.status).toBe(400);
  });

  it("returns 409 when agent with same slug already exists", async () => {
    writeSeedAgent("Test Bot", "test-bot");
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", { name: "Test Bot", systemPrompt: "Duplicate." });
    expect(res.status).toBe(409);
  });

  it("applies defaults for optional fields", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", { name: "Minimal", systemPrompt: "Minimal bot." });
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.model).toBe("claude-sonnet-4-20250514");
    expect(json.maxTokens).toBe(1024);
    expect(json.temperature).toBe(0.7);
    expect(json.avatar).toEqual({ emoji: "🤖", color: "#6c5ce7" });
  });

  it("returns 400 when temperature is out of range", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", { name: "Bad Temp", systemPrompt: "Bad.", temperature: 2.0 });
    expect(res.status).toBe(400);
  });
});

describe("PUT /agents/:id", () => {
  it("updates an existing agent", async () => {
    writeSeedAgent("Old Name", "old-name");
    const app = buildApp();
    const res = await makeRequest(app, "PUT", "/agents/old-name", {
      name: "New Name", systemPrompt: "Updated prompt.", model: "claude-sonnet-4-20250514",
      maxTokens: 2048, temperature: 0.3, avatar: { emoji: "🎨", color: "#fd79a8" },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.name).toBe("New Name");
    expect(json.maxTokens).toBe(2048);
  });

  it("returns 404 for unknown agent", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "PUT", "/agents/nonexistent", { name: "Nope", systemPrompt: "Nope." });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /agents/:id", () => {
  it("deletes an existing agent", async () => {
    writeSeedAgent("Doomed", "doomed");
    const app = buildApp();
    const res = await makeRequest(app, "DELETE", "/agents/doomed");
    expect(res.status).toBe(204);
    expect(fs.existsSync(path.join(tmpDir, "doomed.md"))).toBe(false);
    const list = await makeRequest(app, "GET", "/agents");
    expect(JSON.parse(list.body)).toHaveLength(0);
  });

  it("returns 404 for unknown agent", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "DELETE", "/agents/nonexistent");
    expect(res.status).toBe(404);
  });
});
