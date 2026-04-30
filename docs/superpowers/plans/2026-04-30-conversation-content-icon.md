# Conversation Content Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a small content-aware icon in the conversation sidebar that reflects each conversation's topic. The icon replaces the agent avatar inside the existing colored circle, regenerates after every non-router assistant turn via Haiku, and falls back to the agent avatar when missing or invalid.

**Architecture:** A new `icon` column on the `conversations` table stores a single prefixed string (`emoji:🔢` or `lucide:plane`). After the streaming assistant reply completes, the backend kicks off `generateIcon` concurrently with the existing title generation; both promises are awaited via `Promise.allSettled` before the `done` SSE event so both events fire reliably within the same HTTP turn. A new SSE `icon` event mirrors the existing `title` event end-to-end. The frontend renders via a new `<ConversationIcon>` component that swaps in the inner content of the existing `<AgentAvatar>` shape — same colored circle, swapped emoji/lucide content, with `<Suspense>` + `lazy(dynamicIconImports[name])` for code-split lucide rendering. A two-attempt retry wrapper covers transient and validation failures.

**Tech Stack:** TypeScript, Node 20, Express, Anthropic SDK (`@anthropic-ai/sdk`), better-sqlite3, React 19, Vite, Vitest, Tailwind, lucide-react (with `dynamicIconImports`).

**Spec:** `docs/superpowers/specs/2026-04-30-conversation-content-icon-design.md` (commit `ac1d6d9`).

**Note on spec wording vs. implementation:** The spec describes icon generation as "fire-and-forget after `done`" with a `res.writableEnded` guard. This plan implements it as `Promise.allSettled([titlePromise, iconPromise])` immediately before the existing `done` SSE event, which produces the same observable behavior (both events emit reliably before `done`, neither blocks the streaming reply) and is simpler to test deterministically. The `res.writableEnded` guard is preserved as a defensive check inside the SSE write helper for the rare error path where the response ends early.

---

## File Structure

**New files (5):**

- `packages/agent-service/src/services/icon-generator.ts` — `generateIcon` (Haiku call + retry) and `parseAndValidateIcon` (regex + lucide-name membership check).
- `packages/agent-service/src/__tests__/icon-generator.test.ts` — unit tests for parser and retry wrapper.
- `packages/agent-service/src/__tests__/conversation-icon-flow.test.ts` — integration tests for the end-to-end SSE flow with mocked Anthropic clients.
- `packages/web-client/src/components/conversation-icon.tsx` — render component with Suspense + dynamic lucide.
- `packages/web-client/src/__tests__/conversation-icon.test.tsx` — render-branch tests.

**Modified backend files (3):**

- `packages/agent-service/src/services/database.ts` — add `icon` column migration, `setIcon` method, include `icon` in `listConversations` SELECT and `getConversation` SELECT/mapping.
- `packages/agent-service/src/types.ts` — add `icon: string | null` to `Conversation` interface.
- `packages/agent-service/src/routes/conversations.ts` — concurrent icon generation, new SSE `icon` event, `icon` field in GET list and GET single payloads.

**Modified frontend files (4):**

- `packages/web-client/src/types.ts` — add `icon: string | null` to `ConversationSummary`, `onIcon?: (icon: string) => void` to `SendMessageCallbacks`.
- `packages/web-client/src/lib/api.ts` — `case "icon"` in SSE event switch.
- `packages/web-client/src/hooks/use-chat.ts` — `onIcon` handler mirroring `onTitle` (line 281).
- `packages/web-client/src/components/conversation-item.tsx` — swap `<AgentAvatar>` for `<ConversationIcon>`, add `pr-1` to title wrapper.

**Backend dependency added:** `lucide-react` (peer of frontend; needed in agent-service only for `dynamicIconImports` keys to validate lucide names). Adds ~50KB to backend node_modules but is tree-shakable; only the `dynamicIconImports` map is imported.

---

## Task 1: Backend data layer — schema, types, setter

**Files:**
- Modify: `packages/agent-service/src/types.ts`
- Modify: `packages/agent-service/src/services/database.ts`
- Test: `packages/agent-service/src/__tests__/database.test.ts` (existing file — append tests)

- [ ] **Step 1: Add `icon` to the `Conversation` type**

In `packages/agent-service/src/types.ts`, locate the `Conversation` interface (search for `export interface Conversation`). Add `icon: string | null;` immediately after the `summaryEnabled: boolean;` line:

```ts
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
  icon: string | null;
}
```

Also add `icon: string | null;` to the `ConversationSummary` interface in the same file (search for `export interface ConversationSummary`):

```ts
export interface ConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  updatedAt: Date;
  messageCount: number;
  summaryEnabled: boolean;
  icon: string | null;
}
```

- [ ] **Step 2: Write failing tests for schema, setter, and listing**

Append to `packages/agent-service/src/__tests__/database.test.ts`. If the file doesn't exist yet, look at sibling test files (e.g. `packages/agent-service/src/__tests__/routes.test.ts`) for the standard `describe`/`beforeEach` setup pattern (they create an in-memory DB via `new Database(":memory:")` plus a seeded user). Add this `describe` block at the bottom of the file:

