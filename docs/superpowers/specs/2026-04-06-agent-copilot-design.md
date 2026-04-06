# Agent Copilot — Design Spec

A floating chat panel in the application UI that interviews users and creates or modifies agents through natural conversation, replacing manual form-filling.

## Decisions

| Decision | Choice |
|----------|--------|
| UI placement | Floating panel, bottom-right |
| Scope | Create new + edit existing agents |
| Output flow | Auto-open Agent Drawer after create/update |
| Backend approach | Dedicated `POST /api/copilot/chat` endpoint |
| Chat persistence | Ephemeral (React state only) |
| Agent awareness | Full — copilot sees all existing agents |
| Interview style | Hybrid — free description first, targeted follow-ups for gaps |

## Backend

### New Route: `POST /api/copilot/chat`

File: `packages/agent-service/src/routes/copilot.ts`

Request body:

```ts
{
  messages: { role: "user" | "assistant"; content: string }[];
  mode: "create" | "edit";
  agentId?: string; // required when mode is "edit"
}
```

Protected by existing JWT middleware. Streams SSE responses using the same event format as the conversation endpoint (`delta`, `done`, `error`) plus two new events:

- `event: agent_created` — `{ agentId: string, agentName: string }`
- `event: agent_updated` — `{ agentId: string, agentName: string }`

### CopilotService

File: `packages/agent-service/src/services/copilot-service.ts`

Responsibilities:

1. **Build system prompt** dynamically per request:
   - Base copilot persona and interview instructions
   - Summary of all existing agents (from AgentLoader): names, models, tools, roles
   - Available tools list (from ToolService)
   - Available models list
   - Full agent schema reference (all configurable fields with defaults)
   - If editing: full config of the target agent

2. **Stream Claude response** via Anthropic SDK, forwarding deltas as SSE events.

3. **Detect agent config** in the response. The copilot outputs a fenced JSON block marked with ````agent-config` when it has gathered enough information. CopilotService:
   - Parses the JSON from the stream
   - Validates against the agent schema (required fields: `name`, `systemPrompt`)
   - Calls `AgentLoader.saveAgent()` for create or updates the existing file for edit
   - Emits `agent_created` or `agent_updated` SSE event with the agent ID

### Config Extraction Format

The copilot system prompt instructs Claude to output config in this format:

````
```agent-config
{
  "name": "Travel Planner",
  "model": "claude-sonnet-4-20250514",
  "temperature": 0.7,
  "maxTokens": 1024,
  "avatar": { "emoji": "✈️", "color": "#3498db" },
  "systemPrompt": "You are a travel planning assistant...",
  "tools": ["browse_url"],
  "delegates": [],
  "topicBoundaries": {
    "allowed": ["travel", "flights", "hotels"],
    "blocked": ["politics", "medical advice"],
    "boundaryMessage": "I can only help with travel-related topics."
  }
}
```
````

This avoids tool_use complexity. The copilot is a stateless chat endpoint — each request sends the full message history, and the backend extracts config when present.

## Frontend

### CopilotPanel

File: `packages/web-client/src/components/copilot-panel.tsx`

Floating container in the bottom-right corner of the viewport. Fixed position, z-index above the AgentDrawer backdrop.

Two visual states:
- **Minimized**: Small circular button with 🤖 icon. Click to expand.
- **Expanded**: Chat panel ~350px wide, ~450px tall. Header with "Agent Copilot" title, minimize button, and close/reset button. Contains CopilotChat.

### CopilotChat

File: `packages/web-client/src/components/copilot-chat.tsx`

- Scrollable message list with auto-scroll on new messages
- Simple message bubbles: copilot (left-aligned) and user (right-aligned)
- Text input with send button at bottom
- Typing indicator while streaming
- On `agent_created`/`agent_updated`: displays success message with agent avatar

### useCopilot Hook

File: `packages/web-client/src/hooks/use-copilot.ts`

State:
- `messages: { role: "user" | "assistant"; content: string }[]`
- `isStreaming: boolean`
- `isOpen: boolean`
- `isMinimized: boolean`

Actions:
- `sendMessage(text: string)` — appends user message, calls copilot API, streams response
- `startEdit(agentId: string)` — sets mode to "edit", sends initial message like "I want to edit this agent"
- `reset()` — clears messages and mode
- `toggle()` — open/close panel
- `minimize()` — collapse to button

Accepts an `onAgentReady(agentId: string)` callback for signaling App.tsx.

### copilot-api

File: `packages/web-client/src/lib/copilot-api.ts`

```ts
sendCopilotMessage(
  messages: Message[],
  mode: "create" | "edit",
  agentId: string | undefined,
  callbacks: {
    onDelta: (text: string) => void;
    onAgentCreated: (data: { agentId: string; agentName: string }) => void;
    onAgentUpdated: (data: { agentId: string; agentName: string }) => void;
    onError: (message: string) => void;
    onDone: () => void;
  }
): Promise<void>
```

Mirrors the SSE parsing pattern in `packages/web-client/src/lib/api.ts`.

### App.tsx Integration

Mount `<CopilotPanel>` at the root level (sibling to AgentDrawer):

```tsx
<CopilotPanel
  onAgentReady={(agentId) => {
    openAgentDrawer(agentId);
  }}
