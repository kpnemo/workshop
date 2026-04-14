# Conversation Summary Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time, per-conversation summary panel driven by an agent tool, with SSE delivery, manual refresh, and per-conversation enable/disable.

**Architecture:** Agent calls `update_summary` tool during responses → backend persists to DB → SSE `event: summary` pushes to frontend → sticky panel renders at top of chat. Manual refresh via dedicated endpoint using Claude Haiku. Toggle fully enables/disables the tool per conversation.

**Tech Stack:** TypeScript, Express, SQLite (better-sqlite3), Anthropic SDK, React 19, Tailwind CSS, Vitest

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `packages/agent-service/src/services/tools/update-summary.ts` | Tool definition and execute function |
| `packages/agent-service/src/__tests__/update-summary.test.ts` | Tests for the tool |
| `packages/web-client/src/components/summary-panel.tsx` | Sticky summary display + refresh button |
| `packages/web-client/src/components/summary-toggle.tsx` | Enable/disable toggle in chat header |

### Modified files
| File | Changes |
|------|---------|
| `packages/agent-service/src/types.ts` | Add `summaryInstruction` to `AgentConfig`, `summary`+`summaryEnabled` to `Conversation`+`ConversationSummary` |
| `packages/agent-service/src/services/database.ts` | Migration for 2 columns, `setSummary()`, `setSummaryEnabled()`, update `getConversation`+`listConversations` queries |
| `packages/agent-service/src/__tests__/database.test.ts` | Tests for new DB methods |
| `packages/agent-service/src/services/agent-loader.ts` | Parse `summaryInstruction` from frontmatter |
| `packages/agent-service/src/__tests__/agent-loader.test.ts` | Test parsing `summaryInstruction` |
| `packages/agent-service/src/services/tool-service.ts` | Register `update_summary`, conditional injection |
| `packages/agent-service/src/routes/conversations.ts` | SSE `summary` event after tool exec, `PATCH /:id`, `POST /:id/summary`, system prompt injection, update `GET /:id` and `GET /` responses |
| `packages/web-client/src/types.ts` | Add summary fields to `ChatState`, `ConversationDetail`, `ConversationSummary`, `DebugEvent`, `SendMessageCallbacks` |
| `packages/web-client/src/lib/api.ts` | SSE parser for `summary` event, `refreshSummary()`, `toggleSummary()` |
| `packages/web-client/src/hooks/use-chat.ts` | Summary state, `setSummaryEnabled`, `refreshSummary`, load from conversation detail |
| `packages/web-client/src/components/chat-container.tsx` | Wire `SummaryPanel` + `SummaryToggle` |
| `packages/web-client/src/components/debug-panel.tsx` | Render `summary` and `summary-refresh` event types |
| `packages/web-client/src/App.tsx` | Pass summary props from `useChat` to `ChatContainer` |

---

### Task 1: Backend Types

**Files:**
- Modify: `packages/agent-service/src/types.ts:12-23` (AgentConfig)
- Modify: `packages/agent-service/src/types.ts:41-49` (Conversation)
- Modify: `packages/agent-service/src/types.ts:51-57` (ConversationSummary)

- [ ] **Step 1: Add `summaryInstruction` to `AgentConfig`**

In `packages/agent-service/src/types.ts`, add `summaryInstruction` to the `AgentConfig` interface:

```typescript
export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  avatar: Avatar;
  topicBoundaries?: TopicBoundaries;
  tools?: string[];
  delegates?: string[];
  summaryInstruction?: string;
}
```

- [ ] **Step 2: Add summary fields to `Conversation`**

```typescript
export interface Conversation {
  id: string;
  agentId: string;
  activeAgent: string | null;
  title: string | null;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  summary: string | null;
  summaryEnabled: boolean;
}
```

- [ ] **Step 3: Add `summaryEnabled` to `ConversationSummary`**

```typescript
export interface ConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  updatedAt: Date;
  messageCount: number;
  summaryEnabled: boolean;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/agent-service/src/types.ts
git commit -m "feat: add summary fields to backend types"
```

---

### Task 2: Database Migration and Methods

**Files:**
- Modify: `packages/agent-service/src/services/database.ts:173-196` (migrate)
- Modify: `packages/agent-service/src/services/database.ts:66-91` (getConversation)
- Modify: `packages/agent-service/src/services/database.ts:94-102` (listConversations)
- Modify: `packages/agent-service/src/services/database.ts:58-63` (createConversation)
- Test: `packages/agent-service/src/__tests__/database.test.ts`

- [ ] **Step 1: Write failing tests for `setSummary` and `setSummaryEnabled`**