```ts
describe("conversation icon column", () => {
  let db: Database;
  let userId: string;
  let convId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    userId = "u1";
    db.createUser(userId, "u1@test", "hash");
    const conv = db.createConversation("c1", "support-bot", userId);
    convId = conv.id;
  });

  it("starts with icon as null", () => {
    const conv = db.getConversation(convId)!;
    expect(conv.icon).toBeNull();
  });

  it("setIcon persists the value", () => {
    db.setIcon(convId, "emoji:🔢");
    const conv = db.getConversation(convId)!;
    expect(conv.icon).toBe("emoji:🔢");
  });

  it("setIcon overwrites existing value", () => {
    db.setIcon(convId, "emoji:🔢");
    db.setIcon(convId, "lucide:plane");
    const conv = db.getConversation(convId)!;
    expect(conv.icon).toBe("lucide:plane");
  });

  it("listConversations includes icon field", () => {
    db.setIcon(convId, "emoji:🐛");
    const list = db.listConversations(userId);
    expect(list).toHaveLength(1);
    expect(list[0].icon).toBe("emoji:🐛");
  });

  it("listConversations returns null icon for fresh conversations", () => {
    const list = db.listConversations(userId);
    expect(list[0].icon).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm --filter @new-workshop/agent-service test -- database.test
```

Expected: failures complaining `db.setIcon is not a function` and missing `icon` field on returned objects.

- [ ] **Step 4: Add `icon` column migration**

In `packages/agent-service/src/services/database.ts`, locate the `migrate()` method (around line 217). Append a new block at the end of the method, before the closing `}`:

```ts
const convCols3 = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
if (!convCols3.some((c) => c.name === "icon")) {
  this.db.exec("ALTER TABLE conversations ADD COLUMN icon TEXT");
  console.log("[database] Migration: added icon column to conversations");
}
```

Also update the `init()` method's `CREATE TABLE conversations` block (around line 25) so fresh DBs get the column directly. Change the `conversations` definition to include `icon TEXT`:

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  icon TEXT
);
```

- [ ] **Step 5: Add `setIcon` method**

In `database.ts`, locate `setTitle` (around line 188) and add immediately after it:

```ts
setIcon(id: string, icon: string): void {
  this.db
    .prepare("UPDATE conversations SET icon = ? WHERE id = ?")
    .run(icon, id);
}
```

- [ ] **Step 6: Include `icon` in `getConversation`**

Locate `getConversation` (line 100). Update the SELECT and the row destructuring + return:

```ts
getConversation(id: string): Conversation | undefined {
  const row = this.db
    .prepare("SELECT id, agent_id, active_agent, title, created_at, updated_at, summary, summary_enabled, icon FROM conversations WHERE id = ?")
    .get(id) as { id: string; agent_id: string; active_agent: string | null; title: string | null; created_at: string; updated_at: string; summary: string | null; summary_enabled: number; icon: string | null } | undefined;

  if (!row) return undefined;

  const messages = this.db
    .prepare("SELECT role, content, created_at, agent_id, delegation_meta FROM messages WHERE conversation_id = ? ORDER BY id ASC")
    .all(id) as Array<{ role: string; content: string; created_at: string; agent_id: string | null; delegation_meta: string | null }>;

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
    icon: row.icon ?? null,
  };
}
```

Also update `createConversation`'s return value (line 97) to include `icon: null`:

```ts
return { id, agentId, activeAgent: null, title: null, messages: [], createdAt: new Date(now), updatedAt: new Date(now), summary: null, summaryEnabled: false, icon: null };
```

- [ ] **Step 7: Include `icon` in `listConversations`**

Locate `listConversations` (line 130). Update the SELECT, the row type, and the mapping:

```ts
listConversations(userId: string): ConversationSummary[] {
  const rows = this.db.prepare(`
    SELECT c.id, c.agent_id, c.title, c.updated_at, COUNT(m.id) as message_count, c.summary_enabled, c.icon
    FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = ?
    GROUP BY c.id ORDER BY c.updated_at DESC
  `).all(userId) as Array<{ id: string; agent_id: string; title: string | null; updated_at: string; message_count: number; summary_enabled: number; icon: string | null }>;
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    title: r.title,
    updatedAt: new Date(r.updated_at),
    messageCount: r.message_count,
    summaryEnabled: r.summary_enabled === 1,
    icon: r.icon ?? null,
  }));
}
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
pnpm --filter @new-workshop/agent-service test -- database.test
```

Expected: all 5 new tests pass. Existing tests should also still pass.

- [ ] **Step 9: Commit**

```bash
git add packages/agent-service/src/types.ts packages/agent-service/src/services/database.ts packages/agent-service/src/__tests__/database.test.ts
git commit -m "feat(agent-service): add icon column to conversations" -m "Adds the storage layer for conversation content icons: nullable TEXT column, additive migration for existing DBs, setIcon method, and icon field threaded through getConversation/listConversations and the Conversation/ConversationSummary types." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Icon generator service

**Files:**
- Create: `packages/agent-service/src/services/icon-generator.ts`
- Create: `packages/agent-service/src/__tests__/icon-generator.test.ts`
- Modify: `packages/agent-service/package.json` — add `lucide-react` dependency

- [ ] **Step 1: Add `lucide-react` to agent-service**

Run from project root:

```bash
pnpm --filter @new-workshop/agent-service add lucide-react
```

Verify it appears in `packages/agent-service/package.json` under `dependencies`. We only import `dynamicIconImports` from it (a tree-shakable named export of the icon-name map), so there's no React-runtime cost at import time.

- [ ] **Step 2: Write failing tests for the parser**

