# Test Quality Report

**Date:** 2026-04-06
**Reviewed by:** dev-team (qa-1, qa-2, architect, fullstack-dev)

---

## Executive Summary

| Area | Tests | Files | Estimated Coverage | Grade |
|------|-------|-------|--------------------|-------|
| Backend (agent-service) | 124 | 11 | ~60% | B |
| Frontend (web-client) | 25 | 3 | ~15% | D |
| **Total** | **149** | **14** | **~40%** | **C-** |

**Key finding:** Backend has solid foundational tests but gaps in complex flows (delegation routing, SSE edge cases). Frontend is critically undertested — zero React component tests, missing hook coverage, and untested auth state management.

---

## Detailed Findings

### Backend Strengths
- Good test isolation with temp DBs and proper cleanup
- Real HTTP server testing (not mocked routing)
- Meaningful assertions, not just smoke tests
- Appropriate mocking of external services (Anthropic SDK, Playwright)
- Delegation tools tested for happy path and error cases
- Consistent naming conventions

### Backend Issues

| # | Issue | File(s) | Priority | Category |
|---|-------|---------|----------|----------|
| B1 | Delegation routing loop in POST /messages untested | `routes.test.ts` | **HIGH** | Missing coverage |
| B2 | SSE stream error handling (mid-response failure) untested | `routes.test.ts` | **HIGH** | Missing coverage |
| B3 | Max tool iterations (5-iteration cap) untested | `routes.test.ts` | **HIGH** | Missing coverage |
| B4 | Empty/whitespace message validation untested | `routes.test.ts` | **MEDIUM** | Missing coverage |
| B5 | Auto-title generation (Haiku call) untested | `routes.test.ts` | **MEDIUM** | Missing coverage |
| B6 | `topicBoundaries` extraction in CopilotService untested | `copilot-service.test.ts` | **MEDIUM** | Missing coverage |
| B7 | `tools` array extraction in CopilotService untested | `copilot-service.test.ts` | **MEDIUM** | Missing coverage |
| B8 | Database migration path on older schemas untested | `database.test.ts` | **MEDIUM** | Missing coverage |
| B9 | Agent with tools field parsing from frontmatter untested | `agent-loader.test.ts` | **MEDIUM** | Missing coverage |
| B10 | Concurrent delegation + tool use interaction untested | `routes.test.ts` | **MEDIUM** | Missing coverage |
| B11 | Duplicated `makeRequest` helpers across 3 test files | `routes.test.ts`, `auth.test.ts`, `agents-routes.test.ts` | **LOW** | Code quality |
| B12 | Duplicated DB cleanup pattern across 3 files | Multiple | **LOW** | Code quality |
| B13 | Mutable module-scope `let` for mocks (ordering risk) | `routes.test.ts:45-48` | **LOW** | Code quality |
| B14 | Server startup/shutdown and CORS untested | `index.ts` | **LOW** | Missing coverage |

### Frontend Issues

| # | Issue | File(s) | Priority | Category |
|---|-------|---------|----------|----------|
| F1 | Zero React component tests (0/15 components) | All components | **CRITICAL** | Missing coverage |
| F2 | AuthContext completely untested (JWT, token expiry, auth state) | `contexts/AuthContext.tsx` | **HIGH** | Missing coverage |
| F3 | `useAgents` hook untested (CRUD state management) | `hooks/use-agents.ts` | **HIGH** | Missing coverage |
| F4 | SSE delegation events (`delegation_start/end`) untested | `api.test.ts` | **HIGH** | Missing coverage |
| F5 | `sendMessage` SSE `title` event parsing untested | `api.test.ts` | **HIGH** | Missing coverage |
| F6 | `selectConversation()` in useChat untested | `use-chat.test.ts` | **MEDIUM** | Missing coverage |
| F7 | `deleteConversation()` in useChat untested | `use-chat.test.ts` | **MEDIUM** | Missing coverage |
| F8 | `switchAgent()` in useChat untested | `use-chat.test.ts` | **MEDIUM** | Missing coverage |
| F9 | `onDelegationStart/End` callbacks in useChat untested | `use-chat.test.ts` | **MEDIUM** | Missing coverage |
| F10 | `fetchAvailableTools()` in agents-api untested | `agents-api.test.ts` | **MEDIUM** | Missing coverage |
| F11 | `updateAgent` error path untested | `agents-api.test.ts` | **MEDIUM** | Missing coverage |
| F12 | `listConversations()` no direct test | `api.test.ts` | **MEDIUM** | Missing coverage |
| F13 | `deleteConversation()` untested | `api.test.ts` | **MEDIUM** | Missing coverage |
| F14 | Token helpers (`getStoredToken`, `setStoredToken`, `clearStoredToken`) untested | `api.test.ts` | **MEDIUM** | Missing coverage |
| F15 | `useAutoScroll` hook untested | `hooks/use-auto-scroll.ts` | **LOW** | Missing coverage |
| F16 | `act()` warning in useChat test (state update leak) | `use-chat.test.ts` | **LOW** | Code quality |
| F17 | Dynamic `import()` pattern in login/signup tests (fragile) | `api.test.ts` | **LOW** | Code quality |
| F18 | Chunked/partial SSE data handling untested | `api.test.ts` | **LOW** | Missing coverage |

---

## Coverage Heat Map

| Module | Routes | Services | Components | Hooks | API Client |
|--------|--------|----------|------------|-------|------------|
| Auth | ✅ Good | ✅ Good | ❌ None | ❌ None (context) | ✅ Basic |
| Agents | ✅ Good | ✅ Good | ❌ None | ❌ None | ✅ Good |
| Conversations | ⚠️ Partial | ✅ Good (DB) | ❌ None | ⚠️ Partial | ⚠️ Partial |
| Tools/Delegation | ⚠️ Partial | ✅ Good | N/A | N/A | N/A |
| Guardrails | ✅ Good | ✅ Good | N/A | N/A | N/A |
| Streaming/SSE | ⚠️ Partial | N/A | ❌ None | N/A | ⚠️ Partial |

