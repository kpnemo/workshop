# Test Analysis Report

**Generated**: 2026-04-09  
**Project**: new-workshop (Conversational AI Workshop)  
**Framework**: Vitest 3.x  
**Monorepo**: pnpm with `packages/agent-service` and `packages/web-client`

---

## Executive Summary

The project has **180 tests across 19 test files**. **178 pass, 2 fail** (98.9% pass rate).

The backend (`agent-service`) is well-tested with 143 tests covering 14 of 15 source modules. Test quality is generally strong with good isolation patterns (real filesystem/DB for data layers, mocked SDKs for routes). The 2 failing tests are debug SSE events written ahead of implementation.

The frontend (`web-client`) has 37 tests covering only 5 of 24+ source files (~21% file coverage). API layers are well-tested, but **zero component tests exist** and 3 of 5 hooks are untested.

### Top 3 Recommendations

1. **Fix or skip the 2 failing debug mode tests** in `routes.test.ts` — they test unimplemented SSE event emission in `conversations.ts`
2. **Add happy-path tests for `copilot-route.test.ts`** — currently only validates error cases, the core streaming functionality is completely untested
3. **Add SSE event parsing tests for `copilot-api.test.ts`** — the function has 5 SSE event types but zero parsing coverage (only 2 tests total)

---

## Test Inventory

### Backend — agent-service (14 files, 143 tests)

| File | Tests | Status | Quality |
|------|------:|--------|---------|
| `agent-loader.test.ts` | 17 | Pass | Good |
| `agents-routes.test.ts` | 14 | Pass | Good |
| `assign-agent.test.ts` | 4 | Pass | Adequate |
| `auth.test.ts` | 10 | Pass | Good |
| `auto-mode.test.ts` | 3 | Pass | Good |
| `browse-url.test.ts` | 6 | Pass | Adequate |
| `browser-manager.test.ts` | 7 | Pass | Good |
| `copilot-route.test.ts` | 7 | Pass | **Needs Improvement** |
| `copilot-service.test.ts` | 9 | Pass | Adequate |
| `database.test.ts` | 22 | Pass | Good |
| `delegation.test.ts` | 8 | Pass | Adequate |
| `guardrails.test.ts` | 7 | Pass | Good |
| `routes.test.ts` | 22 | **2 Fail** | **Needs Improvement** |
| `tool-service.test.ts` | 13 | Pass | Good |

### Frontend — web-client (5 files, 37 tests)

| File | Tests | Status | Quality |
|------|------:|--------|---------|
| `agents-api.test.ts` | 8 | Pass | Good |
| `api.test.ts` | 13 | Pass | Good |
| `copilot-api.test.ts` | 2 | Pass | **Critical** |
| `use-chat.test.ts` | 8 | Pass | Adequate |
| `use-debug.test.ts` | 6 | Pass | Good |

---

## Backend Test Analysis (agent-service)

### agent-loader.test.ts (17 tests) — Good

Tests all core operations: loading agents from markdown files (valid config, defaults, topicBoundaries, avatar, delegates, skipping invalid files), saving agents (roundtrip, overwrite), and deleting agents. Uses **real filesystem** with temp directories — no mocking needed.

**Missing scenarios**: Malformed YAML frontmatter, files without `---` separator, `tools` field parsing.

### agents-routes.test.ts (14 tests) — Good

Full CRUD coverage for agents API via real Express HTTP calls. Validates status codes, response bodies, and file persistence. Tests error paths: 400 (missing fields, bad temperature), 404, 409 (duplicate slug).

**Missing scenarios**: PUT with invalid temperature, special characters in name (slug generation), partial updates.

### assign-agent.test.ts (4 tests) — Adequate

Tests the `assign_agent` tool: valid assignment with SSE event, reject unknown agent, reject self-assignment to router, require both params. Checks return value, DB state, and SSE content.

**Missing scenarios**: Empty string agent_id, assignment when conversation doesn't exist.

### auth.test.ts (10 tests) — Good

Thorough coverage of auth middleware (missing header, bad token, expired token, valid token) and auth routes (signup success/duplicate/missing fields/short password, login success/wrong password/unknown email). Uses real JWT, bcrypt, and DB.

**Missing scenarios**: Token with wrong secret, email case sensitivity, Bearer prefix variations.

