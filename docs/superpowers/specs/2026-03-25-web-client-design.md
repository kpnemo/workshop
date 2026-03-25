# Web Client Design Spec

## Overview

A single-page React chat application that connects to the agent service API. Provides a ChatGPT/Messenger-style conversation interface with real-time SSE streaming, markdown rendering, and topic boundary guardrail display.

**Goal**: Working MVP chat client for the agent service.

## Tech Stack

- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **Markdown**: `react-markdown` + `remark-gfm` + `rehype-highlight`
- **Language**: TypeScript
- **Package Manager**: pnpm (monorepo workspace member)

## Project Structure

```
packages/web-client/
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── components.json                # shadcn/ui config
├── src/
│   ├── main.tsx                   # React entry point
│   ├── App.tsx                    # Root component
│   ├── index.css                  # Tailwind imports + dark theme globals
│   ├── lib/
│   │   ├── api.ts                # API client (conversation CRUD, SSE streaming)
│   │   └── utils.ts              # shadcn cn() utility
│   ├── hooks/
│   │   ├── use-chat.ts           # Chat state management hook
│   │   └── use-auto-scroll.ts    # Auto-scroll to bottom on new messages
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives (button, input, scroll-area)
│   │   ├── chat-container.tsx    # Full-page layout: header + messages + input
│   │   ├── message-list.tsx      # Scrollable message list
│   │   ├── message-bubble.tsx    # Single message with markdown rendering
│   │   ├── chat-input.tsx        # Text input + send button
│   │   └── typing-indicator.tsx  # Pulsing dots during streaming
│   └── types.ts                  # Frontend types
└── vite.config.ts
```

## UI Design

### Layout

Full-viewport dark theme, Messenger-style full-width bubbles:

- **Header**: Agent name ("Support Bot") with avatar icon, "New Chat" button on the right
- **Message area**: Flex-grow scrollable area, messages fill the width
- **Input bar**: Fixed at bottom, text input with send button

### Message Bubbles

- **User messages**: Purple background (`#6c5ce7`), right-aligned, rounded corners (16px top-left, 16px top-right, 16px bottom-left, 4px bottom-right)
- **Assistant messages**: Dark background (`#1e1e3a`), left-aligned with circular avatar, rounded corners (4px top-left, 16px top-right, 16px bottom-right, 16px bottom-left). Content rendered as markdown.
- **Blocked messages**: When a guardrail blocks a message, display an inline system notification between the user's message and the next interaction — a subtle banner with the boundary message text (e.g., "I can only help with product-related questions."). Not rendered as a chat bubble.

### Streaming UX

1. User sends message → message appears immediately in chat (optimistic)
2. Typing indicator (three pulsing dots) appears in an assistant bubble placeholder
3. As SSE `delta` events arrive, text replaces the typing indicator and streams in progressively
4. On `done` event, streaming state clears, input re-enables

### Dark Theme

Single dark theme. Key colors:
- Background: `#0f0f1a`
- Surface/card: `#1a1a2e`
- Border: `#2a2a4a`
- Primary/accent: `#6c5ce7`
- Text: `#e0e0e0`
- Muted text: `#888888`
- Success/online: `#00b894`

## API Client (`lib/api.ts`)

Wraps the three agent service endpoints. Base URL configurable via `VITE_API_URL` env var (defaults to empty string for Vite proxy in dev).

### `createConversation(agentId: string): Promise<ConversationResponse>`

```
POST /api/conversations
Body: { agentId }
Returns: { conversationId, agentId, createdAt }
```

### `sendMessage(conversationId, message, callbacks): Promise<void>`

```
POST /api/conversations/:id/messages
Body: { message }
Response: SSE stream
```