Add to `packages/agent-service/src/__tests__/database.test.ts`:

```typescript
describe("Summary support", () => {
  it("setSummary stores and getConversation returns it", () => {
    db.createUser("u-1", "s1@example.com", "pw");
    db.createConversation("conv-s1", "support-bot", "u-1");
    db.setSummary("conv-s1", "User asked about billing.");

    const conv = db.getConversation("conv-s1")!;
    expect(conv.summary).toBe("User asked about billing.");
  });

  it("summary defaults to null on new conversation", () => {
    db.createUser("u-1", "s2@example.com", "pw");
    db.createConversation("conv-s2", "support-bot", "u-1");

    const conv = db.getConversation("conv-s2")!;
    expect(conv.summary).toBeNull();
    expect(conv.summaryEnabled).toBe(false);
  });

  it("setSummaryEnabled toggles the flag", () => {
    db.createUser("u-1", "s3@example.com", "pw");
    db.createConversation("conv-s3", "support-bot", "u-1");

    db.setSummaryEnabled("conv-s3", true);
    expect(db.getConversation("conv-s3")!.summaryEnabled).toBe(true);

    db.setSummaryEnabled("conv-s3", false);
    expect(db.getConversation("conv-s3")!.summaryEnabled).toBe(false);
  });

  it("listConversations includes summaryEnabled", () => {
    db.createUser("u-1", "s4@example.com", "pw");
    db.createConversation("conv-s4", "support-bot", "u-1");
    db.setSummaryEnabled("conv-s4", true);

    const list = db.listConversations("u-1");
    expect(list[0].summaryEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test -- --run src/__tests__/database.test.ts`

Expected: FAIL — `setSummary` and `setSummaryEnabled` are not defined, `summary`/`summaryEnabled` not returned.

- [ ] **Step 3: Add migration for `summary` and `summary_enabled` columns**

In `packages/agent-service/src/services/database.ts`, at the end of the `migrate()` method (after the `delegation_meta` migration around line 195), add:

```typescript
const convCols2 = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
if (!convCols2.some((c) => c.name === "summary")) {
  this.db.exec("ALTER TABLE conversations ADD COLUMN summary TEXT");
  console.log("[database] Migration: added summary column to conversations");
}
if (!convCols2.some((c) => c.name === "summary_enabled")) {
  this.db.exec("ALTER TABLE conversations ADD COLUMN summary_enabled INTEGER DEFAULT 0");
  console.log("[database] Migration: added summary_enabled column to conversations");
}
```

- [ ] **Step 4: Add `setSummary` and `setSummaryEnabled` methods**

Add after the `setTitle` method (around line 155):

```typescript
setSummary(id: string, summary: string): void {
  this.db.prepare("UPDATE conversations SET summary = ? WHERE id = ?").run(summary, id);
}

setSummaryEnabled(id: string, enabled: boolean): void {
  this.db.prepare("UPDATE conversations SET summary_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}
```

- [ ] **Step 5: Update `getConversation` to return summary fields**

Change the SELECT in `getConversation` (line 68) to include `summary` and `summary_enabled`:

```typescript
const row = this.db
  .prepare("SELECT id, agent_id, active_agent, title, created_at, updated_at, summary, summary_enabled FROM conversations WHERE id = ?")
  .get(id) as { id: string; agent_id: string; active_agent: string | null; title: string | null; created_at: string; updated_at: string; summary: string | null; summary_enabled: number } | undefined;
```

And in the return object (around line 77), add the two fields:

```typescript
return {
  id: row.id,
  agentId: row.agent_id,
  activeAgent: row.active_agent ?? null,
  title: row.title,
  messages: messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
    timestamp: new Date(m.created_at),
    agentId: m.agent_id ?? null,
    delegationMeta: m.delegation_meta ? JSON.parse(m.delegation_meta) : null,
  })),
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
  summary: row.summary ?? null,
  summaryEnabled: row.summary_enabled === 1,
};
```

- [ ] **Step 6: Update `createConversation` return to include summary fields**

In `createConversation` (line 63), add to the return object:

```typescript
return { id, agentId, activeAgent: null, title: null, messages: [], createdAt: new Date(now), updatedAt: new Date(now), summary: null, summaryEnabled: false };
```

- [ ] **Step 7: Update `listConversations` to include `summaryEnabled`**

Change the SELECT in `listConversations` (line 95-100) to include `summary_enabled`:

```typescript
const rows = this.db.prepare(`
  SELECT c.id, c.agent_id, c.title, c.updated_at, c.summary_enabled, COUNT(m.id) as message_count
  FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
  WHERE c.user_id = ?
  GROUP BY c.id ORDER BY c.updated_at DESC
