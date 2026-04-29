# Redirect-to-Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any non-router agent hand the conversation back to the Auto router on demand. The router re-engages on the user's current message in the same HTTP turn, picks a different specialist, and that specialist answers — no retype.

**Architecture:** A new `redirect_to_router` tool is auto-granted to every non-router agent (parallel to how `delegate_to` and `hand_back` are auto-granted today). When called, it flips `conversation.agentId` to `"router"`, persists a banner message, emits an SSE `redirect_to_router` event, and returns the sentinel `[REDIRECT] …` so the existing outer loop in `routes/conversations.ts` can re-iterate with the router as the active agent. On the re-engagement iteration, the router sees only the user's current request-body message (history is suppressed) plus a `[Re-engagement]` system-prompt block, so it routes immediately. The existing `topicBoundaries` pre-classifier is removed and replaced by a `[Topic Boundaries]` block injected into the agent's system prompt, leaving boundary-decision authority with the agent.

**Tech Stack:** TypeScript, Node 20, Express, Anthropic SDK, better-sqlite3, React 18, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-29-redirect-to-router-design.md`

---

## File Structure

**New files (2):**

- `packages/agent-service/src/services/tools/redirect-to-router.ts` — the tool implementation.
- `packages/agent-service/src/__tests__/redirect-to-router.test.ts` — unit test for the tool.

**Modified backend files (5):**

- `packages/agent-service/src/services/tool-service.ts` — register the new tool, auto-grant to non-router agents.
- `packages/agent-service/src/routes/conversations.ts` — remove `checkTopicBoundary` pre-call, inject `[Topic Boundaries]` and `[Re-engagement]` system-prompt blocks, detect `[REDIRECT]` tool result with per-turn cap, build single-message context for re-engaged router.
- `packages/agent-service/src/__tests__/tool-service.test.ts` — add gating assertions.
- `packages/agent-service/src/__tests__/routes.test.ts` — replace boundary-blocked test with redirect-flow + system-prompt-injection + loop-cap tests.
- `packages/agent-service/src/__tests__/auto-mode.test.ts` — add bidirectional bounce test.

**Modified frontend files (6):**

- `packages/web-client/src/types.ts` — extend `DelegationMeta.type` union and `SendMessageCallbacks`.
- `packages/web-client/src/lib/api.ts` — parse `redirect_to_router` SSE event.
- `packages/web-client/src/hooks/use-chat.ts` — handle `onRedirect`: drop stale placeholder, append banner, update cached `agentId`.
- `packages/web-client/src/components/delegation-banner.tsx` — render `redirect_to_router` variant.
- `packages/web-client/src/__tests__/api.test.ts` — replace `blocked`-event test with redirect test.
- `packages/web-client/src/__tests__/use-chat.test.ts` — replace `blocked`-message test with redirect-banner test.

**Cleanup pass (separate commit, deletes 2 files):**

- `packages/agent-service/src/services/guardrails.ts` — deleted.
- `packages/agent-service/src/__tests__/guardrails.test.ts` — deleted.

---

## Task 1: Create the `redirect_to_router` tool (no wiring yet)

**Files:**
- Create: `packages/agent-service/src/services/tools/redirect-to-router.ts`
- Create: `packages/agent-service/src/__tests__/redirect-to-router.test.ts`

This task adds the tool file and a thorough unit test. Nothing is wired into the agent runtime yet — the tool exists but is not callable until Task 2.

- [ ] **Step 1: Write the failing test**

Create `packages/agent-service/src/__tests__/redirect-to-router.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createRedirectToRouterTool } from "../services/tools/redirect-to-router.js";
import { Database } from "../services/database.js";
import type { AgentConfig } from "../types.js";

function makeAgents(): Map<string, AgentConfig> {
  const map = new Map<string, AgentConfig>();
  map.set("router", { id: "router", name: "Auto", model: "m", maxTokens: 1, temperature: 1, systemPrompt: "", avatar: { emoji: "✨", color: "#000" } });
  map.set("travel-agent", { id: "travel-agent", name: "Travel", model: "m", maxTokens: 1, temperature: 1, systemPrompt: "", avatar: { emoji: "🤖", color: "#000" } });
  return map;
}

function makeContext(db: Database, agents: Map<string, AgentConfig>) {
  const writes: string[] = [];
  const res = { write: (s: string) => writes.push(s) } as any;
  return { ctx: { conversationId: "c1", res, db, agents }, writes };
}