Create `packages/agent-service/src/__tests__/icon-generator.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseAndValidateIcon, generateIcon } from "../services/icon-generator.js";

describe("parseAndValidateIcon", () => {
  it("accepts a valid emoji", () => {
    expect(parseAndValidateIcon("emoji:🔢")).toBe("emoji:🔢");
  });

  it("accepts a valid lucide name", () => {
    expect(parseAndValidateIcon("lucide:plane")).toBe("lucide:plane");
  });

  it("trims surrounding whitespace", () => {
    expect(parseAndValidateIcon("  lucide:plane  \n")).toBe("lucide:plane");
  });

  it("rejects unknown lucide names", () => {
    expect(parseAndValidateIcon("lucide:not-a-real-icon-xyz123")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseAndValidateIcon("")).toBeNull();
    expect(parseAndValidateIcon("   ")).toBeNull();
  });

  it("rejects invalid prefix", () => {
    expect(parseAndValidateIcon("svg:something")).toBeNull();
    expect(parseAndValidateIcon("plane")).toBeNull();
  });

  it("rejects empty emoji body", () => {
    expect(parseAndValidateIcon("emoji:")).toBeNull();
  });

  it("rejects lucide with uppercase or invalid chars", () => {
    expect(parseAndValidateIcon("lucide:Plane")).toBeNull();
    expect(parseAndValidateIcon("lucide:plane!")).toBeNull();
  });
});

describe("generateIcon retry behavior", () => {
  let mockClient: {
    messages: { create: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockClient = {
      messages: { create: vi.fn() },
    };
  });

  function makeResp(text: string) {
    return { content: [{ type: "text", text }] };
  }

  it("succeeds on first attempt", async () => {
    mockClient.messages.create.mockResolvedValueOnce(makeResp("emoji:🔢"));
    const result = await generateIcon(mockClient as any, {
      title: "Test",
      lastUserMessage: "hi",
      lastAssistantMessage: "hello",
    });
    expect(result).toBe("emoji:🔢");
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
  });

  it("retries once on transport error and succeeds", async () => {
    mockClient.messages.create
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makeResp("lucide:plane"));
    const result = await generateIcon(mockClient as any, {
      title: null,
      lastUserMessage: "book a flight",
      lastAssistantMessage: "sure",
    });
    expect(result).toBe("lucide:plane");
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });

  it("retries once on invalid output and succeeds", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(makeResp("garbage output"))
      .mockResolvedValueOnce(makeResp("emoji:🐛"));
    const result = await generateIcon(mockClient as any, {
      title: "Bug fix",
      lastUserMessage: "x",
      lastAssistantMessage: "y",
    });
    expect(result).toBe("emoji:🐛");
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });

  it("returns null after two failures", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(makeResp("garbage"))
      .mockResolvedValueOnce(makeResp("more garbage"));
    const result = await generateIcon(mockClient as any, {
      title: null,
      lastUserMessage: "x",
      lastAssistantMessage: "y",
    });
    expect(result).toBeNull();
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });

  it("does not retry beyond 2 attempts on persistent transport errors", async () => {
    mockClient.messages.create
      .mockRejectedValueOnce(new Error("e1"))
      .mockRejectedValueOnce(new Error("e2"));
    const result = await generateIcon(mockClient as any, {
      title: null,
      lastUserMessage: "x",
      lastAssistantMessage: "y",
    });
    expect(result).toBeNull();
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm --filter @new-workshop/agent-service test -- icon-generator.test
```

Expected: cannot find module `../services/icon-generator.js`.

- [ ] **Step 4: Implement `parseAndValidateIcon` and `generateIcon`**

Create `packages/agent-service/src/services/icon-generator.ts`:

```ts
import { dynamicIconImports } from "lucide-react";
import type Anthropic from "@anthropic-ai/sdk";

const LUCIDE_NAMES = new Set(Object.keys(dynamicIconImports));
const ICON_REGEX = /^(emoji:.+|lucide:[a-z0-9-]+)$/;

export interface IconGenerationInput {
  title: string | null;
  lastUserMessage: string;
  lastAssistantMessage: string;
}

const PROMPT = (input: IconGenerationInput) => `Pick a single icon that represents this conversation's topic.

Reply with EXACTLY one line in one of these formats:
  emoji:<single emoji>
  lucide:<icon-name>

For lucide, use a kebab-case lucide-react icon name such as plane, map-pin, dollar-sign, bug, hash, message-square — pick whichever icon best fits.

Prefer emoji when an obvious one fits. Use lucide for technical or abstract topics where no emoji is right.

Reply with the icon line only, no other text.

Title: ${input.title ?? "(none)"}
Last user message: ${input.lastUserMessage.slice(0, 300)}
Last assistant message: ${input.lastAssistantMessage.slice(0, 300)}`;

const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;

/**
 * Parse and validate the model's icon output.
 * Returns the trimmed canonical string or null if invalid.
 */
export function parseAndValidateIcon(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!ICON_REGEX.test(trimmed)) return null;

  if (trimmed.startsWith("emoji:")) {
    const body = trimmed.slice("emoji:".length);
    return body.length > 0 ? trimmed : null;
  }

  // lucide:<name>
  const name = trimmed.slice("lucide:".length);
  return LUCIDE_NAMES.has(name) ? trimmed : null;
}

/**
 * Generate a content icon for a conversation. Calls Haiku with a small prompt;
 * retries once on transport error or validation failure (max 2 attempts total,
 * 500ms delay between). Returns the validated icon string or null on failure.
 */
export async function generateIcon(
  client: Anthropic,
  input: IconGenerationInput,
): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        messages: [{ role: "user", content: PROMPT(input) }],
      });

      const text = resp.content[0].type === "text" ? resp.content[0].text : "";
      const icon = parseAndValidateIcon(text);
      if (icon) return icon;

      console.warn(`[icon] Attempt ${attempt} returned invalid output: ${JSON.stringify(text)}`);
    } catch (err) {
      console.warn(`[icon] Attempt ${attempt} failed:`, err);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  return null;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter @new-workshop/agent-service test -- icon-generator.test
```

