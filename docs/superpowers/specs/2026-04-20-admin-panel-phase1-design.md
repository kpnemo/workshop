# Admin Panel — Phase 1 Design

Date: 2026-04-20
Status: approved for planning

## Purpose

Introduce an admin-only surface for managing users, groups, profiles (role templates), and privileges. Phase 1 gates only admin actions themselves; existing app features (chat, agents, files) remain open to any logged-in user.

## Domain model

```
User ─┬─< user_groups >─┬─ Group ─┬─< group_profiles >─┬─ Profile ─┬─< profile_privileges >─┬─ privilege_key (code-defined)
      │                 │         │                    │           │                        │
      email/password     M:M       name                 M:M         name                     M:M, FK to fixed catalog
```

- **User** — existing `users` table (id, email, password, created_at). No schema change.
- **Group** — a collection of users. New table.
- **Profile** — a named bundle of privileges (i.e. a role template). New table.
- **Privilege** — a fixed, code-defined key (e.g. `manage:users`). The catalog lives in `packages/agent-service/src/services/privileges.ts` and is not user-editable. The admin UI exposes a read-only catalog view.
- **Effective privileges of a user** = union of `profile_privileges` across all profiles of all groups the user belongs to.

All three relations are many-to-many:
- `user_groups (user_id, group_id)` — a user may be in multiple groups.
- `group_profiles (group_id, profile_id)` — a group may have multiple profiles.
- `profile_privileges (profile_id, privilege_key)` — a profile may grant multiple privileges.

Privileges in Phase 1 catalog:
- `manage:users`
- `manage:groups`
- `manage:profiles`

No `manage:privileges` privilege, because the privilege catalog is code-defined and therefore not manageable from the UI.

## Architecture

pnpm monorepo gains one new package; existing packages extend:

```
packages/
├── agent-service/   — add /admin/* routes, admin tables, admin middleware, privileges catalog, bootstrap
├── web-client/      — unchanged
└── admin-panel/     — NEW: React + Vite SPA on port 5174, Tailwind, dark theme matching web-client
```

Admin-panel calls the same agent-service over `/api/*` via Vite proxy. Same JWT secret, same hashing (bcrypt). No separate admin database.

## Backend additions (`packages/agent-service`)

### Database migrations (`services/database.ts`)

Adds idempotent `CREATE TABLE IF NOT EXISTS` calls for:

```sql
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_groups (
  user_id  TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE group_profiles (
  group_id   TEXT NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, profile_id)
);

CREATE TABLE profile_privileges (
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  privilege_key TEXT NOT NULL,
  PRIMARY KEY (profile_id, privilege_key)
);

CREATE INDEX idx_user_groups_group ON user_groups(group_id);
CREATE INDEX idx_group_profiles_profile ON group_profiles(profile_id);
```

### New database methods

| Method | Purpose |
| --- | --- |
| `listUsers()` | For `/admin/users` list. Returns id, email, created_at, group_ids. |
| `updateUserEmail(id, email)` / `updateUserPassword(id, hashed)` | Admin user edits. |
| `deleteUser(id)` | Hard delete. FK cascades `user_groups` and existing conversations. |
| `listGroups()` / `createGroup(name)` / `renameGroup(id, name)` / `deleteGroup(id)` | Groups CRUD. |
| `listProfiles()` / `createProfile(name)` / `renameProfile(id, name)` / `deleteProfile(id)` | Profiles CRUD. |
| `setUserGroups(userId, groupIds[])` | Transactional replace-all on `user_groups`. |
| `setGroupMembers(groupId, userIds[])` | Transactional replace-all on `user_groups` by group. |
| `setGroupProfiles(groupId, profileIds[])` | Transactional replace-all on `group_profiles`. |
| `setProfilePrivileges(profileId, keys[])` | Transactional replace-all on `profile_privileges`; rejects keys not in code catalog. |
| `getEffectivePrivileges(userId)` | Single JOIN query returning `Set<string>` of keys. |
| `countUsersWithPrivilege(key)` | Used by self-lockout guard. |

### Privileges catalog (`services/privileges.ts`, new)

