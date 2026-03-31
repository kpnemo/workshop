# Multi-Agent Support Design

Support multiple agents in the workshop app: users can create, edit, delete, and switch between agents via the web UI. Agents remain file-backed (markdown with YAML front-matter in `agents/`).

## Requirements

- Agents are shared/global — all users see and can modify the same agents
- Full CRUD via web UI (no filesystem editing required)
- Agent locked to conversation at creation time (no mid-conversation switching)
- Agent management lives in a slide-out drawer overlay
- New conversations default to last-used agent, switchable before first message
- Agent fields: name, system prompt, model, temperature, maxTokens, avatar (emoji + color), optional guardrails

## Backend API

New file: `packages/agent-service/src/routes/agents.ts`

No authentication required — agents are global resources.

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/agents` | List all agents | `Array<{id, name, model, avatar, hasGuardrails}>` |
| `GET` | `/agents/:id` | Full agent config | `AgentConfig` with all fields |
| `POST` | `/agents` | Create agent | `AgentConfig` (201) |
| `PUT` | `/agents/:id` | Update agent | `AgentConfig` (200) |
| `DELETE` | `/agents/:id` | Delete agent | 204 No Content |

### Agent config shape

```typescript
interface AgentConfig {
  id: string;              // slug from filename
  name: string;            // display name
  model: string;           // e.g. "claude-sonnet-4-20250514"
  maxTokens: number;       // 1-4096
  temperature: number;     // 0-1
  systemPrompt: string;    // markdown content
  avatar: {
    emoji: string;         // e.g. "🤖"
    color: string;         // hex e.g. "#6c5ce7"
  };
  topicBoundaries?: {
    allowed: string[];
    blocked: string[];
    boundaryMessage: string;
  };
}
```

### Agent file format (unchanged, plus avatar)

```yaml
---
name: Support Bot
model: claude-sonnet-4-20250514
maxTokens: 1024
temperature: 0.7
avatar:
  emoji: "🤖"
  color: "#6c5ce7"
topicBoundaries:
  allowed:
    - "product questions"
  blocked:
    - "competitor comparisons"
  boundaryMessage: "I can only help with product-related questions."
---

You are a helpful support agent...
```

### Validation rules

- `name`: required, non-empty string
- `systemPrompt`: required, non-empty string
- `model`: defaults to `claude-sonnet-4-20250514`
- `temperature`: 0-1, defaults to 0.7
- `maxTokens`: 1-4096, defaults to 1024
- `avatar.emoji`: defaults to "🤖"
- `avatar.color`: defaults to "#6c5ce7"
- `id` generation: slugify name (lowercase, replace spaces/special chars with hyphens)
- Duplicate slug: return 409 Conflict

### Agent loader changes

File: `packages/agent-service/src/services/agent-loader.ts`

Add to existing module:
- `saveAgent(id: string, config: AgentConfig): void` — serializes to YAML front-matter + markdown using `gray-matter.stringify()`, writes to `agents/{id}.md`
- `deleteAgent(id: string): void` — removes `agents/{id}.md` from disk
- `refreshAgents(): Map<string, AgentConfig>` — re-reads all files, returns updated map
- Existing `loadAgents()` updated to parse `avatar` field (with defaults for existing files missing it)

### Entry point changes

File: `packages/agent-service/src/index.ts`

- Mount `/agents` routes (no auth middleware — agents are global)
- Pass agents map reference to agents router

## Frontend Components

### New components

**AgentDrawer** (`components/agent-drawer.tsx`)
- Slides in from the right as an overlay
- List view: each row shows avatar (emoji on colored circle), name, model/temperature subtitle, edit/delete icon buttons
- Header with "Agents" title, "+ New Agent" button, close button
- Opens AgentForm when creating or editing (replaces the list within the drawer)

**AgentForm** (`components/agent-form.tsx`)
- Used for both create and edit (pre-filled when editing)
- Fields: avatar picker, name, system prompt (textarea), model (dropdown), temperature (number), maxTokens (number)
- Collapsible guardrails section: allowed topics, blocked topics (textareas, one topic per line), boundary message
- Back arrow to return to list, Save button in header
- Client-side validation before submit

**AgentSelector** (`components/agent-selector.tsx`)
- Dropdown in the chat header, replacing the hardcoded "Support Bot"
- Shows current agent (avatar + name) with a "Change" indicator
- Dropdown lists all available agents with avatar, name, model info
- Visible only before the first message is sent — after that, shows agent info without dropdown
- Hint text: "Agent can be changed until you send the first message"

**AvatarPicker** (`components/avatar-picker.tsx`)
- Large preview circle showing current emoji on current color
- Row of color swatches (5-6 preset colors)
- Click the avatar circle to open an emoji input/picker
- Colors: `#6c5ce7`, `#00b894`, `#fd79a8`, `#fdcb6e`, `#74b9ff`

### Modified components

