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
import type { AgentConfig } from "../types.js";
import { ToolService } from "../services/tool-service.js";
import type { Tool } from "../services/tools/types.js";

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
    yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } };
    yield { type: "content_block_delta", delta: { type: "text_delta", text: " there" } };
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
            yield { type: "content_block_delta", delta: { type: "text_delta", text: "Let me look that up. " } };
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
          yield { type: "content_block_delta", delta: { type: "text_delta", text: "Here is the answer." } };
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

  it("injects [Topic Boundaries] block into the system prompt when agent has topicBoundaries", async () => {
    const agentWithBoundaries: AgentConfig = {
      id: "product-bot",
      name: "Product",
      model: "claude-sonnet-4-20250514",
      maxTokens: 100,
      temperature: 0.5,
      systemPrompt: "You are a product assistant.",
      avatar: { emoji: "📦", color: "#000" },
      topicBoundaries: {
        allowed: ["product features", "pricing"],
        blocked: ["politics"],
        boundaryMessage: "I can only help with product topics.",
      },
    };

    const endTurnStream = {
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } };
        yield { type: "message_stop" };
      },
      finalMessage: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
      }),
    };
    const capturedStream = vi.fn().mockReturnValue(endTurnStream);
    mockMessagesStream = capturedStream;
    mockMessagesCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Product Title" }],
    });

    const app = buildApp(new Map([["product-bot", agentWithBoundaries]]));
    db.createConversation("conv-boundary", "product-bot", "user-a");

    await makeRequest(
      app, "POST", "/conversations/conv-boundary/messages",
      { message: "Tell me about pricing" }, userAToken
    );

    expect(capturedStream).toHaveBeenCalledTimes(1);
    const callArgs = capturedStream.mock.calls[0][0];
    expect(callArgs.system).toContain("[Topic Boundaries]");
    expect(callArgs.system).toContain("product features, pricing");
    expect(callArgs.system).toContain("Decline these topics by handing back: politics");
    expect(callArgs.system).toContain("redirect_to_router");
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
    expect(fakeTool.execute).toHaveBeenCalledWith({ query: "test" }, expect.objectContaining({ conversationId: "conv-tool" }));
  });
});