describe("redirect_to_router tool", () => {
  let db: Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.createUser("u1", "a@b.com", "x");
    db.createConversation("c1", "travel-agent", "u1");
  });

  it("flips agentId to router, persists a banner, emits SSE, returns [REDIRECT]", async () => {
    const agents = makeAgents();
    const tool = createRedirectToRouterTool();
    const { ctx, writes } = makeContext(db, agents);

    const result = await tool.execute({ reason: "weather isn't my scope" }, ctx);

    expect(result).toBe('[REDIRECT] Redirected to router with reason: "weather isn\'t my scope"');
    expect(db.getConversation("c1")!.agentId).toBe("router");

    const conv = db.getConversation("c1")!;
    const banner = conv.messages.find((m) => m.delegationMeta?.type === "redirect_to_router");
    expect(banner).toBeDefined();
    expect(banner!.delegationMeta!.from).toBe("travel-agent");
    expect(banner!.delegationMeta!.to).toBe("router");

    const sse = writes.join("");
    expect(sse).toContain("event: redirect_to_router");
    expect(sse).toContain('"from":"travel-agent"');
    expect(sse).toContain('"to":"router"');
    expect(sse).toContain('"agentName":"Auto"');
    expect(sse).toContain('"reason":"weather isn\'t my scope"');
  });

  it("rejects redirect from the router itself", async () => {
    const agents = makeAgents();
    const tool = createRedirectToRouterTool();
    db.setAgentId("c1", "router");
    const { ctx } = makeContext(db, agents);
    const result = await tool.execute({ reason: "x" }, ctx);
    expect(result).toContain("Error");
    expect(result).toContain("router");
    expect(db.getConversation("c1")!.agentId).toBe("router");
  });

  it("requires reason", async () => {
    const agents = makeAgents();
    const tool = createRedirectToRouterTool();
    const { ctx } = makeContext(db, agents);
    const result = await tool.execute({}, ctx);
    expect(result).toContain("Error");
    expect(result).toContain("reason");
  });

  it("requires context", async () => {
    const tool = createRedirectToRouterTool();
    const result = await tool.execute({ reason: "x" }, undefined);
    expect(result).toContain("Error");
    expect(result).toContain("context");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from project root:
```
pnpm --filter @new-workshop/agent-service test -- redirect-to-router
```
Expected: FAIL — `Cannot find module ".../tools/redirect-to-router.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/agent-service/src/services/tools/redirect-to-router.ts`:

```typescript
import type { Tool, ToolContext } from "./types.js";

export function createRedirectToRouterTool(): Tool {
  return {
    name: "redirect_to_router",
    definition: {
      name: "redirect_to_router",
      description:
        "Hand the conversation back to the Auto router when the user's message is outside your domain or scope. The router will pick a different specialist. Call this instead of refusing — the user should never hit a dead end. You can only call this once per turn.",
      input_schema: {
        type: "object" as const,
        properties: {
          reason: {
            type: "string",
            description: "A short user-facing reason for handing back (e.g. 'weather isn't in my scope').",
          },
        },
        required: ["reason"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const { reason } = (input ?? {}) as { reason?: string };

      if (!context) return "Error: Tool context is required for redirect_to_router.";
      if (!reason) return "Error: reason is required.";

      const conv = context.db.getConversation(context.conversationId);
      if (!conv) return "Error: Conversation not found.";

      const fromAgentId = conv.agentId;
      if (fromAgentId === "router") {
        return "Error: Cannot redirect to router from router.";
      }

      context.db.setAgentId(context.conversationId, "router");
      context.db.addDelegationMessage(context.conversationId, {
        type: "redirect_to_router",
        from: fromAgentId,
        to: "router",
        summary: reason,
      });

      const routerAgent = context.agents.get("router");
      const sseData = JSON.stringify({
        from: fromAgentId,
        to: "router",
        agentName: routerAgent?.name ?? "Auto",
        reason,
      });
      context.res.write(`event: redirect_to_router\ndata: ${sseData}\n\n`);

      return `[REDIRECT] Redirected to router with reason: "${reason}"`;
    },
  };
}
```

Note: we reuse the existing `addDelegationMessage` schema by storing `reason` in the `summary` field. This avoids a database migration since the column already accepts arbitrary metadata as JSON. The frontend will read `meta.summary` as the reason for `redirect_to_router` banners (handled in Task 6).

- [ ] **Step 4: Run test to verify it passes**

```
pnpm --filter @new-workshop/agent-service test -- redirect-to-router
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/tools/redirect-to-router.ts \
        packages/agent-service/src/__tests__/redirect-to-router.test.ts
git commit -m "feat(agent-service): add redirect_to_router tool"
```

---

## Task 2: Auto-grant the tool in `ToolService`

**Files:**
- Modify: `packages/agent-service/src/services/tool-service.ts`
- Modify: `packages/agent-service/src/__tests__/tool-service.test.ts`

The tool exists but no agent has it yet. This task wires the tool into the registry and auto-grants it to every non-router agent, mirroring how `delegate_to` and `hand_back` are added without requiring frontmatter opt-in.

After this task, the tool is callable from any specialist, but the message route still pre-blocks via `topicBoundaries` — so user-visible behavior is unchanged. That keeps the diff small and reviewable.

- [ ] **Step 1: Write the failing test addition**

Append a new test to `packages/agent-service/src/__tests__/tool-service.test.ts` after the existing `assign_agent` gating block (after line 194):

```typescript
describe("redirect_to_router tool gating", () => {
  let service: ToolService;

  beforeEach(() => {
    service = new ToolService();
  });

  it("auto-grants redirect_to_router to non-router agents and excludes the router", () => {
    service.registerDefaults();

    const router: AgentConfig = {
      id: "router", name: "Auto", model: "m", maxTokens: 1, temperature: 1,
      systemPrompt: "", avatar: { emoji: "✨", color: "#000" },
      tools: ["assign_agent"],
    };
    const specialist: AgentConfig = {
      id: "travel-agent", name: "Travel", model: "m", maxTokens: 1, temperature: 1,
      systemPrompt: "", avatar: { emoji: "🤖", color: "#000" },
      tools: ["browse_url"], // does not list redirect_to_router; auto-grant must add it
    };
    const noToolsSpecialist: AgentConfig = {
      id: "weather-agent", name: "Weather", model: "m", maxTokens: 1, temperature: 1,
      systemPrompt: "", avatar: { emoji: "🌤", color: "#000" },
      // no tools field at all — auto-grant must still add redirect
    };

    const routerTools = service.getToolsForAgent(router).map((t) => t.name);
    const specialistTools = service.getToolsForAgent(specialist).map((t) => t.name);
    const noToolsSpecialistTools = service.getToolsForAgent(noToolsSpecialist).map((t) => t.name);

    expect(routerTools).not.toContain("redirect_to_router");
    expect(specialistTools).toContain("redirect_to_router");
    expect(noToolsSpecialistTools).toContain("redirect_to_router");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @new-workshop/agent-service test -- tool-service
```
Expected: the new `redirect_to_router tool gating` test FAILS — current code does not register the tool and does not auto-grant. Existing tests in this file should still pass.

- [ ] **Step 3: Register the tool and auto-grant it**

Modify `packages/agent-service/src/services/tool-service.ts`:

1. Add the import next to the other tool imports near the top of the file (after `createAssignAgentTool` import on line 6):

```typescript
import { createRedirectToRouterTool } from "./tools/redirect-to-router.js";
```

2. Register the tool inside `registerDefaults()` (after `this.register(createAssignAgentTool());` on line 40):

```typescript
this.register(createRedirectToRouterTool());
```

3. In `getToolsForAgent`, after the existing `if (agent.tools && agent.tools.length > 0)` block and before the `if (delegationOptions?.summaryEnabled)` block (around line 61), add the auto-grant:

```typescript
// Auto-grant redirect_to_router to every non-router agent (mirror of how
// delegate_to and hand_back are added — no frontmatter opt-in required).
if (agent.id !== "router") {
  const redirectTool = this.tools.get("redirect_to_router");
  if (redirectTool && !definitions.some((d) => d.name === "redirect_to_router")) {
    definitions.push(redirectTool.definition);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm --filter @new-workshop/agent-service test -- tool-service
```
Expected: PASS — both existing `assign_agent` gating test and new `redirect_to_router` gating test green.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/tool-service.ts \
        packages/agent-service/src/__tests__/tool-service.test.ts
git commit -m "feat(agent-service): auto-grant redirect_to_router to non-router agents"
```

---

## Task 3: Replace topicBoundaries pre-check with system-prompt injection

**Files:**
- Modify: `packages/agent-service/src/routes/conversations.ts`
- Modify: `packages/agent-service/src/__tests__/routes.test.ts`

This task removes the runtime call to `checkTopicBoundary` and instead appends a `[Topic Boundaries]` guidance block to the agent's system prompt when `agent.topicBoundaries` is configured. The existing pre-classifier path that emits an SSE `blocked` event is removed entirely.

After this task, an agent with `topicBoundaries` will receive guidance to call `redirect_to_router` for off-topic messages — but the redirect itself is not yet wired into the outer loop (Task 4). For the duration of this commit, an agent that calls `redirect_to_router` will simply have its tool result pushed back to it without the loop flipping, and the agent will respond with text. This is acceptable as an intermediate state because the test for redirect *flow* lives in Task 4.

- [ ] **Step 1: Write the failing test (system prompt contains boundaries)**

In `packages/agent-service/src/__tests__/routes.test.ts`, find the existing test that asserts the `blocked` event is emitted when `topicBoundaries` triggers (around line 277, the test that mocks `checkTopicBoundary`). **Delete that test.** In its place, add the following test. (Match the test file's existing setup helpers — agents map, `setupApp`, mocked SDK — so you may need to adjust imports/fixtures to fit the file's existing patterns. The existing boundary test already shows the right pattern for this file.)

```typescript
it("injects [Topic Boundaries] block into the system prompt when agent has topicBoundaries", async () => {
  const agentWithBoundaries: AgentConfig = {
    id: "product-bot",
    name: "Product",
    model: "m",
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

  const { app, db, sdkSpy } = setupApp({ agents: new Map([["product-bot", agentWithBoundaries]]) });
  const userId = "u1";
  db.createUser(userId, "x@y.com", "h");
  const conv = db.createConversation("c1", "product-bot", userId);

  // The mocked stream just returns a stop_reason: "end_turn" with no tool calls,
  // so we can capture the system prompt and finish quickly.
  sdkSpy.mockResolvedValueOnce(makeStreamMock({ text: "ok", stopReason: "end_turn" }));

  await request(app)
    .post(`/conversations/${conv.id}/messages`)
    .set("Authorization", `Bearer ${makeJwt(userId)}`)
    .send({ message: "Tell me about pricing" })
    .expect(200);

  const callArgs = sdkSpy.mock.calls[0][0];
  expect(callArgs.system).toContain("[Topic Boundaries]");
  expect(callArgs.system).toContain("product features, pricing");
  expect(callArgs.system).toContain("politics");
  expect(callArgs.system).toContain("redirect_to_router");
});
```

If `setupApp`, `makeStreamMock`, or `makeJwt` helpers do not exist in this file, replace them with the file's actual helpers — read `packages/agent-service/src/__tests__/routes.test.ts` lines 1-100 to see the exact pattern. The test's *intent* is: the system prompt sent to the SDK contains the new `[Topic Boundaries]` block when the agent has boundaries.

Also remove the `checkTopicBoundary` mock at the top of the file (lines ~10, ~16). It should no longer be called from production code.

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @new-workshop/agent-service test -- routes
```
Expected: the new test FAILS — `system` does not contain `"[Topic Boundaries]"`.

- [ ] **Step 3: Remove pre-classifier, inject prompt block**

Modify `packages/agent-service/src/routes/conversations.ts`:

1. Remove the import on line 6:

```typescript
// DELETE this line:
import { checkTopicBoundary } from "../services/guardrails.js";
```

2. Remove the entire pre-classifier block in the message handler. Lines 134–152 currently look like this:

```typescript
    // Guardrail check (before SSE headers)
    if (agent.topicBoundaries) {
      console.log(`[guardrails] Checking topic boundaries for agent "${conversation.agentId}"`);
      const guardrailResult = await checkTopicBoundary(
        message,
        agent.topicBoundaries
      );

      if (!guardrailResult.allowed) {
        console.log(`[guardrails] Message BLOCKED: ${guardrailResult.message}`);
        db.addMessage(conversation.id, "user", message);
        startSSE(res);
        writeSSE(res, "blocked", { message: guardrailResult.message });
        writeSSE(res, "done", { conversationId: conversation.id });
        res.end();
        return;
      }
      console.log(`[guardrails] Message allowed`);
    }
```

Delete the entire block (the `if (agent.topicBoundaries)` and everything inside).

3. In the system-prompt-building section starting around line 215, add a new branch that appends the boundaries block. Insert this *after* the existing `if (curIsMain && curAgent.delegates && curAgent.delegates.length > 0)` block and *before* the `if (curIsDelegate)` block (so it slots between the two existing branches around line 230):

```typescript
        if (curAgent.topicBoundaries) {
          const allowed = curAgent.topicBoundaries.allowed.join(", ");
          const blocked = curAgent.topicBoundaries.blocked.join(", ");
          systemPrompt += `\n\n[Topic Boundaries]\nYou specialize in: ${allowed}.\nDecline these topics by handing back: ${blocked}.\n\nIf the user's message is outside your scope, call the redirect_to_router tool with a short reason — do NOT just refuse or apologize. The router will pick a different specialist.`;
        }
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm --filter @new-workshop/agent-service test -- routes
```
Expected: the new prompt-injection test PASSES. All other tests in the file should still pass — except the previously-removed boundary test, which is gone.

If a different test in the file relies on the `blocked` SSE event (e.g. via `onBlocked` mocks), update it to reflect that this code path no longer exists. The pre-classifier is dead.

- [ ] **Step 5: Run the full agent-service test suite to make sure nothing else broke**

```
pnpm --filter @new-workshop/agent-service test
```
Expected: all tests PASS. The legacy `guardrails.test.ts` will still pass on its own (testing the function in isolation) — it's deleted in Task 8.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-service/src/routes/conversations.ts \
        packages/agent-service/src/__tests__/routes.test.ts
git commit -m "feat(agent-service): replace topicBoundaries pre-classifier with system-prompt guidance"
```

---

## Task 4: Wire `[REDIRECT]` handling and re-engagement context in the outer loop

**Files:**
- Modify: `packages/agent-service/src/routes/conversations.ts`
- Modify: `packages/agent-service/src/__tests__/routes.test.ts`
- Modify: `packages/agent-service/src/__tests__/auto-mode.test.ts`

This is the behavior-change task. The outer loop in the message route already supports re-iteration after `assign_agent` calls (look at the `[ASSIGNMENT]` branch around line 410). We add a parallel branch for `[REDIRECT]`: after the tool flips `agentId` to `"router"`, the outer loop re-iterates with the router. On the re-engagement iteration, we replace the conversation history with a single user message — the original request-body `message` — and append a `[Re-engagement]` block to the router's system prompt.

A per-handler `redirectsThisTurn` counter caps the number of redirects to 1 per HTTP turn. If a second `redirect_to_router` is attempted in the same turn (e.g. the router re-assigns to the same specialist that just redirected), the second tool result is replaced with an error message before being pushed back to the agent so it must answer with text.

- [ ] **Step 1: Write the failing test (end-to-end redirect flow)**

Add this test to `packages/agent-service/src/__tests__/routes.test.ts`. As before, adapt the helper-function names to match the file's existing test fixtures.

```typescript
it("redirects from specialist to router and on to a new specialist in one turn", async () => {
  const travel: AgentConfig = {
    id: "travel-agent", name: "Travel", model: "m", maxTokens: 100, temperature: 0.5,
    systemPrompt: "You are a travel agent.", avatar: { emoji: "🤖", color: "#000" },
    topicBoundaries: { allowed: ["flight booking"], blocked: ["weather"], boundaryMessage: "n/a" },
  };
  const router: AgentConfig = {
    id: "router", name: "Auto", model: "m", maxTokens: 100, temperature: 0.5,
    systemPrompt: "You are the router.", avatar: { emoji: "✨", color: "#000" },
    tools: ["assign_agent"],
  };
  const weather: AgentConfig = {
    id: "weather-agent", name: "Weather", model: "m", maxTokens: 100, temperature: 0.5,
    systemPrompt: "You are a weather agent.", avatar: { emoji: "🌤", color: "#000" },
  };

  const agents = new Map([
    ["travel-agent", travel],
    ["router", router],
    ["weather-agent", weather],
  ]);
  const { app, db, sdkSpy } = setupApp({ agents });
  const userId = "u1";
  db.createUser(userId, "x@y.com", "h");
  const conv = db.createConversation("c1", "travel-agent", userId);

  // Iteration 1: travel-agent calls redirect_to_router
  sdkSpy.mockResolvedValueOnce(makeStreamMock({
    toolUses: [{ id: "tu_1", name: "redirect_to_router", input: { reason: "weather isn't my scope" } }],
    stopReason: "tool_use",
  }));
  // Iteration 2: router calls assign_agent → weather-agent
  sdkSpy.mockResolvedValueOnce(makeStreamMock({
    toolUses: [{ id: "tu_2", name: "assign_agent", input: { agent_id: "weather-agent", reason: "you asked about weather" } }],
    stopReason: "tool_use",
  }));
  // Iteration 3: weather-agent answers
  sdkSpy.mockResolvedValueOnce(makeStreamMock({ text: "It will be sunny.", stopReason: "end_turn" }));

  const sseLines: string[] = [];
  await request(app)
    .post(`/conversations/${conv.id}/messages`)
    .set("Authorization", `Bearer ${makeJwt(userId)}`)
    .send({ message: "What's the weather in Tokyo?" })
    .expect(200)
    .buffer(true)
    .parse((res, cb) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; sseLines.push(chunk.toString()); });
      res.on("end", () => cb(null, body));
    });

  const sse = sseLines.join("");
  expect(sse).toContain("event: redirect_to_router");
  expect(sse).toContain('"from":"travel-agent"');
  expect(sse).toContain('"to":"router"');
  expect(sse).toContain("event: assignment");
  expect(sse).toContain('"to":"weather-agent"');
  expect(sse.indexOf("redirect_to_router")).toBeLessThan(sse.indexOf("event: assignment"));

  expect(db.getConversation("c1")!.agentId).toBe("weather-agent");

  // Iteration 2's system prompt should contain [Re-engagement] and only the latest user message.
  const iter2Args = sdkSpy.mock.calls[1][0];
  expect(iter2Args.system).toContain("[Re-engagement]");
  expect(iter2Args.messages).toHaveLength(1);
  expect(iter2Args.messages[0].role).toBe("user");
  expect(iter2Args.messages[0].content).toBe("What's the weather in Tokyo?");
});

it("caps redirect_to_router at one call per HTTP turn", async () => {
  const a: AgentConfig = {
    id: "agent-a", name: "A", model: "m", maxTokens: 100, temperature: 0.5,
    systemPrompt: "You are A.", avatar: { emoji: "A", color: "#000" },
  };
  const router: AgentConfig = {
    id: "router", name: "Auto", model: "m", maxTokens: 100, temperature: 0.5,
    systemPrompt: "You are the router.", avatar: { emoji: "✨", color: "#000" },
    tools: ["assign_agent"],
  };
  const agents = new Map([["agent-a", a], ["router", router]]);
  const { app, db, sdkSpy } = setupApp({ agents });
  const userId = "u1";
  db.createUser(userId, "x@y.com", "h");
  const conv = db.createConversation("c1", "agent-a", userId);

  // Iteration 1: A redirects.
  sdkSpy.mockResolvedValueOnce(makeStreamMock({
    toolUses: [{ id: "tu_1", name: "redirect_to_router", input: { reason: "off-topic" } }],
    stopReason: "tool_use",
  }));
  // Iteration 2: router assigns back to agent-a.
  sdkSpy.mockResolvedValueOnce(makeStreamMock({
    toolUses: [{ id: "tu_2", name: "assign_agent", input: { agent_id: "agent-a", reason: "let A handle this" } }],
    stopReason: "tool_use",
  }));
  // Iteration 3: A tries to redirect AGAIN.
  sdkSpy.mockResolvedValueOnce(makeStreamMock({
    toolUses: [{ id: "tu_3", name: "redirect_to_router", input: { reason: "still off-topic" } }],
    stopReason: "tool_use",
  }));
  // Iteration 4: A is forced to respond with text after seeing the cap error.
  sdkSpy.mockResolvedValueOnce(makeStreamMock({ text: "Sorry, I can't help with that.", stopReason: "end_turn" }));

  await request(app)
    .post(`/conversations/${conv.id}/messages`)
    .set("Authorization", `Bearer ${makeJwt(userId)}`)
    .send({ message: "anything" })
    .expect(200);

  // Iteration 4: the tool_result that came back to A should contain the cap error.
  const iter4Args = sdkSpy.mock.calls[3][0];
  const lastMessage = iter4Args.messages[iter4Args.messages.length - 1];
  // tool_result is wrapped in a user-role message with content array
  const toolResultBlock = lastMessage.content.find((b: any) => b.type === "tool_result" && b.tool_use_id === "tu_3");
  expect(toolResultBlock).toBeDefined();
  expect(toolResultBlock.content).toContain("redirect already used");

  // Conversation ended on agent-a with the text reply.
  expect(db.getConversation("c1")!.agentId).toBe("agent-a");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm --filter @new-workshop/agent-service test -- routes
```
Expected: both new tests FAIL — the outer loop currently does not detect `[REDIRECT]`, does not build the single-message context, and does not cap redirects.

- [ ] **Step 3: Wire the redirect handling**

Modify `packages/agent-service/src/routes/conversations.ts`. The changes are inside the `router.post("/:id/messages", ...)` handler.

3a. Just before the `while (continueWithDelegation)` loop (around line 165, immediately after `let continueWithDelegation = true;`), declare two pieces of per-turn state:

```typescript
      let redirectsThisTurn = 0;
      let redirectJustHappened = false;
```

3b. Replace the `loopMessages` initialization (line 254 currently reads `const loopMessages: Array<{ role: string; content: any }> = claudeMessages;`) with:

```typescript
        let loopMessages: Array<{ role: string; content: any }>;
        if (redirectJustHappened && curAgentId === "router") {
          // Re-engagement turn: feed the router only the user's current message,
          // not the prior specialist's chat history.
          loopMessages = [{ role: "user", content: message }];
          redirectJustHappened = false;
        } else {
          loopMessages = claudeMessages;
        }
```

3c. Inside the `if (curIsDelegate) { ... }` system-prompt branch in the same iteration (around line 232), add a parallel branch for the re-engagement case. Insert *before* the `if (curIsDelegate)` block:

```typescript
        if (curAgentId === "router" && redirectJustHappened) {
          systemPrompt += `\n\n[Re-engagement]\nYou're being re-engaged because the previous specialist couldn't handle this message. Pick a new specialist with assign_agent. Do not ask follow-up questions; route immediately.`;
        }
```

Wait — `redirectJustHappened` was set to false in step 3b before this point. To make the system-prompt branch fire on the re-engagement iteration, we need the flag still to be true when the system prompt is built. Reorder: put the system-prompt branch *before* the `loopMessages` build (which is currently after it anyway in the source, line ~215 vs line ~254). The corrected sequence within one iteration is:

1. Build system prompt (consult `redirectJustHappened`, append `[Re-engagement]` if true).
2. Build `loopMessages` (consult `redirectJustHappened`, override to single message if true, then set the flag to false).

So in actual edit terms:

- The system-prompt addition (3c) goes right after line 230 (after the `[Available Specialist Agents]` block).
- The `loopMessages` change (3b) goes where the existing `const loopMessages = claudeMessages;` line is (~line 254), and is the place that finally clears the flag.

3d. Replace the `[ASSIGNMENT]` detection block at the bottom of the inner tool loop (currently around lines 410–418) with a branch that handles both `[ASSIGNMENT]` and `[REDIRECT]`. The current code is:

```typescript
          // Check if an assignment tool was invoked (terminal — router's turn is done)
          const hasAssignment = toolResults.some((r) => r.content.startsWith("[ASSIGNMENT]"));
          if (hasAssignment) {
            // assign_agent reassigns the conversation. Continue the outer loop so the
            // newly-assigned agent takes its turn immediately, responding to the user's
            // original message instead of forcing them to send another one.
            continueWithDelegation = true;
            break;
          }
```

Replace with:

```typescript
          // Check if a routing tool was invoked (assign_agent OR redirect_to_router).
          // Both terminate this agent's turn and re-loop with the new active agent.
          const hasAssignment = toolResults.some((r) => r.content.startsWith("[ASSIGNMENT]"));
          const hasRedirect = toolResults.some((r) => r.content.startsWith("[REDIRECT]"));
          if (hasAssignment || hasRedirect) {
            if (hasRedirect) {
              redirectsThisTurn++;
              redirectJustHappened = true;
            }
            continueWithDelegation = true;
            break;
          }
```

3e. Cap enforcement — when a tool *call* to `redirect_to_router` happens after `redirectsThisTurn` already equals 1, replace the tool result with a cap-error string before pushing it into `toolResults`. This happens inside the per-tool-execution loop around line 397–402 where each `result` is pushed. Find the line that currently looks like:

```typescript
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: result,
            });
```

Change it to wrap with the cap check. Just before this push, add:

```typescript
            let toolResultContent = result;
            if (toolUse.name === "redirect_to_router" && redirectsThisTurn >= 1) {
              toolResultContent = "Error: redirect already used in this turn. Please respond to the user with text instead.";
              // Note: by this point the tool's `execute` has already run and (incorrectly) flipped
              // agentId to router. Roll it back so the original agent keeps the turn.
              const conv = db.getConversation(conversation.id)!;
              if (conv.agentId === "router" && curAgentId !== "router") {
                db.setAgentId(conversation.id, curAgentId);
              }
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: toolResultContent,
            });
```

(Why we roll back: the tool `execute` is called before this gate. The cleanest fix would be to skip `execute` when the cap is already hit, but the tool dispatch is centralized in `toolService.execute` and reaching in to bypass it is more complex. Rolling back the side effect after-the-fact is a smaller change.)

After this push, the existing logic that detects `[REDIRECT]` (step 3d) will see the cap-error string (which does NOT start with `[REDIRECT]`), so `hasRedirect` will remain false on the second call, the outer loop will not re-iterate as a redirect, and the agent will be forced to answer with text.

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter @new-workshop/agent-service test -- routes
```
Expected: both new tests PASS. The previously-passing prompt-injection test still passes.

- [ ] **Step 5: Add the bidirectional bounce test in auto-mode**

Add to `packages/agent-service/src/__tests__/auto-mode.test.ts`:

```typescript
it("bounces travel → router → weather in a single HTTP turn after redirect", async () => {
  const travel: AgentConfig = {
    id: "travel-agent", name: "Travel", model: "m", maxTokens: 100, temperature: 0.5,
    systemPrompt: "Travel.", avatar: { emoji: "🤖", color: "#000" },
    topicBoundaries: { allowed: ["flights"], blocked: ["weather"], boundaryMessage: "n/a" },
  };
  const router: AgentConfig = {
    id: "router", name: "Auto", model: "m", maxTokens: 100, temperature: 0.5,
    systemPrompt: "Router.", avatar: { emoji: "✨", color: "#000" },
    tools: ["assign_agent"],
  };
  const weather: AgentConfig = {
    id: "weather-agent", name: "Weather", model: "m", maxTokens: 100, temperature: 0.5,
    systemPrompt: "Weather.", avatar: { emoji: "🌤", color: "#000" },
  };
  const agents = new Map([["travel-agent", travel], ["router", router], ["weather-agent", weather]]);
  const { app, db, sdkSpy } = setupApp({ agents });
  const userId = "u1";
  db.createUser(userId, "x@y.com", "h");
  const conv = db.createConversation("c1", "travel-agent", userId);
  // Pre-existing title so we can assert it isn't regenerated.
  db.setTitle(conv.id, "Existing Title");

  sdkSpy.mockResolvedValueOnce(makeStreamMock({
    toolUses: [{ id: "tu_1", name: "redirect_to_router", input: { reason: "off-scope" } }],
    stopReason: "tool_use",
  }));
  sdkSpy.mockResolvedValueOnce(makeStreamMock({
    toolUses: [{ id: "tu_2", name: "assign_agent", input: { agent_id: "weather-agent", reason: "weather q" } }],
    stopReason: "tool_use",
  }));
  sdkSpy.mockResolvedValueOnce(makeStreamMock({ text: "Sunny.", stopReason: "end_turn" }));

  await request(app)
    .post(`/conversations/${conv.id}/messages`)
    .set("Authorization", `Bearer ${makeJwt(userId)}`)
    .send({ message: "What's the weather?" })
    .expect(200);

  expect(db.getConversation(conv.id)!.agentId).toBe("weather-agent");
  expect(db.getConversation(conv.id)!.title).toBe("Existing Title"); // not regenerated
});
```

- [ ] **Step 6: Run all tests to verify nothing broke**

```
pnpm --filter @new-workshop/agent-service test
```
Expected: all PASS. (Legacy `guardrails.test.ts` still passes — it's deleted in Task 8.)

- [ ] **Step 7: Commit**

```bash
git add packages/agent-service/src/routes/conversations.ts \
        packages/agent-service/src/__tests__/routes.test.ts \
        packages/agent-service/src/__tests__/auto-mode.test.ts
git commit -m "feat(agent-service): wire redirect_to_router in outer loop with re-engagement context and per-turn cap"
```

---

## Task 5: Frontend types and SSE parsing

**Files:**
- Modify: `packages/web-client/src/types.ts`
- Modify: `packages/web-client/src/lib/api.ts`
- Modify: `packages/web-client/src/__tests__/api.test.ts`

This task extends the frontend's type system and SSE parser to recognize the new `redirect_to_router` event. No UI rendering yet — that's Task 6.

- [ ] **Step 1: Write the failing test**

In `packages/web-client/src/__tests__/api.test.ts`, **delete** the existing test at lines 89–114 titled `"calls onBlocked for blocked events"` — the `blocked` event is no longer emitted by the backend.

In its place, add:

```typescript
it("calls onRedirect for redirect_to_router events", async () => {
  const sseBody = [
    'event: redirect_to_router\ndata: {"from":"travel-agent","to":"router","agentName":"Auto","reason":"weather isn\'t my scope"}\n\n',
    'event: done\ndata: {"conversationId":"conv-123"}\n\n',
  ].join("");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseBody));
      controller.close();
    },
  });

  mockFetch.mockResolvedValue({ ok: true, status: 200, body: stream });

  const onRedirect = vi.fn();
  const onDone = vi.fn();

  await sendMessage("conv-123", "weather?", {
    onDelta: vi.fn(),
    onBlocked: vi.fn(),
    onError: vi.fn(),
    onTitle: vi.fn(),
    onDone,
    onRedirect,
  });

  expect(onRedirect).toHaveBeenCalledWith({
    from: "travel-agent",
    to: "router",
    agentName: "Auto",
    reason: "weather isn't my scope",
  });
  expect(onDone).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @new-workshop/web-client test -- api
