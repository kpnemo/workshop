# Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent conversation history with a sidebar UI so users can browse, switch between, and delete conversations.

**Architecture:** Replace the in-memory `ConversationStore` with a `Database` class wrapping `better-sqlite3` for SQLite persistence. Add list and delete endpoints. Build a collapsible sidebar in the React frontend. Generate conversation titles via Claude Haiku after the first exchange.

**Tech Stack:** better-sqlite3 (SQLite), Express, React, Tailwind CSS, Vitest

---

## File Map

### Backend (packages/agent-service)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/services/database.ts` | SQLite wrapper — init, CRUD for conversations and messages |
| Create | `src/__tests__/database.test.ts` | Tests for database service |
| Modify | `src/types.ts` | Add `title`, `updatedAt` to Conversation; add `ConversationSummary` type |
| Modify | `src/routes/conversations.ts` | Replace `ConversationStore` with `Database`, add GET list + DELETE + title SSE |
| Modify | `src/__tests__/routes.test.ts` | Update tests for new endpoints and Database usage |
| Modify | `src/index.ts` | Swap `ConversationStore` for `Database`, pass DB path |
| Delete | `src/services/conversation.ts` | Replaced by database.ts |
| Delete | `src/__tests__/conversation.test.ts` | Replaced by database.test.ts |

### Frontend (packages/web-client)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/types.ts` | Add `ConversationSummary`, `onTitle` callback, `conversations` to ChatState |
| Modify | `src/lib/api.ts` | Add `listConversations()`, `deleteConversation()`, handle `title` SSE event |
| Modify | `src/hooks/use-chat.ts` | Add conversation list, select, delete, title update logic |
| Create | `src/components/sidebar.tsx` | Sidebar with conversation list, new chat button, collapse toggle |
| Create | `src/components/conversation-item.tsx` | Single conversation row with hover trash icon |
| Create | `src/components/confirm-dialog.tsx` | Reusable confirm modal |
| Modify | `src/App.tsx` | Flex row layout with Sidebar + ChatContainer |
| Modify | `src/components/chat-container.tsx` | Accept props from parent instead of owning useChat |

---

### Task 1: Install better-sqlite3

**Files:**
- Modify: `packages/agent-service/package.json`

- [ ] **Step 1: Install the dependency**

Run:
```bash
cd packages/agent-service && pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3
```

- [ ] **Step 2: Verify it installed**

Run: `cd packages/agent-service && node -e "require('better-sqlite3')"`
Expected: No error output

- [ ] **Step 3: Commit**

```bash
git add packages/agent-service/package.json pnpm-lock.yaml
git commit -m "chore: add better-sqlite3 dependency"
```

---

### Task 2: Update backend types

**Files:**
- Modify: `packages/agent-service/src/types.ts`

- [ ] **Step 1: Update the types file**

Replace the entire contents of `packages/agent-service/src/types.ts` with:

```typescript
export interface TopicBoundaries {
  allowed: string[];
  blocked: string[];
  boundaryMessage: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  topicBoundaries?: TopicBoundaries;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  agentId: string;
  title: string | null;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  updatedAt: Date;
  messageCount: number;
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd packages/agent-service && npx tsc --noEmit`
Expected: Errors in files that reference the old Conversation shape (this is expected — we fix them in later tasks)

- [ ] **Step 3: Commit**

```bash
git add packages/agent-service/src/types.ts
git commit -m "feat: add title, updatedAt, ConversationSummary to backend types"
```

---

### Task 3: Create Database service with tests (TDD)

