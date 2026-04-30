# Conversation Content Icon — Design

**Date:** 2026-04-30
**Status:** Drafted; awaiting user review before implementation plan

## Problem

The chat sidebar shows an agent avatar on the left of each conversation row. The
avatar tells the user *which agent* owns the conversation but says nothing about
*what the conversation is about*. Once a user has a few conversations with the
same agent, the rows become hard to scan.

## Goal

Show a small icon that reflects the *topic* of each conversation, regenerated
after every assistant turn so it tracks the conversation as it evolves.

## Non-goals

- Manual icon editing in the UI (auto-managed only in v1).
- Icon-driven search, grouping, or filtering.
- Animation on icon change.
- Icon generation for the router agent on its own (router rows still fall back
  to the agent avatar — they're hand-off agents, not topic owners).

## High-level design

One new `icon` field per conversation. After each assistant turn (excluding
pure-router turns), the backend asks Haiku for a single icon, validates it, and
streams it to the client over a new SSE event. The client renders the icon in
the existing avatar slot, replacing the agent avatar — keeping the agent's
colored circle background as a subtle agent-identity tell.

If no icon has been generated yet (new conversation, generation failed twice,
invalid output), the row falls back to the agent avatar exactly as today.

## Data model

### Database

Add one column to the `conversations` table via the existing additive migration
pattern in `packages/agent-service/src/services/database.ts`
(`PRAGMA table_info` guard + `ALTER TABLE … ADD COLUMN`):

```sql
ALTER TABLE conversations ADD COLUMN icon TEXT;
```

`NULL` means "no content icon yet — fall back to the agent avatar." Existing
conversations remain `NULL` until their next assistant turn produces an icon.

### Encoding

Stored as a single prefixed string. No JSON, no second column.

| Value             | Render                                         |
|-------------------|------------------------------------------------|
| `NULL`            | agent avatar (fallback)                        |
| `emoji:🔢`        | render the emoji directly                      |
| `lucide:plane`    | render `<Plane />` from `lucide-react`         |

Validation regex on the server: `^(emoji:.+|lucide:[a-z0-9-]+)$`. The `lucide:`
branch additionally requires the name to be a known key in `lucide-react`'s
`dynamicIconImports` map (full ~1500-entry set). Anything else is treated as
invalid output (see "Failure modes" below).

### TypeScript types

- `packages/agent-service/src/types.ts` — add `icon: string | null` to the
  `Conversation` interface (after `summaryEnabled`).
- `packages/web-client/src/types.ts` — add `icon: string | null` to
  `ConversationSummary`.

### Database methods

In `database.ts`:

- `setIcon(id: string, icon: string): void` — single `UPDATE conversations SET
  icon = ? WHERE id = ?`. Mirrors the existing `setTitle` shape.
- Extend `listConversations` to include `c.icon` in the SELECT and the row
  mapping.
- Extend `getConversation` to read `icon`.

## Generation flow

Mirror the title generation pattern at
`packages/agent-service/src/routes/conversations.ts:469-499`, but kick the call
off as a background promise so it never blocks the user-visible streaming.

### Trigger

After the assistant's response finishes streaming, on every assistant turn
*except* when `finalConv.agentId === "router"` — same skip rule the title flow
uses. Once a specialist takes over, the icon generation kicks in on the next
turn.

This applies to every turn, not just the first. The generated icon overwrites
any prior icon, so it tracks topic shifts as the conversation evolves.

### Async pattern

The icon call runs in parallel with the rest of the turn-finalisation work,
*after* the user-facing stream has emitted its `done` event. Concretely: kick
off `generateIcon(...)` as a fire-and-forget promise. When it resolves with a
valid icon:

1. `db.setIcon(conversationId, icon)`.
2. If the SSE response is still open, `writeSSE(res, "icon", { icon })`.
3. If the SSE response is already closed (user navigated away mid-flight, or
   the server has already ended the response), skip step 2 silently. Next
   `GET /conversations` will pick up the new value.

The icon promise must not block the user-visible `done` event nor delay
`res.end()`. Before each `writeSSE` for `icon`, guard with a check on
`res.writableEnded` / `res.destroyed`; if true, persist only.

The user never waits on icon generation. There is no perceived latency cost.

### Prompt

Model: `claude-haiku-4-5-20251001` (same model the title flow uses).
`max_tokens: 30`.

```
Pick a single icon that represents this conversation's topic.

Reply with EXACTLY one line in one of these formats:
  emoji:<single emoji>
  lucide:<icon-name>

For lucide, use a kebab-case lucide-react icon name such as plane, map-pin,
dollar-sign, bug, hash, message-square — pick whichever icon best fits.

Prefer emoji when an obvious one fits. Use lucide for technical or abstract
topics where no emoji is right.

Reply with the icon line only, no other text.

Title: <conversation title or "(none)">
Last user message: <truncated to 300 chars>
Last assistant message: <truncated to 300 chars>
```

The prompt is intentionally not given a closed lucide whitelist — the universe
of available lucide icons is large enough that a whitelist would constrain
expressiveness more than it'd improve hit rate. Validation handles unknown
names.

### Validation

Server-side parse:

1. Trim whitespace from the model's response.
2. Regex match `^(emoji:.+|lucide:[a-z0-9-]+)$`. Otherwise: invalid.
3. If `lucide:`, require the name to be a key in `dynamicIconImports`.
   Otherwise: invalid.
4. If `emoji:`, accept any non-empty content after the prefix.

### Retry policy

If the call fails (network/timeout, Anthropic 5xx or 429, malformed response,
or invalid validation per above), retry **once**. Total attempts: **2 max**.

- Delay between attempts: 500ms.
- No exponential backoff — this is background work and two tries is enough.
- Both attempts fail → log the final error, leave the existing `icon` value
  unchanged, do not emit the SSE event. The next turn gets a fresh budget.

## API surface

No breaking changes. Three small additions.

### SSE event: `icon`

Emitted async after the per-turn `done` event:

```ts
writeSSE(res, "icon", { icon: "emoji:🔢" });
// or
writeSSE(res, "icon", { icon: "lucide:plane" });
```

Skipped silently if the response is already closed.

### `GET /conversations` (list)

Add `icon` to each row of the response payload. Backed by adding `c.icon` to
the SELECT in `Database.listConversations` and the row mapping.

```jsonc
[
  {
    "id": "…",
    "agentId": "…",
    "title": "Counting One Through Five",
    "updatedAt": "…",
    "messageCount": 4,
    "summaryEnabled": true,
    "icon": "emoji:🔢"   // ← new, may be null
  }
]
```

### `GET /conversations/:id`

Same — include `icon` in the single-conversation payload.

### No PATCH support

`PATCH /conversations/:id` is not extended for `icon` in v1. The icon is
auto-managed and not user-editable. A future "reset to default" or manual
override is out of scope here.

## Frontend

### `<ConversationIcon>` (new component)

New file: `packages/web-client/src/components/conversation-icon.tsx`.

Receives the raw `icon` string and the conversation's `agent` (so it can derive
both the colored-circle background and the fallback emoji). Returns a single
JSX element shaped exactly like the current `<AgentAvatar>` — same circular
background using `agent.avatar.color`, same size variants. Only the inner
content differs.