describe("Redirect-to-router flow", () => {
  it("redirects from specialist to router and on to a new specialist in one turn", async () => {
    const travel: AgentConfig = {
      id: "travel-agent", name: "Travel", model: "claude-sonnet-4-20250514", maxTokens: 100, temperature: 0.5,
      systemPrompt: "You are a travel agent.",
      topicBoundaries: { allowed: ["flight booking"], blocked: ["weather"], boundaryMessage: "n/a" },
    };
    const router: AgentConfig = {
      id: "router", name: "Auto", model: "claude-sonnet-4-20250514", maxTokens: 100, temperature: 0.5,
      systemPrompt: "You are the router.",
      tools: ["assign_agent"],
    };
    const weather: AgentConfig = {
      id: "weather-agent", name: "Weather", model: "claude-sonnet-4-20250514", maxTokens: 100, temperature: 0.5,
      systemPrompt: "You are a weather agent.",
    };

    const agentMap = new Map([
      ["travel-agent", travel],
      ["router", router],
      ["weather-agent", weather],
    ]);

    // Build app with ToolService (redirect_to_router + assign_agent need to be registered)
    const toolService = new ToolService();
    toolService.registerDefaults();

    let callIdx = 0;
    const streamMock = vi.fn().mockImplementation(() => {
      const idx = callIdx++;
      if (idx === 0) {
        // travel-agent calls redirect_to_router
        return {
          async *[Symbol.asyncIterator]() { yield { type: "message_stop" }; },
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: "tool_use", id: "tu_1", name: "redirect_to_router", input: { reason: "weather isn't my scope" } }],
            stop_reason: "tool_use",
          }),
        };
      } else if (idx === 1) {
        // router calls assign_agent → weather-agent
        return {
          async *[Symbol.asyncIterator]() { yield { type: "message_stop" }; },
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: "tool_use", id: "tu_2", name: "assign_agent", input: { agent_id: "weather-agent", reason: "you asked about weather" } }],
            stop_reason: "tool_use",
          }),
        };
      } else {
        // weather-agent answers
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "content_block_delta", delta: { type: "text_delta", text: "It will be sunny." } };
            yield { type: "message_stop" };
          },
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "It will be sunny." }],
            stop_reason: "end_turn",
          }),
        };
      }
    });
    mockMessagesStream = streamMock;
    mockMessagesCreate = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Weather Title" }] });

    const app = buildAppWithTools(agentMap, toolService);
    db.createConversation("conv-redirect", "travel-agent", "user-a");

    const res = await makeRequest(
      app, "POST", "/conversations/conv-redirect/messages",
      { message: "What's the weather in Tokyo?" }, userAToken
    );

    const sse = res.body;
    expect(sse).toContain("event: redirect_to_router");
    expect(sse).toContain('"from":"travel-agent"');
    expect(sse).toContain('"to":"router"');
    expect(sse).toContain("event: assignment");
    expect(sse).toContain('"to":"weather-agent"');
    expect(sse.indexOf("event: redirect_to_router")).toBeLessThan(sse.indexOf("event: assignment"));

    expect(db.getConversation("conv-redirect")!.agentId).toBe("weather-agent");

    // Iteration 2 (router's call) should have [Re-engagement] in system prompt
    // and only one message (the user's original message).
    const iter2Args = streamMock.mock.calls[1][0];
    expect(iter2Args.system).toContain("[Re-engagement]");
    expect(iter2Args.messages).toHaveLength(1);
    expect(iter2Args.messages[0].role).toBe("user");
    expect(iter2Args.messages[0].content).toBe("What's the weather in Tokyo?");
  });

  it("caps redirect_to_router at one call per HTTP turn", async () => {
    const a: AgentConfig = {
      id: "agent-a", name: "A", model: "claude-sonnet-4-20250514", maxTokens: 100, temperature: 0.5,
      systemPrompt: "You are A.",
    };
    const router: AgentConfig = {
      id: "router", name: "Auto", model: "claude-sonnet-4-20250514", maxTokens: 100, temperature: 0.5,
      systemPrompt: "You are the router.",
      tools: ["assign_agent"],
    };
    const agentMap = new Map([["agent-a", a], ["router", router]]);

    const toolService = new ToolService();
    toolService.registerDefaults();

    let callIdx = 0;
    const streamMock = vi.fn().mockImplementation(() => {
      const idx = callIdx++;
      if (idx === 0) {
        // agent-a redirects (first redirect — allowed)
        return {
          async *[Symbol.asyncIterator]() { yield { type: "message_stop" }; },
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: "tool_use", id: "tu_1", name: "redirect_to_router", input: { reason: "off-topic" } }],
            stop_reason: "tool_use",
          }),
        };
      } else if (idx === 1) {
        // router assigns back to agent-a
        return {
          async *[Symbol.asyncIterator]() { yield { type: "message_stop" }; },
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: "tool_use", id: "tu_2", name: "assign_agent", input: { agent_id: "agent-a", reason: "let A handle this" } }],
            stop_reason: "tool_use",
          }),
        };
      } else if (idx === 2) {
        // agent-a tries to redirect AGAIN (second redirect — capped)
        return {
          async *[Symbol.asyncIterator]() { yield { type: "message_stop" }; },
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: "tool_use", id: "tu_3", name: "redirect_to_router", input: { reason: "still off-topic" } }],
            stop_reason: "tool_use",
          }),
        };
      } else {
        // agent-a forced to answer with text after cap error
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "content_block_delta", delta: { type: "text_delta", text: "Sorry, I can't help with that." } };
            yield { type: "message_stop" };
          },
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "Sorry, I can't help with that." }],
            stop_reason: "end_turn",
          }),
        };
      }
    });
    mockMessagesStream = streamMock;
    mockMessagesCreate = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Cap Title" }] });

    const app = buildAppWithTools(agentMap, toolService);
    db.createConversation("conv-cap", "agent-a", "user-a");

    await makeRequest(
      app, "POST", "/conversations/conv-cap/messages",
      { message: "anything" }, userAToken
    );

    // Iteration 4: the tool_result returned to agent-a should contain the cap error
    const iter4Args = streamMock.mock.calls[3][0];
    const lastMessage = iter4Args.messages[iter4Args.messages.length - 1];
    const toolResultBlock = lastMessage.content.find((b: any) => b.type === "tool_result" && b.tool_use_id === "tu_3");
    expect(toolResultBlock).toBeDefined();
    expect(toolResultBlock.content).toContain("redirect already used");

    // Conversation ended on agent-a (rollback worked)
    expect(db.getConversation("conv-cap")!.agentId).toBe("agent-a");
  });
});

