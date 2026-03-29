# Project

Workshop app for building conversational AI agents. Users create agent personas as markdown files, then chat with them via a web UI. Backend streams Claude responses over SSE.

pnpm monorepo: `packages/agent-service` (Express, port 3000) and `packages/web-client` (React + Vite, port 5173).

## Commands

- `pnpm install` — install all workspace deps from project root
- `pnpm --filter @new-workshop/agent-service dev` — start backend
- `pnpm --filter @new-workshop/web-client dev` — start frontend
- `pnpm --filter @new-workshop/agent-service test` — run backend tests
- `pnpm --filter @new-workshop/web-client test` — run frontend tests

## Architecture

- `.env` at project root, loaded by dotenv in agent-service — contains `ANTHROPIC_API_KEY`
- Anthropic SDK auto-reads `ANTHROPIC_API_KEY` from env (no explicit key passing)
- Agents defined as markdown files in `agents/` directory
- SQLite DB at `packages/data/conversations.db` (gitignored)

## Gotchas

- This machine has Python 3.9 — use `from __future__ import annotations` for modern type hints
- Project uses pnpm, not npm — `node_modules/.pnpm` is the indicator
- `.env` is gitignored; `.env.example` is the template
