# Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email + password authentication with JWT sessions so each user only sees their own conversations.

**Architecture:** New `users` table in SQLite, bcrypt for password hashing, JWT for stateless sessions. Auth middleware protects all `/conversations` routes and injects `userId`. Frontend gets an `AuthContext` + login/signup page that gates the chat UI.

**Tech Stack:** bcrypt, jsonwebtoken (backend); React Context + localStorage (frontend); existing Express + SQLite + Vitest stack.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/agent-service/src/middleware/auth.ts` | JWT verification middleware |
| `packages/agent-service/src/routes/auth.ts` | Signup and login endpoints |
| `packages/agent-service/src/__tests__/auth.test.ts` | Tests for auth routes, middleware, and conversation scoping |
| `packages/web-client/src/contexts/AuthContext.tsx` | React context for auth state + actions |
| `packages/web-client/src/components/AuthPage.tsx` | Login/signup form component |

### Modified files

| File | Changes |
|------|---------|
| `packages/agent-service/package.json` | Add bcrypt, jsonwebtoken, and their type packages |
| `packages/agent-service/src/types.ts` | Add `User` type and extend Express `Request` |
| `packages/agent-service/src/services/database.ts` | Add `users` table, `user_id` column on conversations, user CRUD, migration |
| `packages/agent-service/src/routes/conversations.ts` | Scope all queries by `req.userId` |
| `packages/agent-service/src/index.ts` | Mount auth routes, apply auth middleware |
| `packages/agent-service/src/__tests__/database.test.ts` | Update tests to pass `userId` to modified methods |
| `packages/agent-service/src/__tests__/routes.test.ts` | Add auth headers to all requests |
| `.env.example` | Add `JWT_SECRET` |
| `packages/web-client/src/lib/api.ts` | Add auth endpoints, inject Bearer token headers |
| `packages/web-client/src/App.tsx` | Wrap in AuthProvider, gate on auth state |
| `packages/web-client/src/components/sidebar.tsx` | Add logout button |

---

### Task 1: Install backend dependencies

**Files:**
- Modify: `packages/agent-service/package.json`

- [ ] **Step 1: Install auth packages**

Run from project root:
```
pnpm --filter @new-workshop/agent-service add bcrypt jsonwebtoken
pnpm --filter @new-workshop/agent-service add -D @types/bcrypt @types/jsonwebtoken
```

- [ ] **Step 2: Commit**

```
git add packages/agent-service/package.json pnpm-lock.yaml
git commit -m "chore: add bcrypt and jsonwebtoken dependencies"
```

---

### Task 2: Add User type and extend Express Request

**Files:**
- Modify: `packages/agent-service/src/types.ts`

- [ ] **Step 1: Add User type and augment Express Request**

Add to the end of `packages/agent-service/src/types.ts`:

```typescript
export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @new-workshop/agent-service tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```
git add packages/agent-service/src/types.ts
git commit -m "feat: add User type and extend Express Request with userId"
```

---

### Task 3: Add users table and user methods to Database

**Files:**
- Modify: `packages/agent-service/src/services/database.ts`
- Modify: `packages/agent-service/src/__tests__/database.test.ts`

- [ ] **Step 1: Write failing tests for user CRUD**

Add to `packages/agent-service/src/__tests__/database.test.ts`, after the existing `describe("setTitle", ...)` block:

```typescript
  describe("createUser", () => {
    it("creates a user and returns it", () => {
      const user = db.createUser("u-1", "test@example.com", "hashed-pw");
      expect(user.id).toBe("u-1");
      expect(user.email).toBe("test@example.com");
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it("throws on duplicate email", () => {
      db.createUser("u-1", "test@example.com", "hashed-pw");
      expect(() => db.createUser("u-2", "test@example.com", "hashed-pw")).toThrow();
    });
  });

  describe("findUserByEmail", () => {
    it("returns user with password hash", () => {
      db.createUser("u-1", "test@example.com", "hashed-pw");
      const user = db.findUserByEmail("test@example.com");
      expect(user).toBeDefined();
      expect(user!.id).toBe("u-1");
      expect(user!.password).toBe("hashed-pw");
    });

    it("returns undefined for unknown email", () => {
      expect(db.findUserByEmail("nobody@example.com")).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test`