```ts
export const PRIVILEGES = {
  MANAGE_USERS:    'manage:users',
  MANAGE_GROUPS:   'manage:groups',
  MANAGE_PROFILES: 'manage:profiles',
} as const;

export const PRIVILEGE_CATALOG = [
  { key: PRIVILEGES.MANAGE_USERS,    label: 'Manage users',    description: 'Create, edit, and delete user accounts; set group membership.' },
  { key: PRIVILEGES.MANAGE_GROUPS,   label: 'Manage groups',   description: 'Create, rename, delete groups; assign profiles and members.' },
  { key: PRIVILEGES.MANAGE_PROFILES, label: 'Manage profiles', description: 'Create, rename, delete profiles; assign privileges.' },
] as const;

export const PRIVILEGE_KEYS = new Set(PRIVILEGE_CATALOG.map(p => p.key));
export const ADMIN_PRIVILEGES = PRIVILEGE_KEYS; // all catalog keys are admin keys in Phase 1
```

### Bootstrap (`services/admin-bootstrap.ts`, new)

Called once from `index.ts` after `new Database(DB_PATH)`:

```
ensureBootstrapAdmin(db):
  if !ADMIN_EMAIL && !ADMIN_PASSWORD: log warning if no admin exists; return
  if only one of the two is set: throw startup error
  upsert profile "superadmin" with ALL PRIVILEGE_CATALOG keys
  upsert group "Admins" linked to superadmin profile
  upsert user by ADMIN_EMAIL (hash ADMIN_PASSWORD on create only; do not overwrite an existing password)
  ensure user is a member of Admins
```

Idempotent; safe to run on every boot.

### Admin auth middleware (`middleware/admin-auth.ts`, new)

```ts
adminAuthMiddleware(requiredPrivilege: string):
  parse Bearer JWT (same secret)        → 401 on fail
  privs = db.getEffectivePrivileges(userId)
  if !privs.has(requiredPrivilege)      → 403 { error: "Forbidden", required }
  req.userId = userId; req.privileges = privs; next()
```

Privileges are re-resolved fresh on every request; JWT carries only `{ userId, email }`. Revoking a user's membership takes effect immediately.

### Admin routes (`routes/admin.ts`, new)

| Method | Path | Privilege gate | Purpose |
| --- | --- | --- | --- |
| POST   | /admin/login | (credential + ≥1 admin priv) | email+bcrypt check; 403 if user has no `manage:*`; returns JWT + user + privileges. |
| GET    | /admin/me | (JWT only) | Current user + effective privileges. |
| GET    | /admin/users | manage:users | List. |
| POST   | /admin/users | manage:users | Create user (email, password). |
| PATCH  | /admin/users/:id | manage:users | Update email and/or password. |
| DELETE | /admin/users/:id | manage:users | Delete; blocks self-lockout (see below). |
| PUT    | /admin/users/:id/groups | manage:users | Replace group membership. |
| GET    | /admin/groups | manage:groups | List. |
| POST   | /admin/groups | manage:groups | Create (name). |
| PATCH  | /admin/groups/:id | manage:groups | Rename. |
| DELETE | /admin/groups/:id | manage:groups | Delete; blocks self-lockout. |
| PUT    | /admin/groups/:id/profiles | manage:groups | Replace group's profiles. |
| PUT    | /admin/groups/:id/members | manage:groups | Replace group's members. |
| GET    | /admin/profiles | manage:profiles | List with privilege counts. |
| POST   | /admin/profiles | manage:profiles | Create (name). |
| PATCH  | /admin/profiles/:id | manage:profiles | Rename. |
| DELETE | /admin/profiles/:id | manage:profiles | Delete; blocks self-lockout. |
| PUT    | /admin/profiles/:id/privileges | manage:profiles | Replace privilege assignments (keys must be in catalog). |
| GET    | /admin/privileges | (JWT only) | Read-only catalog + count of profiles including each key. |

Wired in `index.ts`:
```ts
app.use('/admin', createAdminRouter(db, JWT_SECRET));
```

## Frontend (`packages/admin-panel`, new)

```
packages/admin-panel/
├── package.json          — @new-workshop/admin-panel
├── vite.config.ts        — port 5174, proxy /api → http://localhost:3000
├── tailwind.config.ts    — imports same theme as web-client (background #0f0f1a, primary #6c5ce7, …)
├── index.html, tsconfig.json
└── src/
    ├── main.tsx, App.tsx, index.css
    ├── types.ts                     — User, Group, Profile, Privilege, Me
    ├── lib/api.ts                   — fetch wrapper; Authorization header; typed ApiError
    ├── contexts/AuthContext.tsx     — token + privileges in sessionStorage
    ├── hooks/
    │   ├── use-auth.ts              — login/logout/hasPrivilege
    │   └── use-resource.ts          — generic list/mutate helper for each resource page
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── UsersPage.tsx
    │   ├── GroupsPage.tsx
    │   ├── ProfilesPage.tsx
    │   └── PrivilegesPage.tsx       — read-only catalog grouped by key, with profile counts
    ├── components/
    │   ├── AppShell.tsx             — top bar + left nav (Users / Groups / Profiles / Privileges)
    │   ├── DataTable.tsx
    │   ├── ConfirmDialog.tsx
    │   ├── FormField.tsx
    │   ├── MultiSelect.tsx          — for M:M assignment editors
    │   └── PrivilegeBadge.tsx
    └── __tests__/
```

