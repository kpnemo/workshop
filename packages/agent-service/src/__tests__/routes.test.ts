import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import jwt from "jsonwebtoken";
import { createConversationRouter } from "../routes/conversations.js";
import { authMiddleware } from "../middleware/auth.js";
import { Database } from "../services/database.js";
import { checkTopicBoundary } from "../services/guardrails.js";
import type { AgentConfig } from "../types.js";
import { ToolService } from "../services/tool-service.js";
import type { Tool } from "../services/tools/types.js";

vi.mock("../services/guardrails.js", () => ({
  checkTopicBoundary: vi.fn().mockResolvedValue({ allowed: true }),
}));

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

const mockStream = {
  async *[Symbol.asyncIterator]() {
    yield { type: "message_stop" };
  },
  finalMessage: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "Hello there" }],
    stop_reason: "end_turn",
  }),
};

let mockMessagesStream = vi.fn().mockReturnValue(mockStream);
let mockMessagesCreate = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: "Greeting Conversation" }],
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      get stream() { return mockMessagesStream; },
      get create() { return mockMessagesCreate; },
    };
  },
}));

const JWT_SECRET = "test-secret";

function makeToken(userId: string, email: string) {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" });
}

let dbPath: string;
let db: Database;

function buildApp(agents: Map<string, AgentConfig>) {
  const app = express();
  app.use(express.json());
  app.use("/conversations", authMiddleware(JWT_SECRET), createConversationRouter(agents, db));
  return app;
}

function createToolUseStream() {
  let callCount = 0;
  return {
    stream: vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "message_stop" };
          },
          finalMessage: vi.fn().mockResolvedValue({
            content: [
              { type: "text", text: "Let me look that up. " },
              { type: "tool_use", id: "tool_1", name: "fake_tool", input: { query: "test" } },
            ],
            stop_reason: "tool_use",
          }),
        };
      }
      return {
        async *[Symbol.asyncIterator]() {
          yield { type: "message_stop" };
        },
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Here is the answer." }],
          stop_reason: "end_turn",
        }),
      };
    }),
    create: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Tool Conversation Title" }],
    }),
  };
}

function buildAppWithTools(agents: Map<string, AgentConfig>, toolService: ToolService) {
  const app = express();
  app.use(express.json());
  app.use("/conversations", authMiddleware(JWT_SECRET), createConversationRouter(agents, db, toolService));
  return app;
}

function makeRequest(
  app: express.Express,
  method: string,
  reqPath: string,
  body?: object,
  token?: string
) {
  return new Promise<{ status: number; headers: Record<string, string>; body: string }>(
    (resolve) => {
      const server = app.listen(0, () => {
        const port = (server.address() as any).port;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const options = { hostname: "127.0.0.1", port, path: reqPath, method, headers };
        const req = http.request(options, (res: any) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => {
            server.close();
            resolve({ status: res.statusCode, headers: res.headers, body: data });
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

const userAToken = makeToken("user-a", "a@example.com");
const userBToken = makeToken("user-b", "b@example.com");

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `test-routes-${Date.now()}.db`);
  db = new Database(dbPath);
  db.createUser("user-a", "a@example.com", "hashed");
  db.createUser("user-b", "b@example.com", "hashed");
});

afterEach(() => {
  db.close();
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(dbPath + "-wal"); } catch {}
  try { fs.unlinkSync(dbPath + "-shm"); } catch {}
});

describe("GET /conversations", () => {
  it("returns 401 without token", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    const res = await makeRequest(app, "GET", "/conversations");
    expect(res.status).toBe(401);
  });

  it("returns only conversations for authenticated user", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot", "user-a");
    db.createConversation("conv-2", "test-bot", "user-b");

    const res = await makeRequest(app, "GET", "/conversations", undefined, userAToken);
    const json = JSON.parse(res.body);
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe("conv-1");
  });

  it("returns empty array when user has no conversations", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    const res = await makeRequest(app, "GET", "/conversations", undefined, userAToken);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });
});