```
Expected: FAIL — `onRedirect` is not a recognized callback (TypeScript will complain at the call site, and the test will not match).

- [ ] **Step 3: Extend the types**

In `packages/web-client/src/types.ts`:

1. Extend the `DelegationMeta.type` union (line 2):

```typescript
export interface DelegationMeta {
  type: "delegation_start" | "delegation_end" | "assignment" | "redirect_to_router";
  from: string;
  to: string;
  context?: string;
  summary?: string;
  agentName?: string;
  reason?: string;
}
```

2. Add `onRedirect` to `SendMessageCallbacks` (after `onAssignment` on line 79):

```typescript
  onRedirect?: (data: { from: string; to: string; agentName: string; reason: string }) => void;
```

- [ ] **Step 4: Wire the SSE parser**

In `packages/web-client/src/lib/api.ts`, find the event switch around line 159–199. After the `case "assignment":` branch (lines 178–180), add:

```typescript
          case "redirect_to_router":
            callbacks.onRedirect?.(data);
            break;
```

Also remove the `case "blocked":` branch (lines 163–165) — `blocked` events are no longer emitted. Keep the `onBlocked` callback in the type for backward compatibility with conversation history that may have stored old `blocked` system messages from before this change. (We won't render those, but we don't want to cause a typecheck regression in callers that still pass `onBlocked`.)

Actually — re-checking the type: `onBlocked` is `required` in `SendMessageCallbacks`, not optional. Make it optional now since the backend never fires it:

In `packages/web-client/src/types.ts`, change line 73 from:

```typescript
  onBlocked: (message: string) => void;