### auto-mode.test.ts (3 tests) — Good

Tests the auto-router assignment flow end-to-end: router assigns agent + specialist responds in same turn, title generation after assignment, follow-up messages use specialist model. Excellent assertion quality — verifies SSE events, DB state, and Anthropic call params.

**Missing scenarios**: Router fails to assign (no tool_use), error during specialist stream.

### browse-url.test.ts (6 tests) — Adequate

Tests tool schema, content extraction, Readability fallback, 50k truncation, navigation error, and missing URL. BrowserManager appropriately mocked.

**Missing scenarios**: Non-HTML content (PDF, images), timeout during navigation, invalid URL format.

### browser-manager.test.ts (7 tests) — Good

Tests lazy launch, context creation/cleanup, error cleanup, browser reuse, close(), and reconnect on disconnect. Strong assertion quality with exact call count verification.

**Missing scenarios**: Concurrent `withPage` calls, launch failure.

### copilot-route.test.ts (7 tests) — Needs Improvement

**Only tests validation/error paths.** Checks missing messages, empty messages, missing mode, invalid mode, edit without agentId, edit with nonexistent agent. **No happy-path test exists** — the actual streaming chat functionality (create mode, edit mode, SSE response format, agent config extraction) is completely untested.

**Priority**: Add at minimum 2 happy-path tests (create mode success, edit mode success with valid agent).

### copilot-service.test.ts (9 tests) — Adequate

Tests `buildSystemPrompt` (base instructions, agent summaries with tools/delegates, available tools, edit mode) and `extractAgentConfig` (valid, no block, invalid JSON, missing fields, defaults). Pure service logic, no mocking needed.

**Missing scenarios**: Multiple agent-config blocks, edge case temperatures (0, 1, negative).

### database.test.ts (22 tests) — Good

Most comprehensive test file. Full CRUD for conversations, messages, users, and titles. Delegation support (active_agent, agent_id on messages, delegation_meta). Uses real SQLite with per-test DB files.

**Missing scenarios**: `listConversations` ordering, message ordering guarantees, `setTitle` with null/empty, `close()` idempotency.

### delegation.test.ts (8 tests) — Adequate

Tests `delegate_to` (definition, valid delegation, invalid target, agent not in map, SSE event) and `hand_back` (definition, reset active_agent, SSE event). DB and Response appropriately mocked.

**Missing scenarios**: Empty context/summary strings, `hand_back` when no active_agent set, missing params.

### guardrails.test.ts (7 tests) — Good

Tests allowed/blocked classification, case insensitivity, whitespace handling, fail-open on unexpected response, fail-open on API error, and prompt construction. Good security-minded testing with fail-open behavior.

**Missing scenarios**: Empty boundaries, non-text content blocks in API response.

### routes.test.ts (22 tests, 2 FAILED) — Needs Improvement

Tests conversation CRUD (auth, list, create, delete, ownership), message streaming (SSE, guardrails blocking, tool execution loop), and debug mode.

**Failures**: 2 tests in the "Debug mode" describe block expect `debug_agent`, `debug_stream`, and `debug_tool` SSE events, but `conversations.ts` does **not emit these events**. The tests were written ahead of implementation (per recent commits: `feat(web-client): add debug param and debug SSE event routing to API layer` — frontend-only so far).

**Missing scenarios**: Empty message body validation, message to non-existent conversation, `MAX_TOOL_ITERATIONS` limit enforcement, stream error mid-response, full delegation cycle through routes.

### tool-service.test.ts (13 tests) — Good

Tests register/retrieve tools, agent gating, execution, context passing, and delegation tool injection logic (delegate_to for main, hand_back for delegate, assign_agent for router-only). Strong injection logic coverage.

**Missing scenarios**: Duplicate tool name registration, tool execution throwing error.

---

## Frontend Test Analysis (web-client)

### agents-api.test.ts (8 tests) — Good

Tests all 5 CRUD functions with correct HTTP method, URL, headers, body, and response parsing. Error paths for `fetchAgent` (404), `createAgent` (409), `deleteAgent` (404).

**Missing scenarios**: `fetchAvailableTools()` is **completely untested** (exported function). `updateAgent` error path, `fetchAgents` error path, network-level errors (fetch throws), `BASE_URL` prefix behavior.