Expected: New tests FAIL (methods don't exist).

- [ ] **Step 3: Implement users table and user methods**

In `packages/agent-service/src/services/database.ts`, add the `users` table to the `init()` method — insert before the `CREATE TABLE IF NOT EXISTS conversations` statement:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add these methods to the `Database` class after the `setTitle` method:

```typescript
  createUser(id: string, email: string, hashedPassword: string): { id: string; email: string; createdAt: Date } {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO users (id, email, password, created_at) VALUES (?, ?, ?, ?)")
      .run(id, email, hashedPassword, now);
    return { id, email, createdAt: new Date(now) };
  }

  findUserByEmail(email: string): { id: string; email: string; password: string } | undefined {
    const row = this.db
      .prepare("SELECT id, email, password FROM users WHERE email = ?")
      .get(email) as { id: string; email: string; password: string } | undefined;
    return row ?? undefined;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```
git add packages/agent-service/src/services/database.ts packages/agent-service/src/__tests__/database.test.ts
git commit -m "feat: add users table and user CRUD methods to database"
```

---

### Task 4: Add user_id column to conversations and scope queries

**Files:**
- Modify: `packages/agent-service/src/services/database.ts`
- Modify: `packages/agent-service/src/__tests__/database.test.ts`

- [ ] **Step 1: Write failing tests for user-scoped conversations**

Update existing tests in `packages/agent-service/src/__tests__/database.test.ts`:

Replace `createConversation` describe:
```typescript
  describe("createConversation", () => {
    it("creates a conversation with userId and returns it", () => {
      db.createUser("u-1", "test@example.com", "hashed-pw");
      const conv = db.createConversation("conv-1", "support-bot", "u-1");
      expect(conv.id).toBe("conv-1");
      expect(conv.agentId).toBe("support-bot");
      expect(conv.title).toBeNull();
      expect(conv.messages).toEqual([]);
    });
  });
```

Replace `listConversations` describe:
```typescript
  describe("listConversations", () => {
    it("returns only conversations for the given user", () => {
      db.createUser("u-1", "a@example.com", "pw");
      db.createUser("u-2", "b@example.com", "pw");
      db.createConversation("conv-1", "support-bot", "u-1");
      db.createConversation("conv-2", "support-bot", "u-2");
      const list = db.listConversations("u-1");
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("conv-1");
    });

    it("returns empty array when user has no conversations", () => {
      db.createUser("u-1", "a@example.com", "pw");
      expect(db.listConversations("u-1")).toEqual([]);
    });
  });
```

Update `getConversation`, `addMessage`, `deleteConversation`, `setTitle` tests to call `db.createUser(...)` before `db.createConversation(...)`, and pass third arg `"u-1"` to `createConversation`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test -- src/__tests__/database.test.ts`
Expected: FAIL — `createConversation` doesn't accept `userId` yet.

- [ ] **Step 3: Update database methods**

In `packages/agent-service/src/services/database.ts`:

Update conversations CREATE TABLE in `init()`:
```sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Update `createConversation` signature and INSERT:
```typescript
  createConversation(id: string, agentId: string, userId: string): Conversation {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO conversations (id, agent_id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)")
      .run(id, agentId, userId, now, now);
    return { id, agentId, title: null, messages: [], createdAt: new Date(now), updatedAt: new Date(now) };
  }
```

Update `listConversations` to accept and filter by `userId`:
```typescript
  listConversations(userId: string): ConversationSummary[] {
    const rows = this.db.prepare(`
      SELECT c.id, c.agent_id, c.title, c.updated_at, COUNT(m.id) as message_count
      FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = ?
      GROUP BY c.id ORDER BY c.updated_at DESC
    `).all(userId) as Array<{ id: string; agent_id: string; title: string | null; updated_at: string; message_count: number }>;
    return rows.map((r) => ({ id: r.id, agentId: r.agent_id, title: r.title, updatedAt: new Date(r.updated_at), messageCount: r.message_count }));
  }
```

Add ownership check method:
```typescript
  getConversationOwnerId(conversationId: string): string | undefined {
    const row = this.db.prepare("SELECT user_id FROM conversations WHERE id = ?").get(conversationId) as { user_id: string } | undefined;
    return row?.user_id;
  }
```

Add migration method (called from constructor after `this.init()`):
```typescript
  private migrate(): void {
    const columns = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
    const hasUserId = columns.some((c) => c.name === "user_id");
    if (!hasUserId) {
      this.db.exec("ALTER TABLE conversations ADD COLUMN user_id TEXT REFERENCES users(id)");
      console.log("[database] Migration: added user_id column to conversations");
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test -- src/__tests__/database.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```
git add packages/agent-service/src/services/database.ts packages/agent-service/src/__tests__/database.test.ts
git commit -m "feat: add user_id to conversations and scope queries by user"
```

---

### Task 5: Create auth middleware

**Files:**
- Create: `packages/agent-service/src/middleware/auth.ts`
- Create: `packages/agent-service/src/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing test for auth middleware**

Create `packages/agent-service/src/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import { authMiddleware } from "../middleware/auth.js";

const JWT_SECRET = "test-secret";

function buildApp() {
  const app = express();
  app.use(authMiddleware(JWT_SECRET));
  app.get("/protected", (req, res) => { res.json({ userId: req.userId }); });
  return app;
}

function makeRequest(app: express.Express, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request({ hostname: "127.0.0.1", port, path, method: "GET", headers }, (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => { server.close(); resolve({ status: res.statusCode!, body: data }); });
      });
      req.end();
    });
  });
}

