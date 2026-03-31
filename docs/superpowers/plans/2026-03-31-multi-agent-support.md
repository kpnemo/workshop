# Multi-Agent Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-agent CRUD, agent selection per conversation, and agent management drawer to the workshop app.

**Architecture:** File-backed agents with new REST endpoints for CRUD. Frontend gets a management drawer, agent selector in chat header, and a `useAgents` hook. Existing message streaming pipeline is untouched.

**Tech Stack:** Express, gray-matter, React 19, TypeScript, TailwindCSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-31-multi-agent-support-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `packages/agent-service/src/routes/agents.ts` | CRUD REST endpoints for agents |
| `packages/agent-service/src/__tests__/agents-routes.test.ts` | Tests for agent CRUD endpoints |
| `packages/web-client/src/lib/agents-api.ts` | Frontend HTTP client for agent endpoints |
| `packages/web-client/src/__tests__/agents-api.test.ts` | Tests for agent API client |
| `packages/web-client/src/hooks/use-agents.ts` | React hook for agent state management |
| `packages/web-client/src/components/agent-avatar.tsx` | Reusable avatar component (emoji on colored circle) |
| `packages/web-client/src/components/agent-selector.tsx` | Dropdown in chat header for agent selection |
| `packages/web-client/src/components/agent-form.tsx` | Create/edit form with avatar picker and guardrails |
| `packages/web-client/src/components/agent-drawer.tsx` | Slide-out drawer overlay for agent management |

### Modified files
| File | Changes |
|------|---------|
| `packages/agent-service/src/types.ts` | Add `avatar` field to `AgentConfig` |
| `packages/agent-service/src/services/agent-loader.ts` | Add `saveAgent()`, `deleteAgent()`, avatar parsing with defaults |
| `packages/agent-service/src/index.ts` | Mount `/agents` routes, export `AGENTS_DIR` |
| `packages/web-client/src/types.ts` | Add `AgentSummary` and `AgentConfig` frontend types |
| `packages/web-client/src/hooks/use-chat.ts` | Remove hardcoded "support-bot", accept `agentId` param |
| `packages/web-client/src/components/chat-container.tsx` | Replace hardcoded header with `AgentSelector` |
| `packages/web-client/src/components/conversation-item.tsx` | Show agent avatar on each conversation |
| `packages/web-client/src/components/sidebar.tsx` | Add "Manage Agents" button, pass agents data |
| `packages/web-client/src/App.tsx` | Wire up `useAgents`, pass agents to Sidebar and ChatContainer |
| `agents/support-bot.md` | Add `avatar` field to existing agent |

---

## Task 1: Add avatar to backend types and agent loader

**Files:**
- Modify: `packages/agent-service/src/types.ts:1-15`
- Modify: `packages/agent-service/src/services/agent-loader.ts:1-50`
- Modify: `agents/support-bot.md:1-15`
- Test: `packages/agent-service/src/__tests__/agent-loader.test.ts`

- [ ] **Step 1: Add `avatar` field to `AgentConfig` type**

In `packages/agent-service/src/types.ts`, add the `Avatar` interface and the `avatar` field:

```typescript
export interface Avatar {
  emoji: string;
  color: string;
}

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
  avatar: Avatar;
  topicBoundaries?: TopicBoundaries;
}
```

- [ ] **Step 2: Write tests for avatar parsing in agent-loader**

Add these tests to `packages/agent-service/src/__tests__/agent-loader.test.ts`:

```typescript
it("parses avatar when present", () => {
  const md = `---
name: Custom Bot
model: claude-sonnet-4-20250514
avatar:
  emoji: "🎨"
  color: "#fd79a8"
---

Custom bot.`;
  fs.writeFileSync(path.join(tmpDir, "custom.md"), md);
  const agents = loadAgents(tmpDir);
  const agent = agents.get("custom")!;
  expect(agent.avatar).toEqual({ emoji: "🎨", color: "#fd79a8" });
});

it("applies default avatar when not specified", () => {
  const md = `---
name: No Avatar Bot
model: claude-sonnet-4-20250514
---

No avatar.`;
  fs.writeFileSync(path.join(tmpDir, "no-avatar.md"), md);
  const agents = loadAgents(tmpDir);
  const agent = agents.get("no-avatar")!;
  expect(agent.avatar).toEqual({ emoji: "🤖", color: "#6c5ce7" });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test -- --run`
Expected: 2 failures — `avatar` property missing on agent objects.

- [ ] **Step 4: Update agent-loader to parse avatar with defaults**

In `packages/agent-service/src/services/agent-loader.ts`, update the `config` construction inside the `for` loop (around line 33-41):

```typescript
const config: AgentConfig = {
  id,
  name: data.name,
  model: data.model,
  maxTokens: data.maxTokens ?? 1024,
  temperature: data.temperature ?? 1.0,
  systemPrompt: content.trim(),
  avatar: {
    emoji: data.avatar?.emoji ?? "🤖",
    color: data.avatar?.color ?? "#6c5ce7",
  },
  topicBoundaries: data.topicBoundaries,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All tests pass including the 2 new ones.

- [ ] **Step 6: Add avatar to existing support-bot.md**

Update `agents/support-bot.md` front-matter — add `avatar` block after `temperature`:

```yaml
---
name: Support Bot
model: claude-sonnet-4-20250514
maxTokens: 1024
temperature: 0.7
avatar:
  emoji: "🤖"
  color: "#6c5ce7"
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

- [ ] **Step 7: Commit**

```bash
git add packages/agent-service/src/types.ts packages/agent-service/src/services/agent-loader.ts packages/agent-service/src/__tests__/agent-loader.test.ts agents/support-bot.md
git commit -m "feat: add avatar field to agent config with defaults"
```