### api.test.ts (13 tests) — Good

Tests `createConversation`, `sendMessage` (SSE parsing for delta/blocked/error/done events plus debug event routing), `getConversation`, `signup`, and `login`. SSE tests construct real ReadableStreams — realistic approach.

**Missing scenarios**: `listConversations()` and `deleteConversation()` are **completely untested** despite heavy use by `useChat`. Token management helpers (`getStoredToken`, `setStoredToken`, `clearStoredToken`) untested. `authHeaders()` integration untested. `onTitle` callback never asserted. Delegation SSE events (`onDelegationStart/End`, `onAssignment`) untested. SSE chunked delivery (data split across chunks) untested.

### copilot-api.test.ts (2 tests) — Critical

**Severely undertested.** Only tests correct POST body/headers and error path. The function has **5 SSE event types** (`delta`, `agent_created`, `agent_updated`, `error`, `done`) with **zero parsing tests**. Also missing: `agentId` parameter, auth token header, chunked SSE delivery.

**Priority**: This is the most critically undertested file in the project. Needs at minimum 5 tests for each SSE event type.

### use-chat.test.ts (8 tests) — Adequate

Tests conversation creation, `isConnecting` state, optimistic message send, streaming response, blocked messages, connection error, assignment event, and `startNewChat`. The assignment test is particularly comprehensive.

**Missing scenarios**: `selectConversation`, `deleteConversation`, `switchAgent` (has logic to delete empty conversations), `onTitle` callback, `onDelegationStart/End` (complex logic), `onError` during streaming, `resolveAgentId` with router logic, loading existing conversations on mount. Has an `act(...)` warning in one test.

### use-debug.test.ts (6 tests) — Good

Tests default state, localStorage persistence, toggle, addEvent with auto-generated fields, startTurn, and clearEvents. Clean implementation using `renderHook` + `act` properly.

**Missing scenarios**: `addEvent` with explicit turn override, garbage localStorage values.

### Untested Frontend Modules

| Category | Files | Impact |
|----------|-------|--------|
| **Hooks** | `use-agents.ts`, `use-copilot.ts`, `use-auto-scroll.ts` | High — contain state management and business logic |
| **Contexts** | `AuthContext.tsx` | High — auth flow completely untested |
| **Components** | 15 files including `agent-form.tsx` (14.8K), `sidebar.tsx`, `copilot-chat.tsx` | Medium — UI rendering and interaction untested |

---

## Architecture Assessment

### Test Organization and Structure
- **Convention**: All tests live in `src/__tests__/` directories in both packages. File naming uses `<module>.test.ts` pattern consistently.
- **No vitest config file** for backend (uses defaults). Frontend configures jsdom environment via `vite.config.ts` test section.
- **No shared test utilities or helpers** — SSE stream construction is repeated across `api.test.ts` and `copilot-api.test.ts`. A shared `createSSEStream()` helper would reduce duplication.
- **No test setup files** (no `setupTests.ts`) — each file handles its own setup.

### Mocking Patterns and Consistency
- **Backend**: Appropriate layering — real filesystem/SQLite for data layer tests, mocked Anthropic SDK for route/service tests. Consistent pattern.
- **Frontend**: Global `fetch` mock via `globalThis.fetch = mockFetch` for API tests, `vi.mock()` with `vi.mocked()` for hook tests. Minor inconsistency: `copilot-api.test.ts` uses `{ getReader: () => stream.getReader() }` for response body while `api.test.ts` uses `body: stream` directly.
- **No mock factories or shared fixtures** — mock setup is repeated per file.

### Test Isolation and Reliability
- **Backend**: Excellent — temp directories and per-test DB files, cleaned up in `afterEach`.
- **Frontend**: Good — `localStorage.clear()` and `mockFetch.mockReset()` in `beforeEach`.
- **Concern**: `use-chat.test.ts` has a complex mock chain in `beforeEach` (listConversations returning empty first, then non-empty) that is fragile.
- **One `act(...)` warning** in `use-chat.test.ts` — non-blocking but indicates a state update timing issue.

