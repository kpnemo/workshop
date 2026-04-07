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

// Mutable references — individual tests can reassign these
let mockMessagesStream = vi.fn();
let mockMessagesCreate = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: "Weather Conversation" }],
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

const userAToken = makeToken("user-a", "a@example.com");

let dbPath: string;
let db: Database;

const routerAgent: AgentConfig = {
  id: "router",
  name: "Auto Router",
  model: "claude-haiku-4-5-20251001",
  maxTokens: 512,
  temperature: 0,
  systemPrompt: "You are a router. Assign conversations to specialist agents.",
  avatar: { emoji: "✨", color: "#000" },
  tools: ["assign_agent"],
};

const weatherAgent: AgentConfig = {
  id: "weather-agent",
  name: "Weather Agent",
  model: "claude-sonnet-4-20250514",
  maxTokens: 1024,
  temperature: 0.7,
  systemPrompt: "You are a weather specialist.",
  avatar: { emoji: "🌤", color: "#87ceeb" },
};

const agents = new Map<string, AgentConfig>([
  ["router", routerAgent],
  ["weather-agent", weatherAgent],
]);

function buildApp() {
  const toolService = new ToolService();
  toolService.registerDefaults();
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

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `test-auto-mode-${Date.now()}.db`);
  db = new Database(dbPath);
  db.createUser("user-a", "a@example.com", "hashed");
  // Reset mocks to a clean slate before each test
  mockMessagesCreate = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "Weather Conversation" }],
  });
});

afterEach(() => {
  db.close();
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(dbPath + "-wal"); } catch {}
  try { fs.unlinkSync(dbPath + "-shm"); } catch {}
});

// Helper: build a stream that responds with assign_agent tool_use call
function makeAssignAgentStream() {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "message_stop" };
    },
    finalMessage: vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool_use",
          id: "tool_assign_1",
          name: "assign_agent",
          input: { agent_id: "weather-agent", reason: "user asked about weather" },
        },
      ],
      stop_reason: "tool_use",
    }),
  };
}

// Helper: build a plain-text stream
function makePlainTextStream(text: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "content_block_delta", delta: { type: "text_delta", text } };
      yield { type: "message_stop" };
    },
    finalMessage: vi.fn().mockResolvedValue({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    }),
  };
}

describe("auto-mode: assign_agent as terminal tool", () => {
  it("emits assignment SSE event and persists new agentId, then specialist responds in same turn", async () => {
    // Capture stream call params so we can verify models used
    const streamCallParams: any[] = [];

    // First call: router calls assign_agent
    // Second call: weather-agent responds immediately in the same HTTP request
    mockMessagesStream = vi.fn().mockImplementation((params: any) => {
      streamCallParams.push(params);
      if (streamCallParams.length === 1) {
        return makeAssignAgentStream();
      }
      return makePlainTextStream("The weather in Paris is sunny today!");
    });

    const app = buildApp();
    db.createConversation("conv-auto", "router", "user-a");

    const res = await makeRequest(
      app, "POST", "/conversations/conv-auto/messages",
      { message: "What's the weather in Paris?" }, userAToken
    );

    // Should be SSE
    expect(res.headers["content-type"]).toContain("text/event-stream");

    // Should contain assignment event
    expect(res.body).toContain("event: assignment");
    expect(res.body).toContain('"to":"weather-agent"');
    expect(res.body).toContain('"agentName":"Weather Agent"');
    expect(res.body).toContain('"reason":"user asked about weather"');

    // Assigned agent must have streamed a response in the SAME request (same-turn fix)
    expect(res.body).toContain("event: delta");
    expect(res.body).toContain("The weather in Paris is sunny today!");

    // Should end cleanly
    expect(res.body).toContain("event: done");
    expect(res.body).not.toContain("event: error");

    // DB should reflect new agentId
    const conv = db.getConversation("conv-auto")!;
    expect(conv.agentId).toBe("weather-agent");

    // Anthropic stream must have been called twice:
    // 1st with router's model, 2nd with weather-agent's model
    expect(streamCallParams.length).toBe(2);
    expect(streamCallParams[0].model).toBe(routerAgent.model);
    expect(streamCallParams[1].model).toBe(weatherAgent.model);
  });

  it("does not generate a title while conversation is still on router (assignment just happened)", async () => {
    // After the fix, assignment triggers an immediate second turn for the weather-agent.
    // Title generation fires after the outer loop, using the specialist's fullResponse.
    let callCount = 0;
    mockMessagesStream = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeAssignAgentStream();
      return makePlainTextStream("It looks nice today!");
    });

    // mockMessagesCreate is already set up in beforeEach for title generation
    const app = buildApp();
    db.createConversation("conv-title", "router", "user-a");

    const res = await makeRequest(
      app, "POST", "/conversations/conv-title/messages",
      { message: "What's the weather?" }, userAToken
    );

    // Should not error
    expect(res.body).not.toContain("event: error");
    expect(res.body).toContain("event: done");

    // After assignment, agentId is weather-agent, so title generation runs
    // (mockMessagesCreate will be called). The title event may or may not appear
    // depending on whether fullResponse is empty, but no errors should occur.
    const conv = db.getConversation("conv-title")!;
    expect(conv.agentId).toBe("weather-agent");
  });

  it("bonus: follow-up message after assignment uses weather-agent model", async () => {
    // Set up the assignment turn: router assigns, then weather-agent responds in same turn
    let firstRequestCallCount = 0;
    mockMessagesStream = vi.fn().mockImplementation(() => {
      firstRequestCallCount++;
      if (firstRequestCallCount === 1) return makeAssignAgentStream();
      return makePlainTextStream("Paris weather: sunny!");
    });
    const app = buildApp();
    db.createConversation("conv-followup", "router", "user-a");

    // First message — triggers assignment + immediate specialist turn
    await makeRequest(
      app, "POST", "/conversations/conv-followup/messages",
      { message: "What's the weather in Paris?" }, userAToken
    );

    // Confirm assignment happened
    expect(db.getConversation("conv-followup")!.agentId).toBe("weather-agent");

    // Now stub for the second message — plain text response
    const streamCallArgs: any[] = [];
    mockMessagesStream = vi.fn().mockImplementation((params: any) => {
      streamCallArgs.push(params);
      return makePlainTextStream("It is sunny in Paris today!");
    });

    // Second message — should now be handled by weather-agent
    const res2 = await makeRequest(
      app, "POST", "/conversations/conv-followup/messages",
      { message: "How about tomorrow?" }, userAToken
    );

    expect(res2.body).toContain("It is sunny in Paris today!");
    expect(res2.body).toContain("event: done");

    // Verify the stream was called with weather-agent's model
    expect(streamCallArgs.length).toBeGreaterThan(0);
    expect(streamCallArgs[0].model).toBe(weatherAgent.model);
  });
});