Expected: all 13 tests pass. The retry-delay tests run with the real 500ms timeout — that's fine for this small test suite (~1s total). If you want to speed it up later, mock `setTimeout`; for now keep it simple.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-service/package.json packages/agent-service/src/services/icon-generator.ts packages/agent-service/src/__tests__/icon-generator.test.ts pnpm-lock.yaml
git commit -m "feat(agent-service): add icon generator service" -m "Adds parseAndValidateIcon (regex + lucide-name membership check) and generateIcon (Haiku call with retry-once policy, 2-attempt max, 500ms delay). Lucide name validation uses dynamicIconImports keys from lucide-react (no React runtime cost)." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire icon generation into the message route

**Files:**
- Modify: `packages/agent-service/src/routes/conversations.ts` — generation call, SSE event, GET payloads.

- [ ] **Step 1: Update GET /conversations to include icon**

In `packages/agent-service/src/routes/conversations.ts`, locate the GET `/` handler (around line 42-56). Update the response mapping to include `icon`:

```ts
router.get("/", (req: Request, res: Response) => {
  const conversations = db.listConversations(req.userId!);
  console.log(`[conversations] Listed ${conversations.length} conversation(s) for user ${req.userId}`);
  res.json(
    conversations.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      title: c.title,
      updatedAt: c.updatedAt.toISOString(),
      messageCount: c.messageCount,
      summaryEnabled: c.summaryEnabled,
      icon: c.icon,
    }))
  );
});
```

- [ ] **Step 2: Update GET /conversations/:id to include icon**

Find the GET `/:id` handler in the same file (search for `router.get("/:id"`). It currently returns the conversation; ensure the response includes `icon: conversation.icon` (or similar — verify the existing shape and add the field). If the handler currently returns `conversation` directly via `res.json(conversation)`, the `icon` field is already present because `getConversation` now includes it (Task 1). Verify by reading the handler and confirming the response shape.

- [ ] **Step 3: Import the icon generator**

At the top of `packages/agent-service/src/routes/conversations.ts`, alongside the other service imports, add:

```ts
import { generateIcon } from "../services/icon-generator.js";
```

- [ ] **Step 4: Replace title-only flow with concurrent title + icon generation**

In the POST `/:id/messages` handler, locate the title-generation block (around lines 469-499 — search for `// Generate title if this is the first exchange`). Replace the entire block with:

```ts
// Generate title (first turn only) and icon (every turn) concurrently.
// Both run after streaming finishes; both fire SSE events before `done`
// so the client sees them within the same HTTP turn.
const finalConv = db.getConversation(conversation.id)!;
if (finalConv.agentId !== "router") {
  const lastUserMessage = message;
  const lastAssistantMessage = fullResponse.slice(0, 300);

  const titlePromise: Promise<string | null> = (async () => {
    if (conversation.title) return null; // already has a title
    try {
      console.log(`[title] Generating title for conversation ${conversation.id}`);
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
      return title || null;
    } catch (err) {
      console.error("[title] Title generation failed:", err);
      return null;
    }
  })();

  const iconPromise = generateIcon(getClient(), {
    title: conversation.title,
    lastUserMessage,
    lastAssistantMessage,
  });

  const [titleResult, iconResult] = await Promise.allSettled([titlePromise, iconPromise]);

  if (titleResult.status === "fulfilled" && titleResult.value) {
    db.setTitle(conversation.id, titleResult.value);
    if (!res.writableEnded) writeSSE(res, "title", { title: titleResult.value });
    console.log(`[title] Generated: "${titleResult.value}"`);
  }

  if (iconResult.status === "fulfilled" && iconResult.value) {
    db.setIcon(conversation.id, iconResult.value);
    if (!res.writableEnded) writeSSE(res, "icon", { icon: iconResult.value });
    console.log(`[icon] Generated: "${iconResult.value}"`);
  }
}
```

Key behavior changes:
- Title generation still gates on `!conversation.title` (no change — only first turn).
- Icon generation runs **every** non-router turn.
- Both run concurrently via `Promise.allSettled`; total wait ≈ max(title, icon) instead of sequential.
- Each SSE write is guarded by `!res.writableEnded` so a client disconnect mid-flight degrades to DB-only persistence.
- Errors in either path do not affect the other.

- [ ] **Step 5: Run the existing test suite to verify nothing broke**

```bash
pnpm --filter @new-workshop/agent-service test
```

Expected: all existing tests pass. Title-related tests should still pass because the title generation logic itself is unchanged — just moved into a Promise and awaited via `Promise.allSettled`. New icon-generator unit tests already pass (Task 2). Integration tests come in Task 4.

If any title-related test fails because it depended on the exact `await` shape (e.g. spying on call ordering), update it minimally — the observable behavior is identical for the title-already-present and title-needed cases.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-service/src/routes/conversations.ts
git commit -m "feat(agent-service): generate content icon per turn" -m "Wires the icon generator into the message route. Title and icon generation now run concurrently after streaming finishes, both emit SSE events before \`done\`, both guarded against a closed response. GET /conversations and GET /conversations/:id include the icon field." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Backend integration tests for the icon flow

