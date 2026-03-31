# New Workshop — Agent Service

A conversational agent service with REST API + SSE streaming, powered by Anthropic Claude.

## Quick Start

If you have [Claude Code](https://claude.com/claude-code) installed, just type:

```
/workshop-onboarding
```

This will install dependencies, configure your `.env` with your API key, start both services, and give you the URLs.

### Manual setup

```bash
pnpm install
cp .env.example .env
# Edit .env and add your Anthropic API key
```

Start both backend and frontend with a single command:

```bash
pnpm start
```

- Backend (API): http://localhost:3000
- Frontend (UI): http://localhost:5173

## API

### Create conversation

```bash
curl -X POST http://localhost:3000/conversations \
  -H "Content-Type: application/json" \
  -d '{"agentId": "support-bot"}'
```

### Send message (SSE streaming)

```bash
curl -N -X POST http://localhost:3000/conversations/{id}/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "What products do you offer?"}'
```

### Get conversation history

```bash
curl http://localhost:3000/conversations/{id}
```

## Agent Configuration

Agents are defined as markdown files in the `agents/` directory. Each file describes the agent's persona, instructions, and behavior.

See `agents/support-bot.md` for an example.

## Project Structure

```
new-workshop/
├── agents/                   # Agent definition files (markdown)
│   └── support-bot.md
└── packages/
    └── agent-service/        # REST API + SSE streaming service
```