```

to:

```typescript
  onBlocked?: (message: string) => void;
```

This unblocks test fixtures that no longer need to pass `onBlocked`.

- [ ] **Step 5: Run test to verify it passes**

```
pnpm --filter @new-workshop/web-client test -- api
```
Expected: PASS. Other existing tests in `api.test.ts` still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/src/types.ts \
        packages/web-client/src/lib/api.ts \
        packages/web-client/src/__tests__/api.test.ts
git commit -m "feat(web-client): parse redirect_to_router SSE event"
```

---

## Task 6: Frontend banner rendering and `use-chat` hook

**Files:**
- Modify: `packages/web-client/src/hooks/use-chat.ts`
- Modify: `packages/web-client/src/components/delegation-banner.tsx`
- Modify: `packages/web-client/src/__tests__/use-chat.test.ts`

This task adds the visible UX surface: a banner that says *"<from-agent> sent you back to ✨ Auto — \<reason\>"* when the redirect event fires, and the hook logic that drops the stale specialist placeholder so the upcoming `assignment` event can mint a fresh one for the new specialist.

- [ ] **Step 1: Write the failing test**

In `packages/web-client/src/__tests__/use-chat.test.ts`, find the existing `"handles blocked messages as system messages"` test (around line 82) and **delete** it.

