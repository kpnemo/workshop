# Multi-Agent Delegation

A main reasoning agent delegates specific flows to specialist agents within a single conversation. The user sees a seamless handoff with subtle visual indicators showing which agent is active.

## UX Model

Seamless handoff within one conversation. When the main agent delegates:

1. A banner appears: "Schedule Agent joined — Helping with: schedule team call"
2. The specialist's messages render with its own avatar, color, and name
3. The specialist interacts directly with the user (multi-turn)
4. When done, the specialist calls `hand_back` and a "Main Agent resumed" banner appears
5. The main agent continues with a summary of what the specialist accomplished

The user stays in one chat thread throughout. No page navigation or conversation switching.

## Architecture

### Delegation as a Tool

Delegation uses the existing tool system. Two new tools:

- `delegate_to` — auto-injected for agents that have a `delegates` field in frontmatter
- `hand_back` — auto-injected for specialists when they are the active delegate

The main agent's system prompt is auto-appended with a section listing available specialists and their capabilities. Claude decides when to delegate based on conversation context (prompt-based intent detection, no keyword rules).

### Message Routing

The conversations route checks `conversation.active_agent` before processing each message:

- If `active_agent` is NULL → route to the conversation's original agent (main agent)
- If `active_agent` is set → route to that specialist agent

This is a single check at the top of the message handler, before building the Claude API call.

### Message History Isolation

**Main agent sees:**
1. Its own system prompt
2. Full conversation history (pre-delegation messages)
3. Its `delegate_to` tool call and result
4. A system message with the specialist's summary from `hand_back`
5. New user messages after hand-back

**Specialist sees:**
1. Its own system prompt
2. A prepended delegation context block: task description + instruction to call `hand_back` when done
3. Messages since delegation started only
4. Its own tool calls and results

### Delegation Depth

Max depth: 1. Specialists cannot delegate further. Only the conversation's original agent (the one in `agent_id`) receives `delegate_to`. Specialists only receive `hand_back`.

## Agent Frontmatter

New `delegates` field — an array of agent IDs that this agent can delegate to:

```yaml
---
name: Main Agent
model: claude-sonnet-4-20250514
maxTokens: 1024
delegates:
  - schedule-agent
  - weather-agent
tools:
  - browse_url
---
```

Any agent with a `delegates` field becomes a "main" agent for those specialists. Specialists are regular `.md` agent files — the same format as any other agent. They don't need special configuration to be delegated to.

The agent edit form in the UI gets a new "Delegates" section where users pick from available agents (similar to the existing tools picker).

## Database Changes

Three new columns:

```sql
ALTER TABLE conversations ADD COLUMN active_agent TEXT;
-- NULL = use agent_id (the original/main agent)
-- Set to specialist ID during delegation
-- Reset to NULL on hand_back

ALTER TABLE messages ADD COLUMN agent_id TEXT;
-- Which agent produced this message
-- NULL for user messages
-- Used by frontend for avatar/name display

ALTER TABLE messages ADD COLUMN delegation_meta TEXT;
-- JSON for delegation events:
-- { "type": "delegation_start", "from": "main-agent", "to": "schedule-agent", "context": "..." }
-- { "type": "delegation_end", "from": "schedule-agent", "to": "main-agent", "summary": "..." }
```

## Tool Definitions

### Tool Context

The current tool interface is `execute(input): Promise<string>`. The delegation tools need additional context: the conversation ID, the database service, and the SSE response object. Extend the tool execute signature to accept an optional context object:

```typescript
execute(input: unknown, context?: ToolContext): Promise<string>

interface ToolContext {
  conversationId: string
  res: Response          // SSE response for sending events
  db: DatabaseService
  agents: Map<string, AgentConfig>
}
```

Existing tools (like `browse_url`) ignore the context parameter. Only delegation tools use it.

### delegate_to

- **Auto-injected for:** agents where `agent_id` matches the conversation's original agent AND the agent has a `delegates` field
- **Input schema:**
  - `agent_id` (string, required) — which specialist to delegate to, must be in the agent's `delegates` list
  - `context` (string, required) — summary of what the user needs, passed to the specialist
- **Behavior:**
  1. Validate `agent_id` is in the caller's `delegates` list
  2. Set `conversation.active_agent` to the target agent ID
  3. Save a message with `delegation_meta` recording the delegation start
  4. Send SSE `delegation_start` event to the frontend
  5. Return confirmation as tool result
- **After tool result:** the agentic loop must break (not continue iterating). The `delegate_to` tool returns a special marker (e.g., the result string starts with `[DELEGATION]`) that the loop checks. When detected, the loop breaks instead of sending tool results back to Claude. The next user message routes to the specialist.

### hand_back

