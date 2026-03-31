# Authentication Design Spec

**Date:** 2026-03-31
**Goal:** User isolation — each user sees only their own conversations
**Approach:** Lightweight custom auth with email + password, JWT sessions

---

## Requirements

- Open registration (anyone can sign up)
- Email + password authentication
- JWT-based stateless sessions (7-day expiry)
- Conversation scoping: users only see/access their own conversations
- Minimal scope: signup, login, logout, conversation isolation
- No password reset, email verification, or profile management in v1

## Database Schema

### New table: `users`

```sql
CREATE TABLE users (
  id         TEXT PRIMARY KEY,          -- UUID
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,             -- bcrypt hash
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Modified table: `conversations`

```sql
ALTER TABLE conversations ADD COLUMN user_id TEXT REFERENCES users(id);
```

- `user_id` is the isolation mechanism — all conversation queries scoped by it
- Existing conversations with `NULL` user_id will be assigned to a configurable default user via a one-time migration

## Backend

### Dependencies

- `bcrypt` — password hashing
- `jsonwebtoken` — JWT creation and verification
- `@types/bcrypt`, `@types/jsonwebtoken` — TypeScript types

### New file: `src/routes/auth.ts`

Auth endpoints (no middleware required):

| Method | Path           | Body                  | Response                            |
|--------|----------------|-----------------------|-------------------------------------|
| POST   | `/auth/signup` | `{ email, password }` | `{ token, user: { id, email } }`   |
| POST   | `/auth/login`  | `{ email, password }` | `{ token, user: { id, email } }`   |

**Signup logic:**
1. Validate email format and password length (minimum 8 characters)
2. Check email uniqueness
3. Hash password with bcrypt (salt rounds: 10)
4. Insert user with UUID
5. Sign JWT with `{ userId, email }` payload, 7-day expiry
6. Return token and user info

**Login logic:**
1. Find user by email
2. Compare password with bcrypt
3. Sign JWT
4. Return token and user info

### New file: `src/middleware/auth.ts`

JWT verification middleware:
1. Read `Authorization: Bearer <token>` header
2. Verify JWT using `JWT_SECRET` env var
3. Attach `req.userId` to the request object
4. Return 401 if token is missing, expired, or invalid

### Modified file: `src/index.ts`

- Mount auth routes at `/auth` (before auth middleware)
- Apply auth middleware to all `/conversations` routes

### Modified file: `src/routes/conversations.ts`

- `POST /conversations` — set `user_id` from `req.userId`
- `GET /conversations` — filter by `WHERE user_id = ?`
- `GET /conversations/:id` — verify conversation belongs to `req.userId`
- `POST /conversations/:id/messages` — verify ownership before streaming
- `DELETE /conversations/:id` — verify ownership before deleting

### Modified file: `src/services/database.ts`

- Add `users` table creation in schema init
- Add `user_id` column to `conversations` table
- Add user CRUD methods: `createUser(email, hashedPassword)`, `findUserByEmail(email)`
- Modify conversation queries to accept and filter by `userId`
- Add one-time migration for orphaned conversations

### Environment variables

Add to `.env.example`:
```
JWT_SECRET=your-jwt-secret-here
```

## Frontend

### New file: `src/contexts/AuthContext.tsx`

React context providing:
- **State:** `{ user: { id, email } | null, token: string | null, isAuthenticated: boolean, loading: boolean }`
- **Actions:** `login(email, password)`, `signup(email, password)`, `logout()`
- Token stored in `localStorage` under key `auth_token`
- On mount, reads token from `localStorage` and validates (decode without verify — if expired, clear and redirect)

### New file: `src/components/AuthPage.tsx`

Combined login/signup form:
- Email input, password input, submit button
- Toggle link between "Sign up" and "Log in" modes
- Error display for failed attempts
- Minimal styling consistent with existing Tailwind patterns

### Modified file: `src/lib/api.ts`

- Add `signup(email, password)` and `login(email, password)` API functions
- Add `getAuthHeaders()` helper that reads token from `localStorage` and returns `{ Authorization: Bearer <token> }`
- Inject auth headers into all existing API functions (`listConversations`, `createConversation`, `getConversation`, `sendMessage`, `deleteConversation`)

### Modified file: `src/App.tsx`

- Wrap app in `<AuthProvider>`
- Conditionally render: `AuthPage` when not authenticated, existing chat UI when authenticated
- Add logout button (in sidebar or header)

### No changes needed: `src/hooks/use-chat.ts`

Auth is handled transparently at the API layer — the chat hook doesn't need to know about auth.

## Error Handling

| Scenario | HTTP Status | Response | Frontend behavior |
|----------|------------|----------|-------------------|
| Duplicate email on signup | 409 | `{ error: "Email already registered" }` | Show error message |
| Wrong credentials on login | 401 | `{ error: "Invalid email or password" }` | Show error message |
| Expired/invalid JWT | 401 | `{ error: "Unauthorized" }` | Clear token, redirect to login |
| Access another user's conversation | 404 | `{ error: "Conversation not found" }` | Show not-found state |
| Missing required fields | 400 | `{ error: "Email and password required" }` | Show error message |

**Security notes:**
- Wrong credentials return generic message (don't reveal whether email exists)
- Accessing another user's conversation returns 404, not 403 (don't leak existence)

## Data Migration

On first server start after adding auth:
1. Check if `user_id` column exists on `conversations` — if not, run `ALTER TABLE`
2. Check for conversations where `user_id IS NULL`
3. If orphaned conversations exist and a `DEFAULT_USER_EMAIL` env var is set, assign them to that user
4. Otherwise, orphaned conversations remain inaccessible (no data loss, just not visible)

## Testing

### Backend tests

- **Auth routes:** Signup success, signup duplicate email (409), login success, login wrong password (401), login nonexistent email (401)
- **Auth middleware:** Valid token passes, expired token returns 401, missing token returns 401, malformed token returns 401
- **Conversation scoping:** User A creates conversation, User B cannot list/access/delete it, User A can

### Frontend

- Manual testing: signup flow, login flow, logout flow, conversation isolation between two browser sessions

## Files Summary

| Area | New files | Modified files |
|------|-----------|----------------|
| Backend | `src/routes/auth.ts`, `src/middleware/auth.ts` | `src/index.ts`, `src/routes/conversations.ts`, `src/services/database.ts`, `src/types.ts` |
| Frontend | `src/contexts/AuthContext.tsx`, `src/components/AuthPage.tsx` | `src/lib/api.ts`, `src/App.tsx` |
| Config | — | `.env.example` |
| Deps | `bcrypt`, `jsonwebtoken`, `@types/bcrypt`, `@types/jsonwebtoken` | — |