**Sidebar** (`components/sidebar.tsx`)
- Add "Manage Agents" button (below the header, above conversation list)
- Conversation items show the agent's avatar emoji + color instead of generic icon

**ChatContainer** (`components/chat-container.tsx`)
- Replace hardcoded "Support Bot" header with `AgentSelector`
- Pass current agent info and lock state (has messages been sent?)

### New hook

**useAgents** (`hooks/use-agents.ts`)
```typescript
function useAgents() {
  // State
  agents: AgentConfig[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchAgents(): Promise<void>
  createAgent(data: CreateAgentInput): Promise<AgentConfig>
  updateAgent(id: string, data: UpdateAgentInput): Promise<AgentConfig>
  deleteAgent(id: string): Promise<void>
}
```

### Modified hook

**useChat** (`hooks/use-chat.ts`)
- Remove hardcoded `"support-bot"` references (lines ~43, ~114, ~226)
- Accept `agentId` parameter for creating new conversations
- Track last-used agent ID in `localStorage` under key `lastAgentId`
- On "New Chat": use `localStorage.lastAgentId` or fall back to first available agent

### API client additions

File: `packages/web-client/src/lib/api.ts`

```typescript
fetchAgents(): Promise<AgentSummary[]>
fetchAgent(id: string): Promise<AgentConfig>
createAgent(data: CreateAgentInput): Promise<AgentConfig>
updateAgent(id: string, data: UpdateAgentInput): Promise<AgentConfig>
deleteAgent(id: string): Promise<void>
```

## Data Flow

### Create agent
1. User opens drawer → clicks "+ New Agent" → fills AgentForm
2. `useAgents().createAgent(data)` → `POST /agents`
3. Backend validates, generates slug ID, calls `saveAgent()` → writes `.md` file
4. `refreshAgents()` reloads in-memory map
5. Returns full `AgentConfig` → frontend adds to agents list

### Start conversation with agent
1. User clicks "New Chat" → conversation created with `localStorage.lastAgentId` (or first agent)
2. Chat header shows AgentSelector dropdown (enabled)
3. User can change agent via dropdown → frontend deletes the empty conversation and creates a new one with the selected agent (simpler than updating in place, and the conversation has no messages yet)
4. User sends first message → agent locked, dropdown becomes display-only
5. `localStorage.lastAgentId` updated to the selected agent

### Edit agent
1. User opens drawer → clicks edit icon on an agent → AgentForm opens pre-filled
2. `useAgents().updateAgent(id, data)` → `PUT /agents/:id`
3. Backend rewrites `.md` file, refreshes map → returns updated config
4. Frontend updates agents list; active conversations with this agent reflect new name/avatar on next load

### Delete agent
1. User clicks delete icon → confirm dialog appears
2. `useAgents().deleteAgent(id)` → `DELETE /agents/:id`
3. Backend removes `.md` file, refreshes map → returns 204
4. Frontend removes from list; existing conversations with this agent still display their message history
5. Chat header for orphaned conversations shows "Deleted Agent" with a gray fallback avatar

## Error Handling

| Scenario | Backend | Frontend |
|----------|---------|----------|
| Duplicate agent name/slug | 409 Conflict | Show "Agent with this name already exists" |
| Missing required field | 400 Bad Request with field errors | Client-side validation prevents submission |
| Agent not found (edit/delete) | 404 Not Found | Show error, refresh agent list |
| File system write error | 500 Internal Server Error | Show generic error banner |
| Delete agent with active conversations | Allowed (204) | Conversations preserved, header shows "Deleted Agent" |
| Temperature/maxTokens out of range | 400 Bad Request | Client-side validation prevents submission |

## Files Changed

### New files (5)
- `packages/agent-service/src/routes/agents.ts` — CRUD endpoints
- `packages/web-client/src/components/agent-drawer.tsx` — management overlay
- `packages/web-client/src/components/agent-form.tsx` — create/edit form
- `packages/web-client/src/components/agent-selector.tsx` — header dropdown
- `packages/web-client/src/hooks/use-agents.ts` — agent state management

### Modified files (6)
- `packages/agent-service/src/services/agent-loader.ts` — add save/delete/refresh
- `packages/agent-service/src/index.ts` — mount agents routes
- `packages/web-client/src/components/sidebar.tsx` — manage agents button, agent avatars on conversations
- `packages/web-client/src/components/chat-container.tsx` — dynamic agent header
- `packages/web-client/src/hooks/use-chat.ts` — remove hardcoded agent, accept agentId param
- `packages/web-client/src/lib/api.ts` — agent API client functions

### No changes needed
- `packages/agent-service/src/routes/conversations.ts` — already uses `agents.get(agentId)` dynamically
- `packages/agent-service/src/routes/auth.ts`
- `packages/agent-service/src/services/database.ts` — `agent_id` column already exists
- `packages/agent-service/src/services/guardrails.ts`
