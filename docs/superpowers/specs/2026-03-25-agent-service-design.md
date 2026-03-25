# Agent Service Design Spec

## Overview

A conversational agent service accessible via REST API with SSE streaming. Agents are configured through markdown files that define persona, system prompt, and topic boundary guardrails. Powered by Anthropic Claude.

**Goal**: Working MVP / demo.

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **LLM**: Anthropic Claude (via `@anthropic-ai/sdk`)
- **Package Manager**: pnpm workspaces (monorepo)
- **Key Dependencies**: `express`, `@anthropic-ai/sdk`, `uuid`, `gray-matter` (frontmatter parsing)

## Monorepo Structure

```
new-workshop/
├── agents/                          # Agent config MD files (shared across services)
│   └── example.md
├── packages/
│   └── agent-service/              # The conversational agent API
│       ├── src/
│       │   ├── index.ts            # Entry point, Express app setup
│       │   ├── routes/
│       │   │   └── conversations.ts # Route handlers
│       │   ├── services/
│       │   │   ├── agent-loader.ts  # Loads & parses agent MD files
│       │   │   ├── conversation.ts  # Conversation CRUD (in-memory)
│       │   │   └── guardrails.ts    # Topic boundary classification
│       │   └── types.ts            # Shared TypeScript types
│       ├── package.json
│       └── tsconfig.json
├── package.json                     # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.base.json              # Shared TS config
└── README.md
```

Future packages (e.g., `packages/web-client`, `packages/mobile-app`, `packages/shared`) slot into the `packages/` directory.

## Request/Response Conventions

- All request bodies use `Content-Type: application/json`
- Non-streaming responses use `Content-Type: application/json`
- Streaming responses use `Content-Type: text/event-stream` (SSE)
- All `Date` fields are serialized as ISO 8601 strings in JSON responses (e.g., `"2026-03-25T10:00:00Z"`)

## API Surface

### POST /conversations

Create a new conversation with a specified agent. The server validates that the `agentId` corresponds to an existing agent config file; returns 404 if not found.

**Request:**
```json
{ "agentId": "support-bot" }
```

**Response (201):**
```json
{ "conversationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "agentId": "support-bot", "createdAt": "2026-03-25T10:00:00Z" }
```

Conversation IDs are UUIDv4 strings (generated via the `uuid` package).

### POST /conversations/:id/messages

Send a user message. Validation errors (unknown conversation, missing message) are returned as standard JSON responses *before* SSE begins. Once validation passes, the response is always SSE (`text/event-stream`), including when a guardrail blocks the message.

**Request:**
```json
{ "message": "Hello, can you help me?" }
```

**SSE Response (allowed):**
```
event: delta
data: {"text": "Hello! I'd be happy"}

event: delta
data: {"text": " to help you with"}

event: done
data: {"conversationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
```

**SSE Response (guardrail blocked):**
```
event: blocked
data: {"message": "I can only help with product-related questions."}

event: done
data: {"conversationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
```

**SSE Response (error during stream):**
```
event: error
data: {"message": "LLM service error"}

event: done
data: {"conversationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
```

The `done` event is always the final event in any SSE stream — it follows `delta` sequences, `blocked` events, and `error` events alike. Clients should treat `done` as the universal "stream complete" signal.

If the Claude API fails *before* the SSE stream begins (e.g., connection refused), respond with HTTP 502 JSON. If it fails *after* headers are sent, emit `event: error` followed by `event: done` and close the stream.

This unified SSE format means clients always consume the same transport — they just check the event type.

### GET /conversations/:id

Retrieve full conversation history.

**Response (200):**
```json
{
  "conversationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "agentId": "support-bot",
  "createdAt": "2026-03-25T10:00:00Z",
  "messages": [
    { "role": "user", "content": "Hello, can you help me?", "timestamp": "2026-03-25T10:00:01Z" },
    { "role": "assistant", "content": "Hello! I'd be happy to help you with...", "timestamp": "2026-03-25T10:00:02Z" }
  ]
}
```

## Agent Configuration Format

Each agent is a markdown file in `agents/` with YAML frontmatter:

