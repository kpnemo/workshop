# Agent Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a conversational agent service with REST API + SSE streaming, markdown-based agent configs, topic boundary guardrails, and in-memory conversation state.

**Architecture:** Express.js server with Anthropic Claude SDK. Agents defined as markdown files with YAML frontmatter (persona + guardrails). Conversations stored in-memory. SSE streaming for all message responses. pnpm monorepo structure.

**Tech Stack:** TypeScript, Node.js, Express, @anthropic-ai/sdk, uuid, gray-matter, vitest

**Spec:** `docs/superpowers/specs/2026-03-25-agent-service-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Root workspace config |
| `pnpm-workspace.yaml` | Workspace packages declaration |
| `tsconfig.base.json` | Shared TypeScript compiler options |
| `agents/support-bot.md` | Example agent config |
| `packages/agent-service/package.json` | Service dependencies and scripts |
| `packages/agent-service/tsconfig.json` | Service TS config extending base |
| `packages/agent-service/src/types.ts` | Shared interfaces: AgentConfig, Conversation, Message |
| `packages/agent-service/src/services/agent-loader.ts` | Load + parse + validate agent MD files at startup |
| `packages/agent-service/src/services/conversation.ts` | In-memory conversation CRUD |
| `packages/agent-service/src/services/guardrails.ts` | Topic boundary classification via Haiku |
| `packages/agent-service/src/routes/conversations.ts` | Express router: POST create, POST message, GET history |
| `packages/agent-service/src/index.ts` | Express app setup, CORS, JSON parsing, startup |
| `packages/agent-service/src/__tests__/agent-loader.test.ts` | Agent loader unit tests |
| `packages/agent-service/src/__tests__/conversation.test.ts` | Conversation service unit tests |
| `packages/agent-service/src/__tests__/guardrails.test.ts` | Guardrails service unit tests |
| `packages/agent-service/src/__tests__/routes.test.ts` | Route handler integration tests |

---

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/agent-service/package.json`
- Create: `packages/agent-service/tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "new-workshop",
  "private": true,
  "scripts": {},
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Create `packages/agent-service/package.json`**

```json
{
  "name": "@new-workshop/agent-service",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "gray-matter": "^4.0.3",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 5: Create `packages/agent-service/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
.env
*.tgz
```

- [ ] **Step 7: Install dependencies**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm install`
Expected: Lockfile created, dependencies installed

- [ ] **Step 8: Verify TypeScript compiles**

Run: `cd packages/agent-service && pnpm build`
Expected: May warn about no input files (no .ts files yet) — that's fine. No config errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with agent-service package"
```

---

### Task 2: Types

**Files:**
- Create: `packages/agent-service/src/types.ts`

- [ ] **Step 1: Create shared type definitions**

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
  messages: Message[];
  createdAt: Date;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm build`
Expected: Compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add packages/agent-service/src/types.ts
git commit -m "feat: add shared type definitions"
```

---

### Task 3: Agent Loader Service

**Files:**
- Create: `packages/agent-service/src/services/agent-loader.ts`
- Create: `packages/agent-service/src/__tests__/agent-loader.test.ts`
- Create: `agents/support-bot.md` (test fixture + real example)

- [ ] **Step 1: Create example agent config**

Create `agents/support-bot.md`:

```markdown
---
name: Support Bot
model: claude-sonnet-4-20250514
maxTokens: 1024
temperature: 0.7
topicBoundaries:
  allowed:
    - "product questions"
    - "troubleshooting"
    - "pricing"
  blocked:
    - "competitor comparisons"
    - "political topics"
  boundaryMessage: "I can only help with product-related questions."
---

You are a helpful support agent for Acme Corp.
You assist customers with product questions, troubleshooting, and pricing inquiries.
Be professional, concise, and friendly.
```

- [ ] **Step 2: Write failing tests for agent loader**

Create `packages/agent-service/src/__tests__/agent-loader.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: FAIL — module `../services/agent-loader.js` not found

- [ ] **Step 4: Implement agent loader**

Create `packages/agent-service/src/services/agent-loader.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { AgentConfig } from "../types.js";

export function loadAgents(agentsDir: string): Map<string, AgentConfig> {
  const agents = new Map<string, AgentConfig>();

  if (!fs.existsSync(agentsDir)) {
    console.warn(`[agent-loader] Directory not found: ${agentsDir}`);
    return agents;
  }

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    console.warn(`[agent-loader] No .md files found in ${agentsDir}`);
    return agents;
  }

  for (const file of files) {
    const filePath = path.join(agentsDir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);

      if (!data.name || !data.model) {
        console.warn(
          `[agent-loader] Skipping ${file}: missing required fields (name, model)`
        );
        continue;
      }

      const id = path.basename(file, ".md");
      const config: AgentConfig = {
        id,
        name: data.name,
        model: data.model,
        maxTokens: data.maxTokens ?? 1024,
        temperature: data.temperature ?? 1.0,
        systemPrompt: content.trim(),
        topicBoundaries: data.topicBoundaries,
      };

      agents.set(id, config);
    } catch (err) {
      console.warn(`[agent-loader] Skipping ${file}: ${err}`);
    }
  }

  return agents;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: All 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add agents/support-bot.md packages/agent-service/src/services/agent-loader.ts packages/agent-service/src/__tests__/agent-loader.test.ts