describe("POST /conversations", () => {
  it("creates a conversation for authenticated user", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    const res = await makeRequest(app, "POST", "/conversations", { agentId: "test-bot" }, userAToken);
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.conversationId).toBeDefined();

    const list = await makeRequest(app, "GET", "/conversations", undefined, userAToken);
    expect(JSON.parse(list.body)).toHaveLength(1);

    const listB = await makeRequest(app, "GET", "/conversations", undefined, userBToken);
    expect(JSON.parse(listB.body)).toHaveLength(0);
  });

  it("returns 400 when agentId is missing", async () => {
    const app = buildApp(new Map());
    const res = await makeRequest(app, "POST", "/conversations", {}, userAToken);
    expect(res.status).toBe(400);
  });

  it("returns 404 when agentId is unknown", async () => {
    const app = buildApp(new Map());
    const res = await makeRequest(app, "POST", "/conversations", { agentId: "nonexistent" }, userAToken);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /conversations/:id", () => {
  it("deletes own conversation", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot", "user-a");
    const res = await makeRequest(app, "DELETE", "/conversations/conv-1", undefined, userAToken);
    expect(res.status).toBe(204);
  });

  it("returns 404 when deleting another user's conversation", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot", "user-a");
    const res = await makeRequest(app, "DELETE", "/conversations/conv-1", undefined, userBToken);
    expect(res.status).toBe(404);
  });
});

describe("POST /conversations/:id/messages", () => {
  it("returns 404 for another user's conversation", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot", "user-a");
    const res = await makeRequest(app, "POST", "/conversations/conv-1/messages", { message: "Hello" }, userBToken);
    expect(res.status).toBe(404);
  });

  it("returns SSE stream for own conversation", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot", "user-a");
    const res = await makeRequest(app, "POST", "/conversations/conv-1/messages", { message: "Hello" }, userAToken);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("event: delta");
    expect(res.body).toContain("event: done");
  });

  it("returns SSE blocked event when guardrail blocks message", async () => {
    const app = buildApp(new Map([["guarded-bot", guardedAgent]]));
    db.createConversation("conv-1", "guarded-bot", "user-a");
    vi.mocked(checkTopicBoundary).mockResolvedValueOnce({ allowed: false, message: "I can only help with product topics." });
    const res = await makeRequest(app, "POST", "/conversations/conv-1/messages", { message: "Tell me about politics" }, userAToken);
    expect(res.body).toContain("event: blocked");
    expect(res.body).toContain("I can only help with product topics.");
  });
});

describe("GET /conversations/:id", () => {
  it("returns own conversation history", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot", "user-a");
    db.addMessage("conv-1", "user", "Hello");
    db.addMessage("conv-1", "assistant", "Hi!");
    db.setTitle("conv-1", "Greeting");

    const res = await makeRequest(app, "GET", "/conversations/conv-1", undefined, userAToken);
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.title).toBe("Greeting");
    expect(json.messages).toHaveLength(2);
  });

  it("returns 404 for another user's conversation", async () => {
    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-1", "test-bot", "user-a");
    const res = await makeRequest(app, "GET", "/conversations/conv-1", undefined, userBToken);
    expect(res.status).toBe(404);
  });
});

describe("Tool execution loop", () => {
  it("executes tool and returns final response", async () => {
    const toolService = new ToolService();
    const fakeTool: Tool = {
      name: "fake_tool",
      definition: {
        name: "fake_tool",
        description: "A fake tool",
        input_schema: { type: "object" as const, properties: {} },
      },
      execute: vi.fn().mockResolvedValue("tool execution result"),
    };
    toolService.register(fakeTool);

    const agentWithTools: AgentConfig = {
      ...testAgent,
      id: "tool-bot",
      tools: ["fake_tool"],
    };

    // Override the Anthropic mock for this test
    const toolMock = createToolUseStream();
    mockMessagesStream = toolMock.stream;
    mockMessagesCreate = toolMock.create;

    const app = buildAppWithTools(
      new Map([["tool-bot", agentWithTools]]),
      toolService
    );
    db.createConversation("conv-tool", "tool-bot", "user-a");

    const res = await makeRequest(
      app, "POST", "/conversations/conv-tool/messages",
      { message: "Use the tool" }, userAToken
    );

    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("event: tool_start");
    expect(res.body).toContain("event: tool_done");
    expect(res.body).toContain("Here is the answer");
    expect(res.body).toContain("event: done");
    expect(fakeTool.execute).toHaveBeenCalledWith({ query: "test" });
  });
});