**Files:**
- Create: `packages/agent-service/src/__tests__/conversation-icon-flow.test.ts`

- [ ] **Step 1: Read the existing route-test setup pattern**

Open `packages/agent-service/src/__tests__/routes.test.ts` (or whichever existing test exercises POST `/conversations/:id/messages`). Note how it:
- Builds a test Express app with `createConversationRouter`.
- Mocks the Anthropic client (look for the pattern that injects a fake client via the `getClient` callback or similar).
- Drives an SSE response and parses events.

You will reuse the same setup. If the existing tests use a helper function or a shared setup module, import it; otherwise copy the smallest relevant chunk.

- [ ] **Step 2: Write the integration test file**

Create `packages/agent-service/src/__tests__/conversation-icon-flow.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Database } from "../services/database.js";
import { createConversationRouter } from "../routes/conversations.js";
// Adjust import paths to match how routes.test.ts wires things up.

// Helper: parse an SSE response body into an array of {event, data} objects.
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

describe("conversation icon flow (integration)", () => {
  let db: Database;
  let app: express.Express;
  let mockClient: any;

  // Re-create the streaming-response mock to match what messages.stream returns
  // in conversations.ts (an async iterable that yields content_block_delta events).
  function makeStreamMock(text: string) {
    return {
      [Symbol.asyncIterator]: async function* () {
        yield { type: "content_block_delta", delta: { type: "text_delta", text } };
      },
      finalMessage: async () => ({
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        usage: {},
      }),
    };
  }

  beforeEach(() => {
    db = new Database(":memory:");
    db.createUser("u1", "u@test", "hash");

    mockClient = {
      messages: {
        stream: vi.fn(() => makeStreamMock("hello!")),
        create: vi.fn(),
      },
    };

    // Build the test app — adjust constructor args to match the project's setup.
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as any).userId = "u1"; next(); });
    app.use("/conversations", createConversationRouter({
      db,
      agents: /* reuse or build a minimal agents map with a non-router agent */ undefined as any,
      getClient: () => mockClient,
    } as any));
  });

  it("emits an icon SSE event for non-router agents", async () => {
    // Title call returns "Test Title", icon call returns "emoji:🐛"
    mockClient.messages.create
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Test Title" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "emoji:🐛" }] });

    const conv = db.createConversation("c1", "support-bot", "u1");
    const resp = await request(app)
      .post(`/conversations/${conv.id}/messages`)
      .send({ message: "I have a bug" })
      .expect(200);

    const events = parseSSE(resp.text);
    const iconEvents = events.filter((e) => e.event === "icon");
    expect(iconEvents).toHaveLength(1);
    expect(iconEvents[0].data.icon).toBe("emoji:🐛");

    // DB persistence
    expect(db.getConversation("c1")!.icon).toBe("emoji:🐛");
  });

  it("skips icon generation when finalConv.agentId is router", async () => {
    // Setup a conversation where the router stays as the active agent.
    const conv = db.createConversation("c2", "router", "u1");
    await request(app)
      .post(`/conversations/${conv.id}/messages`)
      .send({ message: "hello" })
      .expect(200);

    // No call to messages.create should have been made for icon generation.
    expect(mockClient.messages.create).not.toHaveBeenCalled();
    expect(db.getConversation("c2")!.icon).toBeNull();
  });

  it("does not emit an icon event when generation fails twice", async () => {
    // Both icon calls return invalid output.
    mockClient.messages.create
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Test Title" }] }) // title call
      .mockResolvedValueOnce({ content: [{ type: "text", text: "garbage" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "still garbage" }] });

    const conv = db.createConversation("c3", "support-bot", "u1");
    const resp = await request(app)
      .post(`/conversations/${conv.id}/messages`)
      .send({ message: "test" })
      .expect(200);

    const events = parseSSE(resp.text);
    expect(events.filter((e) => e.event === "icon")).toHaveLength(0);
    expect(db.getConversation("c3")!.icon).toBeNull();
  });

  it("retries on first invalid output and emits the second result", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Test Title" }] }) // title
      .mockResolvedValueOnce({ content: [{ type: "text", text: "garbage" }] })   // icon attempt 1
      .mockResolvedValueOnce({ content: [{ type: "text", text: "lucide:bug" }] }); // icon attempt 2

    const conv = db.createConversation("c4", "support-bot", "u1");
    const resp = await request(app)
      .post(`/conversations/${conv.id}/messages`)
      .send({ message: "test" })
      .expect(200);

    const events = parseSSE(resp.text);
    const icons = events.filter((e) => e.event === "icon");
    expect(icons).toHaveLength(1);
    expect(icons[0].data.icon).toBe("lucide:bug");
  });

  it("returns icon in the GET /conversations list payload", async () => {
    const conv = db.createConversation("c5", "support-bot", "u1");
    db.setIcon(conv.id, "emoji:✈️");

    const resp = await request(app).get(`/conversations`).expect(200);
    const list = resp.body as Array<{ id: string; icon: string | null }>;
    const item = list.find((c) => c.id === conv.id)!;
    expect(item.icon).toBe("emoji:✈️");
  });
});
```

