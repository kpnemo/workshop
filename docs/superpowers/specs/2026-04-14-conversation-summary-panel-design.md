# Conversation Summary Panel — Design Spec

A real-time, per-conversation TL;DR panel that sits at the top of the chat area. The agent drives summarization via a tool call, and users can enable/disable the feature per conversation.

## Requirements

- Concise 2-3 sentence rolling digest of the conversation
- Inline sticky header above messages — stays visible while scrolling
- Per-conversation enable/disable toggle that fully removes the tool from the agent when disabled
- Agent-called `update_summary` tool — agent decides when to summarize
- Configurable summary instruction per agent (YAML frontmatter)
- Manual refresh button as fallback (calls Claude Haiku independently)
- Summary persisted in DB — survives page reloads
- Summary events visible in debug panel when debug mode is on

## Architecture

Approach: **Tool result delivered via existing SSE stream**. The agent calls `update_summary` during its response, the backend persists the summary and emits an `event: summary` SSE event. Manual refresh uses a dedicated REST endpoint. No new transport layer (WebSocket/polling) — reuses the SSE infrastructure already in place.

## Data Model

### Database — `conversations` table

Two new columns added via migration:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `summary` | `TEXT` | `NULL` | Current summary text |
| `summary_enabled` | `INTEGER` | `0` | Per-conversation toggle (0=off, 1=on) |

Migration uses the existing `Database.migrate()` pattern with `ALTER TABLE ADD COLUMN`.

### Agent Markdown — new frontmatter field

```yaml
summaryInstruction: "Provide a 2-3 sentence TL;DR of the conversation so far."
```

Optional. If omitted, the default instruction is: `"Provide a brief 2-3 sentence summary of this conversation so far, capturing the main topic and any key outcomes."` Parsed by `agent-loader.ts`.

### Backend Types (`packages/agent-service/src/types.ts`)

```typescript
// AgentConfig — add:
summaryInstruction?: string;

// Conversation — add:
summary: string | null;
summaryEnabled: boolean;
```

### Frontend Types (`packages/web-client/src/types.ts`)

```typescript
// ConversationDetail — add:
summary: string | null;
summaryEnabled: boolean;

// ChatState — add:
summary: string | null;
summaryEnabled: boolean;
```

## Backend

### `update_summary` tool (`tools/update-summary.ts`)

- Registered in `ToolService` **conditionally** — only when `summaryEnabled` is true for the conversation
- Agent system prompt injection: *"You have an update_summary tool. Use it to maintain a running TL;DR of this conversation. Call it after meaningful exchanges. Follow this instruction: {summaryInstruction}"*
- Tool input schema: `{ summary: string }`
- Tool action: calls `database.setSummary(conversationId, text)`, returns `{ success: true }`
- After tool execution, the SSE stream emits:
  ```
  event: summary
  data: {"summary": "..."}
  ```

### `POST /conversations/:id/summary` (manual refresh)

- Loads conversation messages + agent's `summaryInstruction`
- Calls Claude Haiku with a focused prompt: instruction + conversation history → summary
- Writes result to DB via `database.setSummary()`
- Returns `{ summary: "..." }`

### `PATCH /conversations/:id` (new endpoint)

- New route — no PATCH exists currently for conversations
- Accepts `{ summaryEnabled: boolean }`
- Updates `summary_enabled` column in DB
- Returns updated conversation metadata including `summary` and `summaryEnabled`

### `GET /conversations/:id` (existing, modified)

- Response now includes `summary` and `summaryEnabled` fields so the panel loads persisted data on page visit

### `GET /conversations` (existing, modified)

- List response now includes `summaryEnabled` per conversation — allows the UI to show an indicator in the sidebar if desired in the future

## Frontend

### `SummaryPanel` (`summary-panel.tsx`)

