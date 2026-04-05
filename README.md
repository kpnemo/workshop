# AI Agent Workshop

Build conversational AI agents with tools, guardrails, and personas. Powered by Claude.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
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

That's it. The onboarding skill installs dependencies, configures your environment, starts the services, and opens the app in your browser.

## What You'll Build

Agents are markdown files with a persona, model settings, and optional tools:

```yaml
---
name: Weather Agent
model: claude-sonnet-4-20250514
tools:
  - browse_url
---
You are a weather agent. Browse the web to find current weather for any location.
```

### Available Tools

| Tool | Description |
|------|-------------|
| `browse_url` | Fetch and extract text content from web pages |

### Features

- Chat with AI agents via a web UI
- Real-time streaming responses (SSE)
- Per-agent tools (web browsing, more coming)
- Topic guardrails (allow/block specific topics)
- Agent management (create, edit, delete via UI)

## Useful Commands

| Command | What it does |
|---------|-------------|
| `pnpm start` | Start services + show live logs |
| `pnpm stop` | Stop all services |
| `pnpm restart` | Restart all services |
| `pnpm logs` | View live logs (Ctrl+C to exit, services keep running) |
| `pnpm status` | Show service status table |

## Project Structure

```
new-workshop/
├── agents/                          # Agent personas (markdown files)
├── packages/
│   ├── agent-service/               # Express backend (port 3000)
│   │   └── src/services/tools/      # Tool implementations
│   └── web-client/                  # React + Vite frontend (port 5173)
└── .env                             # API keys (created during onboarding)
```