---

## Task 2: Add saveAgent and deleteAgent to agent-loader

**Files:**
- Modify: `packages/agent-service/src/services/agent-loader.ts`
- Test: `packages/agent-service/src/__tests__/agent-loader.test.ts`

- [ ] **Step 1: Write tests for saveAgent and deleteAgent**

Add to `packages/agent-service/src/__tests__/agent-loader.test.ts`:

```typescript
import { loadAgents, saveAgent, deleteAgent } from "../services/agent-loader.js";

// ... inside the existing describe block:

it("saveAgent writes a valid markdown file that loadAgents can read back", () => {
  saveAgent(tmpDir, "my-bot", {
    id: "my-bot",
    name: "My Bot",
    model: "claude-sonnet-4-20250514",
    maxTokens: 512,
    temperature: 0.5,
    systemPrompt: "You are my bot.",
    avatar: { emoji: "🎯", color: "#00b894" },
  });

  expect(fs.existsSync(path.join(tmpDir, "my-bot.md"))).toBe(true);
  const agents = loadAgents(tmpDir);
  const agent = agents.get("my-bot")!;
  expect(agent.name).toBe("My Bot");
  expect(agent.model).toBe("claude-sonnet-4-20250514");
  expect(agent.maxTokens).toBe(512);
  expect(agent.temperature).toBe(0.5);
  expect(agent.systemPrompt).toBe("You are my bot.");
  expect(agent.avatar).toEqual({ emoji: "🎯", color: "#00b894" });
});

it("saveAgent writes topicBoundaries when present", () => {
  saveAgent(tmpDir, "guarded", {
    id: "guarded",
    name: "Guarded",
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "Guarded bot.",
    avatar: { emoji: "🛡️", color: "#6c5ce7" },
    topicBoundaries: {
      allowed: ["coding"],
      blocked: ["politics"],
      boundaryMessage: "Stay on topic.",
    },
  });

  const agents = loadAgents(tmpDir);
  const agent = agents.get("guarded")!;
  expect(agent.topicBoundaries).toEqual({
    allowed: ["coding"],
    blocked: ["politics"],
    boundaryMessage: "Stay on topic.",
  });
});

it("saveAgent overwrites an existing file", () => {
  saveAgent(tmpDir, "bot", {
    id: "bot",
    name: "Original",
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "Original prompt.",
    avatar: { emoji: "🤖", color: "#6c5ce7" },
  });
  saveAgent(tmpDir, "bot", {
    id: "bot",
    name: "Updated",
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
    temperature: 0.9,
    systemPrompt: "Updated prompt.",
    avatar: { emoji: "🎨", color: "#fd79a8" },
  });

  const agents = loadAgents(tmpDir);
  expect(agents.size).toBe(1);
  const agent = agents.get("bot")!;
  expect(agent.name).toBe("Updated");
  expect(agent.maxTokens).toBe(2048);
  expect(agent.systemPrompt).toBe("Updated prompt.");
});

it("deleteAgent removes the file", () => {
  saveAgent(tmpDir, "doomed", {
    id: "doomed",
    name: "Doomed",
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "Gone soon.",
    avatar: { emoji: "💀", color: "#636e72" },
  });

  expect(fs.existsSync(path.join(tmpDir, "doomed.md"))).toBe(true);
  deleteAgent(tmpDir, "doomed");
  expect(fs.existsSync(path.join(tmpDir, "doomed.md"))).toBe(false);
});

it("deleteAgent throws when file does not exist", () => {
  expect(() => deleteAgent(tmpDir, "nonexistent")).toThrow();
});
```

Also update the import at the top of the test file from:
```typescript
import { loadAgents } from "../services/agent-loader.js";
```
to:
```typescript
import { loadAgents, saveAgent, deleteAgent } from "../services/agent-loader.js";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test -- --run`
Expected: Failures — `saveAgent` and `deleteAgent` are not exported.

- [ ] **Step 3: Implement saveAgent and deleteAgent**

Add to `packages/agent-service/src/services/agent-loader.ts` after the existing `loadAgents` function:

```typescript
export function saveAgent(agentsDir: string, id: string, config: Omit<AgentConfig, "id">& { id: string }): void {
  const frontMatter: Record<string, unknown> = {
    name: config.name,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    avatar: config.avatar,
  };

  if (config.topicBoundaries) {
    frontMatter.topicBoundaries = config.topicBoundaries;
  }

  const fileContent = matter.stringify(config.systemPrompt, frontMatter);
  const filePath = path.join(agentsDir, `${id}.md`);
  fs.writeFileSync(filePath, fileContent, "utf-8");
}

export function deleteAgent(agentsDir: string, id: string): void {
  const filePath = path.join(agentsDir, `${id}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent file not found: ${filePath}`);
  }
  fs.unlinkSync(filePath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/agent-loader.ts packages/agent-service/src/__tests__/agent-loader.test.ts
git commit -m "feat: add saveAgent and deleteAgent to agent-loader"
```

---

## Task 3: Create agents REST routes

**Files:**
- Create: `packages/agent-service/src/routes/agents.ts`
- Create: `packages/agent-service/src/__tests__/agents-routes.test.ts`
- Modify: `packages/agent-service/src/index.ts:1-59`

- [ ] **Step 1: Write tests for agent CRUD endpoints**

Create `packages/agent-service/src/__tests__/agents-routes.test.ts`:

