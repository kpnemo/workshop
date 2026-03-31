# E2E Test Plan

**Date:** 2026-03-31
**Application:** Workshop Conversational AI Agent
**Stack:** Express + SQLite backend (port 3000), React + Vite frontend (port 5173)
**Agent:** support-bot (product questions, troubleshooting, pricing)

---

## Test Environment

- Backend and frontend running simultaneously
- Fresh SQLite database per test run (or clean state between tests)
- Real Anthropic API key configured in `.env` (required for LLM-dependent flows)
- `JWT_SECRET` configured in `.env` (required for auth tests)
- Playwright or Cypress recommended for browser automation
- SSE streaming assertions require waiting for `done` event or stream completion

## Critical Blocker

> **Auth integration is incomplete.** Auth routes (`src/routes/auth.ts`) and middleware (`src/middleware/auth.ts`) exist but are **NOT mounted in `index.ts`**. The DB layer requires `userId` for `listConversations(userId)` and `createConversation(id, agentId, userId)`, but the current route handlers call these methods **without userId**. This means `GET /conversations` and `POST /conversations` will fail at runtime.
>
> **Sections 1-6 and 8-9 cannot be executed until auth is wired into the server.** Section 7 (Auth) can be tested at the unit/integration level against the individual modules. Once auth integration is complete (plan tasks 7-8), all sections become testable.

---

## 1. App Initialization

### 1.1 First Visit — Empty State
**Priority:** P0
**Flow:** Open app with no existing conversations
**Steps:**
1. Start backend and frontend with empty database
2. Navigate to `http://localhost:5173`
3. Observe loading state ("Connecting...")
4. Wait for initialization to complete
**Expected:**
- App auto-creates a conversation via `POST /conversations` with `agentId: "support-bot"`
- Sidebar shows one conversation entry with fallback title "New conversation"
- Chat area shows welcome message: "Ask me about products, troubleshooting, or pricing."
- Input is enabled and auto-focused
- Header shows "Support Bot" with "Online" status

### 1.2 Return Visit — Existing Conversations
**Priority:** P0
**Flow:** Open app with pre-existing conversations
**Steps:**
1. Seed database with 2+ conversations (with messages)
2. Navigate to app
**Expected:**
- Sidebar lists all conversations, sorted by most recently updated
- Most recent conversation is auto-selected and its messages are loaded
- Message history displays correctly (user messages right-aligned purple bubbles, assistant messages left-aligned dark bubbles with "S" avatar)
- Conversation items show relative timestamps ("just now", "5m ago", "2h ago", etc.)

### 1.3 Backend Unreachable
**Priority:** P1
**Flow:** Open app when backend is down
**Steps:**
1. Stop backend
2. Navigate to app
**Expected:**
- "Connecting..." shown briefly
- Error state displayed: "Failed to connect: ..."
- Retry button visible
- Clicking Retry re-attempts connection

---

## 2. Sending Messages & Streaming

### 2.1 Send Message — Happy Path
**Priority:** P0
**Flow:** Send a message and receive streamed response
**Steps:**
1. Type "What products do you offer?" in the input
2. Press Enter (or click Send button)
**Expected:**
- User message appears immediately in chat (right-aligned, purple bubble)
- Input clears and is disabled during streaming
- Typing indicator (pulsing dots) appears in assistant bubble
- Text streams in progressively as SSE delta events arrive
- On completion, input re-enables
- Sidebar conversation entry updates with new timestamp

### 2.2 Send Message — Enter Key Submission
**Priority:** P1
**Flow:** Verify Enter submits, Shift+Enter adds newline
**Steps:**
1. Type text, press Enter
2. Type text, press Shift+Enter, type more, press Enter
**Expected:**
- Enter alone submits the message
- Shift+Enter inserts a newline without submitting
- Multi-line message is sent correctly

### 2.3 Send Message — Title Generation
**Priority:** P0
**Flow:** First message in a new conversation triggers title generation
**Steps:**
1. Create new conversation (click +)
2. Send first message: "Help me troubleshoot my Acme Pro device"
**Expected:**
- After assistant response completes, SSE `title` event is received
- Sidebar conversation title updates from null/placeholder to a generated 3-6 word title
- Title persists on page reload

### 2.4 Send Message — Empty Input Prevention
**Priority:** P1
**Flow:** Attempt to send empty or whitespace-only messages
**Steps:**
1. Click Send with empty input
2. Type only spaces, click Send
**Expected:**
- Send button is disabled when input is empty/whitespace
- No request is made to backend