git commit -m "feat: add agent loader service with tests"
```

---

### Task 4: Conversation Service

**Files:**
- Create: `packages/agent-service/src/services/conversation.ts`
- Create: `packages/agent-service/src/__tests__/conversation.test.ts`

- [ ] **Step 1: Write failing tests for conversation service**

Create `packages/agent-service/src/__tests__/conversation.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { ConversationStore } from "../services/conversation.js";

describe("ConversationStore", () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  it("creates a conversation and returns it", () => {
    const conv = store.create("support-bot");

    expect(conv.id).toBeDefined();
    expect(conv.agentId).toBe("support-bot");
    expect(conv.messages).toEqual([]);
    expect(conv.createdAt).toBeInstanceOf(Date);
  });

  it("retrieves an existing conversation by id", () => {
    const conv = store.create("support-bot");
    const found = store.get(conv.id);

    expect(found).toBeDefined();
    expect(found!.id).toBe(conv.id);
  });

  it("returns undefined for unknown conversation id", () => {
    const found = store.get("nonexistent");
    expect(found).toBeUndefined();
  });

  it("appends a user message with timestamp", () => {
    const conv = store.create("support-bot");
    store.addMessage(conv.id, "user", "Hello");

    const updated = store.get(conv.id)!;
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0].role).toBe("user");
    expect(updated.messages[0].content).toBe("Hello");
    expect(updated.messages[0].timestamp).toBeInstanceOf(Date);
  });

  it("appends an assistant message with timestamp", () => {
    const conv = store.create("support-bot");
    store.addMessage(conv.id, "user", "Hello");
    store.addMessage(conv.id, "assistant", "Hi there!");

    const updated = store.get(conv.id)!;
    expect(updated.messages).toHaveLength(2);
    expect(updated.messages[1].role).toBe("assistant");
    expect(updated.messages[1].content).toBe("Hi there!");
  });

  it("throws when adding message to nonexistent conversation", () => {
    expect(() => store.addMessage("bad-id", "user", "Hello")).toThrow(
      "Conversation not found"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: FAIL — module `../services/conversation.js` not found

- [ ] **Step 3: Implement conversation service**

Create `packages/agent-service/src/services/conversation.ts`:

```typescript
import { v4 as uuidv4 } from "uuid";
import type { Conversation } from "../types.js";

export class ConversationStore {
  private conversations = new Map<string, Conversation>();

  create(agentId: string): Conversation {
    const conversation: Conversation = {
      id: uuidv4(),
      agentId,
      messages: [],
      createdAt: new Date(),
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    conversation.messages.push({ role, content, timestamp: new Date() });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: All conversation tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/conversation.ts packages/agent-service/src/__tests__/conversation.test.ts
git commit -m "feat: add in-memory conversation store with tests"
```

---

### Task 5: Guardrails Service

**Files:**
- Create: `packages/agent-service/src/services/guardrails.ts`
- Create: `packages/agent-service/src/__tests__/guardrails.test.ts`

- [ ] **Step 1: Write failing tests for guardrails**

Create `packages/agent-service/src/__tests__/guardrails.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkTopicBoundary, type GuardrailResult } from "../services/guardrails.js";
import type { TopicBoundaries } from "../types.js";

// Mock the Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

describe("checkTopicBoundary", () => {
  const boundaries: TopicBoundaries = {
    allowed: ["product questions", "pricing"],
    blocked: ["politics", "competitors"],
    boundaryMessage: "I can only help with product topics.",
  };

  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns allowed when classification says allowed", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "allowed" }],
    });

    const result = await checkTopicBoundary("What is your pricing?", boundaries);

    expect(result).toEqual({ allowed: true });
  });

  it("returns blocked with message when classification says blocked", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "blocked" }],
    });

    const result = await checkTopicBoundary("Who will win the election?", boundaries);

    expect(result).toEqual({
      allowed: false,
      message: "I can only help with product topics.",
    });
  });

  it("handles case-insensitive response (BLOCKED)", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "BLOCKED" }],
    });

    const result = await checkTopicBoundary("politics stuff", boundaries);

    expect(result).toEqual({
      allowed: false,
      message: "I can only help with product topics.",
    });
  });

  it("handles response with whitespace", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "  blocked  \n" }],
    });

    const result = await checkTopicBoundary("politics", boundaries);

    expect(result).toEqual({
      allowed: false,
      message: "I can only help with product topics.",
    });
  });

  it("defaults to allowed on unexpected response (fail-open)", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "I think this is fine" }],
    });

    const result = await checkTopicBoundary("random message", boundaries);

    expect(result).toEqual({ allowed: true });
  });

  it("defaults to allowed on API error (fail-open)", async () => {
    mockCreate.mockRejectedValue(new Error("API unavailable"));

    const result = await checkTopicBoundary("any message", boundaries);

    expect(result).toEqual({ allowed: true });
  });

  it("sends correct classification prompt to Haiku", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "allowed" }],
    });

    await checkTopicBoundary("Tell me about pricing", boundaries);

    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      messages: [
        {
          role: "user",
          content: expect.stringContaining("product questions"),
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: FAIL — module `../services/guardrails.js` not found

- [ ] **Step 3: Implement guardrails service**

Create `packages/agent-service/src/services/guardrails.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { TopicBoundaries } from "../types.js";

export interface GuardrailResult {
  allowed: boolean;
  message?: string;
}

const client = new Anthropic();

export async function checkTopicBoundary(
  userMessage: string,
  boundaries: TopicBoundaries
): Promise<GuardrailResult> {
  try {
    const prompt = `Given these allowed topics: ${boundaries.allowed.join(", ")}
And these blocked topics: ${boundaries.blocked.join(", ")}

Classify the following user message as "allowed" or "blocked":
"${userMessage}"

Respond with only "allowed" or "blocked".`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text"
        ? response.content[0].text.trim().toLowerCase()
        : "";

    if (text === "blocked") {
      return { allowed: false, message: boundaries.boundaryMessage };
    }

    return { allowed: true };
  } catch (err) {
    console.warn("[guardrails] Classification failed, defaulting to allowed:", err);
    return { allowed: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: All guardrails tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/guardrails.ts packages/agent-service/src/__tests__/guardrails.test.ts
git commit -m "feat: add topic boundary guardrails with tests"
```

---

### Task 6: Conversation Routes

**Files:**
- Create: `packages/agent-service/src/routes/conversations.ts`
- Create: `packages/agent-service/src/__tests__/routes.test.ts`

- [ ] **Step 1: Write failing tests for routes**

Create `packages/agent-service/src/__tests__/routes.test.ts`:

```typescript
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
    // Should NOT contain delta events
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: FAIL — module `../routes/conversations.js` not found

- [ ] **Step 3: Implement conversation routes**

Create `packages/agent-service/src/routes/conversations.ts`:

```typescript
import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { ConversationStore } from "../services/conversation.js";
import { checkTopicBoundary } from "../services/guardrails.js";
import type { AgentConfig } from "../types.js";

const anthropic = new Anthropic();

export function createConversationRouter(
  agents: Map<string, AgentConfig>,
  store: ConversationStore
): Router {
  const router = Router();

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

    const conversation = store.create(agentId);
    res.status(201).json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      createdAt: conversation.createdAt.toISOString(),
    });
  });

  // Helper to start SSE response
  function startSSE(res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  function writeSSE(res: Response, event: string, data: object) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // POST /conversations/:id/messages - Send a message (SSE response)
  router.post("/:id/messages", async (req: Request, res: Response) => {
    const conversation = store.get(req.params.id);
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

    // Guardrail check (before SSE headers — guardrails fail-open, so no HTTP error path here)
    if (agent.topicBoundaries) {
      const guardrailResult = await checkTopicBoundary(
        message,
        agent.topicBoundaries
      );

      if (!guardrailResult.allowed) {
        store.addMessage(conversation.id, "user", message);
        startSSE(res);
        writeSSE(res, "blocked", { message: guardrailResult.message });
        writeSSE(res, "done", { conversationId: conversation.id });
        res.end();
        return;
      }
    }

    // Add user message to history
    store.addMessage(conversation.id, "user", message);

    // Build messages array for Claude
    const claudeMessages = conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Attempt to create stream BEFORE setting SSE headers.
    // If this fails (connection refused, auth error), we can still send 502 JSON.
    let stream;
    try {
      stream = anthropic.messages.stream({
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

    // Stream created successfully — now switch to SSE
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

      // Add assistant response to history
      store.addMessage(conversation.id, "assistant", fullResponse);

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
    const conversation = store.get(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: All route tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/routes/conversations.ts packages/agent-service/src/__tests__/routes.test.ts
git commit -m "feat: add conversation route handlers with tests"
```

---

### Task 7: Express App Entry Point

**Files:**
- Create: `packages/agent-service/src/index.ts`

- [ ] **Step 1: Implement the Express app**

Create `packages/agent-service/src/index.ts`:

```typescript
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAgents } from "./services/agent-loader.js";
import { ConversationStore } from "./services/conversation.js";
import { createConversationRouter } from "./routes/conversations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const AGENTS_DIR =
  process.env.AGENTS_DIR || path.resolve(__dirname, "../../../agents");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Load agents
const agents = loadAgents(AGENTS_DIR);
console.log(`[startup] Loaded ${agents.size} agent(s): ${[...agents.keys()].join(", ")}`);

// Conversation store
const store = new ConversationStore();

// Routes
app.use("/conversations", createConversationRouter(agents, store));

// Start server
app.listen(PORT, () => {
  console.log(`[startup] Agent service listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Verify build compiles**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm build`
Expected: Compiles with no errors

- [ ] **Step 3: Verify all tests still pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: All tests PASS

- [ ] **Step 4: Smoke test — start the server**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && timeout 5 pnpm dev || true`
Expected: Output includes `Loaded 1 agent(s): support-bot` and `Agent service listening on http://localhost:3000`

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/index.ts
git commit -m "feat: add Express app entry point with startup agent loading"
```

---

### Task 8: README and Final Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create root README**

Create `README.md`:

The README content (write using the Write tool):

- Title: `# New Workshop — Agent Service`
- Description: A conversational agent service with REST API + SSE streaming, powered by Anthropic Claude.
- Quick Start section with: `pnpm install`, `export ANTHROPIC_API_KEY=your-key-here`, `pnpm --filter @new-workshop/agent-service dev`
- API section with curl examples for all 3 endpoints:
  - `curl -X POST http://localhost:3000/conversations -H "Content-Type: application/json" -d '{"agentId": "support-bot"}'`
  - `curl -N -X POST http://localhost:3000/conversations/{id}/messages -H "Content-Type: application/json" -d '{"message": "What products do you offer?"}'`
  - `curl http://localhost:3000/conversations/{id}`
- Agent Configuration section: agents are markdown files in `agents/`, see `agents/support-bot.md`
- Project Structure section: `packages/agent-service/` (REST API service), `agents/` (agent config files)

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm test`
Expected: All tests PASS

- [ ] **Step 3: Run build**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/agent-service && pnpm build`
Expected: Clean compile

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with quick start and API usage"
```
