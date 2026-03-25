import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "node:http";
import express from "express";
import { createConversationRouter } from "../routes/conversations.js";
import { ConversationStore } from "../services/conversation.js";
import { checkTopicBoundary } from "../services/guardrails.js";
import type { AgentConfig } from "../types.js";

// Mock guardrails
vi.mock("../services/guardrails.js", () => ({
  checkTopicBoundary: vi.fn().mockResolvedValue({ allowed: true }),
}));

// Mock Anthropic SDK streaming
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
    };
  },
}));

function buildApp(agents: Map<string, AgentConfig>) {
  const app = express();
  app.use(express.json());
  const store = new ConversationStore();
  app.use("/conversations", createConversationRouter(agents, store));
  return { app, store };
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

describe("POST /conversations", () => {
  it("creates a conversation and returns 201", async () => {
    const agents = new Map([["test-bot", testAgent]]);
    const { app } = buildApp(agents);
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
    const { app } = buildApp(new Map());
    const res = await makeRequest(app, "POST", "/conversations", {});
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe("agentId is required");
  });

  it("returns 404 when agentId is unknown", async () => {
    const { app } = buildApp(new Map());
    const res = await makeRequest(app, "POST", "/conversations", {
      agentId: "nonexistent",
    });
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error).toBe("Agent not found");
  });
});

describe("POST /conversations/:id/messages", () => {
  it("returns 404 for unknown conversation", async () => {
    const { app } = buildApp(new Map());
    const res = await makeRequest(app, "POST", "/conversations/bad-id/messages", {
      message: "Hello",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when message is missing", async () => {
    const agents = new Map([["test-bot", testAgent]]);
    const { app, store } = buildApp(agents);
    const conv = store.create("test-bot");
    const res = await makeRequest(
      app,
      "POST",
      `/conversations/${conv.id}/messages`,
      {}
    );
    expect(res.status).toBe(400);
  });

  it("returns SSE stream for valid message", async () => {
    const agents = new Map([["test-bot", testAgent]]);
    const { app, store } = buildApp(agents);
    const conv = store.create("test-bot");
    const res = await makeRequest(
      app,
      "POST",
      `/conversations/${conv.id}/messages`,
      { message: "Hello" }
    );
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("event: delta");
    expect(res.body).toContain("event: done");
  });

  it("returns SSE blocked event when guardrail blocks message", async () => {
    const agents = new Map([["guarded-bot", guardedAgent]]);
    const { app, store } = buildApp(agents);
    const conv = store.create("guarded-bot");

    // Override mock for this test to return blocked
    vi.mocked(checkTopicBoundary).mockResolvedValueOnce({
      allowed: false,
      message: "I can only help with product topics.",
    });

    const res = await makeRequest(
      app,
      "POST",
      `/conversations/${conv.id}/messages`,
      { message: "Tell me about politics" }
    );
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("event: blocked");
    expect(res.body).toContain("I can only help with product topics.");
    expect(res.body).toContain("event: done");
    expect(res.body).not.toContain("event: delta");
  });
});

describe("GET /conversations/:id", () => {
  it("returns conversation history", async () => {
    const agents = new Map([["test-bot", testAgent]]);
    const { app, store } = buildApp(agents);
    const conv = store.create("test-bot");
    store.addMessage(conv.id, "user", "Hello");
    store.addMessage(conv.id, "assistant", "Hi!");
    const res = await makeRequest(app, "GET", `/conversations/${conv.id}`);
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.messages).toHaveLength(2);
    expect(json.messages[0].role).toBe("user");
    expect(json.messages[0].timestamp).toBeDefined();
  });

  it("returns 404 for unknown conversation", async () => {
    const { app } = buildApp(new Map());
    const res = await makeRequest(app, "GET", "/conversations/nonexistent");
    expect(res.status).toBe(404);
  });
});