### 2.5 Streaming — Input Disabled During Response
**Priority:** P1
**Flow:** Verify input is locked while streaming
**Steps:**
1. Send a message
2. While response is streaming, attempt to type and submit
**Expected:**
- Input shows "Waiting..." placeholder
- Input field and send button are disabled
- Cannot submit another message until streaming completes

### 2.6 Message Persistence Across Reload
**Priority:** P0
**Flow:** Verify messages survive page reload
**Steps:**
1. Send a message, wait for response
2. Reload the page
**Expected:**
- Same conversation is selected
- All messages (user and assistant) are displayed in correct order
- Timestamps are preserved

---

## 3. Topic Boundary Guardrails

### 3.1 Allowed Topic
**Priority:** P0
**Flow:** Send a message within allowed topics
**Steps:**
1. Send "What is the pricing for Acme Pro?"
**Expected:**
- Message passes guardrail classification
- Normal streaming response is returned
- No blocked message shown

### 3.2 Blocked Topic — Competitor Comparison
**Priority:** P0
**Flow:** Send a message on a blocked topic
**Steps:**
1. Send "How does your product compare to CompetitorX?"
**Expected:**
- User message appears in chat
- Instead of streamed response, a system notification banner appears: "I can only help with product-related questions."
- No assistant bubble is rendered
- User message is persisted (visible on reload)
- Input re-enables after done event

### 3.3 Blocked Topic — Political Content
**Priority:** P1
**Flow:** Send a political message
**Steps:**
1. Send "What do you think about the upcoming election?"
**Expected:**
- Same behavior as 3.2: blocked banner with boundary message
- No assistant response generated