describe("authMiddleware", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await makeRequest(buildApp(), "/protected");
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toBe("Unauthorized");
  });

  it("returns 401 for malformed token", async () => {
    const res = await makeRequest(buildApp(), "/protected", { Authorization: "Bearer bad" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for expired token", async () => {
    const token = jwt.sign({ userId: "u-1", email: "a@b.com" }, JWT_SECRET, { expiresIn: "-1s" });
    const res = await makeRequest(buildApp(), "/protected", { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  it("attaches userId for valid token", async () => {
    const token = jwt.sign({ userId: "u-1", email: "a@b.com" }, JWT_SECRET, { expiresIn: "7d" });
    const res = await makeRequest(buildApp(), "/protected", { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).userId).toBe("u-1");
  });
});
```

- [ ] **Step 2: Run test — should fail (module not found)**

- [ ] **Step 3: Implement auth middleware**

Create `packages/agent-service/src/middleware/auth.ts`:

```typescript
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JwtPayload { userId: string; email: string; }

export function authMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const payload = jwt.verify(header.slice(7), secret) as JwtPayload;
      req.userId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}
```

- [ ] **Step 4: Run test — all 4 should pass**

- [ ] **Step 5: Commit**

```
git add packages/agent-service/src/middleware/auth.ts packages/agent-service/src/__tests__/auth.test.ts
git commit -m "feat: add JWT auth middleware"
```

---

### Task 6: Create auth routes (signup + login)

**Files:**
- Create: `packages/agent-service/src/routes/auth.ts`
- Modify: `packages/agent-service/src/__tests__/auth.test.ts`

- [ ] **Step 1: Add route tests to auth.test.ts**

Append imports and test blocks to `packages/agent-service/src/__tests__/auth.test.ts` for:
- `POST /auth/signup` — success (201 + token), duplicate email (409), missing fields (400), short password (400)
- `POST /auth/login` — success (200 + token), wrong password (401), nonexistent email (401)

Each test creates a fresh Database in `beforeEach` using a temp file path (same pattern as routes.test.ts).

- [ ] **Step 2: Run tests — should fail (module not found)**

- [ ] **Step 3: Implement auth routes**

Create `packages/agent-service/src/routes/auth.ts`:

```typescript
import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { Database } from "../services/database.js";

const SALT_ROUNDS = 10;

export function createAuthRouter(db: Database, jwtSecret: string): Router {
  const router = Router();

  router.post("/signup", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }
    if (typeof password !== "string" || password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
    if (db.findUserByEmail(email)) { res.status(409).json({ error: "Email already registered" }); return; }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const id = uuidv4();
    db.createUser(id, email, hashedPassword);
    const token = jwt.sign({ userId: id, email }, jwtSecret, { expiresIn: "7d" });
    res.status(201).json({ token, user: { id, email } });
  });

  router.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }

    const user = db.findUserByEmail(email);
    if (!user) { res.status(401).json({ error: "Invalid email or password" }); return; }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) { res.status(401).json({ error: "Invalid email or password" }); return; }

    const token = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, { expiresIn: "7d" });
    res.status(200).json({ token, user: { id: user.id, email: user.email } });
  });

  return router;
}
```

- [ ] **Step 4: Run tests — all auth tests should pass**

- [ ] **Step 5: Commit**

```
git add packages/agent-service/src/routes/auth.ts packages/agent-service/src/__tests__/auth.test.ts
git commit -m "feat: add signup and login auth routes"
```

---

### Task 7: Scope conversation routes by userId

**Files:**
- Modify: `packages/agent-service/src/routes/conversations.ts`
- Modify: `packages/agent-service/src/__tests__/routes.test.ts`

- [ ] **Step 1: Rewrite routes.test.ts with auth**

Key changes to `packages/agent-service/src/__tests__/routes.test.ts`:
- Import `jwt` and `authMiddleware`
- Add `authMiddleware(JWT_SECRET)` before conversation router in `buildApp`
- Add `makeToken(userId, email)` helper
- Create users in `beforeEach`: `db.createUser("user-a", ...)`, `db.createUser("user-b", ...)`
- Pass token as 5th arg to `makeRequest`; update `makeRequest` to accept and inject `Authorization` header
- Pass third arg to `db.createConversation` calls
- Add isolation tests: User B gets 404 for User A's conversations

- [ ] **Step 2: Run tests — should fail (routes don't check userId yet)**

- [ ] **Step 3: Update conversation routes**

In `packages/agent-service/src/routes/conversations.ts`:
- Add `verifyOwnership(conversationId, userId)` helper using `db.getConversationOwnerId`
- `GET /` — call `db.listConversations(req.userId!)`
- `POST /` — call `db.createConversation(id, agentId, req.userId!)`
- `DELETE /:id` — check `verifyOwnership` first, return 404 if not owner
- `POST /:id/messages` — check `verifyOwnership` first, return 404 if not owner
- `GET /:id` — check `verifyOwnership` first, return 404 if not owner

- [ ] **Step 4: Run all backend tests — all should pass**

- [ ] **Step 5: Commit**

```
git add packages/agent-service/src/routes/conversations.ts packages/agent-service/src/__tests__/routes.test.ts
git commit -m "feat: scope conversation routes by authenticated user"
```

---

### Task 8: Wire up auth in server entry point and update env

**Files:**
- Modify: `packages/agent-service/src/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Update index.ts**