**Implementation note for the engineer:** the exact constructor signature of `createConversationRouter` and the way the existing tests inject the Anthropic client may differ from the sketch above. Read `routes.test.ts` first and pattern-match. The behavioral assertions (which SSE events fire, what the DB looks like after) are what matter — the wiring is project-specific.

- [ ] **Step 3: Run the integration tests**

```bash
pnpm --filter @new-workshop/agent-service test -- conversation-icon-flow
```

Expected: all 5 tests pass. If a test fails because of test-harness wiring issues (mock signature, router setup), fix the harness — don't change the production code unless the test reveals a real bug.

- [ ] **Step 4: Run the entire backend test suite**

```bash
pnpm --filter @new-workshop/agent-service test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/__tests__/conversation-icon-flow.test.ts
git commit -m "test(agent-service): integration tests for icon SSE flow" -m "Covers happy path (icon SSE event + DB persistence), router-skip, both-attempts-fail, retry-then-succeed, and icon in GET list payload." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend — types and SSE plumbing

**Files:**
- Modify: `packages/web-client/src/types.ts`
- Modify: `packages/web-client/src/lib/api.ts`
- Test: `packages/web-client/src/__tests__/api.test.ts` (existing — append a test)

- [ ] **Step 1: Add types**

In `packages/web-client/src/types.ts`, find `ConversationSummary` and add `icon: string | null` after `summaryEnabled`:

```ts
export interface ConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
  summaryEnabled: boolean;
  icon: string | null;
}
```

Find `SendMessageCallbacks` (search for `interface SendMessageCallbacks` or `type SendMessageCallbacks`). Add `onIcon` after `onTitle`:

```ts
export interface SendMessageCallbacks {
  // ... existing callbacks
  onTitle?: (title: string) => void;
  onIcon?: (icon: string) => void;
  // ... rest
}
```

- [ ] **Step 2: Write a failing test for the SSE switch**

Append to `packages/web-client/src/__tests__/api.test.ts`. The file already has test cases for other SSE events; mirror the pattern for `title`:

```ts
it("invokes onIcon when an icon event arrives", async () => {
  const onIcon = vi.fn();

  const sse = sseStream(
    `event: delta\ndata: {"text":"hi","agentId":"a"}\n\n` +
    `event: icon\ndata: {"icon":"emoji:🔢"}\n\n` +
    `event: done\ndata: {"conversationId":"c1"}\n\n`,
  );

  await consumeStream(sse, { onIcon });

  expect(onIcon).toHaveBeenCalledWith("emoji:🔢");
});
```

(`sseStream` and `consumeStream` are sketches — read the existing tests in the same file to find the actual helpers and reuse them. The point is: feed an SSE blob that contains an `icon` event and assert the callback fires with the payload.)

- [ ] **Step 3: Run test to confirm it fails**

```bash
pnpm --filter @new-workshop/web-client test -- api.test
```

Expected: fails because the switch has no `case "icon"`.

- [ ] **Step 4: Add the case to the SSE switch**

In `packages/web-client/src/lib/api.ts`, find the SSE event switch (around lines 159-202 — search for `case "title"`). Add the new case immediately after `case "title"`:

```ts
case "title":
  callbacks.onTitle?.(data.title);
  break;
case "icon":
  callbacks.onIcon?.(data.icon);
  break;
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
pnpm --filter @new-workshop/web-client test -- api.test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/src/types.ts packages/web-client/src/lib/api.ts packages/web-client/src/__tests__/api.test.ts
git commit -m "feat(web-client): add icon SSE event + ConversationSummary.icon" -m "Mirrors the existing onTitle plumbing: ConversationSummary.icon field, SendMessageCallbacks.onIcon callback, and a new case in the SSE switch." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Frontend — useChat onIcon handler

**Files:**
- Modify: `packages/web-client/src/hooks/use-chat.ts`
- Test: `packages/web-client/src/__tests__/use-chat.test.ts` (existing — append a test)

- [ ] **Step 1: Write a failing test for the icon state update**

Append to `packages/web-client/src/__tests__/use-chat.test.ts`. Look for the existing `onTitle`-equivalent test (search for `onTitle` or `title` in the test file) and mirror its structure:

```ts
it("updates the conversation icon when an icon event arrives", async () => {
  // Mock the API to emit an icon event during sendMessage.
  // (Use whatever harness the existing onTitle test uses.)
  const { result } = renderHook(() => useChat(/* same setup as onTitle test */));

  // Pre-populate with a conversation
  act(() => result.current.setConversations([
    { id: "c1", agentId: "support-bot", title: null, updatedAt: "...", messageCount: 0, summaryEnabled: false, icon: null },
  ]));

  // Trigger a send that will produce an icon SSE event
  await act(async () => result.current.sendMessage("hello"));

  // After the event lands, conversations[0].icon should be set
  expect(result.current.conversations.find((c) => c.id === "c1")!.icon).toBe("emoji:🔢");
});
```

Read the existing `onTitle` test for the exact harness — copy its mock setup and adjust the event payload from `title` to `icon`.

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @new-workshop/web-client test -- use-chat.test
```

Expected: fail (icon stays `null` because there's no handler).

- [ ] **Step 3: Add the `onIcon` handler**

In `packages/web-client/src/hooks/use-chat.ts`, locate the `onTitle` handler (around line 281). Add an `onIcon` handler immediately after it, mirroring the same shape:

```ts
onTitle: (title) => {
  setConversations((prev) =>
    prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
  );
},
onIcon: (icon) => {
  setConversations((prev) =>
    prev.map((c) => (c.id === conversationId ? { ...c, icon } : c)),
  );
},
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter @new-workshop/web-client test -- use-chat.test
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/src/hooks/use-chat.ts packages/web-client/src/__tests__/use-chat.test.ts
git commit -m "feat(web-client): handle icon SSE event in useChat" -m "Mirrors the existing onTitle handler: update the matching conversation in state when the server emits an icon event mid-stream." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: <ConversationIcon> component