/>
```

When the copilot creates or updates an agent, the callback opens the AgentDrawer with that agent's form pre-loaded for manual tweaking.

## Copilot System Prompt

```
You are an Agent Copilot that helps users create and configure AI agents.

## Interview Style
- Start by understanding what the user wants naturally
- Extract as much config as you can from their description
- Ask targeted follow-up questions ONLY for missing or ambiguous fields
- Be conversational, not robotic — don't list all fields at once
- Always confirm with the user before outputting the final config

## Agent Schema
Fields you need to gather:
- name (required): Display name for the agent
- model: Claude model (default: claude-sonnet-4-20250514)
- temperature: 0-1 (default: 0.7)
- maxTokens: (default: 1024)
- avatar: { emoji, color } — suggest based on agent personality
- systemPrompt (required): The agent's personality and instructions
- tools: Array of available tools — {available_tools}
- delegates: Array of agent IDs this agent can delegate to — {existing_agent_ids}
- topicBoundaries (optional): { allowed[], blocked[], boundaryMessage }

## Existing Agents
{agent_summaries}

## Output Format
When you have gathered enough information and the user confirms, output the
complete config in a fenced block exactly like this:

```agent-config
{ ...valid JSON... }
```

Do not output this block until the user has confirmed they are happy with the
configuration.
```

Placeholders (`{available_tools}`, `{existing_agent_ids}`, `{agent_summaries}`) are filled by CopilotService at request time.

## Interview Flows

### Create Flow

1. User opens copilot, types a natural description: "I need a travel planning agent"
2. Copilot extracts what it can (name, role, likely tools) and asks follow-ups for gaps: "Should it have web browsing for looking up flights? And should it stay focused on travel topics?"
3. User answers. Copilot fills in remaining defaults (model, temperature, maxTokens, avatar).
4. Copilot presents a summary and asks for confirmation.
5. User confirms. Copilot outputs the `agent-config` block.
6. Backend parses, validates, saves via AgentLoader, emits `agent_created`.
7. Frontend receives event, shows success in chat, opens AgentDrawer with the new agent.

### Mode Detection

The copilot always starts in "create" mode. The `useCopilot` hook detects edit intent by matching the user's first message against known agent names (fetched from the agents list). If the message contains a recognized agent name preceded by "edit", "update", or "modify", the hook switches to "edit" mode and passes the `agentId` to the API. Otherwise it stays in "create" mode. This detection happens only on the first message — subsequent messages in the same session don't change the mode.

### Edit Flow

1. User types "edit support-bot" in copilot. The hook detects "edit" + agent name match, sets mode to "edit" with the matched agentId.
2. CopilotService loads support-bot's full config and injects it into the system prompt.
3. Copilot responds with current config summary: "Here's Support Bot's current setup: [summary]. What would you like to change?"
4. User describes changes naturally.
5. Copilot outputs the updated `agent-config` block.
6. Backend validates, updates the agent file, emits `agent_updated`.
7. Frontend shows success, opens AgentDrawer with the updated agent.

## File Summary

| File | Status | Description |
|------|--------|-------------|
| `packages/agent-service/src/routes/copilot.ts` | New | POST /api/copilot/chat route |
| `packages/agent-service/src/services/copilot-service.ts` | New | System prompt builder, config extraction, validation |
| `packages/web-client/src/components/copilot-panel.tsx` | New | Floating panel container (minimize/expand) |
| `packages/web-client/src/components/copilot-chat.tsx` | New | Message list, input, typing indicator |
| `packages/web-client/src/hooks/use-copilot.ts` | New | State management, SSE handling |
| `packages/web-client/src/lib/copilot-api.ts` | New | SSE client for copilot endpoint |
| `packages/web-client/src/App.tsx` | Modified | Mount CopilotPanel, pass onAgentReady callback |
| `packages/agent-service/src/index.ts` | Modified | Register copilot route |

## Non-Goals

- Copilot chat persistence (ephemeral by design)
- Copilot as a tool-calling agent (uses config block extraction instead)
- Agent deletion via copilot (use existing drawer UI)
- Copilot for non-agent tasks (scoped to agent create/edit only)
