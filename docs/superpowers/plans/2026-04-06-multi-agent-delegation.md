# Multi-Agent Delegation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable agents to delegate tasks to specialist agents within a single conversation, with seamless handoff UX.

**Architecture:** Two new tools (`delegate_to`, `hand_back`) plug into the existing tool system. A new `active_agent` column on conversations controls message routing. The frontend shows delegation banners and per-agent avatars inline.

**Tech Stack:** TypeScript, Express, SQLite (better-sqlite3), Anthropic SDK, React, Vite, Vitest

---

## File Structure

### New Files
- `packages/agent-service/src/services/tools/delegate-to.ts` — delegate_to tool
- `packages/agent-service/src/services/tools/hand-back.ts` — hand_back tool
- `packages/agent-service/src/__tests__/delegation.test.ts` — delegation integration tests
- `packages/web-client/src/components/delegation-banner.tsx` — delegation banner component

### Modified Files
- `packages/agent-service/src/services/tools/types.ts` — add ToolContext to Tool interface
- `packages/agent-service/src/types.ts` — add delegates to AgentConfig, agent_id to Message
- `packages/agent-service/src/services/database.ts` — add columns, new methods
- `packages/agent-service/src/services/agent-loader.ts` — parse/save delegates field
- `packages/agent-service/src/services/tool-service.ts` — pass ToolContext, delegation tool injection
- `packages/agent-service/src/routes/conversations.ts` — message router, history builder, delegation loop break
- `packages/agent-service/src/routes/agents.ts` — include delegates in API responses and saves
- `packages/web-client/src/types.ts` — add agentId, delegationMeta to Message; delegates to AgentConfig
- `packages/web-client/src/lib/api.ts` — handle delegation SSE events
- `packages/web-client/src/hooks/use-chat.ts` — delegation state, agent tracking
- `packages/web-client/src/components/message-list.tsx` — render delegation banners, pass agent info
- `packages/web-client/src/components/message-bubble.tsx` — accept and render agent avatar/name
- `packages/web-client/src/components/agent-form.tsx` — delegates picker section

---

### Task 1: Extend Tool Interface with ToolContext

**Files:**
- Modify: `packages/agent-service/src/services/tools/types.ts`
- Modify: `packages/agent-service/src/services/tool-service.ts`
- Modify: `packages/agent-service/src/__tests__/tool-service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/agent-service/src/__tests__/tool-service.test.ts`:

```typescript
it("passes context to tool execute when provided", async () => {
  const tool = makeFakeTool("ctx_tool");
  service.register(tool);

  const context = {
    conversationId: "conv-1",
    res: {} as any,
    db: {} as any,
    agents: new Map(),
  };

  await service.execute("ctx_tool", { key: "value" }, context);
  expect(tool.execute).toHaveBeenCalledWith({ key: "value" }, context);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "passes context to tool execute"`
Expected: FAIL — `execute` called with 1 argument, not 2

- [ ] **Step 3: Update Tool interface and ToolService**

In `packages/agent-service/src/services/tools/types.ts`, replace the entire file:

```typescript
import type Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import type { Database } from "../database.js";
import type { AgentConfig } from "../../types.js";

export interface ToolContext {
  conversationId: string;
  res: Response;
  db: Database;
  agents: Map<string, AgentConfig>;
}

export interface Tool {
  name: string;
  definition: Anthropic.Messages.Tool;
  execute(input: unknown, context?: ToolContext): Promise<string>;
}
```

In `packages/agent-service/src/services/tool-service.ts`, update the `execute` method signature and call:

```typescript
async execute(toolName: string, input: unknown, context?: ToolContext): Promise<string> {
  const tool = this.tools.get(toolName);
  if (!tool) {
    return `Error: Tool "${toolName}" is not registered.`;
  }
  return tool.execute(input, context);
}
```

Add the import at the top of `tool-service.ts`:

```typescript
import type { Tool, ToolContext } from "./tools/types.js";
```