Uses `fetch()` with manual SSE parsing on the response body stream (not `EventSource`, which doesn't support POST). Parses `event:` and `data:` lines from the stream.

**Before parsing SSE**: Check the response HTTP status. If non-2xx (e.g., 400, 404, 502), parse the JSON body and call `onError` with the `error` field, then call `onDone()`. Only attempt SSE stream parsing when the response status is 200.

**Callbacks:**
- `onDelta(text: string)` — called for each `event: delta` with the text chunk
- `onBlocked(message: string)` — called for `event: blocked` with the boundary message
- `onError(message: string)` — called for `event: error` (SSE error event or HTTP error response)
- `onDone()` — called for `event: done`, signals stream complete

### `getConversation(conversationId: string): Promise<ConversationDetail>`

```
GET /api/conversations/:id
Returns: { conversationId, agentId, createdAt, messages[] }
```

*Note: Not called in current MVP flows. Included for future use (e.g., conversation reconnection after page refresh).*

### Vite Dev Proxy

In `vite.config.ts`, proxy `/api` to `http://localhost:3000` (the agent service) and strip the `/api` prefix:

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      rewrite: (path) => path.replace(/^\/api/, ''),
    }
  }
}
```

This avoids CORS issues during development. In production, a reverse proxy or CORS headers on the agent service would handle this.

## Chat State Hook (`use-chat`)

```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface ChatState {
  conversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
}
```

**Hook returns:**
- `state: ChatState`
- `sendMessage(text: string): void`
- `startNewChat(): void`

**Lifecycle:**

1. **On mount**: Call `createConversation("support-bot")`, set `isConnecting = true`. On success, store `conversationId`, set `isConnecting = false`.
2. **Send message**:
   - Add user message to `messages` immediately (optimistic, with generated UUID)
   - Set `isStreaming = true`
   - Add empty assistant message placeholder
   - Call `sendMessage()` with callbacks:
     - `onDelta`: Append text to the assistant message's content
     - `onBlocked`: Add a system message with the boundary text, remove the empty assistant placeholder
     - `onError`: Set `error` state with the error message, remove the empty assistant placeholder
     - `onDone`: Set `isStreaming = false`
3. **New chat**: Call `createConversation("support-bot")`, clear `messages`, store new `conversationId`.

**Error recovery**: If `createConversation` fails on mount, show an error state with a "Retry" button. If `sendMessage` fails (network error before stream starts), show an inline error and allow retry.

## Component Details

### `chat-container.tsx`

Full-viewport flex column:
```
┌─────────────────────────────────┐
│ [S] Support Bot        [New Chat]│  ← header
├─────────────────────────────────┤
│                                 │
│  [S] Hello! How can I help?     │  ← message-list
│                                 │
│          What products? [user]  │
│                                 │
│  [S] We offer Acme Pro...       │
│                                 │
├─────────────────────────────────┤
│ [Type a message...      ] [Send]│  ← chat-input
└─────────────────────────────────┘
```

### `message-bubble.tsx`

- Accepts `message: Message` prop
- User role: right-aligned purple bubble, no avatar
- Assistant role: left-aligned dark bubble with purple circular avatar showing "S", content rendered through `react-markdown` with `remark-gfm` and `rehype-highlight`
- System role: centered muted text banner (for guardrail blocked messages)

### `chat-input.tsx`

- `textarea` (not `input`) for multi-line support
- Auto-resizes up to 4 lines, then scrolls
- Enter submits, Shift+Enter inserts newline
- Disabled and shows muted placeholder while `isStreaming` or `isConnecting`
- Send button disabled when input is empty or streaming
- Auto-focuses on mount and after each message send

### `typing-indicator.tsx`

- Three dots with staggered CSS pulse animation
- Rendered inside an assistant-style bubble (left-aligned with avatar)
- Shown when `isStreaming && lastAssistantMessage.content === ""`
- Hidden once the first delta arrives (content is no longer empty)

### `use-auto-scroll.ts`

- Uses a `ref` on the scroll container
- On new messages or content changes, scrolls to bottom
- Only auto-scrolls if user is already near the bottom (within 100px). If user has scrolled up to read history, don't force-scroll.

## Dev Server

```bash
# Start agent service (port 3000)
pnpm --filter @new-workshop/agent-service dev

# Start web client (port 5173, proxies /api → localhost:3000)
pnpm --filter @new-workshop/web-client dev
```

## Deferred (Post-MVP)

- Agent selector (pick from available agents)
- Multiple simultaneous conversations / sidebar
- Dark/light theme toggle
- Message copy button
- Message retry/regenerate
- Conversation persistence (reconnect to previous chat)
- Mobile responsive optimizations
- Production deployment config