- Sticky inline header: `position: sticky; top: 0; z-index: 10`
- Sits between the chat header and the message list inside `ChatContainer`
- Displays summary text with fade-in transition on updates
- Refresh button (icon) triggers `POST /conversations/:id/summary`
- Loading spinner on refresh button while generating
- When summary is null/empty: thin bar showing "No summary yet"

### `SummaryToggle` (`summary-toggle.tsx`)

- Small toggle switch in the chat header, alongside the existing debug toggle
- Calls `PATCH /conversations/:id` with `{ summaryEnabled }` on change
- Off → panel hides, tool removed from next agent call
- On → panel shows (with persisted summary if available), tool included in next agent call

### `useChat` hook changes

- New state fields: `summary: string | null`, `summaryEnabled: boolean`
- Loads both from `GET /conversations/:id` on conversation selection
- Updates `summary` when SSE `event: summary` arrives during streaming
- Exposes `setSummaryEnabled(enabled: boolean)` — calls PATCH endpoint, updates local state
- Exposes `refreshSummary()` — calls POST endpoint, updates local state

### `api.ts` changes

- SSE parser in `sendMessage` handles `event: summary` — invokes a new callback in `SendMessageCallbacks`
- New function: `refreshSummary(conversationId: string): Promise<string>`
- New function: `toggleSummary(conversationId: string, enabled: boolean): Promise<void>`

### `ChatContainer` changes

- New props: `summary`, `summaryEnabled`, `onSummaryToggle`, `onSummaryRefresh`
- Renders `SummaryToggle` in the header bar
- Renders `SummaryPanel` between header and message list

## Debug Panel Integration

Two new debug event types:

| Event Type | Trigger | Content |
|------------|---------|---------|
| `summary` | Agent calls `update_summary` tool | Full summary text produced by the agent |
| `summary-refresh` | User clicks manual refresh | Summary text from Haiku call |

Both rendered in the debug panel with distinct labels ("Summary Updated" / "Summary Refreshed") to distinguish from message and tool-use events.

## Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Agent doesn't call the tool | Summary stays as-is (or null). Manual refresh is the fallback. Not a failure. |
| Summary arrives mid-stream | Panel updates immediately — no need to wait for stream end. |
| Toggle while streaming | Toggle is disabled while `isStreaming` is true to prevent race conditions. |
| Empty conversation | Panel shows "No summary yet." |
| Manual refresh spam | Refresh button disabled for 5 seconds after click (each refresh is an API call). |
| Agent markdown has no `summaryInstruction` | Falls back to default: "Provide a brief 2-3 sentence summary of this conversation so far, capturing the main topic and any key outcomes." |

## Components Changed

### New
- `packages/web-client/src/components/summary-panel.tsx`
- `packages/web-client/src/components/summary-toggle.tsx`
- `packages/agent-service/src/tools/update-summary.ts`
- `POST /conversations/:id/summary` endpoint

### Modified
- `packages/agent-service/src/types.ts` — add summary fields to AgentConfig, Conversation
- `packages/agent-service/src/services/database.ts` — migration, setSummary(), summary in getConversation/listConversations
- `packages/agent-service/src/services/agent-loader.ts` — parse summaryInstruction
- `packages/agent-service/src/routes/conversations.ts` — SSE summary event, PATCH handler, POST summary endpoint
- `packages/agent-service/src/services/tool-service.ts` — conditional registration of update_summary
- `packages/web-client/src/types.ts` — add summary fields
- `packages/web-client/src/lib/api.ts` — SSE parser, refreshSummary, toggleSummary
- `packages/web-client/src/hooks/use-chat.ts` — summary state, setSummaryEnabled, refreshSummary
- `packages/web-client/src/components/chat-container.tsx` — wire SummaryPanel and SummaryToggle
- Agent markdown files (optional — add summaryInstruction to agents that want custom instructions)

### Untouched
- Sidebar, MessageList, MessageBubble, ChatInput, AuthPage
- guardrails.ts, browse_url tool
- Existing agent tool infrastructure (no breaking changes)