```typescript
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

    // Verify file was written
    expect(fs.existsSync(path.join(tmpDir, "new-bot.md"))).toBe(true);

    // Verify it shows up in GET /agents
    const list = await makeRequest(app, "GET", "/agents");
    expect(JSON.parse(list.body)).toHaveLength(1);
  });

  it("returns 400 when name is missing", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", {
      systemPrompt: "No name.",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when systemPrompt is missing", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", {
      name: "No Prompt",
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when agent with same slug already exists", async () => {
    writeSeedAgent("Test Bot", "test-bot");
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", {
      name: "Test Bot",
      systemPrompt: "Duplicate.",
    });
    expect(res.status).toBe(409);
  });

  it("applies defaults for optional fields", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", {
      name: "Minimal",
      systemPrompt: "Minimal bot.",
    });
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.model).toBe("claude-sonnet-4-20250514");
    expect(json.maxTokens).toBe(1024);
    expect(json.temperature).toBe(0.7);
    expect(json.avatar).toEqual({ emoji: "🤖", color: "#6c5ce7" });
  });

  it("returns 400 when temperature is out of range", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "POST", "/agents", {
      name: "Bad Temp",
      systemPrompt: "Bad.",
      temperature: 2.0,
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /agents/:id", () => {
  it("updates an existing agent", async () => {
    writeSeedAgent("Old Name", "old-name");
    const app = buildApp();
    const res = await makeRequest(app, "PUT", "/agents/old-name", {
      name: "New Name",
      systemPrompt: "Updated prompt.",
      model: "claude-sonnet-4-20250514",
      maxTokens: 2048,
      temperature: 0.3,
      avatar: { emoji: "🎨", color: "#fd79a8" },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.name).toBe("New Name");
    expect(json.maxTokens).toBe(2048);
  });

  it("returns 404 for unknown agent", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "PUT", "/agents/nonexistent", {
      name: "Nope",
      systemPrompt: "Nope.",
    });
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

    // Verify it's gone from GET /agents
    const list = await makeRequest(app, "GET", "/agents");
    expect(JSON.parse(list.body)).toHaveLength(0);
  });

  it("returns 404 for unknown agent", async () => {
    const app = buildApp();
    const res = await makeRequest(app, "DELETE", "/agents/nonexistent");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test -- --run`
Expected: Failures — `agents.ts` route file doesn't exist.

- [ ] **Step 3: Create the agents router**

Create `packages/agent-service/src/routes/agents.ts`:

```typescript
import { Router } from "express";
import type { Request, Response } from "express";
import { loadAgents, saveAgent, deleteAgent } from "../services/agent-loader.js";
import type { AgentConfig } from "../types.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createAgentsRouter(
  agents: Map<string, AgentConfig>,
  agentsDir: string
): Router {
  const router = Router();

  function refreshAgents(): void {
    const updated = loadAgents(agentsDir);
    agents.clear();
    for (const [k, v] of updated) {
      agents.set(k, v);
    }
  }

  // GET /agents — list all agents (summary)
  router.get("/", (_req: Request, res: Response) => {
    const list = [...agents.values()].map((a) => ({
      id: a.id,
      name: a.name,
      model: a.model,
      avatar: a.avatar,
      hasGuardrails: !!a.topicBoundaries,
    }));
    res.json(list);
  });

  // GET /agents/:id — full agent config
  router.get("/:id", (req: Request, res: Response) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(agent);
  });

  // POST /agents — create new agent
  router.post("/", (req: Request, res: Response) => {
    const { name, systemPrompt, model, maxTokens, temperature, avatar, topicBoundaries } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!systemPrompt || typeof systemPrompt !== "string" || systemPrompt.trim() === "") {
      res.status(400).json({ error: "systemPrompt is required" });
      return;
    }

    const temp = temperature ?? 0.7;
    if (typeof temp !== "number" || temp < 0 || temp > 1) {
      res.status(400).json({ error: "temperature must be between 0 and 1" });
      return;
    }

    const tokens = maxTokens ?? 1024;
    if (typeof tokens !== "number" || tokens < 1 || tokens > 4096) {
      res.status(400).json({ error: "maxTokens must be between 1 and 4096" });
      return;
    }

    const id = slugify(name);
    if (agents.has(id)) {
      res.status(409).json({ error: "Agent with this name already exists" });
      return;
    }

    const config: AgentConfig = {
      id,
      name: name.trim(),
      model: model || "claude-sonnet-4-20250514",
      maxTokens: tokens,
      temperature: temp,
      systemPrompt: systemPrompt.trim(),
      avatar: {
        emoji: avatar?.emoji || "🤖",
        color: avatar?.color || "#6c5ce7",
      },
      topicBoundaries: topicBoundaries || undefined,
    };

    saveAgent(agentsDir, id, config);
    refreshAgents();
    res.status(201).json(agents.get(id));
  });

  // PUT /agents/:id — update existing agent
  router.put("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!agents.has(id)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const { name, systemPrompt, model, maxTokens, temperature, avatar, topicBoundaries } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!systemPrompt || typeof systemPrompt !== "string" || systemPrompt.trim() === "") {
      res.status(400).json({ error: "systemPrompt is required" });
      return;
    }

    const existing = agents.get(id)!;
    const config: AgentConfig = {
      id,
      name: name.trim(),
      model: model || existing.model,
      maxTokens: maxTokens ?? existing.maxTokens,
      temperature: temperature ?? existing.temperature,
      systemPrompt: systemPrompt.trim(),
      avatar: {
        emoji: avatar?.emoji || existing.avatar.emoji,
        color: avatar?.color || existing.avatar.color,
      },
      topicBoundaries: topicBoundaries || undefined,
    };

    saveAgent(agentsDir, id, config);
    refreshAgents();
    res.json(agents.get(id));
  });

  // DELETE /agents/:id — delete agent
  router.delete("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!agents.has(id)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    deleteAgent(agentsDir, id);
    refreshAgents();
    res.status(204).send();
  });

  return router;
}
```