Add imports for `createAuthRouter` and `authMiddleware`. Read `JWT_SECRET` from env (exit if missing). Mount routes:
```typescript
app.use("/auth", createAuthRouter(db, JWT_SECRET));
app.use("/conversations", authMiddleware(JWT_SECRET), createConversationRouter(agents, db));
```

- [ ] **Step 2: Update .env.example**

Add line: `JWT_SECRET=your-jwt-secret-here`

- [ ] **Step 3: Add JWT_SECRET to local .env**

Run: `grep -q JWT_SECRET .env || echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env`

- [ ] **Step 4: Run all backend tests**

Expected: All PASS.

- [ ] **Step 5: Commit**

```
git add packages/agent-service/src/index.ts .env.example
git commit -m "feat: wire up auth routes and middleware in server entry point"
```

---

### Task 9: Add auth to frontend API client

**Files:**
- Modify: `packages/web-client/src/lib/api.ts`

- [ ] **Step 1: Update api.ts**

Add token storage helpers: `getStoredToken()`, `setStoredToken(token)`, `clearStoredToken()` using `localStorage` key `auth_token`.

Add `authHeaders()` helper that returns `{ Authorization: "Bearer <token>" }` if token exists.

Add `signup(email, password)` and `login(email, password)` functions that POST to `/api/auth/signup` and `/api/auth/login`.