**Files:**
- Create: `packages/agent-service/src/services/database.ts`
- Create: `packages/agent-service/src/__tests__/database.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/agent-service/src/__tests__/database.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../services/database.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Database", () => {
  let db: Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
  });

  describe("createConversation", () => {
    it("creates a conversation and returns it", () => {
      const conv = db.createConversation("conv-1", "support-bot");
      expect(conv.id).toBe("conv-1");
      expect(conv.agentId).toBe("support-bot");
      expect(conv.title).toBeNull();
      expect(conv.messages).toEqual([]);
      expect(conv.createdAt).toBeInstanceOf(Date);
      expect(conv.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("getConversation", () => {
    it("returns conversation with messages", () => {
      db.createConversation("conv-1", "support-bot");
      db.addMessage("conv-1", "user", "Hello");
      db.addMessage("conv-1", "assistant", "Hi there!");

      const conv = db.getConversation("conv-1");
      expect(conv).toBeDefined();
      expect(conv!.messages).toHaveLength(2);
      expect(conv!.messages[0].role).toBe("user");
      expect(conv!.messages[0].content).toBe("Hello");
      expect(conv!.messages[0].timestamp).toBeInstanceOf(Date);
      expect(conv!.messages[1].role).toBe("assistant");
      expect(conv!.messages[1].content).toBe("Hi there!");
    });

    it("returns undefined for unknown id", () => {
      expect(db.getConversation("nonexistent")).toBeUndefined();
    });
  });

  describe("listConversations", () => {
    it("returns conversations sorted by updatedAt desc", () => {
      db.createConversation("conv-1", "support-bot");
      db.addMessage("conv-1", "user", "First");

      db.createConversation("conv-2", "support-bot");
      db.addMessage("conv-2", "user", "Second");

      const list = db.listConversations();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe("conv-2");
      expect(list[1].id).toBe("conv-1");
      expect(list[0].messageCount).toBe(1);
    });

    it("returns empty array when no conversations", () => {
      expect(db.listConversations()).toEqual([]);
    });
  });

  describe("addMessage", () => {
    it("inserts a message and updates conversation updatedAt", () => {
      const conv = db.createConversation("conv-1", "support-bot");
      const beforeUpdate = conv.updatedAt;

      db.addMessage("conv-1", "user", "Hello");

      const updated = db.getConversation("conv-1")!;
      expect(updated.messages).toHaveLength(1);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it("throws when conversation does not exist", () => {
      expect(() => db.addMessage("bad-id", "user", "Hello")).toThrow(
        "Conversation not found"
      );
    });
  });

  describe("deleteConversation", () => {
    it("deletes conversation and its messages", () => {
      db.createConversation("conv-1", "support-bot");
      db.addMessage("conv-1", "user", "Hello");

      db.deleteConversation("conv-1");

      expect(db.getConversation("conv-1")).toBeUndefined();
      expect(db.listConversations()).toEqual([]);
    });

    it("returns false for unknown id", () => {
      expect(db.deleteConversation("nonexistent")).toBe(false);
    });
  });

  describe("setTitle", () => {
    it("updates the conversation title", () => {
      db.createConversation("conv-1", "support-bot");
      db.setTitle("conv-1", "Billing Help");

      const conv = db.getConversation("conv-1")!;
      expect(conv.title).toBe("Billing Help");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent-service && npx vitest run src/__tests__/database.test.ts`
Expected: FAIL — cannot find module `../services/database.js`

- [ ] **Step 3: Implement the Database class**

Create `packages/agent-service/src/services/database.ts`:

```typescript
import BetterSqlite3 from "better-sqlite3";
import type { Conversation, ConversationSummary, Message } from "../types.js";

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    `);
  }

  createConversation(id: string, agentId: string): Conversation {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO conversations (id, agent_id, title, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)"
      )
      .run(id, agentId, now, now);

    return {
      id,
      agentId,
      title: null,
      messages: [],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db
      .prepare("SELECT id, agent_id, title, created_at, updated_at FROM conversations WHERE id = ?")
      .get(id) as { id: string; agent_id: string; title: string | null; created_at: string; updated_at: string } | undefined;

    if (!row) return undefined;

    const messages = this.db
      .prepare("SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC")
      .all(id) as Array<{ role: string; content: string; created_at: string }>;

    return {
      id: row.id,
      agentId: row.agent_id,
      title: row.title,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.created_at),
      })),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  listConversations(): ConversationSummary[] {
    const rows = this.db
      .prepare(`
        SELECT c.id, c.agent_id, c.title, c.updated_at,
               COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
      `)
      .all() as Array<{
        id: string;
        agent_id: string;
        title: string | null;
        updated_at: string;
        message_count: number;
      }>;

    return rows.map((r) => ({
      id: r.id,
      agentId: r.agent_id,
      title: r.title,
      updatedAt: new Date(r.updated_at),
      messageCount: r.message_count,
    }));
  }

  addMessage(conversationId: string, role: "user" | "assistant", content: string): void {
    const conv = this.db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get(conversationId);

    if (!conv) {
      throw new Error("Conversation not found");
    }

    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)")
      .run(conversationId, role, content, now);

    this.db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(now, conversationId);
  }

  deleteConversation(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM conversations WHERE id = ?")
      .run(id);

    return result.changes > 0;
  }

  setTitle(id: string, title: string): void {
    this.db
      .prepare("UPDATE conversations SET title = ? WHERE id = ?")
      .run(title, id);
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/agent-service && npx vitest run src/__tests__/database.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/database.ts packages/agent-service/src/__tests__/database.test.ts
git commit -m "feat: add Database service with SQLite persistence"
```

---

### Task 4: Wire up Database in index.ts and update routes

**Files:**
- Modify: `packages/agent-service/src/index.ts`
- Modify: `packages/agent-service/src/routes/conversations.ts`

- [ ] **Step 1: Update index.ts to use Database**

Replace the entire contents of `packages/agent-service/src/index.ts` with:

```typescript
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAgents } from "./services/agent-loader.js";
import { Database } from "./services/database.js";
import { createConversationRouter } from "./routes/conversations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const AGENTS_DIR =
  process.env.AGENTS_DIR || path.resolve(__dirname, "../../../agents");
