# Debug Mode — Design Spec

**Date:** 2026-04-09
**Status:** Approved

## Summary

Add a developer-facing debug mode to the workshop app that exposes the full internal flow of agent conversations: which agent is handling a turn, Claude's extended thinking, tool call details (input/output/timing), delegation flow, and stream statistics. Toggled via a header badge, persisted per-user in localStorage.

## Requirements

- **Toggle:** Header badge button ("DEBUG" pill), gray when OFF, amber when ON
- **Persistence:** Per-user via `localStorage.debugMode`, applies across all conversations
- **Scope:** Debug events stream only for messages sent while debug is ON (no retroactive data, no DB persistence)
- **Debug ON enables:**
  - Side panel (300px, right side) with real-time chronological event log
  - Extended thinking on Claude API calls (`thinking: { type: "enabled", budget_tokens: 5000 }`)
- **Debug OFF:** Normal clean chat, no thinking, no panel, no extra SSE events

## Architecture: Extend Existing SSE Stream

The backend already streams SSE events (`delta`, `tool_start`, `tool_done`, `delegation_start`, etc.). Debug mode adds new event types, gated on a `?debug=true` query parameter. No new transport layer — everything flows through the existing SSE connection.

### New SSE Event Types

| Event | When | Payload |
|-------|------|---------|
| `debug_agent` | Before each Claude API call | `{ agentId, model, temperature, maxTokens, systemPromptPreview, isDelegated }` |
| `debug_thinking` | After Claude response, if thinking blocks present | `{ text }` |
| `debug_tool` | After tool execution completes | `{ tool, input, result, durationMs, resultSize }` |
| `debug_stream` | After stream ends (per iteration) | `{ tokens, stopReason, totalMs, iteration }` |

Existing events (`delta`, `tool_start`, `tool_done`, `delegation_start`, `delegation_end`, `assignment`, `done`) continue unchanged. Debug events are additive.

## Backend Changes

### File: `packages/agent-service/src/routes/conversations.ts`

**POST `/conversations/:id/messages`:**

1. Read `debug` flag from `req.query.debug === 'true'`
2. Pass `debug` boolean through the message handling flow
3. Before each Claude API call:
   - If `debug`, emit `debug_agent` event with agent metadata
   - If `debug`, add `thinking: { type: "enabled", budget_tokens: 5000 }` to Claude API params
4. After Claude response:
   - If `debug` and response contains thinking blocks, emit `debug_thinking` with thinking text
5. After each tool execution:
   - If `debug`, emit `debug_tool` with tool name, input, result preview, duration, and result size
6. After stream ends (per inner-loop iteration):
   - If `debug`, emit `debug_stream` with token count, stop reason, total time, and iteration number

### Extended Thinking Integration

- Add `thinking` param to `getClient().messages.stream()` call when `debug` is true
- Extract thinking blocks from `finalMessage.content` (type `"thinking"` blocks)
- Thinking text is streamed as a single `debug_thinking` event after the response completes (not delta-streamed)

### No Changes To

- Database schema — debug events are ephemeral, not persisted
- Agent loading — no new frontmatter fields
- Tool service — tool execution unchanged, just emit extra event after
- Guardrails — unchanged
- Auth — unchanged

## Frontend Changes

### New Hook: `useDebug`

**File:** `packages/web-client/src/hooks/use-debug.ts`

```typescript
interface DebugEvent {
  id: string;
  timestamp: Date;
  type: 'agent' | 'thinking' | 'tool' | 'stream' | 'delegation' | 'assignment';
  data: Record<string, unknown>;
  turn?: string; // groups events by user message
}

interface UseDebugReturn {
  isDebug: boolean;
  toggleDebug: () => void;
  debugEvents: DebugEvent[];
  clearEvents: () => void;
  addEvent: (event: Omit<DebugEvent, 'id' | 'timestamp'>) => void;
  startTurn: (userMessage: string) => void;
}
```

- Reads/writes `localStorage.debugMode`
- `debugEvents` is an in-memory array, cleared on `clearEvents()` or page refresh
- `startTurn()` creates a turn separator for grouping events in the panel

### API Layer Changes

**File:** `packages/web-client/src/lib/api.ts`

- `sendMessage()` accepts `debug?: boolean` parameter
- When true, appends `?debug=true` to POST URL
- Add new SSE event handlers in the event parser:
  - `debug_agent` → `onDebugAgent` callback
  - `debug_thinking` → `onDebugThinking` callback
  - `debug_tool` → `onDebugTool` callback
  - `debug_stream` → `onDebugStream` callback