`).all(userId) as Array<{ id: string; agent_id: string; title: string | null; updated_at: string; summary_enabled: number; message_count: number }>;
return rows.map((r) => ({ id: r.id, agentId: r.agent_id, title: r.title, updatedAt: new Date(r.updated_at), messageCount: r.message_count, summaryEnabled: r.summary_enabled === 1 }));
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test -- --run src/__tests__/database.test.ts`

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add packages/agent-service/src/services/database.ts packages/agent-service/src/__tests__/database.test.ts
git commit -m "feat: add summary columns, migration, and DB methods"
```

---

### Task 3: Agent Loader — Parse `summaryInstruction`

**Files:**
- Modify: `packages/agent-service/src/services/agent-loader.ts:33-47`
- Test: `packages/agent-service/src/__tests__/agent-loader.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/agent-service/src/__tests__/agent-loader.test.ts` (inside the existing describe block for `loadAgents`):

```typescript
it("parses summaryInstruction from frontmatter", () => {
  const md = `---
name: Test Agent
model: claude-sonnet-4-20250514
summaryInstruction: "Focus on action items and decisions."
---
You are a test agent.`;
  fs.writeFileSync(path.join(agentsDir, "test-summary.md"), md);

  const agents = loadAgents(agentsDir);
  const agent = agents.get("test-summary");
  expect(agent).toBeDefined();
  expect(agent!.summaryInstruction).toBe("Focus on action items and decisions.");
});

