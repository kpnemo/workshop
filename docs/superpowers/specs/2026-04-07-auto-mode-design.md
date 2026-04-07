# Auto-Mode Design

**Date:** 2026-04-07
**Status:** Approved (pending user spec review)

## Problem

When creating a new conversation, users currently must pick a specific agent up front. They may not know which agent fits their need, or their need may only become clear after a turn or two of chatting. We want an "Auto" option that figures out the right specialist from the conversation itself and hands off transparently.

## Goals

- Let users start a conversation without choosing an agent.
- Have the system pick a specialist agent based on the user's actual intent — not just the first message (which might be "hi").
- Once assigned, the conversation behaves identically to one that started with that specialist directly.
- Reuse as much of the existing agent / streaming / delegation infrastructure as possible.

## Non-Goals (v1)

- Re-routing the conversation after assignment (locked in for the lifetime of the conversation).
- Undo / "wrong agent" UI affordance.
- Analytics on assignment decisions.
- Multi-language router persona.
- Hard caps on router turns before forcing assignment.

## Design Decisions

| Question | Decision |
|---|---|
| When is the agent picked? | After 1+ discovery turns, once intent is clear — not necessarily on the first message. |
| Who handles discovery? | A dedicated router persona (markdown agent) chats with the user. |
| How does the router commit? | The router itself calls a new `assign_agent` tool when confident. No separate classifier. |
| Switch agents mid-conversation after assignment? | No. One-shot. |
| Visual feedback on handoff? | Yes — a banner in the message stream (reuses delegation-banner pattern). |
| Where does Auto appear in UI? | Pinned at top of agent selector, pre-selected by default for new conversations. |

## Architecture

The router is a first-class agent — a markdown file at `agents/router.md` loaded by the existing agent loader. It is exposed via a synthetic "✨ Auto" entry at the top of the agent selector. When a user picks Auto, a conversation is created with `agentId = "router"`. The router chats normally, and when ready calls a new `assign_agent` tool. The tool atomically updates `conversation.agentId` in the DB and emits an SSE event the frontend renders as a handoff banner. From that point forward, the conversation is indistinguishable from one created directly with the assigned specialist.

This is the **Approach 1** option from brainstorming: maximum reuse of existing infrastructure, exactly one new tool, no parallel code path.

## Components

### Backend (`packages/agent-service`)

**New files:**

1. **`agents/router.md`** — friendly generalist persona.
   - Frontmatter: `name: "Auto"`, `model: claude-haiku-4-5-20251001`, `avatar: { emoji: "✨", color: "#a29bfe" }`, `tools: ["assign_agent"]`.
   - System prompt: brief greeting, asks one clarifying question if intent is unclear, calls `assign_agent` as soon as it can name a specific specialist (target: 1–3 turns).

2. **`services/tools/assign-agent.ts`** — the new tool.
   - Schema: `{ agent_id: string, reason: string }`.
   - Execution:
     - Look up `agent_id` in the agents map. Reject if missing or if it equals `"router"`.
     - Call `db.setAgentId(conversationId, agent_id)`.
     - Write SSE event: `event: assignment\ndata: {from:"router", to:<agent_id>, agentName:<name>, reason:<reason>}`.
     - Return `"Assigned to <agent_id>"` as the tool result.

**Modified files:**

3. **`services/tool-service.ts`** — register `assign_agent`. Gate it: only include in the tool list when `curAgent.id === "router"`.

4. **`services/database.ts`** — add `setAgentId(conversationId, agentId)`. Single UPDATE on the existing `conversations.agent_id` column. No schema migration.

5. **`routes/conversations.ts`** — treat `assign_agent` as a terminal tool in the streaming loop (similar to `hand_back`). When detected, save any router text from the current turn, send `done`, and return. Skip title generation while `agentId === "router"` so the title is generated after the first specialist exchange instead.

### Frontend (`packages/web-client`)

**Modified files:**

6. **`components/agent-selector.tsx`** — pin a synthetic "✨ Auto" entry at the top, pre-selected by default for new conversations. Selecting it sets `agentId = "router"` in the create-conversation request. Hide the entry if the agents list does not include a `router` agent.

7. **`hooks/use-chat.ts`** — handle the new `assignment` SSE event: insert a banner message into the local message list and update the conversation's `agentId` in the cache so the sidebar avatar refreshes.

8. **`components/delegation-banner.tsx`** — render an `assignment` variant: "✨ Connected you with <Agent Name> · <reason>". Reuses existing styles.

**Reused as-is:** agent-loader, streaming/SSE pipeline, guardrails, sidebar, conversation-item, chat-container, message-list, message-bubble.

## Data Flow

1. User picks "✨ Auto" → `POST /conversations` with `agentId: "router"` → row created with `agent_id = "router"`.
2. User sends "hi" → router streams a friendly reply via the existing path. No tool call. Conversation stays on router.
3. User sends "what's the weather in Paris?" → router streams a brief acknowledgment then emits `tool_use: assign_agent({agent_id: "weather-agent", reason: "user asked about weather"})`.
4. `assign-agent.ts` validates, updates DB, emits SSE `assignment` event, returns success.
5. Conversations route detects the terminal tool, saves router text, sends `done`. Router never speaks again in this conversation.
6. Frontend processes `assignment` SSE → inserts banner, updates `agentId` in cache → sidebar avatar updates immediately.
7. User's next message → server reads `agent_id = "weather-agent"` → weather agent answers normally.

## Error Handling

| Case | Behavior |
|---|---|
| Router calls `assign_agent` with unknown id | Tool returns `"Unknown agent: <id>. Available: ..."`. Router sees the error and can retry. |
| Router calls `assign_agent("router")` | Rejected: `"Cannot assign to router itself"`. |
| Router never calls `assign_agent` | No enforcement in v1. System prompt strongly instructs the router to assign within 1–3 turns. |
| `agents/router.md` is missing | Loader logs a warning. Frontend hides the Auto entry because the agents list does not include `router`. |
| `assign_agent` called after router has already streamed text | Router text is saved as a normal message, then the banner appears after it. No content lost. |
| Existing conversations | Unaffected. They keep their `agentId`. Only conversations created via Auto start on `router`. |
| Guardrails | Router has no `topicBoundaries`, so the check is skipped for it. Specialists' guardrails apply normally once assigned. |

## Testing

**Backend:**

- `agent-loader.test.ts` — verify `router.md` loads and exposes `assign_agent` in its tools list.
- `assign-agent.test.ts` (new) — unit test the tool: happy path, unknown agent, self-assignment rejection, DB update verified, SSE event shape.
- `tool-service.test.ts` — `assign_agent` is included in the tool list iff `curAgent.id === "router"`.
- `conversations.test.ts` — integration: create Auto conversation; send "hi" (router replies); send weather question (router calls assign_agent, banner SSE emitted, `agent_id` updated in DB); send next message (verify it routes to weather-agent).

**Frontend:**

- `use-chat.test.ts` — handles the `assignment` SSE event correctly.
- `agent-selector.test.tsx` — renders the Auto entry pre-selected for new conversations; hidden when no `router` agent exists.

## Footprint

- **New:** 2 files (`agents/router.md`, `services/tools/assign-agent.ts`).
- **Modified:** 6 files (3 backend, 3 frontend) — small, surgical changes.
- **No DB migration.** The `conversations.agent_id` column already exists.
