# Redirect-to-Router Design

**Date:** 2026-04-29
**Status:** Draft (pending user spec review)

## Problem

Once the Auto router (`agents/router.md`) hands a conversation off to a specialist via `assign_agent`, the user is locked in for the lifetime of the conversation. If the user's next message falls outside the specialist's domain, the specialist's `topicBoundaries` pre-classifier blocks the message and emits `boundaryMessage` — a dead end. The user has to leave the conversation, switch agents manually, and re-type the question.

Concrete repro: user starts with Auto → asks about travel → routed to `travel-agent` → in turn 3 asks "what's the weather in Tokyo?" → travel-agent's `topicBoundaries` lists `weather` as blocked → user gets `"I am travel agent, I can help with hotel or flight bookings"` and is stuck.

The user's mental model is that Auto is always available to re-classify a new question. The system should match that model: any specialist should be able to hand the conversation back to Auto when the message is outside its scope, and Auto should re-engage in the same turn so the user gets a real answer.

## Goals

- Any non-router agent can hand the conversation back to Auto on demand.
- After redirect, Auto re-engages on the *current user message* in the same HTTP turn — no retype.
- The redirected message reaches the right specialist and gets answered, all in a single user-visible exchange.
- Conversations can flip between specialists arbitrarily many times across turns (travel → Auto → weather → Auto → travel → …).
- Re-use the existing turn-loop infrastructure that already handles `assign_agent` mid-turn.

## Non-Goals (v1)

- Multiple redirects in one HTTP turn. Hard cap at one — see Error Handling.
- A `suggested_agent_id` argument on the redirect tool (let the agent skip the router and nominate directly).
- Removing `topicBoundaries.boundaryMessage` from the data model. It stays unused at runtime but is preserved in the admin form for one release cycle.
- Changing delegation (`delegate_to` / `hand_back`). Those are an orthogonal mechanism (sub-agent for one task, then return) and stay untouched.
- Schema changes. The new banner type uses an existing column.
- Per-agent opt-in for the redirect tool. It is auto-granted to every non-router agent.

## Design Decisions

| Question | Decision |
|---|---|
| What triggers the redirect? | Agent itself decides via a new `redirect_to_router` tool — no pre-classifier. |
| What happens to the existing `topicBoundaries` pre-check? | Removed. Allowed/blocked lists become guidance injected into the agent's system prompt. |
| Which agents can call the new tool? | Auto-granted to every non-router agent. Mirrors `assign_agent` (which is auto-granted only to the router). |
| What context does the router see when re-engaged? | Just the latest user message, plus a system-prompt note explaining why it's being re-engaged. |
| Does the user have to retype after redirect? | No. The router re-engages in the same HTTP turn and routes immediately. |
| Is `boundaryMessage` still sent? | No. The agent phrases its own reason via the tool's `reason` argument. |
| What if the router re-assigns to the same specialist that just redirected? | The specialist could redirect again — the system caps redirects at 1 per HTTP turn. On the second call the tool returns an error and the agent must answer with text. |

## Architecture

The redirect mechanism re-uses the existing outer-loop pattern in `routes/conversations.ts` that already supports `assign_agent` mid-turn. When a non-router agent calls `redirect_to_router`, the tool flips `conversation.agentId` to `"router"` and returns a sentinel `[REDIRECT]` string. The outer loop detects this exactly the way it already detects `[ASSIGNMENT]` from `assign_agent`, then re-iterates with the router as the active agent — passing only the current user message as input. The router's normal `assign_agent` flow runs against this single message, picks the right specialist, and the loop continues a third time so the new specialist answers. All of this happens inside one HTTP request, producing two banners (`redirect_to_router`, `assignment`) and one assistant reply.

System prompt behavior changes for agents that have `topicBoundaries`: instead of running a separate Haiku call to pre-classify, `routes/conversations.ts` injects a `[Topic Boundaries]` block into the agent's system prompt that lists the allowed/blocked topics and instructs the agent to call `redirect_to_router` rather than refuse.

## Components

### Backend (`packages/agent-service`)

**New files:**

1. **`src/services/tools/redirect-to-router.ts`** — the new tool.
   - Schema: `{ reason: string }` (required).
   - Execution:
     - Validate `context` and `reason`. If missing, return error string and do not write to DB.
     - Call `db.setAgentId(conversationId, "router")`.
     - Call `db.addDelegationMessage(conversationId, { type: "redirect_to_router", from: <currentAgentId>, to: "router", reason })` so the banner persists in conversation history.
     - Emit SSE: `event: redirect_to_router\ndata: {from:<currentAgentId>, to:"router", agentName:"Auto", reason}`.
     - Return `[REDIRECT] Redirected to router with reason: "<reason>"`.

