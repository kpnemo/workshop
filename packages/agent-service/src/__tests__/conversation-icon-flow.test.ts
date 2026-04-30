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

// Mutable references — individual tests reassign these before each request
let mockMessagesStream = vi.fn();
let mockMessagesCreate = vi.fn();

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

function buildApp(agents: Map<string, AgentConfig>) {
  const app = express();
  app.use(express.json());
  app.use("/conversations", authMiddleware(JWT_SECRET), createConversationRouter(agents, db));
  return app;
}

function makeRequest(
  app: express.Express,
  method: string,
  reqPath: string,
  body?: object,
  token?: string,
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
    },
  );
}

function parseSSE(body: string): Array<{ event: string; data: any }> {
  const out: Array<{ event: string; data: any }> = [];
  const blocks = body.split(/\n\n/).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    let event = "";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (event && data) {
      try { out.push({ event, data: JSON.parse(data) }); }
      catch { out.push({ event, data }); }
    }
  }
  return out;
}

// A simple plain-text stream — used as the chat reply in every icon test
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

// A minimal AgentConfig factory
function makeAgent(id: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id,
    name: id,
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: `You are ${id}.`,
    ...overrides,
  };
}

function makeResp(text: string) {
  return { content: [{ type: "text", text }] };
}

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `test-icon-flow-${Date.now()}.db`);
  db = new Database(dbPath);
  db.createUser("user-a", "a@example.com", "hashed");
});

afterEach(() => {
  db.close();
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(dbPath + "-wal"); } catch {}
  try { fs.unlinkSync(dbPath + "-shm"); } catch {}
});

describe("Icon SSE flow — integration tests", () => {
  it("emits an icon SSE event for non-router agents and persists it in DB", async () => {
    // Stream: plain text reply
    mockMessagesStream = vi.fn().mockReturnValue(makePlainTextStream("Here is your answer."));

    // messages.create call sequence:
    //   1st call → title generation
    //   2nd call → icon generation (first & only attempt)
    mockMessagesCreate = vi.fn()
      .mockResolvedValueOnce(makeResp("Test Title"))
      .mockResolvedValueOnce(makeResp("emoji:🐛"));

    const agents = new Map([["support-bot", makeAgent("support-bot")]]);
    const app = buildApp(agents);
    db.createConversation("conv-icon-happy", "support-bot", "user-a");

    const res = await makeRequest(
      app, "POST", "/conversations/conv-icon-happy/messages",
      { message: "Hello" }, userAToken,
    );

    const events = parseSSE(res.body);

    // SSE must contain an icon event with the expected payload
    const iconEvent = events.find((e) => e.event === "icon");
    expect(iconEvent).toBeDefined();
    expect(iconEvent!.data).toEqual({ icon: "emoji:🐛" });

    // DB must persist the icon
    const conv = db.getConversation("conv-icon-happy")!;
    expect(conv.icon).toBe("emoji:🐛");
  });

  it("skips icon generation when finalConv.agentId is router", async () => {
    // The router agent is special: the route skips both title and icon generation
    // when the final agent after the turn is "router".
    const routerAgent = makeAgent("router", { tools: ["assign_agent"] });
    // We need a minimal stream that ends without assign_agent so the conversation
    // stays on "router" for the agentId check.
    mockMessagesStream = vi.fn().mockReturnValue(makePlainTextStream("Routing you now."));
    mockMessagesCreate = vi.fn();

    const agents = new Map([["router", routerAgent]]);
    const app = buildApp(agents);
    db.createConversation("conv-router-skip", "router", "user-a");

    await makeRequest(
      app, "POST", "/conversations/conv-router-skip/messages",
      { message: "Hi" }, userAToken,
    );

    // messages.create must NEVER be called (no title, no icon)
    expect(mockMessagesCreate).not.toHaveBeenCalled();

    // DB icon must remain null
    const conv = db.getConversation("conv-router-skip")!;
    expect(conv.icon).toBeNull();
  });

  it("does not emit an icon SSE event when both icon generation attempts return invalid output", async () => {
    mockMessagesStream = vi.fn().mockReturnValue(makePlainTextStream("Hello there."));

    // Pre-set title so title generation is skipped (conversation.title is truthy).
    // All messages.create calls will be icon generation attempts.
    db.createConversation("conv-icon-fail", "support-bot", "user-a");
    db.setTitle("conv-icon-fail", "Pre-set Title");

    // Both icon attempts return invalid (non-parseable) output
    mockMessagesCreate = vi.fn()
      .mockResolvedValueOnce(makeResp("not-valid-output"))
      .mockResolvedValueOnce(makeResp("also-invalid!!"));

    const agents = new Map([["support-bot", makeAgent("support-bot")]]);
    const app = buildApp(agents);

    const res = await makeRequest(
      app, "POST", "/conversations/conv-icon-fail/messages",
      { message: "Hello" }, userAToken,
    );

    const events = parseSSE(res.body);

    // No icon event must be emitted
    const iconEvent = events.find((e) => e.event === "icon");
    expect(iconEvent).toBeUndefined();

    // DB icon must remain null
    const conv = db.getConversation("conv-icon-fail")!;
    expect(conv.icon).toBeNull();
  });

  it("retries on first invalid icon output and emits the second result", async () => {
    mockMessagesStream = vi.fn().mockReturnValue(makePlainTextStream("Bugs are fun."));

    // Pre-set title so we can isolate icon calls precisely.
    db.createConversation("conv-icon-retry", "support-bot", "user-a");
    db.setTitle("conv-icon-retry", "Pre-set Title");

    // Icon attempt 1 → garbage; icon attempt 2 → valid
    mockMessagesCreate = vi.fn()
      .mockResolvedValueOnce(makeResp("garbage output"))
      .mockResolvedValueOnce(makeResp("lucide:bug"));

    const agents = new Map([["support-bot", makeAgent("support-bot")]]);
    const app = buildApp(agents);

    const res = await makeRequest(
      app, "POST", "/conversations/conv-icon-retry/messages",
      { message: "Tell me about bugs" }, userAToken,
    );

    const events = parseSSE(res.body);

    // Exactly one icon event
    const iconEvents = events.filter((e) => e.event === "icon");
    expect(iconEvents).toHaveLength(1);
    expect(iconEvents[0].data).toEqual({ icon: "lucide:bug" });

    // messages.create called exactly twice (2 icon attempts, no title call)
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);

    // DB must reflect the successful retry result
    const conv = db.getConversation("conv-icon-retry")!;
    expect(conv.icon).toBe("lucide:bug");
  }, 10_000); // generous timeout — generateIcon has a 500ms delay between attempts

  it("returns icon in GET /conversations list payload", async () => {
    // Directly set an icon via db.setIcon (no HTTP request needed for setup)
    db.createConversation("conv-list-icon", "support-bot", "user-a");
    db.setIcon("conv-list-icon", "emoji:✈️");

    const agents = new Map([["support-bot", makeAgent("support-bot")]]);
    const app = buildApp(agents);

    const res = await makeRequest(app, "GET", "/conversations", undefined, userAToken);

    expect(res.status).toBe(200);
    const list = JSON.parse(res.body);
    const row = list.find((c: any) => c.id === "conv-list-icon");
    expect(row).toBeDefined();
    expect(row.icon).toBe("emoji:✈️");
  });
});