Render branches:

- `icon === null` or unknown lucide name → render `agent.avatar.emoji` (full
  fallback to today's behaviour).
- `icon = "emoji:X"` → render `X` as text.
- `icon = "lucide:name"` and `name` is in `dynamicIconImports`:
  ```tsx
  const Icon = lazy(dynamicIconImports[name]);
  return <Suspense fallback={<>{agent.avatar.emoji}</>}>
    <Icon size={14} />
  </Suspense>;
  ```
  First render of any new icon name triggers a small chunk fetch (~1-2KB) and
  is cached for the rest of the session. Bundle stays code-split.

### `conversation-item.tsx`

Replace the existing `<AgentAvatar avatar={agent.avatar} size="sm" />` call
with `<ConversationIcon icon={conversation.icon} agent={agent} size="sm" />`.

The `?` placeholder for "agent not found" stays as-is.

Layout polish for the user-flagged "title can crowd the right side" concern:

- Add `pr-1` to the existing `<div className="min-w-0 flex-1">` so titles
  truncate with breathing room before the hover trash icon appears.
- The outer row already uses `gap-2.5`, leave it.

### `lib/api.ts`

Add `case "icon"` to the streaming SSE switch:

```ts
case "icon":
  callbacks.onIcon?.(data.icon);
  break;
```

Add `onIcon?: (icon: string) => void` to the `SendMessageCallbacks` type.

### `use-chat.ts`

Mirror the existing `onTitle` handler at `use-chat.ts:281`:

```ts
onIcon: (icon) => {
  setConversations((prev) =>
    prev.map((c) => (c.id === conversationId ? { ...c, icon } : c)),
  );
}
```

No optimistic update; the value comes from the server.

## Failure modes

| Case                                            | Behavior                                                       |
|-------------------------------------------------|----------------------------------------------------------------|
| Router turn (Auto only)                         | Skip generation; row keeps the agent avatar.                   |
| Haiku call fails (network/5xx/429)              | Retry once after 500ms. If still failing, log + skip emit.     |
| Invalid model output (regex fail)               | Same as above — counts toward the 2-attempt budget.            |
| Unknown lucide name (not in `dynamicIconImports`) | Same as above.                                                |
| SSE response already closed when icon resolves  | Persist to DB; skip SSE write. Next `GET /conversations` picks up the value. |
| Existing conversations with `icon = NULL`       | Render agent avatar. Auto-fills on next assistant turn.        |
| Conversation with no assistant turn yet         | Never reaches generation. Agent avatar shown.                  |
| Concurrent writes (same convo, multiple turns)  | Last `setIcon` wins. Single UPDATE; no special handling.       |
| Lucide chunk fetch fails on client              | `<Suspense fallback={agentAvatar.emoji}>` shows the agent emoji until retry/refresh. |

## Testing

### Backend

- Unit test for `parseAndValidateIcon(raw: string): string | null`: valid
  emoji, valid lucide name, invalid prefix, unknown lucide name, empty string,
  whitespace-only.
- Unit test for the retry wrapper: succeeds first try, succeeds on retry,
  fails both — assert exactly 2 calls in the failure case.
- Integration test: fake-streamed turn end-to-end (mocked `messages.stream`
  and `messages.create` clients) — asserts the `icon` SSE event fires and the
  DB row reflects the new value.
- Integration test: router turn — asserts no icon generation call is made.

### Frontend

- Render test for `<ConversationIcon>`: null branch (agent emoji), emoji
  branch, valid lucide branch, unknown lucide branch (falls back to agent
  emoji).
- Snapshot for `<ConversationItem>` with and without an icon, hovered and not.

## Out of scope

- User-editable icons.
- Icon history / per-turn icon log.
- Group, color, or filter conversations by icon.
- Icon for the router/Auto rows specifically.
- Manual "regenerate icon now" action.