**Files:**
- Create: `packages/web-client/src/components/conversation-icon.tsx`
- Create: `packages/web-client/src/__tests__/conversation-icon.test.tsx`

- [ ] **Step 1: Write failing tests for the component**

Create `packages/web-client/src/__tests__/conversation-icon.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConversationIcon } from "../components/conversation-icon";

const agentAvatar = { emoji: "🤖", color: "#7c5cff" };

describe("<ConversationIcon>", () => {
  it("renders the agent emoji when icon is null", () => {
    render(<ConversationIcon icon={null} agentAvatar={agentAvatar} size="sm" />);
    expect(screen.getByText("🤖")).toBeInTheDocument();
  });

  it("renders an emoji icon when prefix is emoji:", () => {
    render(<ConversationIcon icon="emoji:🔢" agentAvatar={agentAvatar} size="sm" />);
    expect(screen.getByText("🔢")).toBeInTheDocument();
  });

  it("falls back to agent emoji when lucide name is unknown", () => {
    render(
      <ConversationIcon
        icon="lucide:not-a-real-icon-xyz"
        agentAvatar={agentAvatar}
        size="sm"
      />,
    );
    expect(screen.getByText("🤖")).toBeInTheDocument();
  });

  it("renders a known lucide icon", async () => {
    render(<ConversationIcon icon="lucide:plane" agentAvatar={agentAvatar} size="sm" />);
    // The component lazy-loads lucide icons; first render shows the agent emoji as fallback.
    // Wait for the lucide SVG to mount.
    await waitFor(() => {
      const svg = document.querySelector("svg.lucide-plane, svg.lucide.lucide-plane, svg[class*='plane']");
      expect(svg).not.toBeNull();
    });
  });

  it("renders inside a colored circle using agentAvatar.color", () => {
    const { container } = render(
      <ConversationIcon icon="emoji:🐛" agentAvatar={agentAvatar} size="sm" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.backgroundColor).toMatch(/#7c5cff|rgb\(124,\s*92,\s*255\)/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @new-workshop/web-client test -- conversation-icon
```

Expected: cannot resolve module.

- [ ] **Step 3: Implement the component**

Create `packages/web-client/src/components/conversation-icon.tsx`:

```tsx
import { lazy, Suspense } from "react";
import { dynamicIconImports } from "lucide-react";
import type { AgentAvatar } from "../types";

interface Props {
  icon: string | null;
  agentAvatar: AgentAvatar;
  size?: "sm" | "md";
}

const sizeClasses = {
  sm: "h-6 w-6 text-sm",
  md: "h-8 w-8 text-base",
};

const lucideSize = { sm: 14, md: 18 };

// Cache lazy components per icon name so repeat renders don't re-create them.
const lucideCache = new Map<string, ReturnType<typeof lazy>>();

function getLucideComponent(name: string) {
  if (lucideCache.has(name)) return lucideCache.get(name)!;
  const importer = (dynamicIconImports as Record<string, () => Promise<{ default: any }>>)[name];
  if (!importer) return null;
  const Comp = lazy(importer);
  lucideCache.set(name, Comp);
  return Comp;
}

export function ConversationIcon({ icon, agentAvatar, size = "sm" }: Props) {
  const fallback = <>{agentAvatar.emoji}</>;
  const wrapperClass = `flex items-center justify-center rounded-full flex-none ${sizeClasses[size]}`;
  const wrapperStyle = { backgroundColor: agentAvatar.color };

  let inner: React.ReactNode = fallback;

  if (icon) {
    if (icon.startsWith("emoji:")) {
      const body = icon.slice("emoji:".length);
      if (body.length > 0) inner = body;
    } else if (icon.startsWith("lucide:")) {
      const name = icon.slice("lucide:".length);
      const Comp = getLucideComponent(name);
      if (Comp) {
        inner = (
          <Suspense fallback={fallback}>
            <Comp size={lucideSize[size]} />
          </Suspense>
        );
      }
    }
  }

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      {inner}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @new-workshop/web-client test -- conversation-icon
```

Expected: all 5 tests pass. The lucide-rendering test relies on `waitFor` because the `lazy` import is async — keep the timeout generous if it flakes.

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/src/components/conversation-icon.tsx packages/web-client/src/__tests__/conversation-icon.test.tsx
git commit -m "feat(web-client): add ConversationIcon component" -m "Renders the conversation icon inside the existing agent-color circle: emoji branch, lazy-loaded lucide branch via dynamicIconImports, and a defensive fallback to agent.avatar.emoji for null / unknown / invalid inputs." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Wire <ConversationIcon> into <ConversationItem> + padding fix

**Files:**
- Modify: `packages/web-client/src/components/conversation-item.tsx`
- Test: `packages/web-client/src/__tests__/conversation-item.test.tsx` (create or append — see Step 1).

- [ ] **Step 1: Write a failing snapshot/render test**

Check if `packages/web-client/src/__tests__/conversation-item.test.tsx` exists. If yes, append. If no, create it:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationItem } from "../components/conversation-item";

