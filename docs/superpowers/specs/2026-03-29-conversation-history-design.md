# Conversation History Feature — Design Spec

## Overview

Add persistent conversation history to the chat application. Users can browse previous conversations in a sidebar, switch between them, delete them, and start new ones. Conversations persist across server restarts via SQLite.

## Database Schema

Two tables using `better-sqlite3` with the existing SQLite file at `packages/data/conversations.db`.

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
```

- `title` starts as `NULL`, populated after first assistant response via LLM call
- `updated_at` updates on each new message, used for sidebar sort order
- `ON DELETE CASCADE` ensures deleting a conversation removes its messages
- All timestamps are ISO 8601 strings

## Backend API

### New Endpoints

| Method | Path | Response | Purpose |
|--------|------|----------|---------|
| `GET` | `/conversations` | `[{id, agentId, title, updatedAt, messageCount}]` | List all conversations, sorted by `updated_at` desc |
| `DELETE` | `/conversations/:id` | `204 No Content` | Delete a conversation and its messages |

### Modified Endpoints

**`POST /conversations`** — Creates a conversation row in SQLite (instead of in-memory map).

**`POST /conversations/:id/messages`** — Persists user message and assistant response to SQLite. After the first assistant response completes in a new conversation (no title yet), fires an async Claude call to generate a title. Title is sent via a new SSE event: `event: title\ndata: {"title": "..."}\n\n`.

**`GET /conversations/:id`** — Reads conversation and messages from SQLite.

### Title Generation

- Triggered once: only when conversation has no title and first assistant response finishes
- Model: `claude-haiku-4-5-20251001` (~10 tokens output, cheap)
- Prompt: "Generate a 3-6 word title for this conversation" with first user message + assistant reply
- Delivered via SSE `title` event so frontend updates sidebar without re-fetching
- Sequenced within the SSE stream: after the assistant response finishes streaming, and before the `done` event, the server calls Haiku for the title. If successful, it sends `event: title` then `event: done`. If it fails or times out (3s), it skips the title event and sends `done` immediately. This keeps title delivery in-band without a separate mechanism. The slight delay (~0.5-1s for Haiku) is acceptable since the user has just finished reading the streamed response

### ConversationStore Replacement

The in-memory `ConversationStore` class is replaced with a `Database` class wrapping `better-sqlite3`. Methods:

- `createConversation(id, agentId)` — INSERT into conversations
- `getConversation(id)` — SELECT conversation + messages
- `listConversations()` — SELECT all conversations with message count, ordered by updated_at desc
- `addMessage(conversationId, role, content)` — INSERT message + UPDATE conversation.updated_at
- `deleteConversation(id)` — DELETE conversation (cascade deletes messages)
- `setTitle(id, title)` — UPDATE conversation title
- `init()` — Creates tables if not exist (called on startup)

## Frontend

### Layout

```
App (flex row)
├── Sidebar (260px expanded / 48px collapsed)
│   ├── Collapse/expand toggle (chevron icon)
│   ├── "New Chat" button (+)
│   └── ConversationItem[] (scrollable list)
└── ChatContainer (flex: 1, fills remaining width)
```

### New Components

**`Sidebar`**
- Header with "Chats" label and `+` (new chat) button
- Scrollable list of `ConversationItem` components
- Collapse toggle button (chevron) — collapses to 48px strip showing only toggle + new chat button
- Collapsed state stored in component state

**`ConversationItem`**
- Displays: title (or truncated first message if no title) + relative timestamp (e.g., "2 min ago")
- Active state: highlighted with primary color border
- Hover state: shows trash icon on the right side
- Click: switches to that conversation
- Trash click (stopPropagation): opens ConfirmDialog

**`ConfirmDialog`**
- Reusable modal component
- Dark overlay backdrop
- "Delete conversation?" prompt
- Cancel button (ghost style) + Delete button (red)
- Closes on Cancel, overlay click, or Escape key

### State Management

The `useChat` hook is extended with:

- `conversations` — array of `{id, agentId, title, updatedAt, messageCount}` for sidebar
- `sidebarCollapsed` — boolean for sidebar collapse state
- `selectConversation(id)` — fetches messages via `GET /conversations/:id`, sets as active
- `deleteConversation(id)` — calls `DELETE /conversations/:id`, removes from list, selects next conversation or creates new if empty
- Handles new `title` SSE event: updates the matching conversation's title in the sidebar list

### API Client Additions

New functions in `lib/api.ts`:

- `listConversations()` — `GET /api/conversations`
- `deleteConversation(id)` — `DELETE /api/conversations/:id`

Modified `sendMessage` — handles new `title` SSE event via `onTitle` callback.

## Data Flows

### App Load
1. `GET /conversations` → populate sidebar
2. If conversations exist: select most recent, `GET /conversations/:id` → load messages
3. If no conversations: auto-create new one via `POST /conversations`

### Send Message
1. Optimistically add user + empty assistant message to UI
2. `POST /conversations/:id/messages` → stream SSE
3. `delta` events fill in assistant message content
4. If first exchange (no title): `title` event updates sidebar title
5. `done` event marks streaming complete

### Switch Conversation
1. Click conversation in sidebar
2. `GET /conversations/:id` → replace chat messages
3. Highlight active item in sidebar

### Delete Conversation
1. Hover → click trash → confirm dialog → confirm
2. `DELETE /conversations/:id`
3. Remove from sidebar list
4. If was active: select next conversation, or create new if list empty

### New Conversation
1. Click `+` button
2. `POST /conversations` → get new ID
3. Add to top of sidebar, select it, clear chat area

## Error Handling

- API failures on message send: existing error banner in chat area
- Delete failures: show error text in confirm dialog
- Title generation failures: silent — UI shows first message preview as fallback
- List fetch failure on load: show error state with retry button

## Dependencies

### New
- `better-sqlite3` — SQLite driver for agent-service
- `@types/better-sqlite3` — TypeScript types (dev)

### Existing (no changes)
- All current web-client dependencies remain unchanged
