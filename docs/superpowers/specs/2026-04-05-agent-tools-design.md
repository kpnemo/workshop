# Agent Tools System — Design Spec

## Overview

Add a general-purpose tool execution system to the agent backend, with `browse_url` as the first tool implementation. Agents opt into tools via their markdown frontmatter. Tools execute server-side in an agentic loop invisible to the frontend.

## Architecture

### Approach: Separate Tool Service

A dedicated `ToolService` class manages tool registration, agent-tool resolution, and execution dispatch. The conversation route delegates tool calls to this service.

### New Files

```
packages/agent-service/src/services/
  tool-service.ts          — ToolService class
  tools/
    types.ts               — Tool interface & types
    browse-url.ts          — Playwright-based URL browsing
    browser-manager.ts     — Shared Chromium instance lifecycle
```

### Modified Files

```
packages/agent-service/src/routes/conversations.ts  — tool execution loop + SSE status events
```

### No Frontend Changes

The agentic tool loop runs entirely server-side. The frontend receives the same SSE delta/done events it already handles. Optional `tool_start`/`tool_done` SSE events are sent but can be ignored by the frontend for now.

## Tool Interface

Each tool implements:

```ts
interface Tool {
  name: string;
  definition: Anthropic.Tool;                // schema sent to Claude
  execute(input: unknown): Promise<string>;  // returns text content
}
```

Tools are registered with `ToolService` at server startup. The service resolves which tools an agent has access to by reading the agent's `tools:` frontmatter field.

## Agent Configuration

Tools are assigned per-agent in the markdown frontmatter:

```yaml
---
name: Support Bot
model: claude-sonnet-4-5-20241022
tools:
  - browse_url
---
System prompt here...
```

Agents without a `tools:` field get no tools (current behavior preserved).

## ToolService

Responsibilities:
- **Registry**: Tools register at startup with name, Anthropic schema, and execute function
- **Resolution**: `getToolsForAgent(agentConfig)` reads the agent's `tools:` frontmatter, returns matching Anthropic tool definition array
- **Execution**: `execute(toolName, input)` validates the tool exists, calls its handler, returns the result string
- **Lifecycle**: `start()` and `shutdown()` manage resources (e.g., shared Playwright browser)

## browse_url Tool

### Tool Schema

```ts
{
  name: "browse_url",
  description: "Fetch a web page and extract its main text content",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to browse" }
    },
    required: ["url"]
  }
}
```

### Execution Pipeline

1. `browserManager.withPage(fn)` — fresh browser context, no shared cookies/state
2. `page.goto(url, { waitUntil: 'domcontentloaded' })` — 30-second timeout
3. `page.content()` — get raw HTML
4. Parse HTML with `linkedom`, run `@mozilla/readability` to extract main content
5. Convert to clean markdown (title + body text)
6. Truncate to ~50k characters
7. Return markdown string as tool result

### BrowserManager

- Lazy-launches a single Chromium instance on first tool call (not at server startup)
- `withPage(fn)` creates a fresh browser context + page, runs callback, closes context
- `close()` for graceful shutdown via server shutdown hook
- If browser crashes, relaunches on next `withPage()` call

### Dependencies

- `playwright` — headless Chromium
- `@mozilla/readability` — content extraction
- `linkedom` — lightweight DOM parser for Readability

## Conversation Loop Changes

The POST `/conversations/:id/messages` handler changes from a single stream to a loop:

### Flow

1. Call `anthropic.messages.stream()` with `tools: toolService.getToolsForAgent(agent)`
2. Stream text deltas to frontend as usual
3. When stream ends, check `stop_reason`:
   - If `end_turn`: done, save message, send `event: done`
   - If `tool_use`: continue to step 4
4. Extract tool call(s) from response content blocks
5. Send `event: tool_start` SSE event (tool name + input)
6. Execute via `toolService.execute(toolName, input)`
7. Send `event: tool_done` SSE event (tool name + duration)
8. Push `assistant` message (with tool_use content block) and `tool_result` message (role `user`, per Anthropic API convention) to messages array
9. Go to step 1 (new stream with updated messages)

### Constraints

- Max 5 loop iterations to prevent runaway tool calling
- If max hit, return last Claude response as-is
- Only the final text response is saved to SQLite (not intermediate tool exchanges)

### SSE Event Stream Example

```
event: delta
data: {"text":"Let me look that up"}

event: tool_start
data: {"tool":"browse_url","input":{"url":"https://example.com"}}

event: tool_done
data: {"tool":"browse_url","duration_ms":1200}

event: delta
data: {"text":"Based on the page content..."}

event: done
data: {"conversationId":"..."}
```

## Error Handling

Tool errors are never thrown — they are returned as `tool_result` strings so Claude can handle them in conversation.

| Scenario | Behavior |
|----------|----------|
| Page load timeout (30s) | Return error string as tool result |
| Invalid URL | Return error string as tool result |
| Readability can't extract | Fall back to raw `page.innerText()`, truncated |
| Playwright browser crash | BrowserManager relaunches on next call |
| Tool not found in registry | Return error string as tool result |
| Max iterations (5) hit | Stop looping, return last Claude response |

## Testing Strategy

### tool-service.test.ts
- Register tools and retrieve by name
- `getToolsForAgent()` returns correct tool definitions based on frontmatter
- `execute()` calls the right handler and returns result
- Unknown tool name returns error result (no throw)
- Agent with no `tools:` field returns empty array

### browse-url.test.ts
- Mock Playwright page — test Readability extraction on sample HTML
- Truncation at character limit
- Error cases: timeout, invalid URL, non-HTML content
- No real browser launched in tests

### browser-manager.test.ts
- Lazy launch: browser not started until first `withPage()` call
- Context isolation: each `withPage()` creates and closes its own context
- Graceful shutdown via `close()`

### conversations.test.ts (extend existing)
- Mock ToolService — verify tool_use stop reason triggers the loop
- Tool results pushed back to messages correctly
- Max iterations cap prevents infinite loops
- SSE events sent in correct order (tool_start before tool_done before next delta)