describe("Debug mode", () => {
  it("emits debug_agent and debug_stream events when ?debug=true", async () => {
    // Reset to default mock
    mockMessagesStream = vi.fn().mockReturnValue(mockStream);
    mockMessagesCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Debug Test Title" }],
    });

    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-debug", "test-bot", "user-a");

    const res = await makeRequest(
      app, "POST", "/conversations/conv-debug/messages?debug=true",
      { message: "Hello debug" }, userAToken
    );

    expect(res.body).toContain("event: debug_agent");
    expect(res.body).toContain('"agentId":"test-bot"');
    expect(res.body).toContain('"model":"claude-sonnet-4-20250514"');
    expect(res.body).toContain("event: debug_stream");
    expect(res.body).toContain('"stopReason":"end_turn"');
    // Normal events should still be present
    expect(res.body).toContain("event: delta");
    expect(res.body).toContain("event: done");
  });

  it("does NOT emit debug events when ?debug is absent", async () => {
    mockMessagesStream = vi.fn().mockReturnValue(mockStream);
    mockMessagesCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Normal Title" }],
    });

    const app = buildApp(new Map([["test-bot", testAgent]]));
    db.createConversation("conv-normal", "test-bot", "user-a");

    const res = await makeRequest(
      app, "POST", "/conversations/conv-normal/messages",
      { message: "Hello normal" }, userAToken
    );

    expect(res.body).not.toContain("event: debug_agent");
    expect(res.body).not.toContain("event: debug_stream");
    expect(res.body).toContain("event: delta");
    expect(res.body).toContain("event: done");
  });

  it("emits debug_tool events for tool execution in debug mode", async () => {
    const toolService = new ToolService();
    const fakeTool: Tool = {
      name: "fake_tool",
      definition: {
        name: "fake_tool",
        description: "A fake tool",
        input_schema: { type: "object" as const, properties: {} },
      },
      execute: vi.fn().mockResolvedValue("tool result data"),
    };
    toolService.register(fakeTool);

    const agentWithTools: AgentConfig = {
      ...testAgent,
      id: "debug-tool-bot",
      tools: ["fake_tool"],
    };

    const toolMock = createToolUseStream();
    mockMessagesStream = toolMock.stream;
    mockMessagesCreate = toolMock.create;

    const app = buildAppWithTools(
      new Map([["debug-tool-bot", agentWithTools]]),
      toolService
    );
    db.createConversation("conv-debug-tool", "debug-tool-bot", "user-a");

    const res = await makeRequest(
      app, "POST", "/conversations/conv-debug-tool/messages?debug=true",
      { message: "Use the tool" }, userAToken
    );

    expect(res.body).toContain("event: debug_tool");
    expect(res.body).toContain('"tool":"fake_tool"');
    expect(res.body).toContain("event: debug_agent");
    expect(res.body).toContain("event: debug_stream");
  });
});