const DB_PATH =
  process.env.DB_PATH || path.resolve(__dirname, "../../../packages/data/conversations.db");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Load agents
const agents = loadAgents(AGENTS_DIR);
console.log(`[startup] Loaded ${agents.size} agent(s): ${[...agents.keys()].join(", ")}`);

// Database
const db = new Database(DB_PATH);
console.log(`[startup] Database opened at ${DB_PATH}`);

// Routes
app.use("/conversations", createConversationRouter(agents, db));

// Start server
app.listen(PORT, () => {
  console.log(`[startup] Agent service listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Update routes to use Database and add new endpoints**

Replace the entire contents of `packages/agent-service/src/routes/conversations.ts` with:

```typescript
import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { Database } from "../services/database.js";
import { checkTopicBoundary } from "../services/guardrails.js";
import type { AgentConfig } from "../types.js";

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic();
  }
  return anthropic;
}

export function createConversationRouter(
  agents: Map<string, AgentConfig>,
  db: Database
): Router {
  const router = Router();

  function startSSE(res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  function writeSSE(res: Response, event: string, data: object) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // GET /conversations - List all conversations
  router.get("/", (_req: Request, res: Response) => {
    const conversations = db.listConversations();
    res.json(
      conversations.map((c) => ({
        id: c.id,
        agentId: c.agentId,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
        messageCount: c.messageCount,
      }))
    );
  });

  // POST /conversations - Create a new conversation
  router.post("/", (req: Request, res: Response) => {
    const { agentId } = req.body;

    if (!agentId || (typeof agentId === "string" && agentId.trim() === "")) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }

    if (!agents.has(agentId)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const id = uuidv4();
    const conversation = db.createConversation(id, agentId);
    res.status(201).json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      createdAt: conversation.createdAt.toISOString(),
    });
  });

  // DELETE /conversations/:id - Delete a conversation
  router.delete("/:id", (req: Request, res: Response) => {
    const deleted = db.deleteConversation(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.status(204).send();
  });

  // POST /conversations/:id/messages - Send a message (SSE response)
  router.post("/:id/messages", async (req: Request, res: Response) => {
    const conversation = db.getConversation(req.params.id as string);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const { message } = req.body;
    if (!message || (typeof message === "string" && message.trim() === "")) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const agent = agents.get(conversation.agentId)!;

    // Guardrail check (before SSE headers)
    if (agent.topicBoundaries) {
      const guardrailResult = await checkTopicBoundary(
        message,
        agent.topicBoundaries
      );

      if (!guardrailResult.allowed) {
        db.addMessage(conversation.id, "user", message);
        startSSE(res);
        writeSSE(res, "blocked", { message: guardrailResult.message });
        writeSSE(res, "done", { conversationId: conversation.id });
        res.end();
        return;
      }
    }

    // Add user message to history
    db.addMessage(conversation.id, "user", message);

    // Reload conversation to get all messages including the one just added
    const updatedConversation = db.getConversation(conversation.id)!;

    // Build messages array for Claude
    const claudeMessages = updatedConversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let stream;
    try {
      stream = getClient().messages.stream({
        model: agent.model,
        max_tokens: agent.maxTokens,
        temperature: agent.temperature,
        system: agent.systemPrompt,
        messages: claudeMessages,
      });
    } catch (err) {
      console.error("[routes] Failed to create stream:", err);
      res.status(502).json({ error: "LLM service error" });
      return;
    }

    startSSE(res);

    try {
      let fullResponse = "";

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          fullResponse += event.delta.text;
          writeSSE(res, "delta", { text: event.delta.text });
        }
      }

      // Save assistant response
      db.addMessage(conversation.id, "assistant", fullResponse);

      // Generate title if this is the first exchange (no title yet)
      if (!conversation.title) {
        try {
          const titleResponse = await getClient().messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 20,
            messages: [
              {
                role: "user",
                content: `Generate a 3-6 word title for this conversation. Reply with ONLY the title, no quotes or punctuation.\n\nUser: ${message}\nAssistant: ${fullResponse.slice(0, 200)}`,
              },
            ],
          });

          const title =
            titleResponse.content[0].type === "text"
              ? titleResponse.content[0].text.trim()
              : null;

          if (title) {
            db.setTitle(conversation.id, title);
            writeSSE(res, "title", { title });
          }
        } catch (err) {
          console.error("[routes] Title generation failed:", err);
        }
      }

      writeSSE(res, "done", { conversationId: conversation.id });
      res.end();
    } catch (err) {
      console.error("[routes] Stream error:", err);
      writeSSE(res, "error", { message: "LLM service error" });
      writeSSE(res, "done", { conversationId: conversation.id });
      res.end();
    }
  });

  // GET /conversations/:id - Get conversation history
  router.get("/:id", (req: Request, res: Response) => {
    const conversation = db.getConversation(req.params.id as string);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      messages: conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      })),
    });
  });

  return router;
}
```

- [ ] **Step 3: Verify the agent-service compiles**

Run: `cd packages/agent-service && npx tsc --noEmit`
Expected: No errors (there may be warnings about unused conversation.ts — we delete it next)

- [ ] **Step 4: Commit**

```bash
git add packages/agent-service/src/index.ts packages/agent-service/src/routes/conversations.ts
git commit -m "feat: wire Database into routes, add list/delete endpoints and title generation"
```

---

### Task 5: Update route tests

**Files:**
- Modify: `packages/agent-service/src/__tests__/routes.test.ts`

- [ ] **Step 1: Rewrite routes.test.ts for Database**

Replace the entire contents of `packages/agent-service/src/__tests__/routes.test.ts` with:

```typescript
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

