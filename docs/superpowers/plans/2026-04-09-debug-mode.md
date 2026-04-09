# Debug Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a developer-facing debug mode that exposes agent reasoning, tool calls, delegation flow, and extended thinking in a real-time side panel.

**Architecture:** Extend the existing SSE stream with four new debug event types (`debug_agent`, `debug_thinking`, `debug_tool`, `debug_stream`), gated on a `?debug=true` query parameter. Frontend manages debug state in localStorage, renders events in a 300px collapsible side panel. Extended thinking is enabled on the Claude API call when debug is active.

**Tech Stack:** Express (backend SSE), Anthropic SDK (extended thinking), React + TypeScript (frontend), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-04-09-debug-mode-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/web-client/src/hooks/use-debug.ts` | Debug state hook — localStorage persistence, event array, turn grouping |
| `packages/web-client/src/components/debug-toggle.tsx` | Header badge button for toggling debug mode |
| `packages/web-client/src/components/debug-panel.tsx` | Side panel rendering chronological debug event log |
| `packages/web-client/src/__tests__/use-debug.test.ts` | Tests for the debug hook |

### Modified Files
| File | Change |
|------|--------|
| `packages/web-client/src/types.ts` | Add `DebugEvent` type, extend `SendMessageCallbacks` with debug callbacks |
| `packages/web-client/src/lib/api.ts` | Accept `debug` param, append `?debug=true` to URL, route new SSE events |
| `packages/web-client/src/hooks/use-chat.ts` | Wire `useDebug`, pass debug flag and callbacks to `apiSendMessage` |
| `packages/web-client/src/components/chat-container.tsx` | Add flex layout with conditional debug panel, render DebugToggle in header |
| `packages/web-client/src/App.tsx` | Thread debug hook from App into ChatContainer |
| `packages/agent-service/src/routes/conversations.ts` | Read `debug` query param, emit debug SSE events, enable extended thinking |
| `packages/web-client/src/__tests__/api.test.ts` | Test that `debug=true` appends query param and routes debug SSE events |
| `packages/agent-service/src/__tests__/routes.test.ts` | Test that `?debug=true` emits debug events, `?debug` absent does not |

---

### Task 1: Add debug types to frontend

**Files:**
- Modify: `packages/web-client/src/types.ts`

- [ ] **Step 1: Add DebugEvent interface and extend SendMessageCallbacks**

In `packages/web-client/src/types.ts`, add the `DebugEvent` interface after the existing `DelegationMeta` interface (before the `Message` interface), and extend `SendMessageCallbacks` with optional debug callbacks:

```typescript
// Add after DelegationMeta interface (line 9), before Message interface

export interface DebugEvent {
  id: string;
  timestamp: Date;
  type: 'agent' | 'thinking' | 'tool' | 'stream' | 'delegation' | 'assignment';
  data: Record<string, unknown>;
  turn?: string;
}
```

Add to the `SendMessageCallbacks` interface (after the `onAssignment` line):

```typescript
  onDebugAgent?: (data: { agentId: string; model: string; temperature: number; maxTokens: number; systemPromptPreview: string; isDelegated: boolean }) => void;
  onDebugThinking?: (data: { text: string }) => void;
  onDebugTool?: (data: { tool: string; input: Record<string, unknown>; result: string; durationMs: number; resultSize: number }) => void;
  onDebugStream?: (data: { tokens: number; stopReason: string; totalMs: number; iteration: number }) => void;
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/types.ts
git commit -m "feat(web-client): add DebugEvent type and debug SSE callbacks"
```

---

### Task 2: Create useDebug hook

**Files:**
- Create: `packages/web-client/src/hooks/use-debug.ts`
- Create: `packages/web-client/src/__tests__/use-debug.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-client/src/__tests__/use-debug.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebug } from "../hooks/use-debug";

beforeEach(() => {
  localStorage.clear();
});