---

## Improvement Plan

### Phase 1 — Critical Frontend Gaps (Priority: CRITICAL/HIGH)

**Goal:** Get frontend from ~15% to ~50% coverage.

| Step | What | Items Addressed | Effort |
|------|------|-----------------|--------|
| 1.1 | Add AuthContext tests — JWT decode, token expiry, login/signup/logout state, persistence | F2, F14 | Medium |
| 1.2 | Add useAgents hook tests — mount loading, CRUD mutations, error states | F3 | Small |
| 1.3 | Add SSE event parsing tests for `title`, `delegation_start`, `delegation_end` | F4, F5 | Small |
| 1.4 | Add component tests for AuthPage — form rendering, mode toggle, submit, error display | F1 (partial) | Medium |
| 1.5 | Add component tests for ChatInput — input handling, submit, disabled state | F1 (partial) | Small |
| 1.6 | Add component tests for MessageBubble — markdown rendering, user vs assistant styling | F1 (partial) | Small |
| 1.7 | Add component tests for Sidebar — conversation list, delete confirmation, collapse | F1 (partial) | Medium |

### Phase 2 — Backend Complex Flow Coverage (Priority: HIGH)

**Goal:** Cover the most dangerous untested backend paths.

| Step | What | Items Addressed | Effort |
|------|------|-----------------|--------|
| 2.1 | Test delegation routing loop — delegate → specialist responds → hand_back → main summarizes | B1 | Large |
| 2.2 | Test SSE error handling — Anthropic stream failure mid-response | B2 | Medium |
| 2.3 | Test max tool iterations — verify loop stops at 5 iterations | B3 | Small |
| 2.4 | Test empty/whitespace message rejection | B4 | Small |
| 2.5 | Test CopilotService `topicBoundaries` and `tools` extraction | B6, B7 | Small |

### Phase 3 — Frontend Remaining Components & Hooks (Priority: MEDIUM)

| Step | What | Items Addressed | Effort |
|------|------|-----------------|--------|
| 3.1 | Test useChat: selectConversation, deleteConversation, switchAgent | F6, F7, F8 | Medium |
| 3.2 | Test useChat: delegation callbacks | F9 | Small |
| 3.3 | Test AgentForm — validation, tools picker, delegates picker | F1 (partial) | Large |
| 3.4 | Test AgentDrawer — list/form switching, agent selection | F1 (partial) | Medium |
| 3.5 | Test AgentSelector — dropdown, click-outside | F1 (partial) | Small |
| 3.6 | Test fetchAvailableTools, updateAgent error path, listConversations, deleteConversation | F10, F11, F12, F13 | Small |

### Phase 4 — Code Quality & Polish (Priority: LOW)

| Step | What | Items Addressed | Effort |
|------|------|-----------------|--------|
| 4.1 | Extract shared `makeRequest` helper for backend tests | B11 | Small |
| 4.2 | Extract shared DB setup/teardown utility | B12 | Small |
| 4.3 | Refactor mutable module-scope mocks to per-test setup | B13 | Small |
| 4.4 | Fix `act()` warning in use-chat test | F16 | Small |
| 4.5 | Replace dynamic `import()` with standard imports in api tests | F17 | Small |
| 4.6 | Test DB migration path on older schemas | B8 | Medium |
| 4.7 | Add remaining component tests (ConfirmDialog, DelegationBanner, TypingIndicator) | F1 (remaining) | Small |
| 4.8 | Test useAutoScroll hook | F15 | Small |

---

## Todo: All Tests Requiring Improvement

### CRITICAL
- [ ] F1 — Add React component tests (0/15 components covered)

### HIGH
- [ ] F2 — Test AuthContext (JWT, token expiry, auth state)
- [ ] F3 — Test useAgents hook
- [ ] F4 — Test SSE delegation event parsing
- [ ] F5 — Test SSE title event parsing
- [ ] B1 — Test delegation routing loop in conversations
- [ ] B2 — Test SSE stream error handling
- [ ] B3 — Test max tool iterations cap

### MEDIUM
- [ ] B4 — Test empty/whitespace message validation
- [ ] B5 — Test auto-title generation
- [ ] B6 — Test CopilotService topicBoundaries extraction
- [ ] B7 — Test CopilotService tools extraction
- [ ] B8 — Test database migration on older schemas
- [ ] B9 — Test agent tools field frontmatter parsing
- [ ] B10 — Test concurrent delegation + tool use
- [ ] F6 — Test useChat selectConversation
- [ ] F7 — Test useChat deleteConversation
- [ ] F8 — Test useChat switchAgent
- [ ] F9 — Test useChat delegation callbacks
- [ ] F10 — Test fetchAvailableTools
- [ ] F11 — Test updateAgent error path
- [ ] F12 — Test listConversations
- [ ] F13 — Test deleteConversation in API client
- [ ] F14 — Test token helpers

### LOW
- [ ] B11 — Extract shared makeRequest helper
- [ ] B12 — Extract shared DB setup/teardown
- [ ] B13 — Fix mutable module-scope mocks
- [ ] B14 — Test server startup/shutdown
- [ ] F15 — Test useAutoScroll hook
- [ ] F16 — Fix act() warning in use-chat test
- [ ] F17 — Replace dynamic import pattern in api tests
- [ ] F18 — Test chunked SSE data handling