### Chat Hook Integration

**File:** `packages/web-client/src/hooks/use-chat.ts`

- Import `useDebug` hook
- Pass `isDebug` to `apiSendMessage()` call
- Wire debug callbacks to `addEvent()`:
  - Also pipe existing `delegation_start`, `delegation_end`, `assignment` events to debug panel

### New Component: `DebugToggle`

**File:** `packages/web-client/src/components/debug-toggle.tsx`

- Pill-shaped button rendered in the chat header
- Gray background + gray dot when OFF, amber background + black dot when ON
- Calls `toggleDebug()` on click

### New Component: `DebugPanel`

**File:** `packages/web-client/src/components/debug-panel.tsx`

- Fixed 300px width panel on the right side of the chat area
- Only renders when `isDebug` is true
- Header: "Debug Log" label + "Clear" button
- Body: scrollable event list, auto-scrolls to bottom on new events
- Events grouped by turn (separator with truncated user message)
- Each event type has distinct styling:
  - **AGENT** (blue dot): agent name, model, temperature, max tokens
  - **THINKING** (purple dot): thinking text with left purple border, collapsible if > 3 lines
  - **TOOL** (amber dot): tool name, input JSON, result preview, duration badge (green)
  - **STREAM** (green dot): token count, stop reason, total time
  - **DELEGATE/HAND BACK** (pink dot): from/to agent, context/summary
  - **ASSIGNMENT** (pink dot): router → agent, reason

### Layout Changes

**File:** `packages/web-client/src/components/chat-container.tsx` (or equivalent)

- Chat area wraps in a flex container
- When `isDebug`: chat area is `flex: 1`, debug panel is `width: 300px`
- CSS transition on panel width for smooth open/close
- Below 768px viewport: panel overlays chat (absolute positioned) instead of pushing

## Event Flow Summary

```
User clicks Send (debug=true in localStorage)
  → api.sendMessage(text, { debug: true })
    → POST /conversations/:id/messages?debug=true
      → Backend reads debug flag
      → Emits debug_agent (agent metadata)
      → Calls Claude with thinking enabled
      → Streams delta events (normal)
      → Emits debug_thinking (Claude's reasoning)
      → If tool_use: executes tool, emits debug_tool
      → Emits debug_stream (stats)
      → If delegation: emits delegation_start (existing) + debug_agent for new agent
    → Frontend SSE parser routes debug_* events to onDebug* callbacks
    → useDebug.addEvent() appends to debugEvents array
    → DebugPanel re-renders with new events
```

## Edge Cases

- **Toggle mid-conversation:** Next message sent uses new debug state. In-flight messages keep their original state.
- **Multiple tool iterations:** Each Claude API call in the inner tool loop emits its own `debug_agent` + `debug_stream`. Tools emit `debug_tool` individually.
- **Delegation chains:** Each agent in the delegation emits its own `debug_agent`. Delegation events from existing SSE are also piped to the debug panel.
- **Guardrail blocks:** If guardrails reject the message before streaming starts, no debug events are emitted (the `blocked` event fires as usual).
- **Extended thinking budget:** Fixed at 5000 tokens. Not user-configurable in this iteration.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/web-client/src/hooks/use-debug.ts` | Debug state management hook |
| `packages/web-client/src/components/debug-toggle.tsx` | Header toggle button |
| `packages/web-client/src/components/debug-panel.tsx` | Side panel component |

## Files to Modify

| File | Change |
|------|--------|
| `packages/agent-service/src/routes/conversations.ts` | Read debug flag, emit debug events, enable extended thinking |
| `packages/web-client/src/lib/api.ts` | Pass debug param, parse new SSE events, add callbacks |
| `packages/web-client/src/hooks/use-chat.ts` | Wire useDebug, pass debug flag and callbacks |
| `packages/web-client/src/components/chat-container.tsx` | Flex layout with conditional debug panel |
| `packages/web-client/src/components/chat-container.tsx` (header area) | Render DebugToggle |
| `packages/web-client/src/types.ts` | Add DebugEvent type, extend SendMessageCallbacks |

## Out of Scope

- Persisting debug events in the database
- Retroactive debug data for past messages
- Per-conversation debug toggle
- Configurable thinking budget
- Keyboard shortcut for toggle
- Export/download debug log
