# AI Agent Workshop

Build conversational AI agents with personas, tools, guardrails, multi-agent delegation, an in-UI copilot that helps you build agents through chat, and an auto-mode router that picks the right specialist for each conversation. Powered by Claude.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- [Anthropic API key](https://console.anthropic.com/settings/keys)

### Setup (3 steps)

```bash
# 1. Clone and open the project
git clone <repo-url> && cd new-workshop

# 2. Start Claude Code
claude

# 3. Run the onboarding
/workshop-onboarding
```

That's it. The onboarding skill installs dependencies, generates a JWT secret, asks for your Anthropic API key, starts both services, and opens the app in your browser. It's idempotent — re-running it on a working setup just verifies everything is still healthy and skips the work that's already done.

## What You'll Build

Agents are markdown files in `agents/` with a persona, model settings, optional tools, optional topic guardrails, and optional delegate list:

```yaml
---
name: Weather Agent
model: claude-sonnet-4-20250514
maxTokens: 1024
temperature: 0.7
avatar:
  emoji: 🌤
  color: "#5b9bd5"
tools:
  - browse_url
topicBoundaries:
  allowed: [weather, forecast, climate]
  blocked: [politics, finance]
  boundaryMessage: "I only help with weather questions."
---
You are a weather agent. Browse the web to find current weather for any location.
```

You can edit agents directly in the markdown files, in the web UI's agent form, or by chatting with the **Agent Copilot** (see Features below).

## Features

### Conversational chat
- Chat with any agent via a web UI with a streaming SSE response pipeline.
- Per-agent persona, model, temperature, max tokens, and avatar — defined in markdown frontmatter.
- Topic guardrails: allow/block lists with a configurable refusal message; checked by a fast Haiku call before the main model runs.

### ✨ Auto mode (router agent)
- New conversations default to a special **router** agent (`agents/router.md`) that takes 1–3 turns to figure out what the user actually wants, then calls the `assign_agent` tool to permanently hand the conversation to the right specialist.
- The handoff is shown as a banner in the message stream (e.g. *"✨ Connected you with Weather Agent — you asked about weather"*) and the assigned agent answers the original question in the same request — no double-typing.
- Once assigned, the conversation behaves identically to one started directly with that specialist. The user's prior pick of a specific agent is preserved across new chats — auto mode is the default for users without an explicit choice.
- Spec: [`docs/superpowers/specs/2026-04-07-auto-mode-design.md`](docs/superpowers/specs/2026-04-07-auto-mode-design.md)

### 🤖 Agent Copilot
- A floating chat panel in the bottom-right corner of the UI that interviews you in natural language and **creates or edits agent markdown files for you**, replacing manual form-filling.
- Two modes: **create** (build a new agent from scratch — copilot asks free-form, then targeted follow-ups for gaps) and **edit** (modify an existing agent — copilot sees the current config and proposes diffs).
- Aware of every existing agent, so it can pick avatars/tools/delegates that don't collide and can suggest delegation links between related agents.
- Streams Claude responses via a dedicated `POST /api/copilot/chat` SSE endpoint. After creating or updating an agent, the copilot auto-opens the agent drawer with the new/updated config so you can review.
- Spec: [`docs/superpowers/specs/2026-04-06-agent-copilot-design.md`](docs/superpowers/specs/2026-04-06-agent-copilot-design.md)

### Multi-agent delegation
- A "main" agent can list specialist agents in its `delegates:` field. At runtime it gets a `delegate_to` tool to hand the conversation to a specialist for a specific task, and the specialist gets a matching `hand_back` tool to return when done.
- The conversation history is sliced so the specialist sees only the relevant exchange, not the entire prior context. A delegation banner is rendered in the chat for both directions.

### Per-agent tools
- Tools are opt-in per agent via the `tools:` frontmatter field. When you edit an agent in the UI, an interactive tools picker shows what's available and what each tool does.
- Tool execution is streamed to the frontend with `tool_start` / `tool_done` SSE events so the user sees a "🔧 using browse_url…" indicator in real time.

### Authentication and persistence
- JWT-based signup/login (bcrypt-hashed passwords).
- Conversations are persisted in SQLite at `packages/data/conversations.db` (gitignored). Per-user ownership; users only see their own conversations.
- The data directory is created on demand at startup, so a fresh clone just works without any manual `mkdir`.

### Available Tools

| Tool | Available to | Description |
|------|--------------|-------------|
| `browse_url` | any agent that opts in | Fetch and extract text content from a web page using a headless Playwright browser. |
| `delegate_to` | any agent with non-empty `delegates:` | Hand the conversation to a specialist agent for a specific task. |
| `hand_back` | any agent currently acting as a delegate | Return control to the main agent with a brief summary of what was accomplished. |
| `assign_agent` | router agent only | Permanently assign the conversation to a specialist (auto-mode). One-shot — cannot be called again on the same conversation. |

## Architecture

```
new-workshop/                        pnpm monorepo
├── agents/                          Agent personas (markdown files, hot-loaded at startup)
│   ├── router.md                    Auto-mode router (default for new chats)
│   ├── weather-agent.md             Specialist with browse_url
│   ├── travel-agent.md              Specialist with browse_url
│   ├── support-bot.md               Specialist with browse_url
│   └── ...
├── packages/
│   ├── agent-service/               Express backend on port 3000
│   │   └── src/
│   │       ├── routes/              auth, conversations, agents, copilot
│   │       ├── services/            agent-loader, database, tool-service, copilot-service, guardrails
│   │       └── services/tools/      browse-url, delegate-to, hand-back, assign-agent
│   ├── web-client/                  React + Vite frontend on port 5173
│   │   └── src/
│   │       ├── components/          chat, sidebar, agent-form, copilot-panel, delegation-banner, ...
│   │       └── hooks/               use-chat, use-copilot, use-agents
│   └── data/                        SQLite database (gitignored, auto-created at startup)
├── docs/superpowers/                Design specs and implementation plans
└── .env                             ANTHROPIC_API_KEY + JWT_SECRET (created during onboarding)
```

The two services run together via `concurrently` — one terminal command, one Ctrl-C to stop both.

## Useful Commands

| Command | What it does |
|---------|--------------|
| `pnpm start` | Start both services in the foreground with interleaved live logs (`[be]` blue, `[fe]` green). Press **Ctrl-C** to stop both. |
| `pnpm --filter @new-workshop/agent-service test` | Run backend tests (vitest, ~140 tests). |
| `pnpm --filter @new-workshop/web-client test` | Run frontend tests (vitest + react-testing-library). |
| `pnpm --filter @new-workshop/web-client build` | Production build of the frontend. |

To restart services, just press Ctrl-C and run `pnpm start` again. To keep logs visible while you code, open one terminal tab for `pnpm start` and another for git/editor work.

## Tech Stack

- **Backend:** Node.js 20+, Express, TypeScript, `@anthropic-ai/sdk`, better-sqlite3, JWT, bcrypt, Playwright (for `browse_url`), gray-matter (for parsing agent frontmatter), vitest.
- **Frontend:** React 18, Vite, TypeScript, Tailwind, vitest.
- **Tooling:** pnpm workspaces, concurrently, tsx watch (backend hot reload), vite HMR (frontend hot reload).

## Documentation

- Design specs: [`docs/superpowers/specs/`](docs/superpowers/specs/)
- Implementation plans: [`docs/superpowers/plans/`](docs/superpowers/plans/)
- Test quality report: [`TEST_QUALITY_REPORT.md`](TEST_QUALITY_REPORT.md)
- Agent samples: [`agents/`](agents/)