const agent = {
  id: "support-bot",
  name: "Support Bot",
  avatar: { emoji: "🤖", color: "#7c5cff" },
  // ... whatever else AgentConfig requires (read the type and stub it minimally)
};

const baseConversation = {
  id: "c1",
  agentId: "support-bot",
  title: "Counting One Through Five",
  updatedAt: new Date().toISOString(),
  messageCount: 4,
  summaryEnabled: false,
  icon: null as string | null,
};

describe("<ConversationItem>", () => {
  it("renders the agent emoji when icon is null", () => {
    render(<ConversationItem conversation={baseConversation} agent={agent} isActive={false} onClick={() => {}} onDelete={() => {}} />);
    expect(screen.getByText("🤖")).toBeInTheDocument();
  });

  it("renders the content emoji when icon is set", () => {
    render(<ConversationItem conversation={{ ...baseConversation, icon: "emoji:🔢" }} agent={agent} isActive={false} onClick={() => {}} onDelete={() => {}} />);
    expect(screen.getByText("🔢")).toBeInTheDocument();
  });
});
```

If `ConversationItem`'s prop shape differs slightly, read the file and adjust the test props to match.

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @new-workshop/web-client test -- conversation-item
```

Expected: in the icon case, the test fails because the component still renders the agent emoji from `<AgentAvatar>` regardless of `conversation.icon`.

- [ ] **Step 3: Swap `<AgentAvatar>` for `<ConversationIcon>` and add padding**

Open `packages/web-client/src/components/conversation-item.tsx`. The current avatar render is at line 47-51 (search for `<AgentAvatar`):

```tsx
{agent ? (
  <AgentAvatar avatar={agent.avatar} size="sm" />
) : (
  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px]">?</div>
)}
```

Replace with:

```tsx
{agent ? (
  <ConversationIcon icon={conversation.icon} agentAvatar={agent.avatar} size="sm" />
) : (
  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px]">?</div>
)}
```

Add the import at the top of the file:

```tsx
import { ConversationIcon } from "./conversation-icon";
```

(Remove the `AgentAvatar` import if it's no longer used in this file — check carefully; it may still be referenced elsewhere in the same file.)

For the padding polish flagged during brainstorming, find the title-wrapper `<div>` (current class `min-w-0 flex-1`, around line 54 — it contains the `<div className="truncate text-sm font-medium">` for the title) and add `pr-1`:

```tsx
<div className="min-w-0 flex-1 pr-1">
  <div className="truncate text-sm font-medium">
    {conversation.title || "New conversation"}
  </div>
  <div className="mt-0.5 text-xs text-muted">
    {relativeTime(conversation.updatedAt)}
  </div>
</div>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @new-workshop/web-client test -- conversation-item
```

Expected: both tests pass.

- [ ] **Step 5: Run the full frontend test suite + typecheck**

```bash
pnpm --filter @new-workshop/web-client test
pnpm --filter @new-workshop/web-client tsc --noEmit
```

Both should pass. If `tsc` complains about an unused import (`AgentAvatar`), remove it from the file.

- [ ] **Step 6: Manual smoke test in the running app**

Open http://localhost:5173 (services are already running from earlier in this session via `pnpm start`). Send a message in a non-router conversation and watch the sidebar:
- New conversation row starts with the agent avatar.
- After the assistant response completes, the avatar swaps to a content icon.
- Send another message that shifts topic; icon should update again on the next response.
- For router-only conversations (Auto), icon stays as agent avatar.

If the dev servers were stopped, restart with `pnpm start` from project root.

- [ ] **Step 7: Commit**

```bash
git add packages/web-client/src/components/conversation-item.tsx packages/web-client/src/__tests__/conversation-item.test.tsx
git commit -m "feat(web-client): render content icon in conversation sidebar" -m "Swaps AgentAvatar for ConversationIcon in <ConversationItem>; adds pr-1 to the title wrapper so titles truncate with breathing room before the hover trash button appears." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

After all 8 tasks land:

- [ ] **Run the full test suite across both packages**

```bash
pnpm --filter @new-workshop/agent-service test
pnpm --filter @new-workshop/web-client test
```

Both should pass cleanly.

- [ ] **TypeScript checks**

```bash
pnpm --filter @new-workshop/agent-service tsc --noEmit
pnpm --filter @new-workshop/web-client tsc --noEmit
```

- [ ] **Manual end-to-end in browser**

With `pnpm start` running, exercise the full flow described in Task 8 Step 6.

- [ ] **Verify spec coverage**

Open `docs/superpowers/specs/2026-04-30-conversation-content-icon-design.md` and confirm:
- Storage: `icon` column + setter + types ✓ (Task 1)
- Encoding: prefixed string + regex + lucide name validation ✓ (Task 2)
- Generation: every non-router turn, concurrent with title ✓ (Task 3)
- SSE event: `icon` arrives before `done` ✓ (Task 3)
- Retry: 2 attempts, 500ms ✓ (Task 2)
- API: GET payloads include icon ✓ (Task 3)
- No PATCH support ✓ (out of scope, not implemented)
- Frontend: `<ConversationIcon>` + integration ✓ (Tasks 7, 8)
- SSE handler + state ✓ (Tasks 5, 6)
- Padding fix ✓ (Task 8)
- Failure modes covered by tests ✓ (Tasks 2, 4, 7)

If any spec requirement isn't covered by a task, add a follow-up task before declaring complete.