- [ ] **Step 4: Mount agents routes in index.ts**

In `packages/agent-service/src/index.ts`, add the import and mount:

After the existing imports (around line 12), add:
```typescript
import { createAgentsRouter } from "./routes/agents.js";
```

After the existing route mounts (after line 54), add:
```typescript
app.use("/agents", createAgentsRouter(agents, AGENTS_DIR));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-service/src/routes/agents.ts packages/agent-service/src/__tests__/agents-routes.test.ts packages/agent-service/src/index.ts
git commit -m "feat: add agents CRUD REST endpoints"
```

---

## Task 4: Add frontend types and agent API client

**Files:**
- Modify: `packages/web-client/src/types.ts`
- Create: `packages/web-client/src/lib/agents-api.ts`
- Create: `packages/web-client/src/__tests__/agents-api.test.ts`

- [ ] **Step 1: Add frontend types for agents**

Add to the end of `packages/web-client/src/types.ts`:

```typescript
export interface AgentAvatar {
  emoji: string;
  color: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  model: string;
  avatar: AgentAvatar;
  hasGuardrails: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  avatar: AgentAvatar;
  topicBoundaries?: {
    allowed: string[];
    blocked: string[];
    boundaryMessage: string;
  };
}

export interface CreateAgentInput {
  name: string;
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  avatar?: AgentAvatar;
  topicBoundaries?: {
    allowed: string[];
    blocked: string[];
    boundaryMessage: string;
  };
}
```

- [ ] **Step 2: Write tests for agent API client**

Create `packages/web-client/src/__tests__/agents-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchAgents,
  fetchAgent,
  createAgent,
  updateAgent,
  deleteAgent,
} from "../lib/agents-api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchAgents", () => {
  it("sends GET to /api/agents and returns array", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "test", name: "Test" }]),
    });

    const result = await fetchAgents();

    expect(mockFetch).toHaveBeenCalledWith("/api/agents");
    expect(result).toEqual([{ id: "test", name: "Test" }]);
  });
});

describe("fetchAgent", () => {
  it("sends GET to /api/agents/:id and returns agent", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "test",
          name: "Test",
          systemPrompt: "You are test.",
        }),
    });

    const result = await fetchAgent("test");

    expect(mockFetch).toHaveBeenCalledWith("/api/agents/test");
    expect(result.id).toBe("test");
  });

  it("throws on 404", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Agent not found" }),
    });

    await expect(fetchAgent("bad")).rejects.toThrow("Agent not found");
  });
});

describe("createAgent", () => {
  it("sends POST to /api/agents and returns created agent", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "new-bot",
          name: "New Bot",
          systemPrompt: "Hello.",
        }),
    });

    const result = await createAgent({
      name: "New Bot",
      systemPrompt: "Hello.",
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Bot", systemPrompt: "Hello." }),
    });
    expect(result.id).toBe("new-bot");
  });

  it("throws on 409 conflict", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({ error: "Agent with this name already exists" }),
    });

    await expect(
      createAgent({ name: "Dup", systemPrompt: "Dup." })
    ).rejects.toThrow("Agent with this name already exists");
  });
});

describe("updateAgent", () => {
  it("sends PUT to /api/agents/:id", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: "bot", name: "Updated" }),
    });

    const result = await updateAgent("bot", {
      name: "Updated",
      systemPrompt: "Updated.",
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/agents/bot", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated", systemPrompt: "Updated." }),
    });
    expect(result.name).toBe("Updated");
  });
});

describe("deleteAgent", () => {
  it("sends DELETE to /api/agents/:id", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await deleteAgent("bot");

    expect(mockFetch).toHaveBeenCalledWith("/api/agents/bot", {
      method: "DELETE",
    });
  });

  it("throws on 404", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Agent not found" }),
    });

    await expect(deleteAgent("bad")).rejects.toThrow("Agent not found");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/web-client test -- --run`
Expected: Failures — `agents-api.ts` doesn't exist.

- [ ] **Step 4: Create the agent API client**

Create `packages/web-client/src/lib/agents-api.ts`:

```typescript
import type { AgentSummary, AgentConfig, CreateAgentInput } from "../types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export async function fetchAgents(): Promise<AgentSummary[]> {
  const res = await fetch(`${BASE_URL}/api/agents`);
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to fetch agents");
  }
  return res.json();
}

export async function fetchAgent(id: string): Promise<AgentConfig> {
  const res = await fetch(`${BASE_URL}/api/agents/${id}`);
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to fetch agent");
  }
  return res.json();
}

export async function createAgent(data: CreateAgentInput): Promise<AgentConfig> {
  const res = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to create agent");
  }
  return res.json();
}

export async function updateAgent(
  id: string,
  data: CreateAgentInput
): Promise<AgentConfig> {
  const res = await fetch(`${BASE_URL}/api/agents/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to update agent");
  }
  return res.json();
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/agents/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to delete agent");
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/web-client test -- --run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/src/types.ts packages/web-client/src/lib/agents-api.ts packages/web-client/src/__tests__/agents-api.test.ts
git commit -m "feat: add frontend agent types and API client"
```

---

## Task 5: Create useAgents hook

**Files:**
- Create: `packages/web-client/src/hooks/use-agents.ts`

- [ ] **Step 1: Create the useAgents hook**

Create `packages/web-client/src/hooks/use-agents.ts`:

```typescript
import { useState, useCallback, useEffect } from "react";
import {
  fetchAgents,
  createAgent as apiCreateAgent,
  updateAgent as apiUpdateAgent,
  deleteAgent as apiDeleteAgent,
} from "../lib/agents-api";
import type { AgentSummary, AgentConfig, CreateAgentInput } from "../types";

