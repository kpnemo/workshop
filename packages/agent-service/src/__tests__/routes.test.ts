import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createConversationRouter } from "../routes/conversations.js";
import { Database } from "../services/database.js";
import { checkTopicBoundary } from "../services/guardrails.js";
import type { AgentConfig } from "../types.js";

vi.mock("../services/guardrails.js", () => ({
  checkTopicBoundary: vi.fn().mockResolvedValue({ allowed: true }),
}));

const mockStream = {
  async *[Symbol.asyncIterator]() {
    yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } };
    yield { type: "content_block_delta", delta: { type: "text_delta", text: " there" } };
    yield { type: "message_stop" };
  },
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: vi.fn().mockReturnValue(mockStream),
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Greeting Conversation" }],
      }),
    };
  },
}));

let dbPath: string;
let db: Database;

function buildApp(agents: Map<string, AgentConfig>) {
  const app = express();
  app.use(express.json());
  app.use("/conversations", createConversationRouter(agents, db));
  return app;
}

function makeRequest(app: express.Express, method: string, path: string, body?: object) {
  return new Promise<{ status: number; headers: Record<string, string>; body: string }>(
    (resolve) => {
      const server = app.listen(0, () => {
        const port = (server.address() as any).port;
        const options = {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: { "Content-Type": "application/json" },
        };
        const req = http.request(options, (res: any) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => {
            server.close();
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
            });
          });
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
      });
    }
  );
}

const testAgent: AgentConfig = {
  id: "test-bot",
  name: "Test Bot",
  model: "claude-sonnet-4-20250514",
  maxTokens: 1024,
  temperature: 0.7,
  systemPrompt: "You are a test bot.",
};

const guardedAgent: AgentConfig = {
  id: "guarded-bot",
  name: "Guarded Bot",
  model: "claude-sonnet-4-20250514",
  maxTokens: 1024,
  temperature: 0.7,
  systemPrompt: "You are guarded.",
  topicBoundaries: {
    allowed: ["product questions"],
    blocked: ["politics"],
    boundaryMessage: "I can only help with product topics.",
  },
};

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `test-routes-${Date.now()}.db`);
  db = new Database(dbPath);
});

afterEach(() => {
  db.close();
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(dbPath + "-wal"); } catch {}
  try { fs.unlinkSync(dbPath + "-shm"); } catch {}
});

describe("GET /conversations", () => {
  it("returns empty array when no conversations", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    const res = await makeRequest(app, "GET", "/conversations");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it("returns conversations sorted by updatedAt desc", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot");
    db.addMessage("conv-1", "user", "First");

    await new Promise((r) => setTimeout(r, 10));

    db.createConversation("conv-2", "test-bot");
    db.addMessage("conv-2", "user", "Second");

    const res = await makeRequest(app, "GET", "/conversations");
    const json = JSON.parse(res.body);
    expect(json).toHaveLength(2);
    expect(json[0].id).toBe("conv-2");
    expect(json[0].messageCount).toBe(1);
    expect(json[0].updatedAt).toBeDefined();
  });
});

describe("POST /conversations", () => {
  it("creates a conversation and returns 201", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    const res = await makeRequest(app, "POST", "/conversations", {
      agentId: "test-bot",
    });
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.conversationId).toBeDefined();
    expect(json.agentId).toBe("test-bot");
    expect(json.createdAt).toBeDefined();
  });

  it("returns 400 when agentId is missing", async () => {
    const app = buildApp(new Map());
    const res = await makeRequest(app, "POST", "/conversations", {});
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe("agentId is required");
  });

  it("returns 404 when agentId is unknown", async () => {
    const app = buildApp(new Map());
    const res = await makeRequest(app, "POST", "/conversations", {
      agentId: "nonexistent",
    });
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error).toBe("Agent not found");
  });
});

describe("DELETE /conversations/:id", () => {
  it("deletes an existing conversation and returns 204", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot");
    const res = await makeRequest(app, "DELETE", "/conversations/conv-1");
    expect(res.status).toBe(204);
    expect(db.getConversation("conv-1")).toBeUndefined();
  });

  it("returns 404 for unknown conversation", async () => {
    const app = buildApp(new Map());
    const res = await makeRequest(app, "DELETE", "/conversations/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("POST /conversations/:id/messages", () => {
  it("returns 404 for unknown conversation", async () => {
    const app = buildApp(new Map());
    const res = await makeRequest(app, "POST", "/conversations/bad-id/messages", {
      message: "Hello",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when message is missing", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot");
    const res = await makeRequest(app, "POST", "/conversations/conv-1/messages", {});
    expect(res.status).toBe(400);
  });

  it("returns SSE stream with delta, title, and done events", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot");
    const res = await makeRequest(app, "POST", "/conversations/conv-1/messages", {
      message: "Hello",
    });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("event: delta");
    expect(res.body).toContain("event: title");
    expect(res.body).toContain("event: done");
  });

  it("returns SSE blocked event when guardrail blocks message", async () => {
    const app = buildApp(new Map([["guarded-bot", guardedAgent]]));
    db.createConversation("conv-1", "guarded-bot");

    vi.mocked(checkTopicBoundary).mockResolvedValueOnce({
      allowed: false,
      message: "I can only help with product topics.",
    });

    const res = await makeRequest(app, "POST", "/conversations/conv-1/messages", {
      message: "Tell me about politics",
    });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("event: blocked");
    expect(res.body).toContain("I can only help with product topics.");
    expect(res.body).toContain("event: done");
    expect(res.body).not.toContain("event: delta");
  });
});

describe("GET /conversations/:id", () => {
  it("returns conversation history with title", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot");
    db.addMessage("conv-1", "user", "Hello");
    db.addMessage("conv-1", "assistant", "Hi!");
    db.setTitle("conv-1", "Greeting");

    const res = await makeRequest(app, "GET", "/conversations/conv-1");
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.title).toBe("Greeting");
    expect(json.messages).toHaveLength(2);
    expect(json.messages[0].role).toBe("user");
    expect(json.messages[0].timestamp).toBeDefined();
  });

  it("returns 404 for unknown conversation", async () => {
    const app = buildApp(new Map());
    const res = await makeRequest(app, "GET", "/conversations/nonexistent");
    expect(res.status).toBe(404);
  });
});