### 3.4 Blocked Message Persistence
**Priority:** P1
**Flow:** Verify blocked user messages are saved to DB but no assistant response is stored
**Steps:**
1. Send a blocked message (e.g., competitor comparison)
2. Reload the page
**Expected:**
- User message is persisted and visible after reload
- No assistant message follows the blocked message
- System "blocked" banner is NOT persisted (it's a UI-only element)

### 3.5 Guardrail Fail-Open
**Priority:** P2
**Flow:** Verify guardrail defaults to "allowed" when classification fails
**Prerequisite:** Simulate guardrail classification failure (e.g., invalid API key for Haiku call, or mock)
**Expected:**
- Message is treated as allowed
- Normal streaming response proceeds
- Console logs warning: "[guardrails] Classification failed, defaulting to allowed"

### 3.6 Guardrail Edge Case — Ambiguous Message
**Priority:** P2
**Flow:** Send a message that's borderline between allowed and blocked
**Steps:**
1. Send "Is your product better than alternatives on the market?"
**Expected:**
- Classified as either allowed or blocked (behavior varies by LLM classification)
- Whichever outcome, UI handles it correctly (either streams response or shows blocked banner)
- No UI errors regardless of classification result

---

## 4. Conversation Management

### 4.1 Create New Conversation
**Priority:** P0
**Flow:** Start a new chat via the + button
**Steps:**
1. Have an existing conversation with messages
2. Click the "+" (New Chat) button in sidebar
**Expected:**
- New conversation appears at top of sidebar list
- Chat area clears (no messages)
- New conversation is selected (highlighted in sidebar)
- Input is enabled and focused
- Previous conversation remains in sidebar

### 4.2 Switch Between Conversations
**Priority:** P0
**Flow:** Click different conversations in sidebar
**Steps:**
1. Have 2+ conversations with different messages
2. Click conversation A in sidebar
3. Click conversation B in sidebar
4. Click conversation A again
**Expected:**
- Each click loads the correct messages for that conversation
- Active conversation is highlighted in sidebar
- Messages display correctly for each conversation
- No message leaking between conversations

### 4.3 Delete Conversation — Confirm
**Priority:** P0
**Flow:** Delete a conversation via sidebar
**Steps:**
1. Have 2+ conversations
2. Hover over a non-active conversation item
3. Click the trash icon
4. Confirm deletion in dialog
**Expected:**
- Hover reveals trash icon on conversation item
- Confirm dialog appears: "Delete conversation?"
- On confirm, conversation is removed from sidebar
- If active conversation was deleted, next conversation is auto-selected
- Deleted conversation's messages are gone (not recoverable)
- Database confirms deletion (ON DELETE CASCADE removes messages)

### 4.4 Delete Conversation — Cancel and Dismiss
**Priority:** P1
**Flow:** Cancel or dismiss a deletion dialog
**Steps:**
1. Click trash icon on a conversation → confirm dialog opens
2. Click Cancel → dialog closes, conversation unaffected
3. Repeat: click trash → press Escape key → dialog closes
4. Repeat: click trash → click backdrop overlay → dialog closes
**Expected:**
- All three dismiss methods (Cancel button, Escape key, backdrop click) close the dialog
- Conversation remains in sidebar and is unaffected in all cases

### 4.5 Delete Conversation — API Failure
**Priority:** P2
**Flow:** Delete API call fails
**Steps:**
1. Trigger a delete failure (e.g., backend down or database locked)
2. Click trash → confirm deletion
**Expected:**
- Error message shown inline in the confirm dialog
- Dialog stays open for retry
- Conversation is NOT removed from sidebar

### 4.6 Delete Last Conversation
**Priority:** P1
**Flow:** Delete the only remaining conversation
**Steps:**
1. Delete all conversations except one
2. Delete the last conversation
**Expected:**
- After deletion, a new conversation is automatically created
- Sidebar shows the new conversation
- Chat area is empty and ready for input

### 4.7 Delete Active Conversation
**Priority:** P1
**Flow:** Delete the currently viewed conversation
**Steps:**
1. Have 2+ conversations, viewing conversation A
2. Delete conversation A
**Expected:**
- Conversation A removed from sidebar
- App auto-selects the next conversation (most recent)
- Messages from the newly selected conversation are loaded

---

## 5. Sidebar

### 5.1 Collapse and Expand
**Priority:** P2
**Flow:** Toggle sidebar collapse
**Steps:**
1. Click the collapse chevron (ChevronLeft)
2. Observe collapsed state
3. Click expand chevron (ChevronRight)
**Expected:**
- Sidebar collapses to 48px strip showing only toggle and + buttons
- Conversation list is hidden
- Expanding restores full 260px sidebar with conversation list

### 5.2 Conversation Sort Order
**Priority:** P1
**Flow:** Verify conversations are sorted by most recently updated
**Steps:**
1. Have 3 conversations: A (oldest), B, C (newest)
2. Send a message in conversation A
**Expected:**
- After sending, conversation A moves to the top of the sidebar
- Order reflects updated_at timestamps

### 5.3 Conversation Title Display
**Priority:** P1
**Flow:** Verify title vs. untitled conversations
**Steps:**
1. Create a new conversation (no title)
2. Send a message (triggers title generation)
**Expected:**
- Before title: conversation shows "New conversation" as fallback title
- After title SSE event: sidebar updates to show the generated 3-6 word title in real-time
- Title persists on reload

### 5.4 Relative Timestamps
**Priority:** P2
**Flow:** Verify conversation items show human-readable relative times
**Steps:**
1. Have conversations with varying `updatedAt` values
**Expected:**
- Recent: "just now"
- Minutes ago: "5m ago"
- Hours ago: "2h ago"
- Yesterday: "yesterday"
- Older: "3d ago"

### 5.5 New Chat from Collapsed Sidebar
**Priority:** P2
**Flow:** Create new conversation while sidebar is collapsed
**Steps:**
1. Collapse sidebar
2. Click "+" button in collapsed strip
**Expected:**
- New conversation is created
- Chat area clears
- Sidebar remains collapsed but new conversation is active

---

## 6. SSE Edge Cases

### 6.1 LLM Error During Stream
**Priority:** P1
**Flow:** Backend encounters error mid-stream
**Steps:**
1. Trigger an LLM error (e.g., invalid API key, rate limit)
**Expected:**
- SSE `error` event is sent with `{ message: "LLM service error" }`
- Error banner appears in chat area
- `done` event follows, streaming state clears
- Input re-enables
- No partial assistant message remains visible

### 6.2 Network Disconnect During Stream
**Priority:** P2
**Flow:** Network drops while receiving SSE response
**Steps:**
1. Send a message
2. While streaming, disconnect network (or kill backend)
**Expected:**
- Streaming stops, partial response may be visible
- `onDone` callback may NOT fire (stream reader loop ends on network error)
- App should still recover: input should re-enable
- App remains functional after reconnection

### 6.3 Rapid Conversation Switching During Load
**Priority:** P2
**Flow:** Click multiple conversations quickly before any finishes loading
**Steps:**
1. Have 3+ conversations
2. Rapidly click conversation A, then B, then C
**Expected:**
- Final displayed messages should be from conversation C (last clicked)
- No stale data from A or B should appear
- No race condition causing wrong messages to display

### 6.4 Long Response Streaming
**Priority:** P2
**Flow:** Send a question that generates a lengthy response
**Steps:**
1. Send "Give me a detailed guide on troubleshooting Acme Pro"
**Expected:**
- Response streams smoothly without UI freezing
- Auto-scroll works during streaming (if user is at bottom)
- If user scrolls up during streaming, auto-scroll does not force them back down

---

## 7. Authentication (Backend Only — Integration Pending)

> **Status:** Auth routes (`/auth/signup`, `/auth/login`) and JWT middleware exist as source files but are NOT mounted in `index.ts`. Frontend auth UI (login/signup page, token management, logout) is not yet built. These tests cover the backend auth modules directly. Once auth is wired into the server (plan tasks 7-8), these become full E2E tests.
>
> **Security design notes:**
> - Wrong credentials return generic "Invalid email or password" (no email existence leaking)
> - Accessing another user's conversation returns 404 (not 403) to avoid leaking existence
> - No password reset, email verification, or profile management in v1

### 7.1 Signup — Happy Path
**Priority:** P0
**Flow:** Register a new user
**Steps:**
1. `POST /auth/signup` with `{ email: "user@test.com", password: "password123" }`
**Expected:**
- Response 201 with `{ token, user: { id, email } }`
- Token is a valid JWT with 7-day expiry
- User exists in database

### 7.2 Signup — Duplicate Email
**Priority:** P0
**Flow:** Attempt to register with existing email
**Steps:**
1. Sign up with email A
2. Sign up again with email A
**Expected:**
- Second request returns 409: `{ error: "Email already registered" }`

### 7.3 Signup — Short Password
**Priority:** P1
**Flow:** Attempt signup with password < 8 chars
**Steps:**
1. `POST /auth/signup` with `{ email: "user@test.com", password: "short" }`
**Expected:**
- Response 400: `{ error: "Password must be at least 8 characters" }`

### 7.4 Signup — Missing Fields
**Priority:** P1
**Flow:** Attempt signup with missing email or password
**Steps:**
1. `POST /auth/signup` with `{ email: "user@test.com" }` (no password)
2. `POST /auth/signup` with `{ password: "password123" }` (no email)
**Expected:**
- Response 400: `{ error: "Email and password required" }`

### 7.5 Login — Happy Path
**Priority:** P0
**Flow:** Log in with valid credentials
**Steps:**
1. Sign up user
2. `POST /auth/login` with correct credentials
**Expected:**
- Response 200 with `{ token, user: { id, email } }`
- Token is a valid JWT

### 7.6 Login — Wrong Password
**Priority:** P0
**Flow:** Log in with incorrect password
**Steps:**
1. Sign up user
2. `POST /auth/login` with wrong password
**Expected:**
- Response 401: `{ error: "Invalid email or password" }`
- Generic error (doesn't reveal whether email exists)

### 7.7 Login — Nonexistent Email
**Priority:** P0
**Flow:** Log in with email that hasn't registered
**Steps:**
1. `POST /auth/login` with `{ email: "nobody@test.com", password: "password123" }`
**Expected:**
- Response 401: `{ error: "Invalid email or password" }`
- Same generic error as wrong password

### 7.8 Auth Middleware — Valid Token
**Priority:** P0
**Flow:** Access protected route with valid JWT
**Steps:**
1. Sign up/login to get token
2. `GET /conversations` with `Authorization: Bearer <token>`
**Expected:**
- Request succeeds (200)
- `req.userId` is correctly set

### 7.9 Auth Middleware — Missing Token
**Priority:** P0
**Flow:** Access protected route without token
**Steps:**
1. `GET /conversations` with no Authorization header
**Expected:**
- Response 401: `{ error: "Unauthorized" }`

### 7.10 Auth Middleware — Expired/Invalid Token
**Priority:** P1
**Flow:** Access protected route with bad token
**Steps:**
1. `GET /conversations` with `Authorization: Bearer invalid-token-here`
**Expected:**
- Response 401: `{ error: "Unauthorized" }`

### 7.11 Conversation Isolation — User Scoping
**Priority:** P0
**Flow:** Verify users can only see their own conversations
**Steps:**
1. Sign up User A, create a conversation, send a message
2. Sign up User B, list conversations
**Expected:**
- User B's conversation list is empty
- User B cannot access User A's conversation via `GET /conversations/:id`
- User B cannot send messages to User A's conversation
- User B cannot delete User A's conversation

---

## 8. Multi-Turn Conversation

### 8.1 Context Retention
**Priority:** P0
**Flow:** Verify the agent remembers prior messages in a conversation
**Steps:**
1. Send "My name is Alice"
2. Wait for response
3. Send "What is my name?"
**Expected:**
- Second response references "Alice"
- Full message history is sent to Claude API (all prior messages included)

### 8.2 Long Conversation
**Priority:** P2
**Flow:** Send many messages in one conversation
**Steps:**
1. Send 10+ messages in a single conversation
**Expected:**
- All messages persist and display correctly
- Scrolling works properly
- Performance remains acceptable
- Auto-scroll works as expected

---

## 9. UI/UX Details

### 9.1 Markdown Rendering in Assistant Messages
**Priority:** P1
**Flow:** Receive a response with markdown content
**Steps:**
1. Ask "List the pricing tiers for Acme Pro in a table"
**Expected:**
- Markdown tables, bold, italic, lists, code blocks render correctly
- Rendered via react-markdown with GFM support

### 9.2 Auto-Scroll Behavior
**Priority:** P2
**Flow:** Verify smart auto-scroll
**Steps:**
1. Send a message (at bottom of scroll) — should auto-scroll during streaming
2. Scroll up manually during streaming — should NOT force-scroll back
3. Scroll back to bottom — auto-scroll resumes
**Expected:**
- Auto-scrolls when user is within 100px of bottom
- Does not auto-scroll when user has scrolled up to read history

### 9.3 Input Auto-Resize
**Priority:** P2
**Flow:** Verify textarea grows with content
**Steps:**
1. Type a single line — textarea stays at 1 row
2. Type multiple lines — textarea grows up to ~4 lines
3. Type beyond max — textarea stops growing and becomes scrollable
**Expected:**
- Max height is 120px
- After submission, textarea resets to single row

### 9.4 Error Banner in Chat Area
**Priority:** P1
**Flow:** Verify error display within active conversation
**Steps:**
1. Trigger an error (e.g., LLM service error via SSE `error` event)
**Expected:**
- Red error banner appears above input area (border-t border-red-900/50 styling)
- Banner shows error message text
- Assistant message placeholder is removed (no empty bubble left behind)
- Error clears on next message send (`error` is set to null)

### 9.5 Input Auto-Focus
**Priority:** P2
**Flow:** Verify textarea receives focus at the right times
**Steps:**
1. Load the app — input should be focused
2. Send a message, wait for streaming to complete — input should refocus
3. Switch conversations — input should refocus
**Expected:**
- Textarea gains focus after streaming ends (when `disabled` prop changes)
- User can immediately start typing without clicking the input

### 9.6 System Message Styling
**Priority:** P2
**Flow:** Verify blocked/system messages have distinct styling from user/assistant bubbles
**Steps:**
1. Trigger a blocked message
**Expected:**
- System message appears as centered, muted-color banner (not a chat bubble)
- Visually distinct from purple user bubbles and dark assistant bubbles

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0       | 16    | Core functionality — must pass for release |
| P1       | 15    | Important flows — should pass, minor workarounds acceptable |
| P2       | 13    | Edge cases and polish — nice to have |
| **Total** | **44** | |

---

## Notes

- **Auth integration blocker**: Sections 1-6 and 8-9 require auth to be wired into the server before they can execute. The DB layer's `listConversations` and `createConversation` require a `userId` parameter that the current route handlers don't pass. Section 7 can be tested as unit/integration tests against the auth modules directly.
- **Agent ID hardcoded**: The frontend always uses `"support-bot"` — no agent selection UI exists. All E2E tests use this single agent.
- **Guardrail non-determinism**: Topic boundary checks use Claude Haiku for classification, which is non-deterministic. Use clear-cut examples ("How does your product compare to CompetitorX?" for blocked, "What is the pricing?" for allowed) for reliable test assertions.
- **SSE test timeouts**: SSE streaming tests must include timeouts to avoid hanging if `done` event is never received (e.g., network failure). The `done` event is always the last event in normal flows.
- **Title generation latency**: Title is generated via a separate Haiku call after the first assistant response. Allow 2-5 seconds for the `title` SSE event. If it fails, it's silently skipped (no error event).
- **CASCADE DELETE**: Deleting a conversation automatically removes all its messages from the database.
- **`addMessage` throws**: If `addMessage` is called with a non-existent conversation ID, it throws an Error (not a return value) — relevant for concurrent delete + send scenarios.