export function useAgents() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchAgents();
      setAgents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const createAgent = useCallback(
    async (data: CreateAgentInput): Promise<AgentConfig> => {
      const created = await apiCreateAgent(data);
      await loadAgents();
      return created;
    },
    [loadAgents]
  );

  const updateAgent = useCallback(
    async (id: string, data: CreateAgentInput): Promise<AgentConfig> => {
      const updated = await apiUpdateAgent(id, data);
      await loadAgents();
      return updated;
    },
    [loadAgents]
  );

  const deleteAgent = useCallback(
    async (id: string): Promise<void> => {
      await apiDeleteAgent(id);
      await loadAgents();
    },
    [loadAgents]
  );

  return {
    agents,
    isLoading,
    error,
    loadAgents,
    createAgent,
    updateAgent,
    deleteAgent,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/hooks/use-agents.ts
git commit -m "feat: add useAgents hook for agent state management"
```

---

## Task 6: Create AgentAvatar component

**Files:**
- Create: `packages/web-client/src/components/agent-avatar.tsx`

- [ ] **Step 1: Create the reusable avatar component**

Create `packages/web-client/src/components/agent-avatar.tsx`:

```tsx
import type { AgentAvatar as AgentAvatarType } from "../types";

interface AgentAvatarProps {
  avatar: AgentAvatarType;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-11 w-11 text-lg",
};

export function AgentAvatar({ avatar, size = "md" }: AgentAvatarProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-full ${sizeClasses[size]}`}
      style={{ backgroundColor: avatar.color }}
    >
      {avatar.emoji}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/components/agent-avatar.tsx
git commit -m "feat: add reusable AgentAvatar component"
```

---

## Task 7: Create AgentSelector dropdown for chat header

**Files:**
- Create: `packages/web-client/src/components/agent-selector.tsx`
- Modify: `packages/web-client/src/components/chat-container.tsx`

- [ ] **Step 1: Create the AgentSelector component**

Create `packages/web-client/src/components/agent-selector.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { AgentAvatar } from "./agent-avatar";
import type { AgentSummary } from "../types";

interface AgentSelectorProps {
  agents: AgentSummary[];
  currentAgentId: string;
  locked: boolean;
  onSelect: (agentId: string) => void;
}

export function AgentSelector({
  agents,
  currentAgentId,
  locked,
  onSelect,
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentAgent = agents.find((a) => a.id === currentAgentId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!currentAgent) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm">
          ?
        </div>
        <div>
          <div className="text-sm font-semibold text-muted">Deleted Agent</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !locked && setOpen(!open)}
        className={`flex items-center gap-3 ${locked ? "cursor-default" : "cursor-pointer"}`}
      >
        <AgentAvatar avatar={currentAgent.avatar} />
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{currentAgent.name}</span>
            {!locked && (
              <span className="flex items-center gap-0.5 rounded border border-primary/50 px-1.5 py-0.5 text-[10px] text-primary">
                <ChevronDown size={10} />
                Change
              </span>
            )}
          </div>
          <div className="text-xs text-success">Online</div>
        </div>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                onSelect(agent.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-background ${
                agent.id === currentAgentId ? "bg-primary/10" : ""
              }`}
            >
              <AgentAvatar avatar={agent.avatar} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{agent.name}</div>
                <div className="text-[10px] text-muted">
                  {agent.model.split("-").slice(0, 2).join("-")} · {agent.hasGuardrails ? "guardrails" : "no guardrails"}
                </div>
              </div>
              {agent.id === currentAgentId && (
                <span className="text-xs text-primary">✓</span>
              )}
            </button>
          ))}
          {!locked && (
            <div className="border-t border-border px-3 py-2 text-center text-[11px] text-muted italic">
              Agent can be changed until you send the first message
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update ChatContainer to use AgentSelector**

Replace the full content of `packages/web-client/src/components/chat-container.tsx`:

```tsx
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { AgentSelector } from "./agent-selector";
import { Button } from "./ui/button";
import type { Message, AgentSummary } from "../types";

interface ChatContainerProps {
  conversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
  agents: AgentSummary[];
  currentAgentId: string;
  onAgentChange: (agentId: string) => void;
  onSend: (text: string) => void;
  onRetry: () => void;
}

export function ChatContainer({
  conversationId,
  messages,
  isStreaming,
  isConnecting,
  error,
  agents,
  currentAgentId,
  onAgentChange,
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

  const hasMessages = messages.some((m) => m.role === "user");

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <AgentSelector
          agents={agents}
          currentAgentId={currentAgentId}
          locked={hasMessages}
          onSelect={onAgentChange}
        />
      </div>

      {/* Messages */}
      <MessageList messages={messages} isStreaming={isStreaming} />

      {/* Error banner */}
      {error && conversationId && (
        <div className="border-t border-red-900/50 bg-red-950/30 px-4 py-2 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={onSend} disabled={isStreaming || isConnecting} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/components/agent-selector.tsx packages/web-client/src/components/chat-container.tsx
git commit -m "feat: add AgentSelector dropdown and update chat header"
```

---

## Task 8: Create AgentForm component

**Files:**
- Create: `packages/web-client/src/components/agent-form.tsx`

- [ ] **Step 1: Create the agent form component**

Create `packages/web-client/src/components/agent-form.tsx`:

```tsx
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { AgentConfig, CreateAgentInput } from "../types";

const AVATAR_COLORS = ["#6c5ce7", "#00b894", "#fd79a8", "#fdcb6e", "#74b9ff"];
const DEFAULT_EMOJIS = ["🤖", "📝", "💻", "🎯", "🧠", "🔧", "🎨", "🛡️"];

interface AgentFormProps {
  agent?: AgentConfig;
  onSave: (data: CreateAgentInput) => Promise<void>;
  onBack: () => void;
}

export function AgentForm({ agent, onSave, onBack }: AgentFormProps) {
  const [name, setName] = useState(agent?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? "");
  const [model, setModel] = useState(agent?.model ?? "claude-sonnet-4-20250514");
  const [temperature, setTemperature] = useState(agent?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(agent?.maxTokens ?? 1024);
  const [emoji, setEmoji] = useState(agent?.avatar?.emoji ?? "🤖");
  const [color, setColor] = useState(agent?.avatar?.color ?? "#6c5ce7");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGuardrails, setShowGuardrails] = useState(!!agent?.topicBoundaries);
  const [allowed, setAllowed] = useState(agent?.topicBoundaries?.allowed.join("\n") ?? "");
  const [blocked, setBlocked] = useState(agent?.topicBoundaries?.blocked.join("\n") ?? "");
  const [boundaryMessage, setBoundaryMessage] = useState(agent?.topicBoundaries?.boundaryMessage ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = name.trim() !== "" && systemPrompt.trim() !== "";

  async function handleSubmit() {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);

    const data: CreateAgentInput = {
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      model,
      temperature,
      maxTokens,
      avatar: { emoji, color },
    };

    if (showGuardrails && (allowed.trim() || blocked.trim())) {
      data.topicBoundaries = {
        allowed: allowed.split("\n").map((s) => s.trim()).filter(Boolean),
        blocked: blocked.split("\n").map((s) => s.trim()).filter(Boolean),
        boundaryMessage: boundaryMessage.trim() || "I can't help with that topic.",
      };
    }

    try {
      await onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent");
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-semibold">
            {agent ? "Edit Agent" : "New Agent"}
          </span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!isValid || saving}
          className="rounded bg-primary px-4 py-1.5 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Avatar */}
          <div>
            <label className="mb-1.5 block text-xs text-muted">Avatar</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-border text-lg"
                style={{ backgroundColor: color }}
              >
                {emoji}
              </button>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className="h-5 w-5 rounded-full"
                      style={{
                        backgroundColor: c,
                        outline: c === color ? "2px solid #e0e0e0" : "none",
                        outlineOffset: "2px",
                      }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted">Click avatar to change emoji</span>
              </div>
            </div>
            {showEmojiPicker && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DEFAULT_EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setEmoji(e);
                      setShowEmojiPicker(false);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-surface ${
                      e === emoji ? "bg-primary/20" : ""
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs text-muted">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Agent"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="mb-1 block text-xs text-muted">System Prompt *</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant that..."
              rows={5}
              className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>

          {/* Model / Temperature / MaxTokens */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="claude-sonnet-4-20250514">claude-sonnet-4</option>
                <option value="claude-haiku-4-5-20251001">claude-haiku-4.5</option>
              </select>
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs text-muted">Temperature</label>
              <input
                type="number"
                step={0.1}
                min={0}
                max={1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs text-muted">Max Tokens</label>
              <input
                type="number"
                min={1}
                max={4096}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 1024)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Guardrails */}
          <div className="border-t border-border pt-4">
            <button
              onClick={() => setShowGuardrails(!showGuardrails)}
              className="mb-2 text-xs text-muted hover:text-foreground"
            >
              {showGuardrails ? "▼" : "▶"} Topic Guardrails (optional)
            </button>

            {showGuardrails && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] text-success">Allowed Topics</label>
                    <textarea
                      value={allowed}
                      onChange={(e) => setAllowed(e.target.value)}
                      placeholder={"product questions\npricing\ntroubleshooting"}
                      rows={3}
                      className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] text-[#fd79a8]">Blocked Topics</label>
                    <textarea
                      value={blocked}
                      onChange={(e) => setBlocked(e.target.value)}
                      placeholder={"competitor comparisons\npolitical topics"}
                      rows={3}
                      className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Boundary Message</label>
                  <input
                    value={boundaryMessage}
                    onChange={(e) => setBoundaryMessage(e.target.value)}
                    placeholder="I can only help with product-related questions."
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/components/agent-form.tsx
git commit -m "feat: add AgentForm component for create/edit"
```

---

## Task 9: Create AgentDrawer component

**Files:**
- Create: `packages/web-client/src/components/agent-drawer.tsx`

- [ ] **Step 1: Create the drawer component**

Create `packages/web-client/src/components/agent-drawer.tsx`:

```tsx
import { useState } from "react";
import { X, Pencil, Trash2, Plus } from "lucide-react";
import { AgentAvatar } from "./agent-avatar";
import { AgentForm } from "./agent-form";
import { ConfirmDialog } from "./confirm-dialog";
import type { AgentSummary, AgentConfig, CreateAgentInput } from "../types";

interface AgentDrawerProps {
  agents: AgentSummary[];
  onClose: () => void;
  onCreate: (data: CreateAgentInput) => Promise<AgentConfig>;
  onUpdate: (id: string, data: CreateAgentInput) => Promise<AgentConfig>;
  onDelete: (id: string) => Promise<void>;
  onAgentSaved: () => void;
}

type DrawerView = { type: "list" } | { type: "form"; agent?: AgentConfig };

export function AgentDrawer({
  agents,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onAgentSaved,
}: AgentDrawerProps) {
  const [view, setView] = useState<DrawerView>({ type: "list" });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadingAgent, setLoadingAgent] = useState<string | null>(null);

  async function handleEdit(agentSummary: AgentSummary) {
    setLoadingAgent(agentSummary.id);
    try {
      const { fetchAgent } = await import("../lib/agents-api");
      const full = await fetchAgent(agentSummary.id);
      setView({ type: "form", agent: full });
    } catch {
      // Fall back to summary data if full fetch fails
      setView({
        type: "form",
        agent: {
          ...agentSummary,
          maxTokens: 1024,
          temperature: 0.7,
          systemPrompt: "",
        },
      });
    } finally {
      setLoadingAgent(null);
    }
  }

  async function handleSave(data: CreateAgentInput) {
    if (view.type === "form" && view.agent) {
      await onUpdate(view.agent.id, data);
    } else {
      await onCreate(data);
    }
    onAgentSaved();
    setView({ type: "list" });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget);
      onAgentSaved();
      setDeleteTarget(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-border bg-background shadow-xl">
        {view.type === "form" ? (
          <AgentForm
            agent={view.agent}
            onSave={handleSave}
            onBack={() => setView({ type: "list" })}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Agents</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setView({ type: "form" })}
                  className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                >
                  <Plus size={14} />
                  New Agent
                </button>
                <button
                  onClick={onClose}
                  className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Agent list */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-2">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-lg bg-surface px-3 py-3"
                  >
                    <AgentAvatar avatar={agent.avatar} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{agent.name}</div>
                      <div className="text-[11px] text-muted">
                        {agent.model.split("-").slice(0, 2).join("-")}
                        {agent.hasGuardrails ? " · guardrails" : ""}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(agent)}
                        disabled={loadingAgent === agent.id}
                        className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground disabled:opacity-50"
                        aria-label={`Edit ${agent.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget(agent.id);
                          setDeleteError(null);
                        }}
                        className="rounded p-1.5 text-muted hover:bg-red-950 hover:text-red-400"
                        aria-label={`Delete ${agent.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                {agents.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted">
                    No agents yet. Create one to get started.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete agent?"
          message="This agent will be permanently deleted. Existing conversations using this agent will still be accessible."
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
git add packages/web-client/src/components/agent-drawer.tsx
git commit -m "feat: add AgentDrawer component for agent management"
```

---

## Task 10: Update Sidebar with "Manage Agents" button and agent avatars

**Files:**
- Modify: `packages/web-client/src/components/sidebar.tsx`
- Modify: `packages/web-client/src/components/conversation-item.tsx`

- [ ] **Step 1: Add agent avatar to ConversationItem**

Update `packages/web-client/src/components/conversation-item.tsx`. Add the import and update the component:

```tsx
import { Trash2 } from "lucide-react";
import { AgentAvatar } from "./agent-avatar";
import type { ConversationSummary, AgentSummary } from "../types";

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
  agents: AgentSummary[];
  onClick: () => void;
  onDelete: () => void;
}

export function ConversationItem({
  conversation,
  isActive,
  agents,
  onClick,
  onDelete,
}: ConversationItemProps) {
  const agent = agents.find((a) => a.id === conversation.agentId);

  return (
    <div
      onClick={onClick}
      className={`group flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
        isActive
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-assistant-bg hover:border-border hover:bg-surface"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {agent ? (
          <AgentAvatar avatar={agent.avatar} size="sm" />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px]">?</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {conversation.title || "New conversation"}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {relativeTime(conversation.updatedAt)}
          </div>
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

- [ ] **Step 2: Add "Manage Agents" button to Sidebar**

Update `packages/web-client/src/components/sidebar.tsx`. Add the import for `Bot` icon and the `agents` and `onManageAgents` props:

```tsx
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, LogOut, Bot } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { ConversationItem } from "./conversation-item";
import { ConfirmDialog } from "./confirm-dialog";
import type { ConversationSummary, AgentSummary } from "../types";

interface SidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  agents: AgentSummary[];
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => Promise<void>;
  onManageAgents: () => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  agents,
  onSelect,
  onNewChat,
  onDelete,
  onManageAgents,
}: SidebarProps) {
  const { logout, user } = useAuth();
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
        <button
          onClick={onManageAgents}
          className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
          aria-label="Manage agents"
        >
          <Bot size={16} />
        </button>
        <button
          onClick={logout}
          className="mt-auto rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
          aria-label="Log out"
        >
          <LogOut size={16} />
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

        {/* Manage Agents button */}
        <div className="px-3 pb-2">
          <button
            onClick={onManageAgents}
            className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <Bot size={14} />
            Manage Agents
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
                agents={agents}
                onClick={() => onSelect(conv.id)}
                onDelete={() => {
                  setDeleteTarget(conv.id);
                  setDeleteError(null);
                }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="truncate text-xs text-muted">{user?.email}</span>
            <button
              onClick={logout}
              className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
              aria-label="Log out"
            >
              <LogOut size={14} />
            </button>
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

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/components/conversation-item.tsx packages/web-client/src/components/sidebar.tsx
git commit -m "feat: add agent avatars to sidebar and manage agents button"
```

---

## Task 11: Update useChat to remove hardcoded agent and accept agentId

**Files:**
- Modify: `packages/web-client/src/hooks/use-chat.ts`

- [ ] **Step 1: Update useChat hook**

Replace the full content of `packages/web-client/src/hooks/use-chat.ts`:

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

const LAST_AGENT_KEY = "lastAgentId";

function getLastAgentId(): string | null {
  return localStorage.getItem(LAST_AGENT_KEY);
}

function setLastAgentId(id: string): void {
  localStorage.setItem(LAST_AGENT_KEY, id);
}

export function useChat(defaultAgentId: string | null) {
  const [state, setState] = useState<ChatState>({
    conversationId: null,
    messages: [],
    conversations: [],
    isStreaming: false,
    isConnecting: true,
    error: null,
  });

  const resolveAgentId = useCallback((): string | null => {
    return getLastAgentId() || defaultAgentId;
  }, [defaultAgentId]);

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
        const agentId = resolveAgentId();
        if (!agentId) {
          setState((s) => ({ ...s, conversations: [], isConnecting: false }));
          return;
        }
        const res = await createConversation(agentId);
        setLastAgentId(agentId);
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
  }, [resolveAgentId]);

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
        const agentId = resolveAgentId();
        if (!agentId) return;
        try {
          const res = await createConversation(agentId);
          setLastAgentId(agentId);
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
  }, [state.conversationId, state.conversations, state.isConnecting, selectConversation, resolveAgentId]);

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

  const startNewChat = useCallback(async (agentId?: string) => {
    const resolvedId = agentId || resolveAgentId();
    if (!resolvedId) return;

    setState((s) => ({
      ...s,
      messages: [],
      isConnecting: true,
      error: null,
      isStreaming: false,
    }));
    try {
      const res = await createConversation(resolvedId);
      setLastAgentId(resolvedId);
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
  }, [resolveAgentId]);

  const switchAgent = useCallback(
    async (agentId: string) => {
      // Delete empty current conversation, create new one with selected agent
      if (state.conversationId) {
        const hasUserMessages = state.messages.some((m) => m.role === "user");
        if (!hasUserMessages) {
          await apiDeleteConversation(state.conversationId);
        }
      }
      await startNewChat(agentId);
    },
    [state.conversationId, state.messages, startNewChat]
  );

  // Get the current conversation's agentId
  const currentAgentId =
    state.conversations.find((c) => c.id === state.conversationId)?.agentId ?? resolveAgentId() ?? "";

  return {
    state,
    currentAgentId,
    sendMessage,
    startNewChat,
    selectConversation,
    deleteConversation,
    switchAgent,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/hooks/use-chat.ts
git commit -m "feat: update useChat to support dynamic agent selection"
```

---

## Task 12: Wire everything together in App.tsx

**Files:**
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Update App.tsx to use useAgents and pass data through**

Replace the full content of `packages/web-client/src/App.tsx`:

```tsx
import { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthPage } from "./components/AuthPage";
import { useChat } from "./hooks/use-chat";
import { useAgents } from "./hooks/use-agents";
import { Sidebar } from "./components/sidebar";
import { ChatContainer } from "./components/chat-container";
import { AgentDrawer } from "./components/agent-drawer";

function AuthenticatedApp() {
  const { agents, createAgent, updateAgent, deleteAgent, loadAgents } = useAgents();
  const {
    state,
    currentAgentId,
    sendMessage,
    startNewChat,
    selectConversation,
    deleteConversation,
    switchAgent,
  } = useChat(agents[0]?.id ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-full">
      <Sidebar
        conversations={state.conversations}
        activeConversationId={state.conversationId}
        agents={agents}
        onSelect={selectConversation}
        onNewChat={() => startNewChat()}
        onDelete={deleteConversation}
        onManageAgents={() => setDrawerOpen(true)}
      />
      <ChatContainer
        conversationId={state.conversationId}
        messages={state.messages}
        isStreaming={state.isStreaming}
        isConnecting={state.isConnecting}
        error={state.error}
        agents={agents}
        currentAgentId={currentAgentId}
        onAgentChange={switchAgent}
        onSend={sendMessage}
        onRetry={() => startNewChat()}
      />
      {drawerOpen && (
        <AgentDrawer
          agents={agents}
          onClose={() => setDrawerOpen(false)}
          onCreate={createAgent}
          onUpdate={updateAgent}
          onDelete={deleteAgent}
          onAgentSaved={loadAgents}
        />
      )}
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Run all tests**

Run: `pnpm --filter @new-workshop/agent-service test -- --run && pnpm --filter @new-workshop/web-client test -- --run`
Expected: All tests pass.

- [ ] **Step 3: Restart services and verify manually**

```bash
pnpm restart
```

Wait a few seconds, then:
```bash
curl -s http://localhost:3000/agents | jq .
```
Expected: JSON array with one agent (support-bot) including avatar field.

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```
Expected: 200.

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/src/App.tsx
git commit -m "feat: wire up multi-agent support in App component"
```

---

## Task 13: Final integration test

**Files:** None (manual verification)

- [ ] **Step 1: Open the app and verify agent selector**

Open `http://localhost:5173` in the browser. Verify:
- Chat header shows "Support Bot" with emoji avatar instead of hardcoded "S"
- A "Change" badge is visible before any messages are sent
- Clicking "Change" opens a dropdown listing available agents

- [ ] **Step 2: Verify agent management drawer**

Click "Manage Agents" in the sidebar. Verify:
- Drawer slides in from the right
- Support Bot is listed with avatar, name, and model
- Edit button opens pre-filled form
- "+ New Agent" button opens empty form

- [ ] **Step 3: Create a test agent**

In the drawer, click "+ New Agent" and create an agent:
- Name: "Code Helper"
- System Prompt: "You are a helpful coding assistant."
- Pick a different emoji and color
- Save

Verify: New agent appears in the drawer list and the file `agents/code-helper.md` exists.

- [ ] **Step 4: Start a conversation with the new agent**

Click "New Chat" in sidebar. Use the agent selector dropdown to switch to "Code Helper". Send a message. Verify:
- Agent selector locks after first message
- Response comes from Claude using the new agent's system prompt
- Sidebar shows the conversation with the new agent's avatar

- [ ] **Step 5: Commit final state**

```bash
git add -A
git status
```

If there are any unstaged changes from the testing (like the new `agents/code-helper.md`), decide whether to include or gitignore test agents. The test agent file can be deleted manually.
