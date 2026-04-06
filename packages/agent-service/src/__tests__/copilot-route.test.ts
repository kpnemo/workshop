import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadAgents } from "../services/agent-loader.js";
import { createCopilotRouter } from "../routes/copilot.js";
import type { AgentConfig } from "../types.js";
import type { AvailableToolInfo } from "../services/copilot-service.js";

// Mock Anthropic SDK to avoid real API calls
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "Hello!" },
            };
          },
        }),
      },
    })),
  };
});

let tmpDir: string;
let agents: Map<string, AgentConfig>;
const availableTools: AvailableToolInfo[] = [];

function buildApp() {
  agents = loadAgents(tmpDir);
  const app = express();
  app.use(express.json());
  app.use("/copilot", createCopilotRouter(agents, tmpDir, availableTools));
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-route-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe("POST /copilot/chat - validation", () => {
  it("returns 400 when messages is missing", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/copilot/chat", {
      mode: "create",
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeTruthy();
  });

  it("returns 400 when messages is an empty array", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/copilot/chat", {
      messages: [],
      mode: "create",
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeTruthy();
  });

  it("returns 400 when mode is missing", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/copilot/chat", {
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeTruthy();
  });

  it("returns 400 when mode is invalid", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/copilot/chat", {
      messages: [{ role: "user", content: "Hello" }],
      mode: "invalid",
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeTruthy();
  });

  it("returns 400 when mode is edit but agentId is missing", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/copilot/chat", {
      messages: [{ role: "user", content: "Update this agent" }],
      mode: "edit",
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeTruthy();
  });

  it("returns 404 when edit target agent does not exist", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/copilot/chat", {
      messages: [{ role: "user", content: "Update this agent" }],
      mode: "edit",
      agentId: "nonexistent-agent",
    });
    expect(res.status).toBe(404);
    const json = JSON.parse(res.body);
    expect(json.error).toBeTruthy();
  });

  it("returns 404 when edit target agent does not exist even if agents exist", async () => {
    writeSeedAgent("Support Bot", "support-bot");
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/copilot/chat", {
      messages: [{ role: "user", content: "Update this agent" }],
      mode: "edit",
      agentId: "nonexistent-agent",
    });
    expect(res.status).toBe(404);
  });
});