// Mock guardrails
vi.mock("../services/guardrails.js", () => ({
  checkTopicBoundary: vi.fn().mockResolvedValue({ allowed: true }),
}));

// Mock Anthropic SDK streaming + title generation
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
```

- [ ] **Step 2: Run all backend tests**

Run: `cd packages/agent-service && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Delete old ConversationStore files**

```bash
rm packages/agent-service/src/services/conversation.ts
rm packages/agent-service/src/__tests__/conversation.test.ts
```

- [ ] **Step 4: Run tests again to confirm nothing depends on deleted files**

Run: `cd packages/agent-service && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A packages/agent-service/src/
git commit -m "feat: update route tests for Database, remove old ConversationStore"
```

---

### Task 6: Update frontend types and API client

**Files:**
- Modify: `packages/web-client/src/types.ts`
- Modify: `packages/web-client/src/lib/api.ts`

- [ ] **Step 1: Update frontend types**

Replace the entire contents of `packages/web-client/src/types.ts` with:

```typescript
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

export interface ChatState {
  conversationId: string | null;
  messages: Message[];
  conversations: ConversationSummary[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
}

export interface ConversationResponse {
  conversationId: string;
  agentId: string;
  createdAt: string;
}

export interface ConversationDetail {
  conversationId: string;
  agentId: string;
  title: string | null;
  createdAt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
}

export interface SendMessageCallbacks {
  onDelta: (text: string) => void;
  onBlocked: (message: string) => void;
  onError: (message: string) => void;
  onTitle: (title: string) => void;
  onDone: () => void;
}
```

- [ ] **Step 2: Update the API client**

Replace the entire contents of `packages/web-client/src/lib/api.ts` with:

```typescript
import type {
  ConversationResponse,
  ConversationDetail,
  ConversationSummary,
  SendMessageCallbacks,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${BASE_URL}/api/conversations`);

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to list conversations");
  }

  return res.json();
}