### Framework Usage
- Both packages use Vitest 3.x with `vitest run` for CI and `vitest` for watch mode.
- Frontend uses `@testing-library/react` and `@testing-library/jest-dom` — proper React testing tools.
- No snapshot tests (appropriate for this project).
- No parameterized tests (`test.each`) used anywhere — could reduce repetition in agents-routes and auth tests.

---

## Coverage Gaps & Recommendations

### Critical (Blocks confidence in core features)

1. **`copilot-api.test.ts`** — 2 tests for an 83-line function with 5 SSE event types. Zero parsing coverage. The copilot is a core feature.
2. **`copilot-route.test.ts`** — No happy-path tests. The copilot streaming endpoint is completely untested for success cases.
3. **`routes.test.ts` debug failures** — 2 tests expect unimplemented SSE events. Either implement the backend debug event emission or mark tests as `test.skip` with a TODO.

### High Priority (Important business logic untested)

4. **`api.ts`** — `listConversations()` and `deleteConversation()` are used by `useChat` but have zero tests.
5. **`use-chat.ts`** — Missing tests for `selectConversation`, `deleteConversation`, `switchAgent`, delegation events, and error-during-streaming. This hook contains the most complex frontend business logic.
6. **`use-copilot.ts` hook** — No tests at all. Contains complex mode detection (`EDIT_PATTERN`), streaming state management, and agent callback wiring.
7. **Auth flow end-to-end** — `authHeaders()`, token management functions, and `AuthContext` are all untested on the frontend.

### Medium Priority (Improve robustness)

8. **`fetchAvailableTools()`** — Exported API function with zero tests.
9. **`hand-back.ts`** — The only backend tool module with no dedicated test file (partially covered in `delegation.test.ts`).
10. **`MAX_TOOL_ITERATIONS`** — Route enforces a limit of 5 but no test verifies correct termination.
11. **SSE chunked delivery** — No test anywhere verifies behavior when SSE data splits across multiple chunks (a real-world concern).
12. **Component tests** — Zero exist. Highest-value targets: `agent-form.tsx` (14.8K, most complex), `chat-input.tsx`, `sidebar.tsx`.

### Low Priority (Polish and edge cases)

13. **Shared test helpers** — Extract `createSSEStream()` utility for frontend tests.
14. **`test.each` for validation tests** — agents-routes, auth, and copilot-route have repetitive validation tests that could use parameterized patterns.
15. **`act(...)` warning** — Fix state update timing in `use-chat.test.ts` "sets isConnecting true initially" test.

---

## Priority Action Items

1. **Fix failing tests** — Either implement debug SSE event emission in `conversations.ts` (completing the debug mode feature) or mark the 2 tests as `test.skip("pending backend implementation")`. This restores a green test suite.

2. **Add `copilot-api.test.ts` SSE event tests** — Write tests for all 5 event types (`delta`, `agent_created`, `agent_updated`, `error`, `done`). Model after the existing SSE tests in `api.test.ts`. Estimated: 5-7 new tests.

3. **Add `copilot-route.test.ts` happy-path tests** — At minimum: create mode success with streaming response, edit mode success with valid agent. Model after existing streaming tests in `routes.test.ts`. Estimated: 2-3 new tests.

4. **Add `listConversations` and `deleteConversation` tests to `api.test.ts`** — These are core functions used by the main chat hook. Estimated: 3-4 new tests.

5. **Expand `use-chat.test.ts`** — Add tests for `selectConversation`, `deleteConversation`, `switchAgent`, and `onError` during streaming. These cover the most impactful untested user flows. Estimated: 5-7 new tests.

6. **Create `use-copilot.test.ts`** — Test mode detection, streaming lifecycle, reset, toggle, and minimize. Estimated: 6-8 new tests.

7. **Add auth flow frontend tests** — Test `authHeaders()`, token helpers, and `AuthContext` provider. Estimated: 5-6 new tests.

8. **Add `MAX_TOOL_ITERATIONS` test to `routes.test.ts`** — Verify the tool loop terminates correctly at the limit. Estimated: 1 test.

9. **Create shared SSE test helper** — Extract `createSSEStream(events)` utility to reduce duplication across frontend API tests.

10. **Add component tests** — Start with `agent-form.tsx` (largest, most complex) and `chat-input.tsx` (core user interaction). Estimated: 8-12 new tests.