2. **`src/__tests__/redirect-to-router.test.ts`** — unit tests for the new tool. Cases: happy path (DB updated, banner persisted, SSE emitted, sentinel returned), missing `reason`, missing `context`. Modeled on `assign-agent.test.ts`.

**Modified files:**

3. **`src/services/tool-service.ts`** — register `redirect_to_router` and gate it: include in every agent's tool list *except* the router. Mirrors the existing line `if (name === "assign_agent" && agent.id !== "router") continue;` with the inverse: `if (name === "redirect_to_router" && agent.id === "router") continue;`.

4. **`src/routes/conversations.ts`** — three changes:
   - Remove the `import { checkTopicBoundary }` and the pre-classifier call (current lines ~134–152). Agents now decide off-topic themselves.
   - When building the system prompt (around line 215), if the active agent has `topicBoundaries`, append a `[Topic Boundaries]` block. Exact text:
     ```
     [Topic Boundaries]
     You specialize in: <allowed list, comma-separated>.
     Decline these topics by handing back: <blocked list, comma-separated>.

     If the user's message is outside your scope, call the redirect_to_router
     tool with a short reason — do NOT just refuse or apologize. The router
     will pick a different specialist.
     ```
   - In the tool-result-handling block (around line 410, where `[ASSIGNMENT]` is detected), add a parallel branch for `[REDIRECT]`: set `continueWithDelegation = true`, increment a `redirectsThisTurn` counter scoped to the request handler, and break the inner tool-loop. On the next outer-loop iteration, when the counter is exactly 1 and `curAgentId === "router"`, build `loopMessages` as a single-element array `[{ role: "user", content: message }]` (where `message` is the user's original request-body string captured at the top of the handler) instead of using the conversation history. Augment the router's system prompt with a `[Re-engagement]` block. Exact text:
     ```
     [Re-engagement]
     You're being re-engaged because the previous specialist couldn't handle
     this message. Pick a new specialist with assign_agent. Do not ask
     follow-up questions; route immediately.
     ```
   - Cap: if `redirectsThisTurn` is already 1 when a second `redirect_to_router` tool result arrives, replace its content with `"Error: redirect already used in this turn. Please respond to the user with text instead."` before pushing it back to the agent — so the agent does not loop.

5. **`src/__tests__/routes.test.ts`** — replace the `"blocks message when topicBoundaries pre-classifier returns blocked"` test with two new tests: (a) when an agent has `topicBoundaries`, the system prompt sent to the SDK contains the `[Topic Boundaries]` block; (b) end-to-end redirect flow — agent calls `redirect_to_router`, SSE stream shows `redirect_to_router` event then `assignment` event for a different specialist, DB ends with the correct final `agentId` and ordered banner messages. Add a third test for the loop-cap behavior.

6. **`src/__tests__/tool-service.test.ts`** — add an assertion next to the existing `"exposes assign_agent only to the router agent"` test: `redirect_to_router` is in the tool list for a non-router agent and absent for the router.

7. **`src/__tests__/auto-mode.test.ts`** — add one test: conversation already on `travel-agent`, user message triggers `redirect_to_router`, router (re-engaged) calls `assign_agent("weather-agent")`, weather-agent replies. Assert title is *not* re-generated (existing rule: only generate when missing).

**Reused as-is:**

- `services/agent-loader.ts` — still parses `topicBoundaries` from frontmatter; the field's runtime semantics shift from "hard guardrail" to "prompt guidance" but the parser does not care.
- `services/copilot-service.ts` — still extracts `topicBoundaries` from generated agents. Same field, new meaning.
- `services/database.ts` — `setAgentId` and `addDelegationMessage` already exist. The new `delegationMeta.type: "redirect_to_router"` slots into the existing column without migration.
- `services/tools/{assign-agent, hand-back, delegate-to, browse-url, search-files, read-user-file, update-summary}.ts` — no changes.
- `routes/{agents, admin, auth, copilot, files}.ts` — no changes.
- `services/guardrails.ts` — file remains in v1 but is no longer called from production code. Removed in the cleanup pass (Section 5b of the brainstorm; see Rollout below).

### Frontend (`packages/web-client`)

**Modified files:**

8. **`src/lib/api.ts`** — add `case "redirect_to_router":` in the SSE event switch (current lines ~162–177). Fire a new `onRedirect({from, to, agentName, reason})` callback.

9. **`src/hooks/use-chat.ts`** — handle the new `onRedirect` callback by appending a system message with `delegationMeta: { type: "redirect_to_router", from, to, reason }`, mirroring how `assignment` is handled today (lines ~282–315).

10. **`src/types.ts`** — extend `delegationMeta.type` union to include `"redirect_to_router"`.

11. **`src/components/delegation-banner.tsx`** — add a render branch for `meta.type === "redirect_to_router"`: visually similar to the existing `assignment` banner, with copy like *"<from-agent> redirected to ✨ Auto — \<reason\>"*.

12. **`src/__tests__/api.test.ts`** — add: `redirect_to_router` SSE event triggers `onRedirect` with the parsed payload. Remove the existing `"calls onBlocked for blocked events"` test, since `blocked` is no longer emitted.

13. **`src/__tests__/use-chat.test.ts`** — add: redirect event appends a system banner message. Remove the existing `"handles blocked messages as system messages"` test.

**Reused as-is:**

- `components/agent-form.tsx` — still configures `topicBoundaries` (allowed / blocked / boundaryMessage). The form does not need to know that the runtime semantics changed.
- `components/{agent-selector, agent-drawer, message-list, chat-input, debug-panel}.tsx` — no changes.

### Agents

- `agents/*.md` — no edits. The redirect tool is auto-granted by `tool-service.ts`, not opt-in via frontmatter.

## Data Flow

Concrete trace of the user's experience: conversation starts on Auto, switches to travel, then user asks about weather.

1. User creates a new conversation. Default `agentId = "router"`.
2. User: *"Help me plan a trip to Tokyo."*
   - Router runs, calls `assign_agent({agent_id: "travel-agent", reason: "you asked about travel"})`.
   - Tool emits `event: assignment` SSE, sets `agentId = "travel-agent"`, returns `[ASSIGNMENT]`.
   - Outer loop detects `[ASSIGNMENT]`, re-iterates. Travel-agent runs, replies normally.
   - User sees: Auto banner ("routed to Travel Agent") + travel reply.
3. Same conversation, next user turn: *"What's the weather there next week?"*
   - Travel-agent's system prompt now contains a `[Topic Boundaries]` block listing `flight and hotel booking` (allowed) and `weather` (blocked).
   - Travel-agent reasons: weather is outside scope → calls `redirect_to_router({reason: "weather isn't in my scope — Auto can find someone better"})`.
   - Tool emits `event: redirect_to_router` SSE, sets `agentId = "router"`, persists a banner message, returns `[REDIRECT]`.
   - Outer loop detects `[REDIRECT]`, sets `redirectJustHappened = true`, re-iterates.
   - On the new iteration, the router's input is just `[{role:"user", content:"What's the weather there next week?"}]` — no travel chat history. Router's system prompt has the `[Re-engagement]` block.
   - Router calls `assign_agent({agent_id: "weather-agent", reason: "you asked about weather"})`. SSE `assignment` event, `agentId = "weather-agent"`.
   - Outer loop re-iterates again, weather-agent answers.
   - User sees: travel-redirect banner → Auto banner → weather answer.
4. Same conversation, next user turn: *"Now book me a flight."*
   - Symmetric: weather-agent redirects → router re-engages → assigns to travel-agent → travel-agent answers. Validates that the conversation can bounce indefinitely.
5. Refresh the page and reload the conversation via `GET /conversations/:id`. All three banner types render in history in order.

## Error Handling

| Case | Behavior |
|---|---|
| Agent calls `redirect_to_router` with missing `reason` | Tool returns `"Error: reason is required."` and does not modify DB. Agent sees the error string in the next iteration and must respond with text. |
| Agent calls `redirect_to_router` with no `context` | Same shape: `"Error: Tool context is required for redirect_to_router."` No DB write. |
| Router calls `redirect_to_router` (auto-grant excludes it, so this shouldn't happen) | Defense in depth: tool also rejects when `currentAgentId === "router"` with `"Error: Cannot redirect to router from router."` |
| Two `redirect_to_router` calls in one HTTP turn | The outer loop tracks `redirectsThisTurn`. The first call works normally; the second has its tool result replaced before being sent back to the agent: `"Error: redirect already used in this turn. Please respond to the user with text instead."` The agent then answers with prose. |
| Router fails to call `assign_agent` after re-engagement (e.g. asks a clarifying question) | Allowed. Router can take 1 more turn before assigning, mirroring its first-turn behavior. The user sees the router's question and can answer. |
| `redirect_to_router` invoked while in a `delegate_to` sub-task | Out of scope for v1. The combination is unlikely (delegated sub-agents are scoped to a specific task) and the existing delegation flow does not pass through the same outer-loop branch. If it happens, the redirect tool runs, but the delegation context is lost — acceptable in v1, document as a known limitation. |
| Existing conversations with `boundaryMessage` set | Unaffected at the data layer. At runtime, `boundaryMessage` is no longer emitted; the agent generates its own redirect reason. The admin form still edits the field. |
| Frontend receives `redirect_to_router` SSE event but agentId in cache is stale | `use-chat.ts` updates `agentId` from the event payload (`to: "router"`), then the subsequent `assignment` event updates it again. Cache stays consistent. |
| Workshop participant creates a new specialist that doesn't have the redirect tool | Cannot happen. Auto-grant is in `tool-service.ts`, not in agent markdown. |

## Testing

**Backend unit tests:**

- `__tests__/redirect-to-router.test.ts` (new) — happy path, missing `reason`, missing `context`, router-self-redirect rejection.
- `__tests__/tool-service.test.ts` — `redirect_to_router` included for non-router agents, excluded for router.

**Backend integration tests:**

- `__tests__/routes.test.ts` — system prompt contains `[Topic Boundaries]` block when agent has boundaries; end-to-end redirect flow (specialist → router → new specialist, all in one request); loop-cap (second redirect in same turn returns error).
- `__tests__/auto-mode.test.ts` — full bounce: travel → redirect → router → assign weather → weather replies. Title not re-generated.

**Frontend tests:**

- `__tests__/api.test.ts` — `redirect_to_router` SSE event parsed and `onRedirect` fired. Removed: `calls onBlocked for blocked events`.
- `__tests__/use-chat.test.ts` — redirect event appends a system banner. Removed: `handles blocked messages as system messages`.

**Manual smoke test (browser, http://localhost:5173):**

1. New conversation defaults to **Auto** (`router`).
2. *"Help me plan a trip to Tokyo."* → Auto banner (routed to travel) + travel reply. DB: `agentId === "travel-agent"`.
3. *"What's the weather there next week?"* → travel redirect banner + Auto banner (routed to weather) + weather reply. DB: `agentId === "weather-agent"`.
4. *"Now book me a flight."* → weather redirect banner + Auto banner (routed to travel) + travel reply. DB: `agentId === "travel-agent"`. Validates bidirectional bounce.
5. Refresh the page, reload the conversation. All banners render in order with correct reasons.
6. Fresh conversation, vague off-topic message ("what's the meaning of life?"). Auto handles it normally — no regression on first-turn behavior.

## Rollout

Suggested commit sequence (small, reviewable diffs):

1. **Tool only.** Add `services/tools/redirect-to-router.ts` and its unit test. No wiring; no behavior change.
2. **Auto-grant.** Modify `tool-service.ts`. Update `tool-service.test.ts`. Tool is now callable but the route still pre-blocks via `topicBoundaries`, so user-visible behavior is unchanged.
3. **Wire the redirect, remove the pre-classifier, inject prompt guidance.** Modify `routes/conversations.ts` (the behavior-change commit). Replace the boundary-blocked test in `routes.test.ts` with redirect-flow + system-prompt-injection tests. Add the loop-cap test. After this lands, off-topic messages flow through redirect.
4. **Frontend SSE handling and banner.** Modify `lib/api.ts`, `hooks/use-chat.ts`, `types.ts`, `components/delegation-banner.tsx`. Update frontend tests. The banner is the visible UX surface — ship after the backend is green.
5. **Cleanup pass (separate PR).** Delete `services/guardrails.ts`, `__tests__/guardrails.test.ts`, the `import { checkTopicBoundary }` line. Decide on `boundaryMessage`: keep one release cycle, remove the next.

**Risks:**

- Soft refusal vs. hard pre-classifier. Prompt guidance is fuzzier than a deterministic Haiku call. Mitigated by clear `[Topic Boundaries]` text in the system prompt and the agent's own reasoning. The redirect path itself is robust — the only worry is whether the agent decides to redirect in the right cases.
- Wrong re-routing. Router could pick a worse specialist after redirect than the one we just left. Same risk profile as today's first-turn routing — not a new failure mode. Out of scope to fix here.
- Loop. The 1-per-turn cap forecloses any actual infinite loop. Worst case the user sees a generic "I can't help with that" — strictly better than today's dead-end.

## Footprint

- **New:** 2 files (`services/tools/redirect-to-router.ts`, `__tests__/redirect-to-router.test.ts`).
- **Modified backend:** 5 files — 2 source (`tool-service.ts`, `routes/conversations.ts`) and 3 tests (`routes.test.ts`, `tool-service.test.ts`, `auto-mode.test.ts`).
- **Modified frontend:** 6 files — 4 source (`lib/api.ts`, `hooks/use-chat.ts`, `types.ts`, `components/delegation-banner.tsx`) and 2 tests (`__tests__/api.test.ts`, `__tests__/use-chat.test.ts`).
- **Removed (cleanup pass):** 2 files (`services/guardrails.ts`, `__tests__/guardrails.test.ts`).
- **No DB migration.** New `delegationMeta.type` value uses an existing column.
- **No agent markdown changes.** Auto-grant only.