Inject `...authHeaders()` into the headers of all existing fetch calls (`listConversations`, `createConversation`, `deleteConversation`, `sendMessage`, `getConversation`).

- [ ] **Step 2: Commit**

```
git add packages/web-client/src/lib/api.ts
git commit -m "feat: add auth API functions and inject Bearer token in all requests"
```

---

### Task 10: Create AuthContext

**Files:**
- Create: `packages/web-client/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Create AuthContext**

Provides: `{ user, isAuthenticated, loading, login, signup, logout }`

On mount, reads token from localStorage, decodes JWT payload (client-side decode via `atob`), checks expiry. If valid, sets user. If expired, clears token.

`login` and `signup` call the API functions, store the token, set user state.
`logout` clears token and sets user to null.

- [ ] **Step 2: Commit**

```
git add packages/web-client/src/contexts/AuthContext.tsx
git commit -m "feat: add AuthContext with login, signup, and logout"
```

---

### Task 11: Create AuthPage component

**Files:**
- Create: `packages/web-client/src/components/AuthPage.tsx`

- [ ] **Step 1: Create login/signup form**

Combined form with toggle between sign-in and sign-up modes. Email input, password input (minLength 8), submit button, error display. Uses `useAuth()` for login/signup actions. Styled with existing Tailwind classes (border-border, bg-surface, text-foreground, etc).

- [ ] **Step 2: Commit**

```
git add packages/web-client/src/components/AuthPage.tsx
git commit -m "feat: add AuthPage login/signup component"
```

---

### Task 12: Integrate auth into App and Sidebar

**Files:**
- Modify: `packages/web-client/src/App.tsx`
- Modify: `packages/web-client/src/components/sidebar.tsx`

- [ ] **Step 1: Update App.tsx**

Wrap everything in `<AuthProvider>`. Create `AppContent` that checks `isAuthenticated`: if loading show spinner, if not authenticated show `<AuthPage />`, if authenticated show existing chat UI (extracted to `<AuthenticatedApp />`).

- [ ] **Step 2: Add logout to Sidebar**

Import `useAuth` and `LogOut` icon. Show user email and logout button in sidebar footer.

- [ ] **Step 3: Run frontend tests, fix any failures from auth context**

- [ ] **Step 4: Commit**

```
git add packages/web-client/src/App.tsx packages/web-client/src/components/sidebar.tsx
git commit -m "feat: integrate auth into App shell and add logout to sidebar"
```

---

### Task 13: Update frontend tests

**Files:**
- Modify: `packages/web-client/src/__tests__/api.test.ts`

- [ ] **Step 1: Add localStorage.clear() to beforeEach and add auth API tests**

Add tests for `signup` and `login` API functions (success and error cases).

- [ ] **Step 2: Run frontend tests — all should pass**

- [ ] **Step 3: Commit**

```
git add packages/web-client/src/__tests__/api.test.ts
git commit -m "test: add auth API tests for frontend"
```

---

### Task 14: Delete old database and smoke test

- [ ] **Step 1: Delete old SQLite database**

Remove `packages/data/conversations.db` and WAL/SHM files so schema is recreated fresh.

- [ ] **Step 2: Start backend and frontend**

Run: `pnpm start`

- [ ] **Step 3: Manual smoke test**

1. Open http://localhost:5173 — see login/signup form
2. Sign up with email + password (8+ chars)
3. Redirected to chat UI, send a message
4. Incognito window: sign up as different user — no shared conversations
5. Logout returns to login form

- [ ] **Step 4: Run full test suite**

Run: `pnpm --filter @new-workshop/agent-service test && pnpm --filter @new-workshop/web-client test`
Expected: All PASS.