Add the following test at an analogous location in the file. Match the existing test's setup helpers (mocks for `sendMessage`, hook render utility, etc.):

```typescript
it("handles redirect_to_router event by dropping the stale assistant placeholder and inserting a banner", async () => {
  // Mock sendMessage so we can drive callbacks directly.
  vi.mocked(api.sendMessage).mockImplementation(async (_id, _message, callbacks) => {
    callbacks.onRedirect?.({
      from: "travel-agent",
      to: "router",
      agentName: "Auto",
      reason: "weather isn't my scope",
    });
    callbacks.onDone();
  });

  const { result } = renderHook(() => useChat({ /* match existing call shape */ }));
  // Pre-condition: a conversation is selected and a user message has been sent.
  // (Use the file's existing setup pattern to seed conversationId and one user message.)
  await act(async () => {
    await result.current.sendMessage("What's the weather?");
  });

  // The system banner is appended.
  const banner = result.current.messages.find(
    (m) => m.role === "system" && m.delegationMeta?.type === "redirect_to_router"
  );
  expect(banner).toBeDefined();
  expect(banner!.delegationMeta!.from).toBe("travel-agent");
  expect(banner!.delegationMeta!.to).toBe("router");
  expect(banner!.delegationMeta!.reason).toBe("weather isn't my scope");

  // The empty assistant placeholder for travel-agent is dropped (it never streamed any text).
  const emptyAssistant = result.current.messages.find(
    (m) => m.role === "assistant" && m.content === ""
  );
  expect(emptyAssistant).toBeUndefined();

  // The cached conversation's agentId is updated to "router".
  const cachedConv = result.current.conversations.find((c) => c.id === result.current.conversationId);
  expect(cachedConv?.agentId).toBe("router");
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @new-workshop/web-client test -- use-chat
```
Expected: FAIL — `onRedirect` is not handled in the hook.