(Remove the separate `import type { Tool }` if it exists.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "passes context to tool execute"`
Expected: PASS

- [ ] **Step 5: Run full test suite to check nothing broke**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All tests pass (existing tools ignore the optional context parameter)

- [ ] **Step 6: Commit**

```
git add packages/agent-service/src/services/tools/types.ts packages/agent-service/src/services/tool-service.ts packages/agent-service/src/__tests__/tool-service.test.ts
git commit -m "feat: add ToolContext to tool interface for delegation support"
```

---

### Task 2: Add Backend Types and Database Schema

**Files:**
- Modify: `packages/agent-service/src/types.ts`
- Modify: `packages/agent-service/src/services/database.ts`
- Modify: `packages/agent-service/src/__tests__/database.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/agent-service/src/__tests__/database.test.ts`:

```typescript
describe("Delegation support", () => {
  it("stores and retrieves active_agent on conversation", () => {
    db.createConversation("conv-d1", "main-agent", "user-1");
    db.setActiveAgent("conv-d1", "specialist-agent");
    const conv = db.getConversation("conv-d1")!;
    expect(conv.activeAgent).toBe("specialist-agent");
  });

  it("defaults active_agent to null", () => {
    db.createConversation("conv-d2", "main-agent", "user-1");
    const conv = db.getConversation("conv-d2")!;
    expect(conv.activeAgent).toBeNull();
  });

  it("clears active_agent", () => {
    db.createConversation("conv-d3", "main-agent", "user-1");
    db.setActiveAgent("conv-d3", "specialist-agent");
    db.setActiveAgent("conv-d3", null);
    const conv = db.getConversation("conv-d3")!;
    expect(conv.activeAgent).toBeNull();
  });

  it("stores agent_id on messages", () => {
    db.createConversation("conv-d4", "main-agent", "user-1");
    db.addMessage("conv-d4", "assistant", "Hello", "main-agent");
    db.addMessage("conv-d4", "user", "Hi");
    const conv = db.getConversation("conv-d4")!;
    expect(conv.messages[0].agentId).toBe("main-agent");
    expect(conv.messages[1].agentId).toBeNull();
  });

  it("stores delegation_meta on messages", () => {
    db.createConversation("conv-d5", "main-agent", "user-1");
    const meta = { type: "delegation_start", from: "main-agent", to: "schedule-agent", context: "schedule a meeting" };
    db.addDelegationMessage("conv-d5", meta);
    const conv = db.getConversation("conv-d5")!;
    const delegationMsg = conv.messages.find(m => m.delegationMeta);
    expect(delegationMsg).toBeDefined();
    expect(delegationMsg!.delegationMeta).toEqual(meta);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "Delegation support"`
Expected: FAIL — methods don't exist, properties not on types

- [ ] **Step 3: Update types.ts**

In `packages/agent-service/src/types.ts`, replace `AgentConfig`:

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
}
```

Replace `Message`:

```typescript
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  agentId?: string | null;
  delegationMeta?: DelegationMeta | null;
}
```

Add `DelegationMeta` type and update `Conversation`:

```typescript
export interface DelegationMeta {
  type: "delegation_start" | "delegation_end";
  from: string;
  to: string;
  context?: string;
  summary?: string;
}

export interface Conversation {
  id: string;
  agentId: string;
  activeAgent: string | null;
  title: string | null;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 4: Update database.ts**

Add to the `migrate()` method in `Database`, after the existing `hasUserId` migration:

```typescript
const convColumns = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
if (!convColumns.some((c) => c.name === "active_agent")) {
  this.db.exec("ALTER TABLE conversations ADD COLUMN active_agent TEXT");
  console.log("[database] Migration: added active_agent column to conversations");
}

const msgColumns = this.db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
if (!msgColumns.some((c) => c.name === "agent_id")) {
  this.db.exec("ALTER TABLE messages ADD COLUMN agent_id TEXT");
  console.log("[database] Migration: added agent_id column to messages");
}
if (!msgColumns.some((c) => c.name === "delegation_meta")) {
  this.db.exec("ALTER TABLE messages ADD COLUMN delegation_meta TEXT");
  console.log("[database] Migration: added delegation_meta column to messages");
}
```

Add `setActiveAgent` method:

```typescript
setActiveAgent(conversationId: string, agentId: string | null): void {
  this.db
    .prepare("UPDATE conversations SET active_agent = ? WHERE id = ?")
    .run(agentId, conversationId);
}
```

Update `getConversation` to read `active_agent` from conversations and `agent_id`, `delegation_meta` from messages:

In the conversation SELECT query, add `active_agent`:
```typescript
const row = this.db
  .prepare("SELECT id, agent_id, active_agent, title, created_at, updated_at FROM conversations WHERE id = ?")
  .get(id) as { id: string; agent_id: string; active_agent: string | null; title: string | null; created_at: string; updated_at: string } | undefined;
```

In the messages SELECT query, add `agent_id`, `delegation_meta`:
```typescript
const messages = this.db
  .prepare("SELECT role, content, created_at, agent_id, delegation_meta FROM messages WHERE conversation_id = ? ORDER BY id ASC")
  .all(id) as Array<{ role: string; content: string; created_at: string; agent_id: string | null; delegation_meta: string | null }>;
```

In the return, add `activeAgent` and map the new message fields:
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
};
```

Update `addMessage` to accept optional `agentId`:

```typescript
addMessage(conversationId: string, role: "user" | "assistant", content: string, agentId?: string): void {
  const conv = this.db
    .prepare("SELECT id FROM conversations WHERE id = ?")
    .get(conversationId);

  if (!conv) {
    throw new Error("Conversation not found");
  }

  const now = new Date().toISOString();
  this.db
    .prepare("INSERT INTO messages (conversation_id, role, content, created_at, agent_id) VALUES (?, ?, ?, ?, ?)")
    .run(conversationId, role, content, now, agentId ?? null);

  this.db
    .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
    .run(now, conversationId);
}
```

Add `addDelegationMessage` method:

```typescript
addDelegationMessage(conversationId: string, meta: { type: string; from: string; to: string; context?: string; summary?: string }): void {
  const now = new Date().toISOString();
  this.db
    .prepare("INSERT INTO messages (conversation_id, role, content, created_at, delegation_meta) VALUES (?, ?, ?, ?, ?)")
    .run(conversationId, "system", "", now, JSON.stringify(meta));

  this.db
    .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
    .run(now, conversationId);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "Delegation support"`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All pass. Some existing tests may need `activeAgent` added to expected Conversation shapes — fix any that fail.

- [ ] **Step 7: Commit**

```
git add packages/agent-service/src/types.ts packages/agent-service/src/services/database.ts packages/agent-service/src/__tests__/database.test.ts
git commit -m "feat: add delegation columns and types to database"
```

---

### Task 3: Update Agent Loader to Parse delegates Field

**Files:**
- Modify: `packages/agent-service/src/services/agent-loader.ts`
- Modify: `packages/agent-service/src/__tests__/agent-loader.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/agent-service/src/__tests__/agent-loader.test.ts`:

```typescript
it("parses delegates field from frontmatter", () => {
  const md = `---
name: Main Agent
model: claude-sonnet-4-20250514
delegates:
  - schedule-agent
  - weather-agent
---
You are a main agent.`;

  fs.writeFileSync(path.join(tmpDir, "main-agent.md"), md);
  const agents = loadAgents(tmpDir);
  const agent = agents.get("main-agent")!;
  expect(agent.delegates).toEqual(["schedule-agent", "weather-agent"]);
});

it("saves delegates field in frontmatter", () => {
  const config: AgentConfig = {
    id: "main-agent",
    name: "Main Agent",
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "You are a main agent.",
    avatar: { emoji: "🤖", color: "#6c5ce7" },
    delegates: ["schedule-agent", "weather-agent"],
  };
  saveAgent(tmpDir, "main-agent", config);
  const agents = loadAgents(tmpDir);
  expect(agents.get("main-agent")!.delegates).toEqual(["schedule-agent", "weather-agent"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "parses delegates"`
Expected: FAIL — delegates not parsed

- [ ] **Step 3: Update agent-loader.ts**

In `loadAgents`, add `delegates` to the `AgentConfig` construction (after `tools: data.tools`):

```typescript
delegates: data.delegates,
```

In `saveAgent`, add delegates to frontmatter (after the tools block):

```typescript
if (config.delegates && config.delegates.length > 0) {
  frontMatter.delegates = config.delegates;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "delegates"`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add packages/agent-service/src/services/agent-loader.ts packages/agent-service/src/__tests__/agent-loader.test.ts
git commit -m "feat: parse and save delegates field in agent frontmatter"
```

---

### Task 4: Implement delegate_to and hand_back Tools

**Files:**
- Create: `packages/agent-service/src/services/tools/delegate-to.ts`
- Create: `packages/agent-service/src/services/tools/hand-back.ts`
- Create: `packages/agent-service/src/__tests__/delegation.test.ts`

- [ ] **Step 1: Write failing tests for delegate_to**

Create `packages/agent-service/src/__tests__/delegation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDelegateToTool } from "../services/tools/delegate-to.js";
import { createHandBackTool } from "../services/tools/hand-back.js";
import type { ToolContext } from "../services/tools/types.js";
import type { AgentConfig } from "../types.js";

function makeAgent(id: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id,
    name: id.replace(/-/g, " "),
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "Test agent.",
    avatar: { emoji: "🤖", color: "#6c5ce7" },
    ...overrides,
  };
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv-1",
    res: { write: vi.fn() } as any,
    db: {
      setActiveAgent: vi.fn(),
      addDelegationMessage: vi.fn(),
    } as any,
    agents: new Map<string, AgentConfig>([
      ["main-agent", makeAgent("main-agent", { delegates: ["schedule-agent"] })],
      ["schedule-agent", makeAgent("schedule-agent")],
    ]),
    ...overrides,
  };
}

describe("delegate_to tool", () => {
  it("has correct tool definition", () => {
    const tool = createDelegateToTool(["schedule-agent"]);
    expect(tool.name).toBe("delegate_to");
    expect(tool.definition.name).toBe("delegate_to");
  });

  it("delegates to valid agent and returns delegation marker", async () => {
    const ctx = makeContext();
    const tool = createDelegateToTool(["schedule-agent"]);
    const result = await tool.execute(
      { agent_id: "schedule-agent", context: "Schedule a meeting" },
      ctx
    );
    expect(result).toContain("[DELEGATION]");
    expect(ctx.db.setActiveAgent).toHaveBeenCalledWith("conv-1", "schedule-agent");
    expect(ctx.db.addDelegationMessage).toHaveBeenCalledWith("conv-1", {
      type: "delegation_start",
      from: "main-agent",
      to: "schedule-agent",
      context: "Schedule a meeting",
    });
  });

  it("returns error for invalid delegate target", async () => {
    const ctx = makeContext();
    const tool = createDelegateToTool(["schedule-agent"]);
    const result = await tool.execute(
      { agent_id: "unknown-agent", context: "Do something" },
      ctx
    );
    expect(result).toContain("Error");
    expect(result).toContain("schedule-agent");
    expect(ctx.db.setActiveAgent).not.toHaveBeenCalled();
  });

  it("returns error for agent not in agents map", async () => {
    const ctx = makeContext();
    ctx.agents.delete("schedule-agent");
    const tool = createDelegateToTool(["schedule-agent"]);
    const result = await tool.execute(
      { agent_id: "schedule-agent", context: "Schedule" },
      ctx
    );
    expect(result).toContain("Error");
  });

  it("sends delegation_start SSE event", async () => {
    const ctx = makeContext();
    const tool = createDelegateToTool(["schedule-agent"]);
    await tool.execute(
      { agent_id: "schedule-agent", context: "Schedule a meeting" },
      ctx
    );
    const writeCall = (ctx.res.write as any).mock.calls[0][0] as string;
    expect(writeCall).toContain("event: delegation_start");
    expect(writeCall).toContain("schedule-agent");
  });
});

describe("hand_back tool", () => {
  it("has correct tool definition", () => {
    const tool = createHandBackTool();
    expect(tool.name).toBe("hand_back");
    expect(tool.definition.name).toBe("hand_back");
  });

  it("resets active_agent and returns delegation marker", async () => {
    const ctx = makeContext();
    const tool = createHandBackTool();
    const result = await tool.execute(
      { summary: "Meeting booked at 2pm" },
      ctx
    );
    expect(result).toContain("[DELEGATION]");
    expect(ctx.db.setActiveAgent).toHaveBeenCalledWith("conv-1", null);
    expect(ctx.db.addDelegationMessage).toHaveBeenCalledWith("conv-1", {
      type: "delegation_end",
      from: "schedule-agent",
      to: "main-agent",
      summary: "Meeting booked at 2pm",
    });
  });

  it("sends delegation_end SSE event", async () => {
    const ctx = makeContext();
    const tool = createHandBackTool();
    await tool.execute({ summary: "Done" }, ctx);
    const writeCall = (ctx.res.write as any).mock.calls[0][0] as string;
    expect(writeCall).toContain("event: delegation_end");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "delegate_to tool|hand_back tool"`
Expected: FAIL — modules don't exist

- [ ] **Step 3: Implement delegate_to tool**

Create `packages/agent-service/src/services/tools/delegate-to.ts`:

```typescript
import type { Tool, ToolContext } from "./types.js";

export function createDelegateToTool(allowedDelegates: string[]): Tool {
  return {
    name: "delegate_to",
    definition: {
      name: "delegate_to",
      description:
        "Delegate the current conversation to a specialist agent. Use this when the user's request matches a specialist's capability.",
      input_schema: {
        type: "object" as const,
        properties: {
          agent_id: {
            type: "string",
            description: "The ID of the specialist agent to delegate to",
          },
          context: {
            type: "string",
            description:
              "A summary of what the user needs, passed to the specialist as context",
          },
        },
        required: ["agent_id", "context"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const { agent_id, context: delegationContext } = (input ?? {}) as {
        agent_id?: string;
        context?: string;
      };

      if (!context) {
        return "Error: Tool context is required for delegation.";
      }

      if (!agent_id || !delegationContext) {
        return "Error: agent_id and context are required.";
      }

      if (!allowedDelegates.includes(agent_id)) {
        return `Error: Cannot delegate to "${agent_id}". Available delegates: [${allowedDelegates.join(", ")}]`;
      }

      const targetAgent = context.agents.get(agent_id);
      if (!targetAgent) {
        return `Error: Agent "${agent_id}" not found.`;
      }

      // Find the main agent (conversation's original agent)
      const mainAgentId = [...context.agents.values()].find(
        (a) => a.delegates?.includes(agent_id)
      )?.id;

      // Update database
      context.db.setActiveAgent(context.conversationId, agent_id);
      context.db.addDelegationMessage(context.conversationId, {
        type: "delegation_start",
        from: mainAgentId ?? "unknown",
        to: agent_id,
        context: delegationContext,
      });

      // Send SSE event
      const sseData = JSON.stringify({
        from: mainAgentId ?? "unknown",
        to: agent_id,
        agentName: targetAgent.name,
        emoji: targetAgent.avatar.emoji,
        color: targetAgent.avatar.color,
        context: delegationContext,
      });
      context.res.write(`event: delegation_start\ndata: ${sseData}\n\n`);

      return `[DELEGATION] Successfully delegated to "${targetAgent.name}". The specialist will now handle the conversation.`;
    },
  };
}
```

- [ ] **Step 4: Implement hand_back tool**

Create `packages/agent-service/src/services/tools/hand-back.ts`:

```typescript
import type { Tool, ToolContext } from "./types.js";

export function createHandBackTool(): Tool {
  return {
    name: "hand_back",
    definition: {
      name: "hand_back",
      description:
        "Hand the conversation back to the main agent after completing your delegated task. Call this when you have finished the task you were asked to do.",
      input_schema: {
        type: "object" as const,
        properties: {
          summary: {
            type: "string",
            description:
              "A brief summary of what you accomplished, which will be shared with the main agent",
          },
        },
        required: ["summary"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const { summary } = (input ?? {}) as { summary?: string };

      if (!context) {
        return "Error: Tool context is required for hand_back.";
      }

      if (!summary) {
        return "Error: summary is required.";
      }

      // Find the main agent (the one with delegates) and current specialist
      const mainAgent = [...context.agents.values()].find(
        (a) => a.delegates && a.delegates.length > 0
      );
      const currentAgent = [...context.agents.values()].find(
        (a) => !a.delegates || a.delegates.length === 0
      );

      const mainAgentId = mainAgent?.id ?? "unknown";
      const currentAgentId = currentAgent?.id ?? "unknown";

      // Update database
      context.db.setActiveAgent(context.conversationId, null);
      context.db.addDelegationMessage(context.conversationId, {
        type: "delegation_end",
        from: currentAgentId,
        to: mainAgentId,
        summary,
      });

      // Send SSE event
      const sseData = JSON.stringify({
        from: currentAgentId,
        to: mainAgentId,
        agentName: mainAgent?.name ?? "Main Agent",
        summary,
      });
      context.res.write(`event: delegation_end\ndata: ${sseData}\n\n`);

      return `[DELEGATION] Handed back to main agent with summary: "${summary}"`;
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "delegate_to tool|hand_back tool"`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add packages/agent-service/src/services/tools/delegate-to.ts packages/agent-service/src/services/tools/hand-back.ts packages/agent-service/src/__tests__/delegation.test.ts
git commit -m "feat: implement delegate_to and hand_back tools"
```

---

### Task 5: Update ToolService for Delegation Tool Injection

**Files:**
- Modify: `packages/agent-service/src/services/tool-service.ts`
- Modify: `packages/agent-service/src/__tests__/tool-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/agent-service/src/__tests__/tool-service.test.ts`:

```typescript
describe("Delegation tool injection", () => {
  it("injects delegate_to for agent with delegates field (main agent)", () => {
    const agent = makeAgent({
      tools: ["my_tool"],
      delegates: ["schedule-agent"],
    });
    service.register(makeFakeTool("my_tool"));

    const definitions = service.getToolsForAgent(agent, { isMainAgent: true });
    const names = definitions.map((d) => d.name);
    expect(names).toContain("my_tool");
    expect(names).toContain("delegate_to");
    expect(names).not.toContain("hand_back");
  });

  it("injects hand_back for active delegate (not main agent)", () => {
    const agent = makeAgent({ tools: ["my_tool"] });
    service.register(makeFakeTool("my_tool"));

    const definitions = service.getToolsForAgent(agent, { isActiveDelegate: true });
    const names = definitions.map((d) => d.name);
    expect(names).toContain("my_tool");
    expect(names).toContain("hand_back");
    expect(names).not.toContain("delegate_to");
  });

  it("does not inject delegation tools for regular agent", () => {
    const agent = makeAgent({ tools: ["my_tool"] });
    service.register(makeFakeTool("my_tool"));

    const definitions = service.getToolsForAgent(agent);
    const names = definitions.map((d) => d.name);
    expect(names).toEqual(["my_tool"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "Delegation tool injection"`
Expected: FAIL — `getToolsForAgent` doesn't accept options

- [ ] **Step 3: Update ToolService**

In `packages/agent-service/src/services/tool-service.ts`, replace the entire file:

```typescript
import type Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolContext } from "./tools/types.js";
import type { AgentConfig } from "../types.js";
import { BrowserManager } from "./tools/browser-manager.js";
import { createBrowseUrlTool } from "./tools/browse-url.js";
import { createDelegateToTool } from "./tools/delegate-to.js";
import { createHandBackTool } from "./tools/hand-back.js";

export interface DelegationOptions {
  isMainAgent?: boolean;
  isActiveDelegate?: boolean;
}

export class ToolService {
  private tools = new Map<string, Tool>();
  private browserManager: BrowserManager;

  constructor() {
    this.browserManager = new BrowserManager();
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  registerDefaults(): void {
    this.register(createBrowseUrlTool(this.browserManager));
  }

  getToolsForAgent(
    agent: AgentConfig,
    delegationOptions?: DelegationOptions
  ): Anthropic.Messages.Tool[] {
    const definitions: Anthropic.Messages.Tool[] = [];

    // Add agent's configured tools
    if (agent.tools && agent.tools.length > 0) {
      for (const name of agent.tools) {
        const tool = this.tools.get(name);
        if (tool) {
          definitions.push(tool.definition);
        }
      }
    }

    // Inject delegate_to for main agents
    if (delegationOptions?.isMainAgent && agent.delegates && agent.delegates.length > 0) {
      const delegateTool = createDelegateToTool(agent.delegates);
      definitions.push(delegateTool.definition);
    }

    // Inject hand_back for active delegates
    if (delegationOptions?.isActiveDelegate) {
      const handBackTool = createHandBackTool();
      definitions.push(handBackTool.definition);
    }

    return definitions;
  }

  async execute(toolName: string, input: unknown, context?: ToolContext): Promise<string> {
    // Handle dynamically created delegation tools
    if (toolName === "delegate_to" && context) {
      const mainAgent = [...(context.agents?.values() ?? [])].find(
        (a) => a.delegates && a.delegates.length > 0
      );
      if (mainAgent?.delegates) {
        const tool = createDelegateToTool(mainAgent.delegates);
        return tool.execute(input, context);
      }
    }

    if (toolName === "hand_back" && context) {
      const tool = createHandBackTool();
      return tool.execute(input, context);
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      return `Error: Tool "${toolName}" is not registered.`;
    }
    return tool.execute(input, context);
  }

  async shutdown(): Promise<void> {
    await this.browserManager.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run -t "Delegation tool injection"`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All pass

- [ ] **Step 6: Commit**

```
git add packages/agent-service/src/services/tool-service.ts packages/agent-service/src/__tests__/tool-service.test.ts
git commit -m "feat: inject delegate_to and hand_back tools based on delegation state"
```

---

### Task 6: Update Conversations Route for Delegation

**Files:**
- Modify: `packages/agent-service/src/routes/conversations.ts`

This is the core task — message routing, history building, system prompt injection, and delegation loop break.

- [ ] **Step 1: Add message routing at the top of the message handler**

In `conversations.ts`, in the `POST /:id/messages` handler, after the line `const agent = agents.get(conversation.agentId)!;` (line 109), add delegation routing:

```typescript
// Delegation routing: use active_agent if set, otherwise conversation's agent
const activeAgentId = conversation.activeAgent ?? conversation.agentId;
const activeAgent = agents.get(activeAgentId);

if (!activeAgent) {
  // Delegate agent was deleted — reset to main
  db.setActiveAgent(conversation.id, null);
  startSSE(res);
  writeSSE(res, "error", { message: `Agent "${activeAgentId}" not found. Returning to main agent.` });
  writeSSE(res, "delegation_end", { from: activeAgentId, to: conversation.agentId, agentName: agent.name, summary: "Agent unavailable" });
  writeSSE(res, "done", { conversationId: conversation.id });
  res.end();
  return;
}

const isMainAgent = activeAgentId === conversation.agentId;
const isActiveDelegate = !isMainAgent;
```

Replace `agent` usage in the Claude API call section with `activeAgent`. Keep the `agent` variable for the guardrails check (it checks the conversation's original agent).

- [ ] **Step 2: Build delegation-aware message history**

Replace the message history building section. After `const updatedConversation = db.getConversation(conversation.id)!;` (line 137), replace the `claudeMessages` construction:

```typescript
// Build messages array for Claude — delegation-aware
let claudeMessages: Array<{ role: string; content: any }>;

if (isActiveDelegate) {
  // Specialist sees only messages since delegation started
  const delegationStartIdx = updatedConversation.messages.findLastIndex(
    (m) => m.delegationMeta?.type === "delegation_start"
  );
  const messagesAfterDelegation = delegationStartIdx >= 0
    ? updatedConversation.messages.slice(delegationStartIdx + 1)
    : updatedConversation.messages;

  claudeMessages = messagesAfterDelegation
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
} else {
  // Main agent sees full history, with delegation summaries
  claudeMessages = updatedConversation.messages
    .filter((m) => {
      if (m.agentId && m.agentId !== conversation.agentId && !m.delegationMeta) {
        return false;
      }
      if (m.delegationMeta?.type === "delegation_start") {
        return false;
      }
      if (m.delegationMeta?.type === "delegation_end") {
        return true;
      }
      return m.role !== "system";
    })
    .map((m) => {
      if (m.delegationMeta?.type === "delegation_end") {
        return {
          role: "user" as const,
          content: `[Specialist agent completed task: ${m.delegationMeta.summary}]`,
        };
      }
      return { role: m.role, content: m.content };
    });
}
```

- [ ] **Step 3: Build delegation-aware system prompt**

Before the `while (iterations < MAX_TOOL_ITERATIONS)` loop (line 158), add:

```typescript
let systemPrompt = activeAgent.systemPrompt;

if (isMainAgent && activeAgent.delegates && activeAgent.delegates.length > 0) {
  const delegateDescriptions = activeAgent.delegates
    .map((delegateId) => {
      const delegateAgent = agents.get(delegateId);
      if (!delegateAgent) return null;
      const firstLine = delegateAgent.systemPrompt.split("\n")[0];
      return `• ${delegateId} ("${delegateAgent.name}") — ${firstLine}`;
    })
    .filter(Boolean)
    .join("\n");

  systemPrompt += `\n\n[Available Specialist Agents]\nYou can delegate tasks to these specialist agents using the delegate_to tool:\n\n${delegateDescriptions}\n\nWhen a user's request matches a specialist's capability, delegate to them with a clear context summary. Handle general conversation yourself.`;
}

if (isActiveDelegate) {
  const delegationStart = updatedConversation.messages.findLast(
    (m) => m.delegationMeta?.type === "delegation_start"
  );
  const delegationContext = delegationStart?.delegationMeta?.context ?? "No context provided";
  systemPrompt = `[Delegation Context]\nYou have been asked to help with a specific task.\nContext from the main agent: "${delegationContext}"\n\nWhen you have completed the task, you MUST call the hand_back tool with a brief summary of what you accomplished. Do not continue the conversation after handing back.\n\n${systemPrompt}`;
}
```

- [ ] **Step 4: Update tool injection and execution in the agentic loop**

Update the tools variable (replace line 146):

```typescript
const delegationOptions = { isMainAgent, isActiveDelegate };
const tools = toolService ? toolService.getToolsForAgent(activeAgent, delegationOptions) : [];
```

Update `streamParams` to use `activeAgent` and `systemPrompt` (replace lines 162-166):

```typescript
const streamParams: Record<string, any> = {
  model: activeAgent.model,
  max_tokens: activeAgent.maxTokens,
  temperature: activeAgent.temperature,
  system: systemPrompt,
  messages: loopMessages,
};
```

Update tool execution to pass context (replace line 228):

```typescript
const toolContext = {
  conversationId: conversation.id,
  res,
  db,
  agents,
};
const result = await toolService.execute(toolUse.name, toolUse.input, toolContext);
```

Add delegation loop break after `toolResults.push(...)` and before `loopMessages.push(...)` (after line 239):

```typescript
// Check if any tool result is a delegation action
const hasDelegation = toolResults.some((r) => r.content.startsWith("[DELEGATION]"));
if (hasDelegation) {
  break; // Stop the agentic loop — delegation or hand_back occurred
}
```

- [ ] **Step 5: Update message saving to include agentId**

Update the final save (around line 252):

```typescript
if (fullResponse) {
  db.addMessage(conversation.id, "assistant", fullResponse, activeAgentId);
}
```

- [ ] **Step 6: Update SSE delta events to include agentId**

In the streaming loop (around line 189), update:

```typescript
writeSSE(res, "delta", { text: event.delta.text, agentId: activeAgentId });
```

- [ ] **Step 7: Update GET /conversations/:id to include new fields**

In the GET handler (around line 304), update the response:

```typescript
res.json({
  conversationId: conversation.id,
  agentId: conversation.agentId,
  activeAgent: conversation.activeAgent,
  title: conversation.title,
  createdAt: conversation.createdAt.toISOString(),
  messages: conversation.messages.map((m) => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
    agentId: m.agentId ?? null,
    delegationMeta: m.delegationMeta ?? null,
  })),
});
```

- [ ] **Step 8: Run full test suite**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All pass

- [ ] **Step 9: Commit**

```
git add packages/agent-service/src/routes/conversations.ts
git commit -m "feat: add delegation routing, history isolation, and loop break to conversations"
```

---

### Task 7: Update Agents Route to Include delegates

**Files:**
- Modify: `packages/agent-service/src/routes/agents.ts`

- [ ] **Step 1: Update POST and PUT handlers to pass delegates**

In the `POST /` handler (line 35), add `delegates` to the destructured body:

```typescript
const { name, systemPrompt, model, maxTokens, temperature, avatar, topicBoundaries, delegates } = req.body;
```

Add `delegates` to the config object (after `topicBoundaries`):

```typescript
delegates: delegates || undefined,
```

Do the same for the `PUT /:id` handler (line 58):

```typescript
const { name, systemPrompt, model, maxTokens, temperature, avatar, topicBoundaries, delegates } = req.body;
```

And in the config:

```typescript
delegates: delegates || undefined,
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All pass

- [ ] **Step 3: Commit**

```
git add packages/agent-service/src/routes/agents.ts
git commit -m "feat: pass delegates field through agent CRUD endpoints"
```

---

### Task 8: Update Frontend Types and API Client

**Files:**
- Modify: `packages/web-client/src/types.ts`
- Modify: `packages/web-client/src/lib/api.ts`

- [ ] **Step 1: Update frontend types**

In `packages/web-client/src/types.ts`, add `DelegationMeta` interface (before `Message`):

```typescript
export interface DelegationMeta {
  type: "delegation_start" | "delegation_end";
  from: string;
  to: string;
  context?: string;
  summary?: string;
}
```

Update `Message`:

```typescript
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  agentId?: string | null;
  delegationMeta?: DelegationMeta | null;
}
```

Update `SendMessageCallbacks`:

```typescript
export interface SendMessageCallbacks {
  onDelta: (text: string, agentId?: string) => void;
  onBlocked: (message: string) => void;
  onError: (message: string) => void;
  onTitle: (title: string) => void;
  onDone: () => void;
  onDelegationStart?: (data: { from: string; to: string; agentName: string; emoji: string; color: string; context: string }) => void;
  onDelegationEnd?: (data: { from: string; to: string; agentName: string; summary: string }) => void;
}
```

Update `ConversationDetail`:

```typescript
export interface ConversationDetail {
  conversationId: string;
  agentId: string;
  activeAgent?: string | null;
  title: string | null;
  createdAt: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
    agentId?: string | null;
    delegationMeta?: DelegationMeta | null;
  }>;
}
```

Update `AgentConfig` and `CreateAgentInput` to include `delegates`:

Add to `AgentConfig`:
```typescript
delegates?: string[];
```

Add to `CreateAgentInput`:
```typescript
delegates?: string[];
```

- [ ] **Step 2: Update api.ts to handle delegation SSE events**

In the `sendMessage` function's switch statement (around line 159), add cases:

```typescript
case "delegation_start":
  callbacks.onDelegationStart?.(data);
  break;
case "delegation_end":
  callbacks.onDelegationEnd?.(data);
  break;
```

Update the `delta` case to pass `agentId`:

```typescript
case "delta":
  callbacks.onDelta(data.text, data.agentId);
  break;
```

- [ ] **Step 3: Commit**

```
git add packages/web-client/src/types.ts packages/web-client/src/lib/api.ts
git commit -m "feat: add delegation types and SSE event handling to frontend"
```

---

### Task 9: Update useChat Hook for Delegation State

**Files:**
- Modify: `packages/web-client/src/hooks/use-chat.ts`

- [ ] **Step 1: Add useRef import and activeAssistantIdRef**

Update the import at the top:

```typescript
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
```

Inside `useChat`, add:

```typescript
const activeAssistantIdRef = useRef<string | null>(null);
```

- [ ] **Step 2: Update sendMessage to use ref and handle delegation**

In the `sendMessage` callback, after creating `assistantMessageId`:

```typescript
activeAssistantIdRef.current = assistantMessageId;
```

Update the `onDelta` callback:

```typescript
onDelta: (deltaText, agentId) => {
  const targetId = activeAssistantIdRef.current;
  if (!targetId) return;
  setState((s) => ({
    ...s,
    messages: s.messages.map((m) =>
      m.id === targetId
        ? { ...m, content: m.content + deltaText, agentId: agentId ?? null }
        : m
    ),
  }));
},
```

Add delegation callbacks after `onDone`:

```typescript
onDelegationStart: (data) => {
  const specialistMessageId = uuidv4();
  activeAssistantIdRef.current = specialistMessageId;
  const delegationMessage: Message = {
    id: uuidv4(),
    role: "system",
    content: "",
    timestamp: new Date(),
    delegationMeta: {
      type: "delegation_start",
      from: data.from,
      to: data.to,
      context: data.context,
    },
  };
  const specialistMessage: Message = {
    id: specialistMessageId,
    role: "assistant",
    content: "",
    timestamp: new Date(),
    agentId: data.to,
  };
  setState((s) => ({
    ...s,
    messages: [...s.messages, delegationMessage, specialistMessage],
  }));
},
onDelegationEnd: (data) => {
  const delegationMessage: Message = {
    id: uuidv4(),
    role: "system",
    content: "",
    timestamp: new Date(),
    delegationMeta: {
      type: "delegation_end",
      from: data.from,
      to: data.to,
      summary: data.summary,
    },
  };
  setState((s) => ({
    ...s,
    messages: [...s.messages, delegationMessage],
  }));
},
```

- [ ] **Step 3: Update message loading to include new fields**

In `loadConversations` and `selectConversation`, update the messages mapping:

```typescript
const messages: Message[] = detail.messages.map((m) => ({
  id: uuidv4(),
  role: m.role,
  content: m.content,
  timestamp: new Date(m.timestamp),
  agentId: m.agentId ?? null,
  delegationMeta: m.delegationMeta ?? null,
}));
```

Apply this in both places where `detail.messages.map(...)` appears.

- [ ] **Step 4: Commit**

```
git add packages/web-client/src/hooks/use-chat.ts
git commit -m "feat: add delegation state tracking to useChat hook"
```

---

### Task 10: Create DelegationBanner Component

**Files:**
- Create: `packages/web-client/src/components/delegation-banner.tsx`

- [ ] **Step 1: Create the component**

Create `packages/web-client/src/components/delegation-banner.tsx`:

```tsx
import type { DelegationMeta, AgentSummary } from "../types";

interface DelegationBannerProps {
  meta: DelegationMeta;
  agents: AgentSummary[];
}

export function DelegationBanner({ meta, agents }: DelegationBannerProps) {
  if (meta.type === "delegation_start") {
    const targetAgent = agents.find((a) => a.id === meta.to);
    const emoji = targetAgent?.avatar?.emoji ?? "🤖";
    const name = targetAgent?.name ?? meta.to;

    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-xs text-muted">
          <span>{emoji}</span>
          <span className="font-medium text-foreground">{name}</span>
          <span>joined</span>
          {meta.context && (
            <span className="text-muted">— {meta.context}</span>
          )}
        </div>
      </div>
    );
  }

  if (meta.type === "delegation_end") {
    const mainAgent = agents.find((a) => a.id === meta.to);
    const emoji = mainAgent?.avatar?.emoji ?? "🤖";
    const name = mainAgent?.name ?? "Main Agent";

    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-xs text-muted">
          <span>{emoji}</span>
          <span className="font-medium text-foreground">{name}</span>
          <span>resumed</span>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```
git add packages/web-client/src/components/delegation-banner.tsx
git commit -m "feat: add DelegationBanner component"
```

---

### Task 11: Update MessageBubble and MessageList for Per-Agent Avatars

**Files:**
- Modify: `packages/web-client/src/components/message-bubble.tsx`
- Modify: `packages/web-client/src/components/message-list.tsx`
- Modify: `packages/web-client/src/components/chat-container.tsx`

- [ ] **Step 1: Update MessageBubble to accept agent info**

Replace `packages/web-client/src/components/message-bubble.tsx`:

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Message, AgentSummary } from "../types";

interface MessageBubbleProps {
  message: Message;
  agents?: AgentSummary[];
}

export function MessageBubble({ message, agents }: MessageBubbleProps) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="rounded-lg bg-surface px-4 py-2 text-center text-sm text-muted">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end px-4">
        <div className="max-w-[80%] rounded-[16px_16px_4px_16px] bg-primary px-4 py-3 text-sm leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant — resolve agent avatar
  const agent = message.agentId && agents
    ? agents.find((a) => a.id === message.agentId)
    : null;
  const emoji = agent?.avatar?.emoji ?? "S";
  const color = agent?.avatar?.color ?? undefined;
  const name = agent?.name ?? null;

  return (
    <div className="flex items-start gap-2 px-4">
      <div
        className="flex h-7 w-7 min-w-[1.75rem] items-center justify-center rounded-full text-xs text-white"
        style={{ backgroundColor: color ?? "var(--color-primary)" }}
      >
        {emoji}
      </div>
      <div className="max-w-[80%] rounded-[4px_16px_16px_16px] bg-assistant-bg px-4 py-3 text-sm leading-relaxed">
        {name && (
          <div className="mb-1 text-xs font-medium" style={{ color: color ?? "var(--color-primary)" }}>
            {name}
          </div>
        )}
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-headings:my-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update MessageList to render delegation banners and pass agents**

Replace `packages/web-client/src/components/message-list.tsx`:

```tsx
import { useAutoScroll } from "../hooks/use-auto-scroll";
import { MessageBubble } from "./message-bubble";
import { DelegationBanner } from "./delegation-banner";
import { TypingIndicator } from "./typing-indicator";
import type { Message, AgentSummary } from "../types";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  agents?: AgentSummary[];
}

export function MessageList({ messages, isStreaming, agents = [] }: MessageListProps) {
  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator =
    isStreaming && lastMessage?.role === "assistant" && lastMessage.content === "";

  const { scrollRef, handleScroll } = useAutoScroll([messages, isStreaming]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-4"
    >
      {messages.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl text-white">
            S
          </div>
          <div className="text-base font-semibold">Support Bot</div>
          <div className="max-w-[260px] text-center text-sm text-muted">
            Ask me about products, troubleshooting, or pricing. I&apos;m here to help!
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {messages.map((msg) => {
          if (msg.delegationMeta) {
            return <DelegationBanner key={msg.id} meta={msg.delegationMeta} agents={agents} />;
          }

          if (msg.role === "assistant" && msg.content === "" && showTypingIndicator) {
            return null;
          }

          return <MessageBubble key={msg.id} message={msg} agents={agents} />;
        })}
        {showTypingIndicator && <TypingIndicator />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update ChatContainer to pass agents to MessageList**

In `packages/web-client/src/components/chat-container.tsx`, update the `MessageList` line:

```tsx
<MessageList messages={messages} isStreaming={isStreaming} agents={agents} />
```

The `agents` prop is already available in `ChatContainerProps`.

- [ ] **Step 4: Verify frontend compiles**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client dev -- --host 2>&1 | head -20`
Expected: Vite starts without compilation errors

- [ ] **Step 5: Commit**

```
git add packages/web-client/src/components/message-bubble.tsx packages/web-client/src/components/message-list.tsx packages/web-client/src/components/chat-container.tsx
git commit -m "feat: render delegation banners and per-agent avatars in chat UI"
```

---

### Task 12: Add Delegates Picker to Agent Form

**Files:**
- Modify: `packages/web-client/src/components/agent-form.tsx`

- [ ] **Step 1: Update AgentForm props and state**

Update the `AgentFormProps` interface:

```typescript
interface AgentFormProps {
  agent?: AgentConfig;
  agents?: AgentSummary[];
  onSave: (data: CreateAgentInput) => Promise<void>;
  onBack: () => void;
}
```

Update the function signature:

```typescript
export function AgentForm({ agent, agents, onSave, onBack }: AgentFormProps) {
```

Add delegates state:

```typescript
const [delegates, setDelegates] = useState<string[]>(agent?.delegates ?? []);
```

In `handleSubmit`, add to the `data` object (after the `topicBoundaries` block):

```typescript
if (delegates.length > 0) {
  data.delegates = delegates;
}
```

- [ ] **Step 2: Add delegates picker UI**

Insert this after the Tools Info `</div>` (after line 159) and before the Model/Temperature row:

```tsx
{/* Delegates */}
<div>
  <label className="mb-1 block text-xs text-muted">Delegates</label>
  <p className="mb-2 text-[11px] text-muted">
    Agents that this agent can delegate tasks to
  </p>
  <div className="flex flex-col gap-2">
    {delegates.map((delegateId) => {
      const delegateAgent = agents?.find((a) => a.id === delegateId);
      return (
        <div
          key={delegateId}
          className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span>{delegateAgent?.avatar?.emoji ?? "🤖"}</span>
            <span className="text-sm text-foreground">
              {delegateAgent?.name ?? delegateId}
            </span>
            <span className="text-xs text-muted">{delegateId}</span>
          </div>
          <button
            onClick={() => setDelegates(delegates.filter((d) => d !== delegateId))}
            className="text-xs text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      );
    })}

    {agents && agents.filter((a) => a.id !== agent?.id && !delegates.includes(a.id)).length > 0 && (
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) {
            setDelegates([...delegates, e.target.value]);
            e.target.value = "";
          }
        }}
        className="w-full rounded-md border border-dashed border-border bg-surface px-3 py-2 text-sm text-muted focus:border-primary focus:outline-none"
      >
        <option value="">+ Add delegate from available agents</option>
        {agents
          .filter((a) => a.id !== agent?.id && !delegates.includes(a.id))
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.avatar?.emoji} {a.name}
            </option>
          ))}
      </select>
    )}
  </div>
</div>
```

- [ ] **Step 3: Update AgentForm usage to pass agents prop**

Find where `AgentForm` is rendered (use `grep -rn "AgentForm" packages/web-client/src/`). Add the `agents` prop where the component is used. The parent component likely has access to the agents list already.

- [ ] **Step 4: Verify frontend compiles**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client dev -- --host 2>&1 | head -20`
Expected: Compiles without errors

- [ ] **Step 5: Commit**

```
git add packages/web-client/src/components/agent-form.tsx
git commit -m "feat: add delegates picker to agent form"
```

---

### Task 13: End-to-End Manual Test

No new files — this is a manual verification task.

- [ ] **Step 1: Restart services**

```
pnpm restart
```

- [ ] **Step 2: Create a test main agent**

Create `agents/main-agent.md`:

```markdown
---
name: Main Agent
model: claude-sonnet-4-20250514
maxTokens: 1024
temperature: 0.7
avatar:
  emoji: "🧠"
  color: "#6c5ce7"
delegates:
  - weather-agent
---
You are a helpful general-purpose assistant. You can help with a variety of tasks.
When the user asks about weather, delegate to the weather specialist.
```

- [ ] **Step 3: Test the delegation flow**

1. Open http://localhost:5173
2. Select "Main Agent" from the agent selector
3. Send: "What's the weather like in Tokyo?"
4. Verify:
   - Main agent calls `delegate_to` with weather-agent
   - A "Weather Agent joined" banner appears
   - Weather agent responds
   - Weather agent calls `hand_back`
   - A "Main Agent resumed" banner appears
   - Main agent summarizes

- [ ] **Step 4: Test edge cases**

1. Send a non-weather message to verify main agent handles it directly
2. Verify the agent form shows the delegates picker
3. Verify conversation history loads correctly on page refresh

- [ ] **Step 5: Clean up and commit the test agent**

```
git add agents/main-agent.md
git commit -m "feat: add main agent with delegation to weather specialist"
```

- [ ] **Step 6: Run full test suite one more time**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All pass