```markdown
---
name: Support Bot
model: claude-sonnet-4-20250514
maxTokens: 1024
temperature: 0.7
topicBoundaries:
  allowed:
    - "product questions"
    - "troubleshooting"
    - "pricing"
  blocked:
    - "competitor comparisons"
    - "political topics"
  boundaryMessage: "I can only help with product-related questions."
---

You are a helpful support agent for Acme Corp.
You assist customers with product questions, troubleshooting, and pricing inquiries.
Be professional, concise, and friendly.
```

- **Frontmatter**: Parsed for model settings and guardrail configuration
- **Body**: Used as the system prompt sent to Claude
- **File naming**: `agents/<agent-id>.md` — the filename (without extension) is the `agentId`
- **`topicBoundaries` is optional**: If omitted, the guardrail check is skipped entirely and all messages are passed directly to the conversation

## Conversation Management

**In-memory store** using `Map<string, Conversation>`:

```typescript
interface Conversation {
  id: string;
  agentId: string;
  messages: Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>;
  createdAt: Date; // All Date fields serialized as ISO 8601 strings in JSON responses
}
```

No persistence — conversations are lost on server restart. Acceptable for MVP.

## Guardrail: Topic Boundary Enforcement

**Approach**: Before sending the user's message to the main conversation, make a lightweight Claude call to classify whether the message falls within allowed topics.

**Classification prompt** (sent as a separate, minimal API call):

```
Given these allowed topics: [list]
And these blocked topics: [list]

Classify the following user message as "allowed" or "blocked":
"<user message>"

Respond with only "allowed" or "blocked".
```

- Classification model is hardcoded to `claude-haiku-4-5-20251001` for MVP with `max_tokens: 5`
- Parse the response with case-insensitive trim; treat anything other than an exact match on "blocked" as "allowed" (consistent with fail-open posture)
- If "blocked" → return `boundaryMessage` via SSE `blocked` event, skip main conversation. The blocked user message is still appended to conversation history (as a `user` message) but no assistant message is added — this preserves a record of the attempt
- If "allowed" → proceed with normal conversation flow
- If classification fails (API error) → default to allowing the message (fail-open for MVP)
- If the agent config omits `topicBoundaries`, the guardrail check is skipped entirely

## Agent Loading

Agent config files are loaded once at startup from the `agents/` directory and cached in memory. Changes to agent files require a server restart. Hot-reloading is deferred post-MVP.

**Startup behavior**:
- If the `agents/` directory is missing or empty, the server logs a warning and starts with zero agents (all conversation creates will 404)
- If an agent file has invalid YAML frontmatter, it is skipped with a warning log
- **Required frontmatter fields**: `name`, `model`. If missing, the file is skipped
- **Optional frontmatter fields**: `maxTokens` (default: 1024), `temperature` (default: 1.0), `topicBoundaries`

**CORS**: For MVP, enable permissive CORS (`Access-Control-Allow-Origin: *`). SSE responses include `Cache-Control: no-cache` and `Connection: keep-alive`.

## Error Handling

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Missing or empty `agentId` (on conversation create) | 400 | `{ "error": "agentId is required" }` |
| Unknown `agentId` (on conversation create) | 404 | `{ "error": "Agent not found" }` |
| Unknown `conversationId` | 404 | `{ "error": "Conversation not found" }` |
| Missing or empty `message` field | 400 | `{ "error": "Message is required" }` |
| Malformed JSON request body | 400 | `{ "error": "Invalid request body" }` |
| Claude API error (before SSE stream) | 502 | `{ "error": "LLM service error" }` |
| Claude API error (during SSE stream) | — | SSE `event: error` (see message endpoint) |

Note: Guardrail blocks are not errors — they are delivered as SSE `blocked` events on the message endpoint. Express default JSON parsing errors are acceptable for MVP.

## Deferred (Post-MVP)

- Authentication (API keys, JWT)
- Rate limiting
- Persistent conversation storage (Redis/Postgres)
- Tool/function calling
- Multiple MD files per agent (composed context)
- Agent hot-reloading (watch for file changes)
- Health check / metrics endpoints
- Client packages (web, mobile)