export async function createConversation(
  agentId: string
): Promise<ConversationResponse> {
  const res = await fetch(`${BASE_URL}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId }),
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to create conversation");
  }

  return res.json();
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to delete conversation");
  }
}

export async function sendMessage(
  conversationId: string,
  message: string,
  callbacks: SendMessageCallbacks
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }
  );

  if (!res.ok) {
    const body = await res.json();
    callbacks.onError(body.error || "Request failed");
    callbacks.onDone();
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        switch (currentEvent) {
          case "delta":
            callbacks.onDelta(data.text);
            break;
          case "blocked":
            callbacks.onBlocked(data.message);
            break;
          case "error":
            callbacks.onError(data.message);
            break;
          case "title":
            callbacks.onTitle(data.title);
            break;
          case "done":
            callbacks.onDone();
            break;
        }
        currentEvent = "";
      }
    }
  }
}

export async function getConversation(
  conversationId: string
): Promise<ConversationDetail> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}`);

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to get conversation");
  }

  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/types.ts packages/web-client/src/lib/api.ts
git commit -m "feat: add ConversationSummary type, list/delete API, title SSE handler"
```

---

### Task 7: Update useChat hook

**Files:**
- Modify: `packages/web-client/src/hooks/use-chat.ts`

- [ ] **Step 1: Rewrite the useChat hook**

Replace the entire contents of `packages/web-client/src/hooks/use-chat.ts` with:

```typescript
import { useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  listConversations,
  createConversation,
  deleteConversation as apiDeleteConversation,
  getConversation,
  sendMessage as apiSendMessage,
} from "../lib/api";
import type { Message, ChatState } from "../types";

export function useChat() {
  const [state, setState] = useState<ChatState>({
    conversationId: null,
    messages: [],
    conversations: [],
    isStreaming: false,
    isConnecting: true,
    error: null,
  });

  const loadConversations = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const conversations = await listConversations();
      if (conversations.length > 0) {
        const mostRecent = conversations[0];
        const detail = await getConversation(mostRecent.id);
        const messages: Message[] = detail.messages.map((m) => ({
          id: uuidv4(),
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp),
        }));
        setState((s) => ({
          ...s,
          conversations,
          conversationId: mostRecent.id,
          messages,
          isConnecting: false,
        }));
      } else {
        const res = await createConversation("support-bot");
        const updatedList = await listConversations();
        setState((s) => ({
          ...s,
          conversations: updatedList,
          conversationId: res.conversationId,
          messages: [],
          isConnecting: false,
        }));
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Failed to connect",
      }));
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const selectConversation = useCallback(async (id: string) => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const detail = await getConversation(id);
      const messages: Message[] = detail.messages.map((m) => ({
        id: uuidv4(),
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
      }));
      setState((s) => ({
        ...s,
        conversationId: id,
        messages,
        isConnecting: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Failed to load conversation",
      }));
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      await apiDeleteConversation(id);
      setState((s) => {
        const remaining = s.conversations.filter((c) => c.id !== id);
        if (s.conversationId === id) {
          return { ...s, conversations: remaining, conversationId: null, messages: [] };
        }
        return { ...s, conversations: remaining };
      });
    },
    []
  );

  // When active conversation becomes null, select next or create new
  useEffect(() => {
    if (state.isConnecting || state.conversationId !== null) return;

    if (state.conversations.length > 0) {
      selectConversation(state.conversations[0].id);
    } else {
      (async () => {
        try {
          const res = await createConversation("support-bot");
          const updatedList = await listConversations();
          setState((s) => ({
            ...s,
            conversations: updatedList,
            conversationId: res.conversationId,
            messages: [],
          }));
        } catch (err) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to create conversation",
          }));
        }
      })();
    }
  }, [state.conversationId, state.conversations, state.isConnecting, selectConversation]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!state.conversationId || state.isStreaming) return;

      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      const assistantMessageId = uuidv4();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setState((s) => ({
        ...s,
        messages: [...s.messages, userMessage, assistantMessage],
        isStreaming: true,
        error: null,
      }));

      apiSendMessage(state.conversationId, text, {
        onDelta: (deltaText) => {
          setState((s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: m.content + deltaText }
                : m
            ),
          }));
        },
        onBlocked: (message) => {
          const systemMessage: Message = {
            id: uuidv4(),
            role: "system",
            content: message,
            timestamp: new Date(),
          };
          setState((s) => ({
            ...s,
            messages: [
              ...s.messages.filter((m) => m.id !== assistantMessageId),
              systemMessage,
            ],
          }));
        },
        onError: (message) => {
          setState((s) => ({
            ...s,
            messages: s.messages.filter((m) => m.id !== assistantMessageId),
            error: message,
          }));
        },
        onTitle: (title) => {
          setState((s) => ({
            ...s,
            conversations: s.conversations.map((c) =>
              c.id === s.conversationId ? { ...c, title } : c
            ),
          }));
        },
        onDone: () => {
          setState((s) => ({
            ...s,
            isStreaming: false,
            conversations: s.conversations
              .map((c) =>
                c.id === s.conversationId
                  ? { ...c, updatedAt: new Date().toISOString(), messageCount: c.messageCount + 2 }
                  : c
              )
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
          }));
        },
      });
    },
    [state.conversationId, state.isStreaming]
  );

  const startNewChat = useCallback(async () => {
    setState((s) => ({
      ...s,
      messages: [],
      isConnecting: true,
      error: null,
      isStreaming: false,
    }));
    try {
      const res = await createConversation("support-bot");
      const updatedList = await listConversations();
      setState((s) => ({
        ...s,
        conversations: updatedList,
        conversationId: res.conversationId,
        isConnecting: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Failed to connect",
      }));
    }
  }, []);

  return { state, sendMessage, startNewChat, selectConversation, deleteConversation };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/web-client && npx tsc --noEmit`
Expected: Errors in files that consume useChat (App.tsx, chat-container.tsx) — these are fixed in later tasks

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/hooks/use-chat.ts
git commit -m "feat: extend useChat with conversation list, select, delete, title update"
```