**Routing:** `react-router-dom` (new dependency for this package). Unauthenticated → LoginPage; authenticated with ≥1 admin privilege → AppShell with nested routes.

**Styling:** dark theme matching web-client (`#0f0f1a` bg, `#1a1a2e` surface, `#2a2a4a` borders, `#6c5ce7` primary, `#e0e0e0` foreground). Uses `@tailwindcss/typography` for any rich text. No new design system.

**Privilege-aware UI:** buttons and nav items are disabled/hidden based on `hasPrivilege(...)`. Server-side checks are still the source of truth; UI gating is just a UX nicety.

## Data flow

### Bootstrap
```
.env(ADMIN_EMAIL, ADMIN_PASSWORD)
        │
agent-service/index.ts
  db.init() + db.migrate()
  ensureBootstrapAdmin(db)
        ├─ upsert "superadmin" profile + catalog keys
        ├─ upsert "Admins" group, link to "superadmin"
        └─ upsert admin user, add to "Admins"
```

### Login
```
admin-panel LoginPage → POST /admin/login { email, password }
                    ↓
routes/admin.ts      bcrypt.compare → privs = getEffectivePrivileges(userId)
                    if no manage:* → 403
                    ↓
                    { token, user, privileges: string[] }
                    ↓
admin-panel AuthContext stores token + privileges in sessionStorage
```

### Authorized mutation (e.g. create user)
```
UsersPage form → api.post('/admin/users', { email, password })
               Authorization: Bearer <jwt>
                    ↓
adminAuthMiddleware('manage:users') → fresh getEffectivePrivileges()
                    ↓
handler → db.createUser(...) → 201 { user }
                    ↓
UsersPage: optimistic row added; re-fetch on success
```

### Transactional M:M replace
```
GroupDetail MultiSelect → PUT /admin/groups/:id/profiles { profileIds: string[] }
                    ↓
adminAuthMiddleware('manage:groups')
                    ↓
db.transaction:
  DELETE FROM group_profiles WHERE group_id = ?
  INSERT INTO group_profiles (group_id, profile_id) VALUES (…)  -- batched
                    ↓
201 { profileIds }
```

## Error handling

### Response contract
| Status | Body | When |
| --- | --- | --- |
| 400 | `{ error, field? }` | Validation (empty name, password < 8, unknown privilege key) |
| 401 | `{ error: "Unauthorized" }` | Missing/invalid/expired JWT |
| 403 | `{ error: "Forbidden", required? }` | Authenticated but missing privilege |
| 404 | `{ error: "Not found" }` | Unknown id |
| 409 | `{ error, field? }` | Uniqueness conflict or self-lockout guard |
| 500 | `{ error: "Internal error" }` | Unexpected; stack logged server-side only |

### Safeguards

- **Self-lockout guard.** The following all refuse with 409 when the action would leave zero users with a given `manage:*` privilege:
  - `DELETE /admin/users/:id` if the user is the only holder of that privilege.
  - `PUT /admin/users/:id/groups` if removing the user from their last admin-granting group would leave them without the privilege while they are the sole holder.
  - `PUT /admin/groups/:id/members` likewise for removals.
  - `PUT /admin/groups/:id/profiles` if removing the last admin-granting profile from the group that supplies that privilege would drop the last holder.
  - `PUT /admin/profiles/:id/privileges` likewise.
  - `DELETE /admin/groups/:id` and `DELETE /admin/profiles/:id` likewise.
- **Bootstrap resilience.** Both env vars unset → log warning only. Only one set → fail fast at startup. Existing admin's password is never overwritten by bootstrap.
- **Referential integrity.** `ON DELETE CASCADE` on all three join tables.
- **Transactional replaces.** M:M set endpoints use `db.transaction(...)` — all or nothing.
- **Email normalization.** Trim + lowercase on write and lookup.

