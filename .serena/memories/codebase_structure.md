# Codebase Structure

```
new-workshop/
├── agents/
│   └── support-bot.md          # Agent config (YAML frontmatter + system prompt)
├── packages/
│   ├── agent-service/          # Backend Express API
│   │   └── src/
│   │       ├── index.ts        # Server entry point
│   │       ├── types.ts        # Shared types (AgentConfig, Conversation, Message, etc.)
│   │       ├── routes/
│   │       │   └── conversations.ts  # REST + SSE endpoints (CRUD, streaming, title gen)
│   │       ├── services/
│   │       │   ├── database.ts       # SQLite wrapper (better-sqlite3)
│   │       │   ├── agent-loader.ts   # Loads agent configs from markdown files
│   │       │   └── guardrails.ts     # Topic boundary checking via Claude
│   │       └── __tests__/
│   │           ├── database.test.ts
│   │           ├── routes.test.ts
│   │           ├── guardrails.test.ts
│   │           └── agent-loader.test.ts
│   ├── web-client/             # Frontend React SPA
│   │   └── src/
│   │       ├── App.tsx         # Root: flex layout with Sidebar + ChatContainer
│   │       ├── main.tsx        # React entry point
│   │       ├── index.css       # Global styles + Tailwind
│   │       ├── types.ts        # Frontend types (Message, ChatState, etc.)
│   │       ├── lib/
│   │       │   ├── api.ts      # Fetch wrappers (list, create, delete, sendMessage SSE)
│   │       │   └── utils.ts    # cn() utility
│   │       ├── hooks/
│   │       │   ├── use-chat.ts       # Main state hook (conversations, messages, streaming)
│   │       │   └── use-auto-scroll.ts
│   │       ├── components/
│   │       │   ├── sidebar.tsx           # Collapsible conversation list
│   │       │   ├── conversation-item.tsx # Single conversation row
│   │       │   ├── confirm-dialog.tsx    # Delete confirmation modal
│   │       │   ├── chat-container.tsx    # Chat area (header, messages, input)
│   │       │   ├── message-list.tsx
│   │       │   ├── message-bubble.tsx    # Markdown-rendered message
│   │       │   ├── chat-input.tsx
│   │       │   ├── typing-indicator.tsx
│   │       │   └── ui/button.tsx         # CVA button component
│   │       └── __tests__/
│   │           ├── use-chat.test.ts
│   │           └── api.test.ts
│   └── data/
│       └── conversations.db    # SQLite database (auto-created)
├── package.json                # Root (pnpm workspace config)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## API Endpoints (agent-service, port 3000)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /conversations | List all conversations |
| POST | /conversations | Create new conversation |
| GET | /conversations/:id | Get conversation with messages |
| POST | /conversations/:id/messages | Send message (SSE stream) |
| DELETE | /conversations/:id | Delete conversation |

## Vite Proxy
Frontend proxies `/api/*` to `http://localhost:3000` with `/api` prefix stripped.
