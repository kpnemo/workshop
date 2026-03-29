# Project Overview

## Purpose
A chat application with an AI agent backend powered by Claude (Anthropic). Users interact with configurable AI agents through a web interface with streaming responses, conversation history, and topic guardrails.

## Tech Stack
- **Monorepo**: pnpm workspaces
- **Backend** (`packages/agent-service`): Node.js, Express, TypeScript, better-sqlite3 (SQLite), Anthropic SDK
- **Frontend** (`packages/web-client`): React 19, Vite, Tailwind CSS 3, TypeScript
- **Testing**: Vitest for both packages
- **Runtime**: Node.js >= 20, ESM modules (`"type": "module"`)

## Architecture
- `packages/agent-service` — Express API with SQLite persistence, SSE streaming, Claude integration
- `packages/web-client` — React SPA with dark theme, sidebar conversation history
- `agents/` — Markdown files with YAML frontmatter defining agent configs (system prompt, model, topic boundaries)
- `packages/data/` — SQLite database file (`conversations.db`)

## Key Features
- Streaming chat via Server-Sent Events (SSE)
- Persistent conversation history (SQLite)
- Collapsible sidebar for conversation management
- LLM-generated conversation titles (Claude Haiku)
- Topic guardrails (allowed/blocked topics per agent)
- Markdown rendering in assistant messages