---

### Task 8: Create ConfirmDialog component

**Files:**
- Create: `packages/web-client/src/components/confirm-dialog.tsx`

- [ ] **Step 1: Create the ConfirmDialog component**

Create `packages/web-client/src/components/confirm-dialog.tsx`:

```tsx
import { useEffect } from "react";
import { Button } from "./ui/button";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  error?: string | null;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  error,
}: ConfirmDialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {error && (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/components/confirm-dialog.tsx
git commit -m "feat: add ConfirmDialog component"
```

---

### Task 9: Create ConversationItem component

**Files:**
- Create: `packages/web-client/src/components/conversation-item.tsx`

- [ ] **Step 1: Create the ConversationItem component**

Create `packages/web-client/src/components/conversation-item.tsx`:

```tsx
import { Trash2 } from "lucide-react";
import type { ConversationSummary } from "../types";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

interface ConversationItemProps {
  conversation: ConversationSummary;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function ConversationItem({
  conversation,
  isActive,
  onClick,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      onClick={onClick}
      className={`group flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
        isActive
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-assistant-bg hover:border-border hover:bg-surface"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {conversation.title || "New conversation"}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {relativeTime(conversation.updatedAt)}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="ml-2 hidden rounded p-1 text-muted hover:bg-red-950 hover:text-red-400 group-hover:block"
        aria-label="Delete conversation"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/components/conversation-item.tsx
git commit -m "feat: add ConversationItem component with hover trash icon"
```

---

### Task 10: Create Sidebar component

**Files:**
- Create: `packages/web-client/src/components/sidebar.tsx`

- [ ] **Step 1: Create the Sidebar component**

Create `packages/web-client/src/components/sidebar.tsx`:

```tsx
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ConversationItem } from "./conversation-item";
import { ConfirmDialog } from "./confirm-dialog";
import type { ConversationSummary } from "../types";