- **Auto-injected for:** agents that are the active delegate (conversation's `active_agent` matches this agent AND this agent is not the conversation's original `agent_id`)
- **Input schema:**
  - `summary` (string, required) — what was accomplished, injected into main agent's context on resume
- **Behavior:**
  1. Set `conversation.active_agent` to NULL (returns to main)
  2. Save a message with `delegation_meta` recording the delegation end and summary
  3. Send SSE `delegation_end` event to the frontend
  4. Return confirmation as tool result
- **After tool result:** same as `delegate_to` — the agentic loop breaks via the `[DELEGATION]` marker. The next user message routes back to the main agent, which receives the summary as context.

## System Prompt Injection

### Main Agent — Auto-Appended Delegates Section

Appended to the main agent's system prompt when it has delegates:

```
[Available Specialist Agents]
You can delegate tasks to these specialist agents using the delegate_to tool:

• schedule-agent ("Schedule Agent") — <first line of its system prompt>
• weather-agent ("Weather Agent") — <first line of its system prompt>

When a user's request matches a specialist's capability, delegate to them with a clear context summary. Handle general conversation yourself.
```

### Specialist — Prepended Delegation Context

Prepended to the specialist's own system prompt when it's delegated to:

```
[Delegation Context]
You have been asked to help with a specific task.
Context from the main agent: "<context from delegate_to call>"

When you have completed the task, you MUST call the hand_back tool with a brief summary of what you accomplished. Do not continue the conversation after handing back.
```

## SSE Events

New events sent to the frontend:

| Event | Data | UI Effect |
|-------|------|-----------|
| `delegation_start` | `{ from, to, agentName, emoji, color, context }` | Shows "Agent joined" banner, updates active agent indicator |
| `delegation_end` | `{ from, to, agentName, summary }` | Shows "Main Agent resumed" banner, restores original agent |

Existing `delta` event gets a new `agentId` field so the frontend can render the correct avatar and name for each message.

## Frontend Changes

### Chat UI (message-list.tsx, agent-avatar.tsx)

- Delegation banners rendered inline between messages
- Each assistant message displays the producing agent's avatar, color, and name (read from `agentId` on the message)
- Banners styled as subtle dividers: gradient background, agent emoji, short description

### Agent Form (agent-form.tsx)

- New "Delegates" section below the existing "Tools" section
- Lists currently selected delegates with emoji, name, and remove button
- "Add delegate from available agents" button opens a picker showing all other agents
- Excludes the current agent from the picker (can't delegate to self)
- Saves as `delegates: [agent-id-1, agent-id-2]` in frontmatter

### API Client (api.ts)

- Handle new `delegation_start` and `delegation_end` SSE event types
- Pass `agentId` from `delta` events through to the message state

### useChat Hook (use-chat.ts)

- Track current active agent for the conversation
- Update active agent on delegation events
- Include `agentId` on messages for rendering

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Invalid delegate target | Tool returns error: "Cannot delegate to 'X'. Available delegates: [a, b, c]". Claude retries or self-handles. |
| Specialist never calls hand_back | No automatic timeout. Specialist stays active until `hand_back` or user starts a new conversation. |
| User switches agent mid-delegation | Agent selector is already locked after first message. No change needed. |
| Delegate agent deleted from filesystem | Next message fails to find agent config. Return error SSE event and reset `active_agent` to NULL. |
| Specialist has its own tools | Specialist keeps its configured tools plus auto-injected `hand_back`. Existing agentic loop handles tool execution normally. |
| Main agent calls delegate_to for non-existent agent | Validation in delegate_to tool checks agent exists in the loaded agents map. Returns error if not found. |

## Files Changed

### New Files (2)
- `packages/agent-service/src/services/tools/delegate-to.ts` — delegate_to tool implementation
- `packages/agent-service/src/services/tools/hand-back.ts` — hand_back tool implementation

### Modified Files (11)
- `packages/agent-service/src/types.ts` — add `delegates` to AgentConfig
- `packages/agent-service/src/services/agent-loader.ts` — parse delegates field, validate IDs
- `packages/agent-service/src/services/tool-service.ts` — register new tools, update getToolsForAgent logic
- `packages/agent-service/src/services/database.ts` — add columns: active_agent, agent_id, delegation_meta
- `packages/agent-service/src/routes/conversations.ts` — message router, history builder, delegation SSE events, tool injection
- `packages/agent-service/src/routes/agents.ts` — include delegates in responses, validate delegate IDs
- `packages/web-client/src/types.ts` — add agentId, delegationMeta to Message; delegates to Agent
- `packages/web-client/src/lib/api.ts` — handle delegation SSE events, pass agentId
- `packages/web-client/src/hooks/use-chat.ts` — delegation state tracking
- `packages/web-client/src/components/message-list.tsx` — delegation banners, per-agent avatars
- `packages/web-client/src/components/agent-form.tsx` — delegates picker UI
