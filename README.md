# New Workshop — Agent Service

A conversational agent service with REST API + SSE streaming, powered by Anthropic Claude.

## Quick Start

```bash
pnpm install
```

```bash
export ANTHROPIC_API_KEY=your-key-here
```

```bash
pnpm --filter @new-workshop/agent-service dev
```

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