interface SidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => Promise<void>;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  onDelete,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center border-r border-border bg-surface py-3 gap-3">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
          aria-label="Expand sidebar"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={onNewChat}
          className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
          aria-label="New chat"
        >
          <Plus size={16} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex w-[260px] flex-col border-r border-border bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3">
          <button
            onClick={() => setCollapsed(true)}
            className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold">Chats</span>
          <button
            onClick={onNewChat}
            className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
            aria-label="New chat"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <div className="flex flex-col gap-1.5">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onClick={() => onSelect(conv.id)}
                onDelete={() => {
                  setDeleteTarget(conv.id);
                  setDeleteError(null);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete conversation?"
          message="This conversation and all its messages will be permanently deleted."
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          error={deleteError}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/components/sidebar.tsx
git commit -m "feat: add Sidebar component with collapse, new chat, and delete"
```

---

### Task 11: Update App.tsx and ChatContainer

**Files:**
- Modify: `packages/web-client/src/App.tsx`
- Modify: `packages/web-client/src/components/chat-container.tsx`

- [ ] **Step 1: Update App.tsx to use sidebar layout**

Replace the entire contents of `packages/web-client/src/App.tsx` with:

```tsx
import { useChat } from "./hooks/use-chat";
import { Sidebar } from "./components/sidebar";
import { ChatContainer } from "./components/chat-container";

export default function App() {
  const { state, sendMessage, startNewChat, selectConversation, deleteConversation } = useChat();

  return (
    <div className="flex h-full">
      <Sidebar
        conversations={state.conversations}
        activeConversationId={state.conversationId}
        onSelect={selectConversation}
        onNewChat={startNewChat}
        onDelete={deleteConversation}
      />
      <ChatContainer
        conversationId={state.conversationId}
        messages={state.messages}
        isStreaming={state.isStreaming}
        isConnecting={state.isConnecting}
        error={state.error}
        onSend={sendMessage}
        onRetry={startNewChat}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update ChatContainer to accept props**

Replace the entire contents of `packages/web-client/src/components/chat-container.tsx` with:

```tsx
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { Button } from "./ui/button";
import type { Message } from "../types";

interface ChatContainerProps {
  conversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRetry: () => void;
}

export function ChatContainer({
  conversationId,
  messages,
  isStreaming,
  isConnecting,
  error,
  onSend,
  onRetry,
}: ChatContainerProps) {
  if (isConnecting) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted">Connecting...</p>
      </div>
    );
  }

  if (error && !conversationId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-red-400">Failed to connect: {error}</p>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm text-white">
            S
          </div>
          <div>
            <div className="text-sm font-semibold">Support Bot</div>
            <div className="text-xs text-success">Online</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
      />

      {/* Error banner */}
      {error && conversationId && (
        <div className="border-t border-red-900/50 bg-red-950/30 px-4 py-2 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={onSend}
        disabled={isStreaming || isConnecting}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify the web client compiles**

Run: `cd packages/web-client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/src/App.tsx packages/web-client/src/components/chat-container.tsx
git commit -m "feat: add sidebar layout to App, make ChatContainer prop-driven"
```

---

### Task 12: Update frontend tests

**Files:**
- Modify: `packages/web-client/src/__tests__/use-chat.test.ts`
- Modify: `packages/web-client/src/__tests__/api.test.ts`

- [ ] **Step 1: Update use-chat.test.ts**

The existing test mocks `createConversation`. Update to also mock `listConversations` and `getConversation`, and account for the new `conversations` field in state and `onTitle` callback.

Key changes:
- Mock `listConversations` to return an empty array by default (triggers auto-create flow)
- Mock `getConversation` for select tests
- Add `onTitle` to `SendMessageCallbacks` mock expectations
- Update assertions that check `state` to include `conversations: []`

Read the current test file first and adapt the mocks accordingly. Run: `cd packages/web-client && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/__tests__/
git commit -m "test: update frontend tests for conversation history"
```

---

### Task 13: Manual end-to-end verification

- [ ] **Step 1: Start the backend**

Run: `cd packages/agent-service && ANTHROPIC_API_KEY="<key>" pnpm dev`
Expected: `[startup] Database opened at ...` and `[startup] Agent service listening on http://localhost:3000`

- [ ] **Step 2: Start the frontend**

Run: `cd packages/web-client && pnpm dev`
Expected: Vite dev server starts

- [ ] **Step 3: Verify in browser**

Open `http://localhost:5173`. You should see:
1. A sidebar on the left with a "Chats" header and `+` button
2. A new conversation auto-created
3. Send a message — sidebar should update with an LLM-generated title
4. Click `+` to create another conversation
5. Switch between conversations by clicking them
6. Hover a conversation — trash icon appears
7. Click trash — confirm dialog appears
8. Confirm delete — conversation removed
9. Collapse sidebar with chevron — shows thin strip
10. Refresh page — conversations persist

- [ ] **Step 4: Run all tests**

Run: `cd packages/agent-service && npx vitest run && cd ../web-client && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "feat: conversation history with persistent sidebar"
```