- [ ] **Step 3: Add the `onRedirect` handler**

In `packages/web-client/src/hooks/use-chat.ts`, find the `onAssignment` handler (around line 276–318). Add a new `onRedirect` handler immediately before it:

```typescript
        onRedirect: (data) => {
          const banner: Message = {
            id: uuidv4(),
            role: "system",
            content: "",
            timestamp: new Date(),
            delegationMeta: {
              type: "redirect_to_router",
              from: data.from,
              to: data.to,
              agentName: data.agentName,
              reason: data.reason,
            },
          };
          setState((s) => ({
            ...s,
            messages: [
              // Drop the empty specialist placeholder; the upcoming assignment
              // event will mint a fresh placeholder for the next specialist.
              ...s.messages.filter((m) => !(m.id === assistantMessageId && m.content === "")),
              banner,
            ],
            conversations: s.conversations.map((c) =>
              c.id === s.conversationId ? { ...c, agentId: data.to } : c
            ),
          }));
          // The active assistant ref is now stale; the next assignment event mints a new one.
          activeAssistantIdRef.current = null;
          debug?.addEvent({
            type: "assignment",
            data: { from: data.from, to: data.to, agentName: data.agentName, reason: data.reason },
          });
        },
```

(The `assistantMessageId` and `activeAssistantIdRef` and `debug` are all already in scope at the call site — they're the same ones the existing `onAssignment` handler uses.)

- [ ] **Step 4: Render the redirect banner**

In `packages/web-client/src/components/delegation-banner.tsx`, add a new branch after the existing `assignment` branch (after line 60):

```typescript
  if (meta.type === "redirect_to_router") {
    const fromAgent = agents.find((a) => a.id === meta.from);
    const fromEmoji = fromAgent?.avatar?.emoji ?? "🤖";
    const fromName = fromAgent?.name ?? meta.from;
    // The redirect tool stores the user-facing reason in delegationMeta.summary
    // (the existing addDelegationMessage schema reuses that field for arbitrary text).
    const reason = meta.reason ?? meta.summary;

    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-xs text-muted">
          <span>{fromEmoji}</span>
          <span className="font-medium text-foreground">{fromName}</span>
          <span>sent you back to</span>
          <span>✨</span>
          <span className="font-medium text-foreground">Auto</span>
          {reason && <span className="text-muted">— {reason}</span>}
        </div>
      </div>
    );
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```
pnpm --filter @new-workshop/web-client test
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/src/hooks/use-chat.ts \
        packages/web-client/src/components/delegation-banner.tsx \
        packages/web-client/src/__tests__/use-chat.test.ts
git commit -m "feat(web-client): render redirect_to_router banner and update agentId in cache"
```

---

## Task 7: Manual smoke test

**Files:** None. Manual verification only.

This task validates the full flow in a real browser against real backend services. No code changes; either the test passes or you go back and find the bug.

- [ ] **Step 1: Restart all services**

Run from project root:

```bash
lsof -ti:3000 -ti:5173 -ti:5174 2>/dev/null | xargs kill 2>/dev/null
pnpm start
```

Wait for the readiness banner (backend `[startup] Agent service listening on http://localhost:3000`, `[fe]` Vite ready, `[admin]` Vite ready).

- [ ] **Step 2: Open the chat UI**

Open http://localhost:5173 in a browser. Sign in with your existing user (or create one).

- [ ] **Step 3: Verify entry point is Auto**

Click "New conversation". The agent selector should default to **✨ Auto** at the top.

- [ ] **Step 4: First exchange — Auto routes to travel-agent**

Send: *"Help me plan a trip to Tokyo."*

Expected:
- An "✨ Auto" banner appears: *"Connected you with 🤖 Travel Agent — you asked about travel"* (the exact reason text comes from the router's prompt).
- Travel Agent's reply streams in below the banner.
- The sidebar avatar for this conversation switches to the travel agent.

- [ ] **Step 5: Trigger a redirect**

Send (same conversation): *"What's the weather there next week?"*

Expected:
- A redirect banner appears: *"🤖 Travel Agent sent you back to ✨ Auto — \<reason\>"*.
- An assignment banner appears: *"✨ Connected you with 🌤 Weather Agent — \<reason\>"*.
- Weather Agent's reply streams in.
- Sidebar avatar updates to weather.

- [ ] **Step 6: Verify the bounce in the other direction**

Send (same conversation): *"Now book me a flight."*

Expected:
- Redirect banner from weather agent.
- Assignment banner to travel agent.
- Travel agent reply.

- [ ] **Step 7: Verify history persistence**

Refresh the browser tab. Re-open the same conversation from the sidebar.

Expected: all banners (assignment / redirect / assignment / redirect / assignment) render in order, with the correct reasons. Final agent avatar in the sidebar matches the last assigned specialist.

- [ ] **Step 8: Verify the no-regression case**

Click "New conversation". Send a vague off-topic question: *"What's the meaning of life?"*

Expected: Auto still classifies and routes within 1–3 turns (existing behavior). No regression on first-turn routing.

- [ ] **Step 9: If anything fails**

Stop. Read the backend logs in your `pnpm start` terminal (look for `[stream]`, `[guardrails]`, errors). Read the browser console (Cmd-Opt-I → Console). Diagnose the root cause and fix it. Do not proceed to Task 8 until all manual checks pass.

- [ ] **Step 10: Commit (no-op marker, optional)**

If you want a marker for "smoke test passed", commit an empty change:

```bash
git commit --allow-empty -m "test: redirect-to-router manual smoke test passed"
```

Otherwise skip — there's nothing to commit.

---

## Task 8: Cleanup pass — delete dead `guardrails.ts`

**Files:**
- Delete: `packages/agent-service/src/services/guardrails.ts`
- Delete: `packages/agent-service/src/__tests__/guardrails.test.ts`

The `checkTopicBoundary` function is no longer called from any production code path (verified by Task 3). The file and its test are dead weight.

- [ ] **Step 1: Verify no production code imports `guardrails.ts`**

```
grep -rn "from.*guardrails" packages/agent-service/src --include='*.ts' | grep -v __tests__
```
Expected output: empty (no matches in non-test files). If anything matches, stop and investigate before deleting.

- [ ] **Step 2: Delete the files**

```bash
rm packages/agent-service/src/services/guardrails.ts
rm packages/agent-service/src/__tests__/guardrails.test.ts
```

- [ ] **Step 3: Run the full test suite**

```
pnpm --filter @new-workshop/agent-service test
```
Expected: all PASS. No remaining test references the deleted file (the route-test reference was removed in Task 3).

If any test still imports `guardrails`, fix it (likely a leftover mock import — remove the `vi.mock(".../guardrails")` line and the `import { checkTopicBoundary }` line).

- [ ] **Step 4: Run typecheck end-to-end**

```
pnpm -r test
```
Expected: all packages PASS — no broken imports.

- [ ] **Step 5: Commit**

```bash
git add -A packages/agent-service/src/services/guardrails.ts \
          packages/agent-service/src/__tests__/guardrails.test.ts
git commit -m "chore(agent-service): remove dead guardrails module after redirect-to-router migration"
```

---

## Final verification

After all tasks complete:

- [ ] Run the full monorepo test suite from project root: `pnpm -r test`. Expected: PASS.
- [ ] Confirm `git log --oneline` shows the commits in the expected sequence (one per task that produced commits).
- [ ] Re-run the manual smoke test (Task 7) once more on the final code. Confirm the full bounce still works.
- [ ] Push the branch.