### Frontend handling
- `api.ts` throws typed `ApiError { status, error, field? }`.
- `401` → clear AuthContext, redirect to LoginPage.
- `403` → toast "You don't have permission to do that" (shouldn't normally fire when UI gates by privilege, but defensive).
- `409` → inline field error.
- Network / 500 → toast + optimistic row stays pending with a retry button.

### Out of scope for Phase 1
Audit log, rate limiting on `/admin/login`, password policies beyond min-8, account lockouts, token revocation list, MFA, email verification, passwordless flows.

## Testing

### Backend — Vitest (`packages/agent-service/src/__tests__/`)

- **`admin-bootstrap.test.ts`** — idempotent on repeat runs; no-op when env unset; fast-fail when only one env var set; existing admin password is not overwritten.
- **`admin-auth.middleware.test.ts`** — 401 on missing/malformed/expired JWT; 403 when required privilege absent; 200 when present; removing user from admin group → next request 403 without token re-issue.
- **`admin.routes.test.ts`** (in-memory SQLite per test):
  - `POST /admin/login`: valid admin → 200 token+privs; valid creds, non-admin → 403; wrong password → 401; unknown email → 401.
  - `GET /admin/me`: resolved privileges union across multiple groups.
  - Users: CRUD; 409 duplicate email; email normalized; password rehashes; delete cascades `user_groups`.
  - Groups: CRUD; transactional `PUT /members` and `PUT /profiles`; 409 on duplicate name.
  - Profiles: CRUD; `PUT /privileges` rejects unknown keys (400); transactional replace.
  - Privileges: `GET /admin/privileges` returns catalog with per-key profile counts; no write verbs exist.
  - Self-lockout across all listed operations → 409.
- **`database.admin.test.ts`** — `getEffectivePrivileges()` correctness with multi-group / multi-profile setups; FK cascades on user/group/profile delete.

### Frontend — Vitest + React Testing Library (`packages/admin-panel/src/__tests__/`)

- `api.test.ts` — attaches Authorization header, throws typed ApiError, clears auth on 401.
- `use-auth.test.ts` — login stores token+privileges; logout clears; `hasPrivilege(key)` correct.
- `LoginPage.test.tsx` — happy path, bad creds, non-admin (403) inline message.
- `UsersPage.test.tsx` — renders list, "+ New user" disabled when privilege missing, create form validation, delete confirm → DELETE call, 409 → inline field error.
- `GroupsPage.test.tsx` and `ProfilesPage.test.tsx` — MultiSelect posts correct array, optimistic update rolls back on error.
- `PrivilegesPage.test.tsx` — read-only catalog groups, profile counts render.

### Running
Add to root `package.json`: `"test": "pnpm -r test"` for convenience. Per-package commands in `CLAUDE.md` remain unchanged.

### Out of scope for Phase 1
End-to-end (Playwright) flows spanning admin-panel ↔ agent-service, load/perf tests, visual regression.

## Dev workflow

- `.env` gains `ADMIN_EMAIL` and `ADMIN_PASSWORD` (documented in `.env.example`).
- Root `pnpm start` gets a third `concurrently` target:
  ```json
  "start": "concurrently --names \"be,fe,admin\" --prefix-colors \"blue,green,magenta\" --kill-others-on-fail \
    \"pnpm --filter @new-workshop/agent-service dev\" \
    \"pnpm --filter @new-workshop/web-client dev\" \
    \"pnpm --filter @new-workshop/admin-panel dev\""
  ```
- Admin UI reachable at `http://localhost:5174`.

## Risks and open questions

- **SQLite write concurrency.** Admin writes happen on the same DB file as chat writes. WAL mode is already on; contention is expected to be negligible at workshop scale, but heavy admin bulk ops could briefly block chat writes. Acceptable for Phase 1.
- **Session storage of JWT.** We keep the token in `sessionStorage` for admin-panel so a tab close clears it. `localStorage` would survive restarts but widens XSS blast radius; not worth it for admin surface.
- **No CSRF surface.** Admin APIs are token-authenticated (not cookie), so no CSRF middleware required.
- **Admin-panel accessibility / i18n.** Not in scope for Phase 1; keep markup semantic to keep the door open.

## Explicit non-goals (Phase 1)

- Gating existing (non-admin) app actions by privilege.
- Per-resource ownership rules.
- Audit logging.
- Anything beyond the three `manage:*` privileges.