it("summaryInstruction is undefined when not in frontmatter", () => {
  const md = `---
name: Plain Agent
model: claude-sonnet-4-20250514
---
You are a plain agent.`;
  fs.writeFileSync(path.join(agentsDir, "test-plain.md"), md);

  const agents = loadAgents(agentsDir);
  const agent = agents.get("test-plain");
  expect(agent).toBeDefined();
  expect(agent!.summaryInstruction).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test -- --run src/__tests__/agent-loader.test.ts`

Expected: FAIL — `summaryInstruction` not present on loaded config.

- [ ] **Step 3: Parse `summaryInstruction` in agent-loader**

In `packages/agent-service/src/services/agent-loader.ts`, add `summaryInstruction` to the config object (around line 47, before the closing of the config object):

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
  tools: data.tools,
  delegates: data.delegates,
  summaryInstruction: data.summaryInstruction,
};
```

Also add it to the `saveAgent` function's frontMatter object (around line 73, before `const fileContent`):

```typescript
if (config.summaryInstruction) {
  frontMatter.summaryInstruction = config.summaryInstruction;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test -- --run src/__tests__/agent-loader.test.ts`

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/agent-loader.ts packages/agent-service/src/__tests__/agent-loader.test.ts
git commit -m "feat: parse summaryInstruction from agent frontmatter"
```

---

### Task 4: `update_summary` Tool

**Files:**
- Create: `packages/agent-service/src/services/tools/update-summary.ts`
- Create: `packages/agent-service/src/__tests__/update-summary.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/agent-service/src/__tests__/update-summary.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createUpdateSummaryTool } from "../services/tools/update-summary.js";
import { Database } from "../services/database.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("update_summary tool", () => {
  let db: Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-summary-tool-${Date.now()}.db`);
    db = new Database(dbPath);
    db.createUser("u-1", "test@example.com", "pw");
    db.createConversation("conv-1", "support-bot", "u-1");
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("has correct tool definition", () => {
    const tool = createUpdateSummaryTool();
    expect(tool.name).toBe("update_summary");
    expect(tool.definition.name).toBe("update_summary");
    expect(tool.definition.input_schema.required).toContain("summary");
  });

  it("writes summary to DB and returns success", async () => {
    const tool = createUpdateSummaryTool();
    const result = await tool.execute(
      { summary: "User asked about billing." },
      { conversationId: "conv-1", db } as any
    );

    expect(result).toContain("success");
    const conv = db.getConversation("conv-1")!;
    expect(conv.summary).toBe("User asked about billing.");
  });

  it("returns error when summary is missing", async () => {
    const tool = createUpdateSummaryTool();
    const result = await tool.execute({}, { conversationId: "conv-1", db } as any);
    expect(result).toContain("Error");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test -- --run src/__tests__/update-summary.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool**

Create `packages/agent-service/src/services/tools/update-summary.ts`:

```typescript
import type { Tool } from "./types.js";

export function createUpdateSummaryTool(): Tool {
  return {
    name: "update_summary",
    definition: {
      name: "update_summary",
      description:
        "Update the conversation summary. Call this after meaningful exchanges to maintain a running TL;DR.",
      input_schema: {
        type: "object" as const,
        properties: {
          summary: {
            type: "string",
            description: "A brief 2-3 sentence summary of the conversation so far.",
          },
        },
        required: ["summary"],
      },
    },
    async execute(input: unknown, context): Promise<string> {
      const { summary } = (input ?? {}) as { summary?: string };

      if (!summary || typeof summary !== "string") {
        return "Error: A valid summary string is required.";
      }

      if (!context?.db || !context?.conversationId) {
        return "Error: Missing context.";
      }

      context.db.setSummary(context.conversationId, summary);
      return JSON.stringify({ success: true, summary });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test -- --run src/__tests__/update-summary.test.ts`

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/tools/update-summary.ts packages/agent-service/src/__tests__/update-summary.test.ts
git commit -m "feat: create update_summary tool"
```

---

### Task 5: Register Tool and Wire SSE + Endpoints

**Files:**
- Modify: `packages/agent-service/src/services/tool-service.ts:36-41` (registerDefaults)
- Modify: `packages/agent-service/src/services/tool-service.ts:43-70` (getToolsForAgent)
- Modify: `packages/agent-service/src/routes/conversations.ts`

- [ ] **Step 1: Register `update_summary` in ToolService**

In `packages/agent-service/src/services/tool-service.ts`, add the import at the top:

```typescript
import { createUpdateSummaryTool } from "./tools/update-summary.js";
```

Add to `registerDefaults()` method:

```typescript
registerDefaults(): void {
  this.register(createBrowseUrlTool(this.browserManager));
  this.register(createAssignAgentTool());
  this.register(createSearchFilesTool());
  this.register(createReadUserFileTool());
  this.register(createUpdateSummaryTool());
}
```

- [ ] **Step 2: Add conditional `update_summary` injection in `getToolsForAgent`**

The `update_summary` tool must only be included when `summaryEnabled` is true. Since `getToolsForAgent` receives `AgentConfig` (which doesn't have `summaryEnabled` — that's per-conversation), we need to pass it via `DelegationOptions`. Update the interface and method:

In `packages/agent-service/src/services/tool-service.ts`, update `DelegationOptions`:

```typescript
export interface DelegationOptions {
  isMainAgent?: boolean;
  isActiveDelegate?: boolean;
  summaryEnabled?: boolean;
}
```

Then in `getToolsForAgent`, add this block after the existing tool loop and before the delegation tool logic (around line 57):

```typescript
// Conditionally include update_summary when summary is enabled for this conversation
if (delegationOptions?.summaryEnabled) {
  const summaryTool = this.tools.get("update_summary");
  if (summaryTool && !definitions.some((d) => d.name === "update_summary")) {
    definitions.push(summaryTool.definition);
  }
}
```

- [ ] **Step 3: Pass `summaryEnabled` from conversations route**

In `packages/agent-service/src/routes/conversations.ts`, in the message handler (around line 245-246), update the tool fetching to pass `summaryEnabled`:

```typescript
const delegationOptions = { isMainAgent: curIsMain, isActiveDelegate: curIsDelegate, summaryEnabled: currentConv.summaryEnabled };
const tools = toolService ? toolService.getToolsForAgent(curAgent, delegationOptions) : [];
```

- [ ] **Step 4: Inject summary instruction into system prompt**

In `packages/agent-service/src/routes/conversations.ts`, after the existing system prompt building (around line 243, after the delegation system prompt block), add the summary instruction when enabled:

```typescript
if (currentConv.summaryEnabled) {
  const summaryInstruction = curAgent.summaryInstruction
    ?? "Provide a brief 2-3 sentence summary of this conversation so far, capturing the main topic and any key outcomes.";
  systemPrompt += `\n\n[Summary]\nYou have an update_summary tool. Use it to maintain a running TL;DR of this conversation. Call it after meaningful exchanges. Follow this instruction: ${summaryInstruction}`;
}
```

- [ ] **Step 5: Emit SSE `summary` event after `update_summary` tool execution**

In `packages/agent-service/src/routes/conversations.ts`, inside the tool execution loop (around line 367, after the debug tool block), add:

```typescript
// Emit summary SSE event when update_summary tool is called
if (toolUse.name === "update_summary") {
  const parsedResult = (() => { try { return JSON.parse(result); } catch { return null; } })();
  if (parsedResult?.success) {
    writeSSE(res, "summary", { summary: parsedResult.summary });
  }
  if (debug) {
    writeSSE(res, "debug_summary", { summary: parsedResult?.summary ?? result });
  }
}
```

- [ ] **Step 6: Add `POST /:id/summary` endpoint for manual refresh**

In `packages/agent-service/src/routes/conversations.ts`, add before the `PATCH /:id` route (before the `GET /:id` handler):

```typescript
// POST /conversations/:id/summary - Manual summary refresh
router.post("/:id/summary", async (req: Request, res: Response) => {
  if (!verifyOwnership(req.params.id, req.userId!)) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const conversation = db.getConversation(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (conversation.messages.length === 0) {
    res.json({ summary: null });
    return;
  }

  const agent = agents.get(conversation.agentId);
  const summaryInstruction = agent?.summaryInstruction
    ?? "Provide a brief 2-3 sentence summary of this conversation so far, capturing the main topic and any key outcomes.";

  const conversationText = conversation.messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `${summaryInstruction}\n\nConversation:\n${conversationText}`,
        },
      ],
    });

    const summary = response.content[0].type === "text" ? response.content[0].text.trim() : null;
    if (summary) {
      db.setSummary(conversation.id, summary);
    }
    res.json({ summary });
  } catch (err) {
    console.error("[summary] Manual refresh failed:", err);
    res.status(500).json({ error: "Summary generation failed" });
  }
});
```

- [ ] **Step 7: Add `PATCH /:id` endpoint for toggling summary**

Add after the `POST /:id/summary` route:

```typescript
// PATCH /conversations/:id - Update conversation settings
router.patch("/:id", (req: Request, res: Response) => {
  if (!verifyOwnership(req.params.id, req.userId!)) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const { summaryEnabled } = req.body;
  if (typeof summaryEnabled === "boolean") {
    db.setSummaryEnabled(req.params.id, summaryEnabled);
  }

  const conversation = db.getConversation(req.params.id)!;
  res.json({
    conversationId: conversation.id,
    agentId: conversation.agentId,
    title: conversation.title,
    summary: conversation.summary,
    summaryEnabled: conversation.summaryEnabled,
  });
});
```

- [ ] **Step 8: Update `GET /:id` response to include summary fields**

In `packages/agent-service/src/routes/conversations.ts`, in the `GET /:id` handler (around line 481-494), add `summary` and `summaryEnabled` to the response:

```typescript
res.json({
  conversationId: conversation.id,
  agentId: conversation.agentId,
  activeAgent: conversation.activeAgent,
  title: conversation.title,
  createdAt: conversation.createdAt.toISOString(),
  summary: conversation.summary,
  summaryEnabled: conversation.summaryEnabled,
  messages: conversation.messages.map((m) => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
    agentId: m.agentId ?? null,
    delegationMeta: m.delegationMeta ?? null,
  })),
});
```

- [ ] **Step 9: Update `GET /` list response to include `summaryEnabled`**

In the `GET /` handler (around line 47-55), add `summaryEnabled`:

```typescript
res.json(
  conversations.map((c) => ({
    id: c.id,
    agentId: c.agentId,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
    messageCount: c.messageCount,
    summaryEnabled: c.summaryEnabled,
  }))
);
```

- [ ] **Step 10: Run all backend tests**

Run: `pnpm --filter @new-workshop/agent-service test -- --run`

Expected: ALL PASS

- [ ] **Step 11: Commit**

```bash
git add packages/agent-service/src/services/tool-service.ts packages/agent-service/src/routes/conversations.ts
git commit -m "feat: register update_summary tool, add SSE event, PATCH and POST summary endpoints"
```

---

### Task 6: Frontend Types

**Files:**
- Modify: `packages/web-client/src/types.ts`

- [ ] **Step 1: Add `summary` event type to `DebugEvent`**

In `packages/web-client/src/types.ts`, update the `type` union in `DebugEvent` (line 14):

```typescript
export interface DebugEvent {
  id: string;
  timestamp: Date;
  type: 'agent' | 'thinking' | 'tool' | 'stream' | 'delegation' | 'assignment' | 'summary';
  data: Record<string, unknown>;
  turn?: string;
}
```

- [ ] **Step 2: Add `onSummary` and `onDebugSummary` to `SendMessageCallbacks`**

Add after `onDebugStream` (around line 78):

```typescript
onSummary?: (data: { summary: string }) => void;
onDebugSummary?: (data: { summary: string }) => void;
```

- [ ] **Step 3: Add summary fields to `ConversationDetail`**

```typescript
export interface ConversationDetail {
  conversationId: string;
  agentId: string;
  activeAgent?: string | null;
  title: string | null;
  createdAt: string;
  summary: string | null;
  summaryEnabled: boolean;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
    agentId?: string | null;
    delegationMeta?: DelegationMeta | null;
  }>;
}
```

- [ ] **Step 4: Add summary fields to `ChatState`**

```typescript
export interface ChatState {
  conversationId: string | null;
  messages: Message[];
  conversations: ConversationSummary[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
  summary: string | null;
  summaryEnabled: boolean;
}
```

- [ ] **Step 5: Add `summaryEnabled` to `ConversationSummary`**

```typescript
export interface ConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
  summaryEnabled: boolean;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/src/types.ts
git commit -m "feat: add summary fields to frontend types"
```

---

### Task 7: Frontend API Functions

**Files:**
- Modify: `packages/web-client/src/lib/api.ts`

- [ ] **Step 1: Add `summary` and `debug_summary` SSE event handling**

In `packages/web-client/src/lib/api.ts`, in the `sendMessage` function's switch statement (around line 158-195), add cases before `case "done"`:

```typescript
case "summary":
  callbacks.onSummary?.(data);
  break;
case "debug_summary":
  callbacks.onDebugSummary?.(data);
  break;
```

- [ ] **Step 2: Add `refreshSummary` function**

Add after the `getConversation` function (around line 216):

```typescript
export async function refreshSummary(conversationId: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to refresh summary");
  }

  const data = await res.json();
  return data.summary;
}
```

- [ ] **Step 3: Add `toggleSummary` function**

Add after `refreshSummary`:

```typescript
export async function toggleSummary(conversationId: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ summaryEnabled: enabled }),
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to toggle summary");
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/src/lib/api.ts
git commit -m "feat: add SSE summary handler, refreshSummary, toggleSummary API functions"
```

---

### Task 8: `useChat` Hook — Summary State

**Files:**
- Modify: `packages/web-client/src/hooks/use-chat.ts`

- [ ] **Step 1: Add imports**

Add to imports at the top of `packages/web-client/src/hooks/use-chat.ts`:

```typescript
import {
  listConversations,
  createConversation,
  deleteConversation as apiDeleteConversation,
  getConversation,
  sendMessage as apiSendMessage,
  refreshSummary as apiRefreshSummary,
  toggleSummary as apiToggleSummary,
} from "../lib/api";
```

- [ ] **Step 2: Update initial state**

Update the `useState<ChatState>` initial value (around line 28) to include summary fields:

```typescript
const [state, setState] = useState<ChatState>({
  conversationId: null,
  messages: [],
  conversations: [],
  isStreaming: false,
  isConnecting: true,
  error: null,
  summary: null,
  summaryEnabled: false,
});
```

- [ ] **Step 3: Load summary from conversation detail**

In `loadConversations` (around line 77), when setting state from the detail, add summary fields:

```typescript
setState((s) => ({
  ...s,
  conversations,
  conversationId: mostRecent.id,
  messages,
  isConnecting: false,
  summary: detail.summary ?? null,
  summaryEnabled: detail.summaryEnabled ?? false,
}));
```

In `selectConversation` (around line 130-136), add the same:

```typescript
setState((s) => ({
  ...s,
  conversationId: id,
  messages,
  isConnecting: false,
  summary: detail.summary ?? null,
  summaryEnabled: detail.summaryEnabled ?? false,
}));
```

- [ ] **Step 4: Handle `onSummary` callback in `sendMessage`**

In the `apiSendMessage` callbacks object (around line 220), add `onSummary` and `onDebugSummary`:

```typescript
onSummary: (data) => {
  setState((s) => ({ ...s, summary: data.summary }));
},
onDebugSummary: (data) => {
  debug?.addEvent({ type: "summary", data });
},
```

- [ ] **Step 5: Add `setSummaryEnabled` and `refreshSummary` callbacks**

Add after the `switchAgent` callback (around line 415):

```typescript
const setSummaryEnabled = useCallback(
  async (enabled: boolean) => {
    if (!state.conversationId) return;
    setState((s) => ({ ...s, summaryEnabled: enabled }));
    await apiToggleSummary(state.conversationId, enabled);
  },
  [state.conversationId]
);

const refreshSummary = useCallback(async () => {
  if (!state.conversationId) return;
  const summary = await apiRefreshSummary(state.conversationId);
  setState((s) => ({ ...s, summary }));
  debug?.addEvent({ type: "summary", data: { summary, source: "manual-refresh" } });
}, [state.conversationId, debug]);
```

- [ ] **Step 6: Reset summary state on new chat**

In `startNewChat` (around line 384), add summary reset:

```typescript
setState((s) => ({ ...s, messages: [], isConnecting: true, error: null, isStreaming: false, summary: null, summaryEnabled: false }));
```

- [ ] **Step 7: Expose new functions in return**

Update the return object (around line 420-428):

```typescript
return {
  state,
  currentAgentId,
  sendMessage,
  startNewChat,
  selectConversation,
  deleteConversation,
  switchAgent,
  setSummaryEnabled,
  refreshSummary,
};
```

- [ ] **Step 8: Commit**

```bash
git add packages/web-client/src/hooks/use-chat.ts
git commit -m "feat: add summary state management to useChat hook"
```

---

### Task 9: `SummaryToggle` Component

**Files:**
- Create: `packages/web-client/src/components/summary-toggle.tsx`

- [ ] **Step 1: Create the component**

Create `packages/web-client/src/components/summary-toggle.tsx`:

```tsx
interface SummaryToggleProps {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

export function SummaryToggle({ enabled, disabled, onToggle }: SummaryToggleProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
        enabled
          ? "bg-blue-500 text-white"
          : "border border-border bg-secondary text-muted-foreground hover:text-foreground"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      title={enabled ? "Summary ON — click to disable" : "Summary OFF — click to enable"}
    >
      <span
        className={`h-2 w-2 rounded-full ${enabled ? "bg-white" : "bg-muted-foreground"}`}
      />
      SUMMARY
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/components/summary-toggle.tsx
git commit -m "feat: create SummaryToggle component"
```

---

### Task 10: `SummaryPanel` Component

**Files:**
- Create: `packages/web-client/src/components/summary-panel.tsx`

- [ ] **Step 1: Create the component**

Create `packages/web-client/src/components/summary-panel.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";

interface SummaryPanelProps {
  summary: string | null;
  onRefresh: () => Promise<void>;
  isStreaming: boolean;
}

export function SummaryPanel({ summary, onRefresh, isStreaming }: SummaryPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [prevSummary, setPrevSummary] = useState(summary);
  const [animating, setAnimating] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>();

  // Detect summary changes for fade-in animation
  useEffect(() => {
    if (summary !== prevSummary) {
      setAnimating(true);
      setPrevSummary(summary);
      const timer = setTimeout(() => setAnimating(false), 500);
      return () => clearTimeout(timer);
    }
  }, [summary, prevSummary]);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    };
  }, []);

  const handleRefresh = async () => {
    if (isRefreshing || cooldown) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setCooldown(true);
      cooldownTimer.current = setTimeout(() => setCooldown(false), 5000);
    }
  };

  return (
    <div className="sticky top-0 z-10 border-b border-blue-500/20 bg-[#0c1425] px-4 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-blue-400 text-xs font-semibold shrink-0">SUMMARY</span>
          <span
            className={`text-sm text-muted-foreground leading-snug transition-opacity duration-500 ${
              animating ? "opacity-0" : "opacity-100"
            }`}
          >
            {summary ?? "No summary yet"}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || cooldown || isStreaming}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          title={cooldown ? "Please wait before refreshing again" : "Refresh summary"}
        >
          <svg
            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/components/summary-panel.tsx
git commit -m "feat: create SummaryPanel component with sticky header and refresh"
```

---

### Task 11: Wire Components into `ChatContainer` and `App`

**Files:**
- Modify: `packages/web-client/src/components/chat-container.tsx`
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Update `ChatContainerProps` and add imports**

In `packages/web-client/src/components/chat-container.tsx`, add imports:

```typescript
import { SummaryPanel } from "./summary-panel";
import { SummaryToggle } from "./summary-toggle";
```

Add summary props to the interface:

```typescript
interface ChatContainerProps {
  conversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
  agents: AgentSummary[];
  currentAgentId: string;
  onAgentChange: (agentId: string) => void;
  onSend: (text: string, attachment?: FileInfo) => void;
  onRetry: () => void;
  isDebug: boolean;
  onDebugToggle: () => void;
  debugEvents: DebugEvent[];
  onDebugClear: () => void;
  summary: string | null;
  summaryEnabled: boolean;
  onSummaryToggle: () => void;
  onSummaryRefresh: () => Promise<void>;
}
```

- [ ] **Step 2: Destructure new props and render components**

Add `summary`, `summaryEnabled`, `onSummaryToggle`, `onSummaryRefresh` to the destructuring in the function signature.

In the header bar (around line 65-73), add `SummaryToggle` next to `DebugToggle`:

```tsx
<div className="flex items-center justify-between border-b border-border px-4 py-3">
  <AgentSelector
    agents={agents}
    currentAgentId={currentAgentId}
    locked={hasMessages}
    onSelect={onAgentChange}
  />
  <div className="flex items-center gap-2">
    <SummaryToggle
      enabled={summaryEnabled}
      disabled={isStreaming}
      onToggle={onSummaryToggle}
    />
    <DebugToggle isDebug={isDebug} onToggle={onDebugToggle} />
  </div>
</div>
```

Add `SummaryPanel` between the header and `MessageList` (only when `summaryEnabled` is true):

```tsx
{summaryEnabled && (
  <SummaryPanel
    summary={summary}
    onRefresh={onSummaryRefresh}
    isStreaming={isStreaming}
  />
)}

{/* Messages */}
<MessageList messages={messages} isStreaming={isStreaming} agents={agents} />
```

- [ ] **Step 3: Update `App.tsx` to pass summary props**

In `packages/web-client/src/App.tsx`, destructure `setSummaryEnabled` and `refreshSummary` from `useChat`:

```typescript
const {
  state,
  currentAgentId,
  sendMessage,
  startNewChat,
  selectConversation,
  deleteConversation,
  switchAgent,
  setSummaryEnabled,
  refreshSummary,
} = useChat(agents[0]?.id ?? null, agents.map((a) => a.id), debug);
```

Add summary props to the `ChatContainer` JSX:

```tsx
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
  isDebug={debug.isDebug}
  onDebugToggle={debug.toggleDebug}
  debugEvents={debug.debugEvents}
  onDebugClear={debug.clearEvents}
  summary={state.summary}
  summaryEnabled={state.summaryEnabled}
  onSummaryToggle={() => setSummaryEnabled(!state.summaryEnabled)}
  onSummaryRefresh={refreshSummary}
/>
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/src/components/chat-container.tsx packages/web-client/src/App.tsx
git commit -m "feat: wire SummaryPanel and SummaryToggle into ChatContainer and App"
```

---

### Task 12: Debug Panel — Summary Events

**Files:**
- Modify: `packages/web-client/src/components/debug-panel.tsx:13-19` (EVENT_STYLES)
- Modify: `packages/web-client/src/components/debug-panel.tsx:42-98` (EventEntry)

- [ ] **Step 1: Add summary event style**

In `packages/web-client/src/components/debug-panel.tsx`, add to `EVENT_STYLES` (around line 13-19):

```typescript
const EVENT_STYLES: Record<string, { color: string; label: string }> = {
  agent: { color: "text-blue-400", label: "AGENT" },
  thinking: { color: "text-purple-400", label: "THINKING" },
  tool: { color: "text-amber-400", label: "TOOL" },
  stream: { color: "text-green-400", label: "STREAM" },
  delegation: { color: "text-pink-400", label: "DELEGATE" },
  assignment: { color: "text-pink-400", label: "ASSIGN" },
  summary: { color: "text-cyan-400", label: "SUMMARY" },
};
```

- [ ] **Step 2: Add summary rendering in `EventEntry`**

In the `EventEntry` component, add a rendering block after the `assignment` block (around line 95):

```tsx
{event.type === "summary" && (
  <>
    <div className="text-muted-foreground/60 truncate">
      {data.source === "manual-refresh" ? "Manual refresh" : "Agent updated"}
    </div>
    <div className="text-muted-foreground mt-0.5 leading-relaxed">
      {String(data.summary ?? "")}
    </div>
  </>
)}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/components/debug-panel.tsx
git commit -m "feat: add summary event rendering to debug panel"
```

---

### Task 13: Run All Tests and Manual Verification

**Files:** None (verification only)

- [ ] **Step 1: Run backend tests**

Run: `pnpm --filter @new-workshop/agent-service test -- --run`

Expected: ALL PASS

- [ ] **Step 2: Run frontend tests**

Run: `pnpm --filter @new-workshop/web-client test -- --run`

Expected: ALL PASS

- [ ] **Step 3: Start the app and test manually**

Run: `pnpm start`

Manual test checklist:
1. Open a conversation — summary toggle should appear in the header (OFF by default)
2. Toggle summary ON — panel appears at top showing "No summary yet"
3. Send a message — if agent calls `update_summary`, panel should update in real-time via SSE
4. Scroll down through messages — panel stays sticky at the top
5. Click the refresh button — summary regenerates via Haiku, panel updates
6. Refresh button is disabled for 5 seconds after click
7. Toggle summary OFF — panel disappears
8. Toggle is disabled while agent is streaming
9. Enable debug mode + summary — debug panel shows SUMMARY events (cyan)
10. Reload page — summary and enabled state persist from DB

- [ ] **Step 4: Commit any fixes if needed**