describe("useDebug", () => {
  it("defaults to debug OFF", () => {
    const { result } = renderHook(() => useDebug());
    expect(result.current.isDebug).toBe(false);
    expect(result.current.debugEvents).toEqual([]);
  });

  it("reads initial state from localStorage", () => {
    localStorage.setItem("debugMode", "true");
    const { result } = renderHook(() => useDebug());
    expect(result.current.isDebug).toBe(true);
  });

  it("toggleDebug flips state and persists to localStorage", () => {
    const { result } = renderHook(() => useDebug());
    expect(result.current.isDebug).toBe(false);

    act(() => result.current.toggleDebug());
    expect(result.current.isDebug).toBe(true);
    expect(localStorage.getItem("debugMode")).toBe("true");

    act(() => result.current.toggleDebug());
    expect(result.current.isDebug).toBe(false);
    expect(localStorage.getItem("debugMode")).toBe("false");
  });

  it("addEvent appends to debugEvents with auto-generated id and timestamp", () => {
    const { result } = renderHook(() => useDebug());
    act(() => {
      result.current.addEvent({ type: "agent", data: { agentId: "test-bot" } });
    });
    expect(result.current.debugEvents).toHaveLength(1);
    expect(result.current.debugEvents[0].type).toBe("agent");
    expect(result.current.debugEvents[0].data.agentId).toBe("test-bot");
    expect(result.current.debugEvents[0].id).toBeDefined();
    expect(result.current.debugEvents[0].timestamp).toBeInstanceOf(Date);
  });

  it("startTurn sets turn label on subsequent events", () => {
    const { result } = renderHook(() => useDebug());
    act(() => result.current.startTurn("What is the weather?"));
    act(() => result.current.addEvent({ type: "agent", data: { agentId: "weather" } }));
    expect(result.current.debugEvents[0].turn).toBe("What is the weather?");
  });

  it("clearEvents empties the array", () => {
    const { result } = renderHook(() => useDebug());
    act(() => result.current.addEvent({ type: "stream", data: {} }));
    expect(result.current.debugEvents).toHaveLength(1);
    act(() => result.current.clearEvents());
    expect(result.current.debugEvents).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client test -- --run src/__tests__/use-debug.test.ts`
Expected: FAIL — module `../hooks/use-debug` not found

- [ ] **Step 3: Implement useDebug hook**

Create `packages/web-client/src/hooks/use-debug.ts`:

```typescript
import { useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { DebugEvent } from "../types";

const DEBUG_KEY = "debugMode";

export function useDebug() {
  const [isDebug, setIsDebug] = useState(() => localStorage.getItem(DEBUG_KEY) === "true");
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const currentTurnRef = useRef<string | undefined>(undefined);

  const toggleDebug = useCallback(() => {
    setIsDebug((prev) => {
      const next = !prev;
      localStorage.setItem(DEBUG_KEY, String(next));
      return next;
    });
  }, []);

  const addEvent = useCallback((event: Omit<DebugEvent, "id" | "timestamp">) => {
    const newEvent: DebugEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date(),
      turn: event.turn ?? currentTurnRef.current,
    };
    setDebugEvents((prev) => [...prev, newEvent]);
  }, []);

  const startTurn = useCallback((userMessage: string) => {
    currentTurnRef.current = userMessage;
  }, []);

  const clearEvents = useCallback(() => {
    setDebugEvents([]);
    currentTurnRef.current = undefined;
  }, []);

  return { isDebug, toggleDebug, debugEvents, addEvent, startTurn, clearEvents };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client test -- --run src/__tests__/use-debug.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/src/hooks/use-debug.ts packages/web-client/src/__tests__/use-debug.test.ts
git commit -m "feat(web-client): add useDebug hook with localStorage persistence"
```

---

### Task 3: Extend API layer to handle debug param and debug SSE events

**Files:**
- Modify: `packages/web-client/src/lib/api.ts`
- Modify: `packages/web-client/src/__tests__/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of `packages/web-client/src/__tests__/api.test.ts`:

```typescript
describe("sendMessage with debug", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("appends ?debug=true to URL when debug option is set", async () => {
    const sseBody = 'event: done\ndata: {"conversationId":"conv-123"}\n\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: stream });

    await sendMessage("conv-123", "Hi", { onDelta: vi.fn(), onBlocked: vi.fn(), onError: vi.fn(), onTitle: vi.fn(), onDone: vi.fn() }, { debug: true });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/conversations/conv-123/messages?debug=true",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not append ?debug=true when debug is false", async () => {
    const sseBody = 'event: done\ndata: {"conversationId":"conv-123"}\n\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: stream });

    await sendMessage("conv-123", "Hi", { onDelta: vi.fn(), onBlocked: vi.fn(), onError: vi.fn(), onTitle: vi.fn(), onDone: vi.fn() });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/conversations/conv-123/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes debug SSE events to debug callbacks", async () => {
    const sseBody = [
      'event: debug_agent\ndata: {"agentId":"test-bot","model":"claude-sonnet-4","temperature":0.7,"maxTokens":1024,"systemPromptPreview":"You are...","isDelegated":false}\n\n',
      'event: debug_thinking\ndata: {"text":"Let me think about this..."}\n\n',
      'event: debug_tool\ndata: {"tool":"browse_url","input":{"url":"https://example.com"},"result":"page content","durationMs":500,"resultSize":100}\n\n',
      'event: debug_stream\ndata: {"tokens":42,"stopReason":"end_turn","totalMs":1500,"iteration":1}\n\n',
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

    const onDebugAgent = vi.fn();
    const onDebugThinking = vi.fn();
    const onDebugTool = vi.fn();
    const onDebugStream = vi.fn();

    await sendMessage("conv-123", "Hi", {
      onDelta: vi.fn(), onBlocked: vi.fn(), onError: vi.fn(), onTitle: vi.fn(), onDone: vi.fn(),
      onDebugAgent, onDebugThinking, onDebugTool, onDebugStream,
    }, { debug: true });

    expect(onDebugAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: "test-bot", model: "claude-sonnet-4" }));
    expect(onDebugThinking).toHaveBeenCalledWith(expect.objectContaining({ text: "Let me think about this..." }));
    expect(onDebugTool).toHaveBeenCalledWith(expect.objectContaining({ tool: "browse_url", durationMs: 500 }));
    expect(onDebugStream).toHaveBeenCalledWith(expect.objectContaining({ tokens: 42, stopReason: "end_turn" }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client test -- --run src/__tests__/api.test.ts`
Expected: FAIL — `sendMessage` doesn't accept a 4th argument, debug events not routed

- [ ] **Step 3: Modify sendMessage to accept debug option and route debug events**

In `packages/web-client/src/lib/api.ts`, change the `sendMessage` function signature (line 120) from:

```typescript
export async function sendMessage(
  conversationId: string,
  message: string,
  callbacks: SendMessageCallbacks
): Promise<void> {
```

to:

```typescript
export async function sendMessage(
  conversationId: string,
  message: string,
  callbacks: SendMessageCallbacks,
  options?: { debug?: boolean }
): Promise<void> {
```

Change the fetch URL (line 125-126) from:

```typescript
  const res = await fetch(
    `${BASE_URL}/api/conversations/${conversationId}/messages`,
```

to:

```typescript
  const url = `${BASE_URL}/api/conversations/${conversationId}/messages${options?.debug ? '?debug=true' : ''}`;
  const res = await fetch(
    url,
```

Add debug event cases in the switch statement (after the `case "assignment":` block, before `case "done":`):

```typescript
          case "debug_agent":
            callbacks.onDebugAgent?.(data);
            break;
          case "debug_thinking":
            callbacks.onDebugThinking?.(data);
            break;
          case "debug_tool":
            callbacks.onDebugTool?.(data);
            break;
          case "debug_stream":
            callbacks.onDebugStream?.(data);
            break;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client test -- --run src/__tests__/api.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/src/lib/api.ts packages/web-client/src/__tests__/api.test.ts
git commit -m "feat(web-client): add debug param and debug SSE event routing to API layer"
```

---

### Task 4: Backend — emit debug SSE events and enable extended thinking

**Files:**
- Modify: `packages/agent-service/src/routes/conversations.ts`
- Modify: `packages/agent-service/src/__tests__/routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of `packages/agent-service/src/__tests__/routes.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run src/__tests__/routes.test.ts`
Expected: FAIL — no `debug_agent` or `debug_stream` events in response

- [ ] **Step 3: Implement debug event emission in conversations.ts**

In `packages/agent-service/src/routes/conversations.ts`, make these changes inside the `POST /:id/messages` handler:

**3a. Read debug flag** — after `startSSE(res);` (line 154), add:

```typescript
      const debug = req.query.debug === "true";
```

**3b. Emit debug_agent before each Claude call** — right before `const streamStart = Date.now();` (line 265), add:

```typescript
          if (debug) {
            writeSSE(res, "debug_agent", {
              agentId: curAgentId,
              model: curAgent.model,
              temperature: curAgent.temperature,
              maxTokens: curAgent.maxTokens,
              systemPromptPreview: curAgent.systemPrompt.slice(0, 200),
              isDelegated: curIsDelegate,
            });
          }
```

**3c. Enable extended thinking** — after building `streamParams` (after line 263, the `};` that closes the streamParams object), add:

```typescript
          if (debug) {
            streamParams.thinking = { type: "enabled", budget_tokens: 5000 };
          }
```

**3d. Emit debug_thinking after stream** — after `const finalMessage = await stream.finalMessage();` and `const streamMs = Date.now() - streamStart;` (around line 289), add:

```typescript
          if (debug) {
            const thinkingBlocks = finalMessage.content.filter(
              (block: any) => block.type === "thinking"
            );
            for (const block of thinkingBlocks) {
              writeSSE(res, "debug_thinking", { text: (block as any).thinking });
            }
          }
```

**3e. Emit debug_stream after each iteration** — after the `console.log(\`[stream] Response complete...` line (around line 291), add:

```typescript
          if (debug) {
            writeSSE(res, "debug_stream", {
              tokens: finalMessage.usage?.output_tokens ?? 0,
              stopReason: finalMessage.stop_reason,
              totalMs: streamMs,
              iteration: iterations,
            });
          }
```

**3f. Emit debug_tool after each tool execution** — after the existing `writeSSE(res, "tool_done", ...)` line (around line 326), add:

```typescript
              if (debug) {
                writeSSE(res, "debug_tool", {
                  tool: toolUse.name,
                  input: toolUse.input,
                  result: result.slice(0, 500),
                  durationMs: toolMs,
                  resultSize: result.length,
                });
              }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test -- --run src/__tests__/routes.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run all backend tests to check for regressions**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent-service/src/routes/conversations.ts packages/agent-service/src/__tests__/routes.test.ts
git commit -m "feat(agent-service): emit debug SSE events and enable extended thinking when ?debug=true"
```

---

### Task 5: Create DebugToggle component

**Files:**
- Create: `packages/web-client/src/components/debug-toggle.tsx`

- [ ] **Step 1: Create DebugToggle component**

Create `packages/web-client/src/components/debug-toggle.tsx`:

```tsx
interface DebugToggleProps {
  isDebug: boolean;
  onToggle: () => void;
}

export function DebugToggle({ isDebug, onToggle }: DebugToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
        isDebug
          ? "bg-amber-500 text-black"
          : "border border-border bg-secondary text-muted-foreground hover:text-foreground"
      }`}
      title={isDebug ? "Debug mode ON — click to disable" : "Debug mode OFF — click to enable"}
    >
      <span
        className={`h-2 w-2 rounded-full ${isDebug ? "bg-black" : "bg-muted-foreground"}`}
      />
      DEBUG
    </button>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/components/debug-toggle.tsx
git commit -m "feat(web-client): add DebugToggle header badge component"
```

---

### Task 6: Create DebugPanel component

**Files:**
- Create: `packages/web-client/src/components/debug-panel.tsx`

- [ ] **Step 1: Create DebugPanel component**

Create `packages/web-client/src/components/debug-panel.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { DebugEvent } from "../types";

interface DebugPanelProps {
  events: DebugEvent[];
  onClear: () => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const EVENT_STYLES: Record<string, { color: string; label: string }> = {
  agent: { color: "text-blue-400", label: "AGENT" },
  thinking: { color: "text-purple-400", label: "THINKING" },
  tool: { color: "text-amber-400", label: "TOOL" },
  stream: { color: "text-green-400", label: "STREAM" },
  delegation: { color: "text-pink-400", label: "DELEGATE" },
  assignment: { color: "text-pink-400", label: "ASSIGN" },
};

function ThinkingContent({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;
  const display = isLong && !expanded ? text.slice(0, 200) + "..." : text;

  return (
    <div className="border-l-2 border-purple-400/30 pl-2 text-muted-foreground">
      {display}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-purple-400 hover:underline"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

function EventEntry({ event }: { event: DebugEvent }) {
  const style = EVENT_STYLES[event.type] ?? { color: "text-muted-foreground", label: event.type.toUpperCase() };
  const data = event.data;

  return (
    <div className="flex gap-1.5 mb-2">
      <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.color.replace("text-", "bg-")}`} />
      <div className="min-w-0 text-xs font-mono">
        <div className={`font-semibold ${style.color}`}>
          {style.label}
          {event.type === "tool" && <span className="text-muted-foreground font-normal ml-1">{String(data.tool)}</span>}
          {event.type === "agent" && data.isDelegated && <span className="text-pink-400 font-normal ml-1">(delegated)</span>}
        </div>

        {event.type === "agent" && (
          <>
            <div className="text-muted-foreground">{String(data.agentId)}</div>
            <div className="text-muted-foreground/60">{String(data.model)} · temp {String(data.temperature)} · {String(data.maxTokens)} max</div>
          </>
        )}

        {event.type === "thinking" && <ThinkingContent text={String(data.text)} />}

        {event.type === "tool" && (
          <>
            <div className="text-muted-foreground/60 truncate">→ {JSON.stringify(data.input)}</div>
            <div className="text-muted-foreground/60 truncate">← {String(data.resultSize)} chars</div>
            <span className="inline-block rounded bg-green-500/10 px-1.5 text-green-400 text-[10px]">
              {String(data.durationMs)}ms
            </span>
          </>
        )}

        {event.type === "stream" && (
          <div className="text-muted-foreground/60">
            {String(data.tokens)} tokens · {String(data.stopReason)} · {String(data.totalMs)}ms
          </div>
        )}

        {event.type === "delegation" && (
          <>
            <div className="text-muted-foreground">{String(data.from)} → {String(data.to)}</div>
            {data.context && <div className="text-muted-foreground/60 truncate">context: {String(data.context)}</div>}
            {data.summary && <div className="text-muted-foreground/60 truncate">summary: {String(data.summary)}</div>}
          </>
        )}

        {event.type === "assignment" && (
          <>
            <div className="text-muted-foreground">{String(data.from)} → {String(data.to)}</div>
            {data.reason && <div className="text-muted-foreground/60 truncate">reason: {String(data.reason)}</div>}
          </>
        )}
      </div>
    </div>
  );
}

export function DebugPanel({ events, onClear }: DebugPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  // Group events by turn
  const turns: Array<{ label?: string; events: DebugEvent[] }> = [];
  let currentTurn: string | undefined;

  for (const event of events) {
    if (event.turn !== currentTurn) {
      currentTurn = event.turn;
      turns.push({ label: currentTurn, events: [event] });
    } else {
      turns[turns.length - 1]?.events.push(event);
    }
  }

  return (
    <div className="flex w-[300px] shrink-0 flex-col border-l border-border bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-amber-400">Debug Log</span>
        <button
          onClick={onClear}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {events.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/50 mt-8">
            Send a message to see debug events...
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="mb-3">
            {turn.label && (
              <div className="mb-2 border-b border-border/50 pb-1 text-[10px] text-muted-foreground/50 truncate">
                {turn.label}
              </div>
            )}
            {turn.events.map((event) => (
              <EventEntry key={event.id} event={event} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/components/debug-panel.tsx
git commit -m "feat(web-client): add DebugPanel side panel component"
```

---

### Task 7: Wire everything together — ChatContainer, useChat, App

**Files:**
- Modify: `packages/web-client/src/components/chat-container.tsx`
- Modify: `packages/web-client/src/hooks/use-chat.ts`
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Update ChatContainer to accept and render debug props**

Replace the entire content of `packages/web-client/src/components/chat-container.tsx` with:

```tsx
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { AgentSelector } from "./agent-selector";
import { DebugToggle } from "./debug-toggle";
import { DebugPanel } from "./debug-panel";
import { Button } from "./ui/button";
import type { Message, AgentSummary, DebugEvent } from "../types";

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
  isDebug: boolean;
  onDebugToggle: () => void;
  debugEvents: DebugEvent[];
  onDebugClear: () => void;
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
  isDebug,
  onDebugToggle,
  debugEvents,
  onDebugClear,
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
    <div className="flex flex-1">
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <AgentSelector
            agents={agents}
            currentAgentId={currentAgentId}
            locked={hasMessages}
            onSelect={onAgentChange}
          />
          <DebugToggle isDebug={isDebug} onToggle={onDebugToggle} />
        </div>

        {/* Messages */}
        <MessageList messages={messages} isStreaming={isStreaming} agents={agents} />

        {/* Error banner */}
        {error && conversationId && (
          <div className="border-t border-red-900/50 bg-red-950/30 px-4 py-2 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Input */}
        <ChatInput onSend={onSend} disabled={isStreaming || isConnecting} />
      </div>

      {isDebug && <DebugPanel events={debugEvents} onClear={onDebugClear} />}
    </div>
  );
}
```

- [ ] **Step 2: Update useChat to accept and wire debug callbacks**

In `packages/web-client/src/hooks/use-chat.ts`, make these changes:

**2a.** Add import at the top (after existing imports):

```typescript
import type { useDebug } from "./use-debug";
```

**2b.** Change the `useChat` function signature (line 22) from:

```typescript
export function useChat(defaultAgentId: string | null, agentIds: string[] = []) {
```

to:

```typescript
export function useChat(
  defaultAgentId: string | null,
  agentIds: string[] = [],
  debug?: ReturnType<typeof useDebug>
) {
```

**2c.** In the `sendMessage` callback, right after `setState((s) => ({ ...s, messages: [...` (around line 196, after the `isStreaming: true` setState), add:

```typescript
      if (debug?.isDebug) {
        debug.startTurn(text);
      }
```

**2d.** Change the `apiSendMessage` call (line 199) from:

```typescript
      apiSendMessage(state.conversationId, text, {
```

to:

```typescript
      apiSendMessage(state.conversationId, text, {
```

(The call itself stays the same, but we need to add the options argument at the end.) After the closing `});` of the callbacks object (around line 331), add the options argument:

Change:
```typescript
      });
```

to:
```typescript
      }, { debug: debug?.isDebug });
```

**2e.** Add debug callbacks inside the callbacks object, after the `onDelegationEnd` callback (before the closing `}`). Add these alongside the existing delegation callbacks so debug events are also piped to the panel:

```typescript
        onDebugAgent: (data) => {
          debug?.addEvent({ type: "agent", data });
        },
        onDebugThinking: (data) => {
          debug?.addEvent({ type: "thinking", data });
        },
        onDebugTool: (data) => {
          debug?.addEvent({ type: "tool", data });
        },
        onDebugStream: (data) => {
          debug?.addEvent({ type: "stream", data });
        },
```

**2f.** Also update the existing `onDelegationStart` callback to pipe to debug panel. After the existing `setState` call inside `onDelegationStart` (around line 311), add:

```typescript
          debug?.addEvent({
            type: "delegation",
            data: { from: data.from, to: data.to, context: data.context, agentName: data.agentName },
          });
```

**2g.** Similarly, after the `setState` call inside `onDelegationEnd` (around line 329), add:

```typescript
          debug?.addEvent({
            type: "delegation",
            data: { from: data.from, to: data.to, summary: data.summary, agentName: data.agentName },
          });
```

**2h.** And after the `setState` call inside `onAssignment` (around line 284), add:

```typescript
          debug?.addEvent({
            type: "assignment",
            data: { from: data.from, to: data.to, agentName: data.agentName, reason: data.reason },
          });
```

**2i.** Update the `sendMessage` dependency array to include `debug?.isDebug`:

Change:
```typescript
    [state.conversationId, state.isStreaming]
```

to:
```typescript
    [state.conversationId, state.isStreaming, debug]
```

- [ ] **Step 3: Update App.tsx to create debug hook and pass it through**

In `packages/web-client/src/App.tsx`, add the import (after existing imports):

```typescript
import { useDebug } from "./hooks/use-debug";
```

Inside `AuthenticatedApp`, add the hook call (after the `useCopilot` call, around line 24):

```typescript
  const debug = useDebug();
```

Update the `useChat` call to pass the debug hook:

Change:
```typescript
  } = useChat(agents[0]?.id ?? null, agents.map((a) => a.id));
```

to:
```typescript
  } = useChat(agents[0]?.id ?? null, agents.map((a) => a.id), debug);
```

Add debug props to the `ChatContainer` JSX (after `onRetry`):

```tsx
        isDebug={debug.isDebug}
        onDebugToggle={debug.toggleDebug}
        debugEvents={debug.debugEvents}
        onDebugClear={debug.clearEvents}
```

- [ ] **Step 4: Verify types compile**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run all frontend tests**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client test`
Expected: All tests PASS

- [ ] **Step 6: Run all backend tests**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/agent-service test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web-client/src/components/chat-container.tsx packages/web-client/src/hooks/use-chat.ts packages/web-client/src/App.tsx
git commit -m "feat: wire debug mode through ChatContainer, useChat, and App"
```

---

### Task 8: Manual smoke test

- [ ] **Step 1: Restart services**

If services are running, stop them with Ctrl-C then:

```bash
cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm start
```

- [ ] **Step 2: Test debug OFF (default)**

Open `http://localhost:5173`. The DEBUG badge should appear gray in the header. Send a message — no debug panel should appear, chat works normally.

- [ ] **Step 3: Test debug ON**

Click the DEBUG badge — it should turn amber, and a debug panel should appear on the right. Send a message. The debug panel should show:
- AGENT event (blue) with agent name, model, temperature
- THINKING event (purple) with Claude's reasoning text
- TOOL events (amber) if the agent uses tools
- STREAM event (green) with token count and timing

- [ ] **Step 4: Test toggle persistence**

Refresh the page. The debug badge should still be amber (persisted in localStorage). Click it again to turn off — panel disappears, badge goes gray. Refresh — stays off.

- [ ] **Step 5: Test with delegation**

If you have the router agent, start a new conversation with it. Send a message that triggers delegation (e.g., "What's the weather in Tokyo?"). The debug panel should show DELEGATE events alongside the agent/tool/stream events.
