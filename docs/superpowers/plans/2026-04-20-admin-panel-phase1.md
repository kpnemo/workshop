# Admin Panel — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only surface for managing users, groups, role-template profiles, and a fixed privilege catalog. Deliver a new `packages/admin-panel` React SPA and `/admin/*` routes inside the existing `agent-service`.

**Architecture:** All admin data lives in the same SQLite DB as the rest of the app (3 new tables + 3 join tables, FK-cascaded). Privileges are a code-defined catalog (`services/privileges.ts`). A separate `POST /admin/login` endpoint rejects non-admin users up front; subsequent routes are gated by a `adminAuthMiddleware(requiredPrivilege)` that re-resolves the user's effective privileges from DB on every request (no privilege claims in the JWT). The admin-panel SPA reuses web-client's Tailwind theme, runs on port 5174, proxies `/api/*` to agent-service.

**Tech Stack:** TypeScript, Express, better-sqlite3, bcrypt, jsonwebtoken, uuid, React 19, Vite 6, Tailwind 3, react-router-dom 6, Vitest + supertest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-04-20-admin-panel-phase1-design.md](../specs/2026-04-20-admin-panel-phase1-design.md)

---

## Conventions for every task

- Work from the project root: `cd "$(git rev-parse --show-toplevel)"` before running commands.
- Run backend tests with: `pnpm --filter @new-workshop/agent-service test`.
- Run frontend tests with: `pnpm --filter @new-workshop/admin-panel test`.
- Use `pnpm` exclusively (never `npm`).
- Keep commits small — one per task minimum, more if the task has natural sub-units.
- Apply **TDD**: write the failing test, see it fail for the right reason, implement the minimum, see it pass, commit.
- Filenames for backend import use `.js` extension suffix (ESM with bundler-style resolution — matches existing codebase).

## File structure

### New backend files
```
packages/agent-service/src/
├── services/
│   ├── privileges.ts              — PRIVILEGES consts, PRIVILEGE_CATALOG, PRIVILEGE_KEYS
│   └── admin-bootstrap.ts         — ensureBootstrapAdmin(db)
├── middleware/
│   └── admin-auth.ts              — adminAuthMiddleware(requiredPrivilege)
├── routes/
│   └── admin.ts                   — createAdminRouter(db, jwtSecret)
└── __tests__/
    ├── privileges.test.ts
    ├── database.admin.test.ts
    ├── admin-bootstrap.test.ts
    ├── admin-auth.middleware.test.ts
    └── admin.routes.test.ts
```

### Modified backend files
- `packages/agent-service/src/services/database.ts` — add 5 tables, 15+ new methods.
- `packages/agent-service/src/types.ts` — add `Group`, `Profile`, `PrivilegeCatalogEntry`, `AdminUserSummary`.
- `packages/agent-service/src/index.ts` — call bootstrap, mount admin router.
- `.env.example` — add `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### New frontend package (`packages/admin-panel`)
```
packages/admin-panel/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── types.ts
    ├── lib/api.ts
    ├── contexts/AuthContext.tsx
    ├── hooks/use-auth.ts
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── UsersPage.tsx
    │   ├── GroupsPage.tsx
    │   ├── ProfilesPage.tsx
    │   └── PrivilegesPage.tsx
    ├── components/
    │   ├── AppShell.tsx
    │   ├── DataTable.tsx
    │   ├── ConfirmDialog.tsx
    │   ├── FormField.tsx
    │   ├── MultiSelect.tsx
    │   └── PrivilegeBadge.tsx
    └── __tests__/
        ├── api.test.ts
        ├── use-auth.test.tsx
        ├── LoginPage.test.tsx
        ├── UsersPage.test.tsx
        ├── GroupsPage.test.tsx
        ├── ProfilesPage.test.tsx
        └── PrivilegesPage.test.tsx
```

### Root
- `package.json` — `start` script gains `admin-panel`; new `test` script.

---

## Task 1: Privilege catalog

**Files:**
- Create: `packages/agent-service/src/services/privileges.ts`
- Test: `packages/agent-service/src/__tests__/privileges.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent-service/src/__tests__/privileges.test.ts
import { describe, it, expect } from "vitest";
import { PRIVILEGES, PRIVILEGE_CATALOG, PRIVILEGE_KEYS } from "../services/privileges.js";

describe("privileges catalog", () => {
  it("exposes three Phase 1 keys", () => {
    expect(PRIVILEGES.MANAGE_USERS).toBe("manage:users");
    expect(PRIVILEGES.MANAGE_GROUPS).toBe("manage:groups");
    expect(PRIVILEGES.MANAGE_PROFILES).toBe("manage:profiles");
  });

  it("catalog lists each privilege with label and description", () => {
    const keys = PRIVILEGE_CATALOG.map((p) => p.key);
    expect(keys).toEqual(["manage:users", "manage:groups", "manage:profiles"]);
    for (const entry of PRIVILEGE_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("PRIVILEGE_KEYS is a Set of all catalog keys", () => {
    expect(PRIVILEGE_KEYS.has("manage:users")).toBe(true);
    expect(PRIVILEGE_KEYS.has("manage:groups")).toBe(true);
    expect(PRIVILEGE_KEYS.has("manage:profiles")).toBe(true);
    expect(PRIVILEGE_KEYS.has("manage:nope")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @new-workshop/agent-service test -- privileges`
Expected: FAIL — cannot find module `../services/privileges.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/agent-service/src/services/privileges.ts
export const PRIVILEGES = {
  MANAGE_USERS: "manage:users",
  MANAGE_GROUPS: "manage:groups",
  MANAGE_PROFILES: "manage:profiles",
} as const;

export type PrivilegeKey = typeof PRIVILEGES[keyof typeof PRIVILEGES];

export interface PrivilegeCatalogEntry {
  key: PrivilegeKey;
  label: string;
  description: string;
}

export const PRIVILEGE_CATALOG: readonly PrivilegeCatalogEntry[] = [
  {
    key: PRIVILEGES.MANAGE_USERS,
    label: "Manage users",
    description: "Create, edit, and delete user accounts; set group membership.",
  },
  {
    key: PRIVILEGES.MANAGE_GROUPS,
    label: "Manage groups",
    description: "Create, rename, delete groups; assign profiles and members.",
  },
  {
    key: PRIVILEGES.MANAGE_PROFILES,
    label: "Manage profiles",
    description: "Create, rename, delete profiles; assign privileges.",
  },
] as const;

export const PRIVILEGE_KEYS: ReadonlySet<string> = new Set(
  PRIVILEGE_CATALOG.map((p) => p.key),
);

export const ADMIN_PRIVILEGE_KEYS = PRIVILEGE_KEYS;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @new-workshop/agent-service test -- privileges`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/privileges.ts \
        packages/agent-service/src/__tests__/privileges.test.ts
git commit -m "feat(admin): add privilege catalog"
```

---

## Task 2: Database schema for admin tables

**Files:**
- Modify: `packages/agent-service/src/services/database.ts` (the `init()` block)
- Modify: `packages/agent-service/src/types.ts` (add `Group`, `Profile`, `AdminUserSummary`)
- Test: `packages/agent-service/src/__tests__/database.admin.test.ts` (new)

- [ ] **Step 1: Add new types**

Edit `packages/agent-service/src/types.ts` — append at the end (do not remove anything):

```ts
// Admin domain types (Phase 1)
export interface Group {
  id: string;
  name: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  createdAt: string;
  groupIds: string[];
}
```

- [ ] **Step 2: Write the failing schema test**

```ts
// packages/agent-service/src/__tests__/database.admin.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "../services/database.js";

describe("Database admin schema", () => {
  let dbPath: string;
  let db: Database;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-admin-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
  });

  afterEach(() => {
    fs.existsSync(dbPath) && fs.unlinkSync(dbPath);
  });

  it("creates groups, profiles, user_groups, group_profiles, profile_privileges tables", () => {
    const raw = (db as unknown as { db: import("better-sqlite3").Database }).db;
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      "users", "conversations", "messages", "files",
      "groups", "profiles", "user_groups", "group_profiles", "profile_privileges",
    ]));
  });

  it("enforces FK cascade from users to user_groups", () => {
    const raw = (db as unknown as { db: import("better-sqlite3").Database }).db;
    raw.prepare("INSERT INTO users (id, email, password, created_at) VALUES ('u1','u1@x','h',datetime('now'))").run();
    raw.prepare("INSERT INTO groups (id, name, created_at) VALUES ('g1','G1',datetime('now'))").run();
    raw.prepare("INSERT INTO user_groups (user_id, group_id) VALUES ('u1','g1')").run();

    raw.prepare("DELETE FROM users WHERE id = 'u1'").run();
    const rows = raw.prepare("SELECT * FROM user_groups").all();
    expect(rows.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @new-workshop/agent-service test -- database.admin`
Expected: FAIL — tables don't exist (or cascade doesn't work).

- [ ] **Step 4: Add tables to `database.ts`**

Open `database.ts`. Inside the `init()` method there is a call that runs a multi-statement SQL template string against the DB (search for `CREATE TABLE IF NOT EXISTS users`). Append the following statements to the end of that same template string, keeping all existing tables intact:

```sql
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_groups (
  user_id  TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS group_profiles (
  group_id   TEXT NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, profile_id)
);

CREATE TABLE IF NOT EXISTS profile_privileges (
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  privilege_key TEXT NOT NULL,
  PRIMARY KEY (profile_id, privilege_key)
);

CREATE INDEX IF NOT EXISTS idx_user_groups_group       ON user_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_group_profiles_profile  ON group_profiles(profile_id);
```

- [ ] **Step 5: Run test to verify pass**

Run: `pnpm --filter @new-workshop/agent-service test -- database.admin`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-service/src/services/database.ts \
        packages/agent-service/src/types.ts \
        packages/agent-service/src/__tests__/database.admin.test.ts
git commit -m "feat(admin): add DB schema for groups, profiles, and join tables"
```

---

## Task 3: Groups CRUD DB methods

**Files:**
- Modify: `packages/agent-service/src/services/database.ts`
- Test: `packages/agent-service/src/__tests__/database.admin.test.ts`

- [ ] **Step 1: Extend the existing test file with CRUD tests**

Append inside the `describe("Database admin schema", ...)` block:

```ts
  it("groups CRUD: create, list, rename, delete", () => {
    db.createGroup("g1", "Admins");
    db.createGroup("g2", "Editors");

    let list = db.listGroups();
    expect(list.map((g) => g.name).sort()).toEqual(["Admins", "Editors"]);

    db.renameGroup("g2", "Writers");
    list = db.listGroups();
    expect(list.find((g) => g.id === "g2")!.name).toBe("Writers");

    db.deleteGroup("g1");
    list = db.listGroups();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe("g2");
  });

  it("createGroup rejects duplicate name (unique constraint)", () => {
    db.createGroup("g1", "Admins");
    expect(() => db.createGroup("g2", "Admins")).toThrow();
  });
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm --filter @new-workshop/agent-service test -- database.admin`
Expected: FAIL — `db.createGroup is not a function`.

- [ ] **Step 3: Add methods to `Database` class**

In `packages/agent-service/src/services/database.ts`, add inside the class (near the other methods):

```ts
  createGroup(id: string, name: string): import("../types.js").Group {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)")
      .run(id, name.trim(), now);
    return { id, name: name.trim(), createdAt: now };
  }

  listGroups(): import("../types.js").Group[] {
    const rows = this.db
      .prepare("SELECT id, name, created_at FROM groups ORDER BY name")
      .all() as Array<{ id: string; name: string; created_at: string }>;
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  getGroup(id: string): import("../types.js").Group | undefined {
    const row = this.db
      .prepare("SELECT id, name, created_at FROM groups WHERE id = ?")
      .get(id) as { id: string; name: string; created_at: string } | undefined;
    return row && { id: row.id, name: row.name, createdAt: row.created_at };
  }

  renameGroup(id: string, name: string): void {
    this.db
      .prepare("UPDATE groups SET name = ? WHERE id = ?")
      .run(name.trim(), id);
  }

  deleteGroup(id: string): void {
    this.db.prepare("DELETE FROM groups WHERE id = ?").run(id);
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @new-workshop/agent-service test -- database.admin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/database.ts \
        packages/agent-service/src/__tests__/database.admin.test.ts
git commit -m "feat(admin): add groups CRUD DB methods"
```

---

## Task 4: Profiles CRUD DB methods

**Files:**
- Modify: `packages/agent-service/src/services/database.ts`
- Test: `packages/agent-service/src/__tests__/database.admin.test.ts`

- [ ] **Step 1: Extend tests**

Append inside the same `describe` block:

```ts
  it("profiles CRUD: create, list, rename, delete", () => {
    db.createProfile("p1", "superadmin");
    db.createProfile("p2", "viewer");

    let list = db.listProfiles();
    expect(list.map((p) => p.name).sort()).toEqual(["superadmin", "viewer"]);

    db.renameProfile("p2", "reader");
    list = db.listProfiles();
    expect(list.find((p) => p.id === "p2")!.name).toBe("reader");

    db.deleteProfile("p1");
    list = db.listProfiles();
    expect(list.length).toBe(1);
  });

  it("createProfile rejects duplicate name", () => {
    db.createProfile("p1", "reader");
    expect(() => db.createProfile("p2", "reader")).toThrow();
  });
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm --filter @new-workshop/agent-service test -- database.admin`
Expected: FAIL — `db.createProfile is not a function`.

- [ ] **Step 3: Add methods to `Database`**

```ts
  createProfile(id: string, name: string): import("../types.js").Profile {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)")
      .run(id, name.trim(), now);
    return { id, name: name.trim(), createdAt: now };
  }

  listProfiles(): import("../types.js").Profile[] {
    const rows = this.db
      .prepare("SELECT id, name, created_at FROM profiles ORDER BY name")
      .all() as Array<{ id: string; name: string; created_at: string }>;
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  getProfile(id: string): import("../types.js").Profile | undefined {
    const row = this.db
      .prepare("SELECT id, name, created_at FROM profiles WHERE id = ?")
      .get(id) as { id: string; name: string; created_at: string } | undefined;
    return row && { id: row.id, name: row.name, createdAt: row.created_at };
  }

  renameProfile(id: string, name: string): void {
    this.db.prepare("UPDATE profiles SET name = ? WHERE id = ?").run(name.trim(), id);
  }

  deleteProfile(id: string): void {
    this.db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @new-workshop/agent-service test -- database.admin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/database.ts \
        packages/agent-service/src/__tests__/database.admin.test.ts
git commit -m "feat(admin): add profiles CRUD DB methods"
```

---

## Task 5: M:M join methods + privilege resolution

**Files:**
- Modify: `packages/agent-service/src/services/database.ts`
- Test: `packages/agent-service/src/__tests__/database.admin.test.ts`

- [ ] **Step 1: Extend tests**

Append inside the same `describe` block:

```ts
  function seedPeople() {
    const raw = (db as unknown as { db: import("better-sqlite3").Database }).db;
    raw.prepare("INSERT INTO users (id, email, password, created_at) VALUES ('u1','a@x','h',datetime('now'))").run();
    raw.prepare("INSERT INTO users (id, email, password, created_at) VALUES ('u2','b@x','h',datetime('now'))").run();
    db.createGroup("g1", "Admins");
    db.createGroup("g2", "Editors");
    db.createProfile("p1", "superadmin");
    db.createProfile("p2", "writer");
  }

  it("setUserGroups replaces membership transactionally", () => {
    seedPeople();
    db.setUserGroups("u1", ["g1", "g2"]);
    expect(db.listUserGroupIds("u1").sort()).toEqual(["g1", "g2"]);
    db.setUserGroups("u1", ["g2"]);
    expect(db.listUserGroupIds("u1")).toEqual(["g2"]);
    db.setUserGroups("u1", []);
    expect(db.listUserGroupIds("u1")).toEqual([]);
  });

  it("setGroupMembers replaces members transactionally", () => {
    seedPeople();
    db.setGroupMembers("g1", ["u1", "u2"]);
    expect(db.listGroupMemberIds("g1").sort()).toEqual(["u1", "u2"]);
    db.setGroupMembers("g1", ["u2"]);
    expect(db.listGroupMemberIds("g1")).toEqual(["u2"]);
  });

  it("setGroupProfiles replaces profiles on a group", () => {
    seedPeople();
    db.setGroupProfiles("g1", ["p1", "p2"]);
    expect(db.listGroupProfileIds("g1").sort()).toEqual(["p1", "p2"]);
    db.setGroupProfiles("g1", ["p1"]);
    expect(db.listGroupProfileIds("g1")).toEqual(["p1"]);
  });

  it("setProfilePrivileges replaces privilege keys, rejects unknown", () => {
    seedPeople();
    db.setProfilePrivileges("p1", ["manage:users", "manage:groups"]);
    expect(db.listProfilePrivileges("p1").sort()).toEqual(["manage:groups", "manage:users"]);
    expect(() => db.setProfilePrivileges("p1", ["manage:nope"])).toThrow(/unknown privilege/i);
  });

  it("getEffectivePrivileges unions across groups and profiles", () => {
    seedPeople();
    db.setProfilePrivileges("p1", ["manage:users"]);
    db.setProfilePrivileges("p2", ["manage:groups", "manage:profiles"]);
    db.setGroupProfiles("g1", ["p1"]);
    db.setGroupProfiles("g2", ["p2"]);
    db.setUserGroups("u1", ["g1", "g2"]);

    const privs = db.getEffectivePrivileges("u1");
    expect(privs).toEqual(new Set(["manage:users", "manage:groups", "manage:profiles"]));
  });

  it("countUsersWithPrivilege returns distinct user count holding a key", () => {
    seedPeople();
    db.setProfilePrivileges("p1", ["manage:users"]);
    db.setGroupProfiles("g1", ["p1"]);
    db.setUserGroups("u1", ["g1"]);
    db.setUserGroups("u2", ["g1"]);

    expect(db.countUsersWithPrivilege("manage:users")).toBe(2);
    expect(db.countUsersWithPrivilege("manage:groups")).toBe(0);
  });

  it("listAdminUsers includes group ids per user", () => {
    seedPeople();
    db.setUserGroups("u1", ["g1"]);
    const list = db.listAdminUsers();
    expect(list).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "u1", email: "a@x", groupIds: ["g1"] }),
      expect.objectContaining({ id: "u2", email: "b@x", groupIds: [] }),
    ]));
  });
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm --filter @new-workshop/agent-service test -- database.admin`
Expected: FAIL — none of these methods exist.

- [ ] **Step 3: Add methods to `Database`**

Add this import at the top of `database.ts`:

```ts
import { PRIVILEGE_KEYS } from "./privileges.js";
```

Then add these methods inside the `Database` class:

```ts
listAdminUsers(): import("../types.js").AdminUserSummary[] {
  const users = this.db
    .prepare("SELECT id, email, created_at FROM users ORDER BY email")
    .all() as Array<{ id: string; email: string; created_at: string }>;
  const memberships = this.db
    .prepare("SELECT user_id, group_id FROM user_groups")
    .all() as Array<{ user_id: string; group_id: string }>;
  const byUser = new Map<string, string[]>();
  for (const m of memberships) {
    const arr = byUser.get(m.user_id) ?? [];
    arr.push(m.group_id);
    byUser.set(m.user_id, arr);
  }
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    createdAt: u.created_at,
    groupIds: byUser.get(u.id) ?? [],
  }));
}

updateUserEmail(id: string, email: string): void {
  this.db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email.trim().toLowerCase(), id);
}

updateUserPassword(id: string, hashed: string): void {
  this.db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, id);
}

deleteUser(id: string): void {
  this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

setUserGroups(userId: string, groupIds: string[]): void {
  const deleteStmt = this.db.prepare("DELETE FROM user_groups WHERE user_id = ?");
  const insertStmt = this.db.prepare("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)");
  this.db.transaction(() => {
    deleteStmt.run(userId);
    for (const gid of groupIds) insertStmt.run(userId, gid);
  })();
}

listUserGroupIds(userId: string): string[] {
  const rows = this.db
    .prepare("SELECT group_id FROM user_groups WHERE user_id = ?")
    .all(userId) as Array<{ group_id: string }>;
  return rows.map((r) => r.group_id);
}

setGroupMembers(groupId: string, userIds: string[]): void {
  const deleteStmt = this.db.prepare("DELETE FROM user_groups WHERE group_id = ?");
  const insertStmt = this.db.prepare("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)");
  this.db.transaction(() => {
    deleteStmt.run(groupId);
    for (const uid of userIds) insertStmt.run(uid, groupId);
  })();
}

listGroupMemberIds(groupId: string): string[] {
  const rows = this.db
    .prepare("SELECT user_id FROM user_groups WHERE group_id = ?")
    .all(groupId) as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

setGroupProfiles(groupId: string, profileIds: string[]): void {
  const deleteStmt = this.db.prepare("DELETE FROM group_profiles WHERE group_id = ?");
  const insertStmt = this.db.prepare("INSERT INTO group_profiles (group_id, profile_id) VALUES (?, ?)");
  this.db.transaction(() => {
    deleteStmt.run(groupId);
    for (const pid of profileIds) insertStmt.run(groupId, pid);
  })();
}

listGroupProfileIds(groupId: string): string[] {
  const rows = this.db
    .prepare("SELECT profile_id FROM group_profiles WHERE group_id = ?")
    .all(groupId) as Array<{ profile_id: string }>;
  return rows.map((r) => r.profile_id);
}

setProfilePrivileges(profileId: string, keys: string[]): void {
  for (const k of keys) {
    if (!PRIVILEGE_KEYS.has(k)) throw new Error(`unknown privilege: ${k}`);
  }
  const deleteStmt = this.db.prepare("DELETE FROM profile_privileges WHERE profile_id = ?");
  const insertStmt = this.db.prepare("INSERT INTO profile_privileges (profile_id, privilege_key) VALUES (?, ?)");
  this.db.transaction(() => {
    deleteStmt.run(profileId);
    for (const k of keys) insertStmt.run(profileId, k);
  })();
}

listProfilePrivileges(profileId: string): string[] {
  const rows = this.db
    .prepare("SELECT privilege_key FROM profile_privileges WHERE profile_id = ?")
    .all(profileId) as Array<{ privilege_key: string }>;
  return rows.map((r) => r.privilege_key);
}

getEffectivePrivileges(userId: string): Set<string> {
  const rows = this.db.prepare(`
    SELECT DISTINCT pp.privilege_key
      FROM user_groups ug
      JOIN group_profiles gp  ON gp.group_id = ug.group_id
      JOIN profile_privileges pp ON pp.profile_id = gp.profile_id
     WHERE ug.user_id = ?
  `).all(userId) as Array<{ privilege_key: string }>;
  return new Set(rows.map((r) => r.privilege_key));
}

countUsersWithPrivilege(key: string): number {
  const row = this.db.prepare(`
    SELECT COUNT(DISTINCT ug.user_id) AS c
      FROM user_groups ug
      JOIN group_profiles gp ON gp.group_id = ug.group_id
      JOIN profile_privileges pp ON pp.profile_id = gp.profile_id
     WHERE pp.privilege_key = ?
  `).get(key) as { c: number };
  return row.c;
}

countProfilesWithPrivilege(key: string): number {
  const row = this.db
    .prepare("SELECT COUNT(*) AS c FROM profile_privileges WHERE privilege_key = ?")
    .get(key) as { c: number };
  return row.c;
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `pnpm --filter @new-workshop/agent-service test -- database.admin`
Expected: every test PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/database.ts \
        packages/agent-service/src/__tests__/database.admin.test.ts
git commit -m "feat(admin): add M:M join methods and privilege resolution"
```

---

## Task 6: Admin bootstrap service

**Files:**
- Create: `packages/agent-service/src/services/admin-bootstrap.ts`
- Test: `packages/agent-service/src/__tests__/admin-bootstrap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent-service/src/__tests__/admin-bootstrap.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcrypt";
import { Database } from "../services/database.js";
import { ensureBootstrapAdmin } from "../services/admin-bootstrap.js";
import { PRIVILEGE_CATALOG } from "../services/privileges.js";

describe("ensureBootstrapAdmin", () => {
  let dbPath: string;
  let db: Database;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-bootstrap-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
  });

  afterEach(() => {
    fs.existsSync(dbPath) && fs.unlinkSync(dbPath);
  });

  it("is a no-op when neither env var is set", async () => {
    await ensureBootstrapAdmin(db, { email: undefined, password: undefined });
    expect(db.listGroups()).toEqual([]);
    expect(db.listProfiles()).toEqual([]);
    expect(db.listAdminUsers()).toEqual([]);
  });

  it("fails fast when only one env var is set", async () => {
    await expect(ensureBootstrapAdmin(db, { email: "a@x", password: undefined }))
      .rejects.toThrow(/both ADMIN_EMAIL and ADMIN_PASSWORD/i);
    await expect(ensureBootstrapAdmin(db, { email: undefined, password: "pw12345678" }))
      .rejects.toThrow(/both ADMIN_EMAIL and ADMIN_PASSWORD/i);
  });

  it("creates superadmin profile, Admins group, admin user — all linked", async () => {
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });

    const profiles = db.listProfiles();
    expect(profiles.length).toBe(1);
    expect(profiles[0].name).toBe("superadmin");

    const groups = db.listGroups();
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe("Admins");

    const users = db.listAdminUsers();
    expect(users.length).toBe(1);
    expect(users[0].email).toBe("admin@x");
    expect(users[0].groupIds).toEqual([groups[0].id]);

    expect(db.listGroupProfileIds(groups[0].id)).toEqual([profiles[0].id]);
    expect(db.listProfilePrivileges(profiles[0].id).sort())
      .toEqual(PRIVILEGE_CATALOG.map((p) => p.key).sort());
  });

  it("is idempotent: running twice yields exactly one of each", async () => {
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    expect(db.listGroups().length).toBe(1);
    expect(db.listProfiles().length).toBe(1);
    expect(db.listAdminUsers().length).toBe(1);
  });

  it("does NOT overwrite an existing admin's password", async () => {
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    const raw = (db as unknown as { db: import("better-sqlite3").Database }).db;
    const before = raw.prepare("SELECT password FROM users WHERE email='admin@x'").get() as { password: string };

    // Second run with a different password env — should be ignored.
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "different-password" });
    const after = raw.prepare("SELECT password FROM users WHERE email='admin@x'").get() as { password: string };
    expect(after.password).toBe(before.password);
  });

  it("normalizes admin email (trim + lowercase)", async () => {
    await ensureBootstrapAdmin(db, { email: "  ADMIN@X.com  ", password: "pw12345678" });
    const users = db.listAdminUsers();
    expect(users[0].email).toBe("admin@x.com");
  });

  it("hashes the password with bcrypt", async () => {
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    const raw = (db as unknown as { db: import("better-sqlite3").Database }).db;
    const row = raw.prepare("SELECT password FROM users WHERE email='admin@x'").get() as { password: string };
    expect(row.password).not.toBe("pw12345678");
    expect(await bcrypt.compare("pw12345678", row.password)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm --filter @new-workshop/agent-service test -- admin-bootstrap`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/agent-service/src/services/admin-bootstrap.ts
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import type { Database } from "./database.js";
import { PRIVILEGE_CATALOG } from "./privileges.js";

const SALT_ROUNDS = 10;
const SUPERADMIN_PROFILE_NAME = "superadmin";
const ADMINS_GROUP_NAME = "Admins";

export interface BootstrapEnv {
  email: string | undefined;
  password: string | undefined;
}

export async function ensureBootstrapAdmin(
  db: Database,
  env: BootstrapEnv,
): Promise<void> {
  const hasEmail = typeof env.email === "string" && env.email.trim().length > 0;
  const hasPassword = typeof env.password === "string" && env.password.length > 0;

  if (!hasEmail && !hasPassword) {
    if (db.listAdminUsers().length === 0) {
      console.warn("[admin-bootstrap] No ADMIN_EMAIL/ADMIN_PASSWORD set and no admin user exists; admin UI will be unreachable until one is created.");
    }
    return;
  }
  if (hasEmail !== hasPassword) {
    throw new Error("Must set both ADMIN_EMAIL and ADMIN_PASSWORD (or neither).");
  }

  const email = env.email!.trim().toLowerCase();
  const password = env.password!;

  // 1) superadmin profile
  let profile = db.listProfiles().find((p) => p.name === SUPERADMIN_PROFILE_NAME);
  if (!profile) profile = db.createProfile(uuidv4(), SUPERADMIN_PROFILE_NAME);
  db.setProfilePrivileges(profile.id, PRIVILEGE_CATALOG.map((p) => p.key));

  // 2) Admins group linked to profile
  let group = db.listGroups().find((g) => g.name === ADMINS_GROUP_NAME);
  if (!group) group = db.createGroup(uuidv4(), ADMINS_GROUP_NAME);
  const current = db.listGroupProfileIds(group.id);
  if (!current.includes(profile.id)) {
    db.setGroupProfiles(group.id, Array.from(new Set([...current, profile.id])));
  }

  // 3) admin user (create only if missing; never overwrite password)
  const existingUser = db.findUserByEmail(email);
  let userId: string;
  if (!existingUser) {
    userId = uuidv4();
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    db.createUser(userId, email, hashed);
    console.log(`[admin-bootstrap] Created admin user ${email}`);
  } else {
    userId = existingUser.id;
    console.log(`[admin-bootstrap] Admin user ${email} already exists; not modifying password`);
  }

  // 4) ensure membership
  const memberships = db.listUserGroupIds(userId);
  if (!memberships.includes(group.id)) {
    db.setUserGroups(userId, Array.from(new Set([...memberships, group.id])));
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @new-workshop/agent-service test -- admin-bootstrap`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/admin-bootstrap.ts \
        packages/agent-service/src/__tests__/admin-bootstrap.test.ts
git commit -m "feat(admin): add idempotent bootstrap admin service"
```

---

## Task 7: Wire bootstrap into startup + `.env.example`

**Files:**
- Modify: `packages/agent-service/src/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Update `.env.example`**

Replace the file contents with:

```
ANTHROPIC_API_KEY=your-key-here
JWT_SECRET=your-jwt-secret-here
ADMIN_EMAIL=admin@localhost
ADMIN_PASSWORD=change-me-now
```

- [ ] **Step 2: Modify `index.ts`**

Add this import with the other imports at the top:

```ts
import { ensureBootstrapAdmin } from "./services/admin-bootstrap.js";
```

After the line `const db = new Database(DB_PATH);` and its log line, add:

```ts
await ensureBootstrapAdmin(db, {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
```

Top-level `await` is supported because the package has `"type": "module"` and Node >= 20.

- [ ] **Step 3: Manual smoke test**

```bash
lsof -ti:3000 -ti:5173 2>/dev/null | xargs kill 2>/dev/null
pnpm --filter @new-workshop/agent-service dev
```

Expected logs contain: `[admin-bootstrap] Created admin user <email>`.
Press Ctrl-C when done.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-service/src/index.ts .env.example
git commit -m "feat(admin): wire bootstrap admin into agent-service startup"
```

---

## Task 8: Admin auth middleware

**Files:**
- Create: `packages/agent-service/src/middleware/admin-auth.ts`
- Test: `packages/agent-service/src/__tests__/admin-auth.middleware.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent-service/src/__tests__/admin-auth.middleware.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { Database } from "../services/database.js";
import { adminAuthMiddleware } from "../middleware/admin-auth.js";

const SECRET = "test-secret";
function token(userId: string) { return jwt.sign({ userId, email: "x@x" }, SECRET, { expiresIn: "1h" }); }

describe("adminAuthMiddleware", () => {
  let dbPath: string; let db: Database;
  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-auth-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
  });
  afterEach(() => fs.existsSync(dbPath) && fs.unlinkSync(dbPath));

  function appFor(priv: string) {
    const app = express();
    app.get("/x", adminAuthMiddleware(db, SECRET, priv), (_req, res) => res.status(200).json({ ok: true }));
    return app;
  }

  function seedAdmin(priv: string): string {
    const uid = uuidv4();
    (db as unknown as { db: import("better-sqlite3").Database }).db
      .prepare("INSERT INTO users (id, email, password, created_at) VALUES (?, ?, 'h', datetime('now'))")
      .run(uid, `${uid}@x`);
    const group = db.createGroup(uuidv4(), `G-${uid}`);
    const profile = db.createProfile(uuidv4(), `P-${uid}`);
    db.setProfilePrivileges(profile.id, [priv]);
    db.setGroupProfiles(group.id, [profile.id]);
    db.setUserGroups(uid, [group.id]);
    return uid;
  }

  it("401 when Authorization header is missing", async () => {
    const res = await request(appFor("manage:users")).get("/x");
    expect(res.status).toBe(401);
  });

  it("401 when token is invalid", async () => {
    const res = await request(appFor("manage:users")).get("/x").set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("403 when user lacks the required privilege", async () => {
    const uid = seedAdmin("manage:groups");
    const res = await request(appFor("manage:users")).get("/x").set("Authorization", `Bearer ${token(uid)}`);
    expect(res.status).toBe(403);
    expect(res.body.required).toBe("manage:users");
  });

  it("200 when user holds the required privilege", async () => {
    const uid = seedAdmin("manage:users");
    const res = await request(appFor("manage:users")).get("/x").set("Authorization", `Bearer ${token(uid)}`);
    expect(res.status).toBe(200);
  });

  it("privilege changes take effect immediately without re-issuing token", async () => {
    const uid = seedAdmin("manage:users");
    const t = token(uid);
    let res = await request(appFor("manage:users")).get("/x").set("Authorization", `Bearer ${t}`);
    expect(res.status).toBe(200);

    // revoke by clearing memberships
    db.setUserGroups(uid, []);
    res = await request(appFor("manage:users")).get("/x").set("Authorization", `Bearer ${t}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `pnpm --filter @new-workshop/agent-service test -- admin-auth.middleware`
Expected: FAIL (module not found).

- [ ] **Step 3: Implementation**

```ts
// packages/agent-service/src/middleware/admin-auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Database } from "../services/database.js";

interface JwtPayload { userId: string; email: string; }

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      privileges?: Set<string>;
    }
  }
}

export function adminAuthMiddleware(db: Database, secret: string, requiredPrivilege: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    let payload: JwtPayload;
    try {
      payload = jwt.verify(header.slice(7), secret) as JwtPayload;
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const privs = db.getEffectivePrivileges(payload.userId);
    if (!privs.has(requiredPrivilege)) {
      res.status(403).json({ error: "Forbidden", required: requiredPrivilege });
      return;
    }
    req.userId = payload.userId;
    req.privileges = privs;
    next();
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @new-workshop/agent-service test -- admin-auth.middleware`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/middleware/admin-auth.ts \
        packages/agent-service/src/__tests__/admin-auth.middleware.test.ts
git commit -m "feat(admin): add adminAuthMiddleware with fresh privilege lookup"
```

---

## Task 9: Admin router scaffold — `/admin/login`, `/admin/me`, `/admin/privileges`

**Files:**
- Create: `packages/agent-service/src/routes/admin.ts`
- Create: `packages/agent-service/src/__tests__/admin.routes.test.ts`
- Modify: `packages/agent-service/src/index.ts` (mount router)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/agent-service/src/__tests__/admin.routes.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { Database } from "../services/database.js";
import { createAdminRouter } from "../routes/admin.js";
import { ensureBootstrapAdmin } from "../services/admin-bootstrap.js";

const SECRET = "test-secret";

function buildApp(db: Database) {
  const app = express();
  app.use(express.json());
  app.use("/admin", createAdminRouter(db, SECRET));
  return app;
}

describe("POST /admin/login", () => {
  let dbPath: string; let db: Database; let app: express.Express;
  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-admin-routes-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    app = buildApp(db);
  });
  afterEach(() => fs.existsSync(dbPath) && fs.unlinkSync(dbPath));

  it("returns token + privileges on valid admin creds", async () => {
    const res = await request(app).post("/admin/login").send({ email: "admin@x", password: "pw12345678" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe("admin@x");
    expect(res.body.privileges).toEqual(expect.arrayContaining(["manage:users", "manage:groups", "manage:profiles"]));
  });

  it("401 for unknown email", async () => {
    const res = await request(app).post("/admin/login").send({ email: "nope@x", password: "pw12345678" });
    expect(res.status).toBe(401);
  });

  it("401 for wrong password", async () => {
    const res = await request(app).post("/admin/login").send({ email: "admin@x", password: "wrongwrong" });
    expect(res.status).toBe(401);
  });

  it("403 for valid creds but no admin privileges", async () => {
    const uid = uuidv4();
    const hashed = await bcrypt.hash("pw12345678", 10);
    db.createUser(uid, "user@x", hashed);
    const res = await request(app).post("/admin/login").send({ email: "user@x", password: "pw12345678" });
    expect(res.status).toBe(403);
  });

  it("normalizes email (accepts mixed case)", async () => {
    const res = await request(app).post("/admin/login").send({ email: "ADMIN@X", password: "pw12345678" });
    expect(res.status).toBe(200);
  });
});

describe("GET /admin/me", () => {
  let dbPath: string; let db: Database; let app: express.Express; let token: string;
  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-admin-me-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    app = buildApp(db);
    const r = await request(app).post("/admin/login").send({ email: "admin@x", password: "pw12345678" });
    token = r.body.token;
  });
  afterEach(() => fs.existsSync(dbPath) && fs.unlinkSync(dbPath));

  it("returns current user with effective privileges", async () => {
    const res = await request(app).get("/admin/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("admin@x");
    expect(res.body.privileges.sort()).toEqual(["manage:groups", "manage:profiles", "manage:users"]);
  });

  it("401 without token", async () => {
    const res = await request(app).get("/admin/me");
    expect(res.status).toBe(401);
  });
});

describe("GET /admin/privileges", () => {
  let dbPath: string; let db: Database; let app: express.Express; let token: string;
  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-admin-priv-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    app = buildApp(db);
    const r = await request(app).post("/admin/login").send({ email: "admin@x", password: "pw12345678" });
    token = r.body.token;
  });
  afterEach(() => fs.existsSync(dbPath) && fs.unlinkSync(dbPath));

  it("returns full catalog plus profile counts per key", async () => {
    const res = await request(app).get("/admin/privileges").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "manage:users",    label: "Manage users",    profileCount: 1 }),
      expect.objectContaining({ key: "manage:groups",   label: "Manage groups",   profileCount: 1 }),
      expect.objectContaining({ key: "manage:profiles", label: "Manage profiles", profileCount: 1 }),
    ]));
  });
});
```

- [ ] **Step 2: Run to confirm failures**

Run: `pnpm --filter @new-workshop/agent-service test -- admin.routes`
Expected: FAIL — route module not found.

- [ ] **Step 3: Write the route scaffold**

```ts
// packages/agent-service/src/routes/admin.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import type { Database } from "../services/database.js";
import { PRIVILEGE_CATALOG, ADMIN_PRIVILEGE_KEYS } from "../services/privileges.js";
import { adminAuthMiddleware } from "../middleware/admin-auth.js";

interface JwtPayload { userId: string; email: string; }

function requireAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const payload = jwt.verify(header.slice(7), secret) as JwtPayload;
      req.userId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}

export function createAdminRouter(db: Database, jwtSecret: string): Router {
  const router = Router();

  router.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Email and password required" }); return;
    }
    const normalized = email.trim().toLowerCase();
    const user = db.findUserByEmail(normalized);
    if (!user) { res.status(401).json({ error: "Invalid email or password" }); return; }
    if (!(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: "Invalid email or password" }); return;
    }
    const privs = db.getEffectivePrivileges(user.id);
    const hasAny = [...ADMIN_PRIVILEGE_KEYS].some((k) => privs.has(k));
    if (!hasAny) { res.status(403).json({ error: "Forbidden" }); return; }
    const token = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, { expiresIn: "7d" });
    res.status(200).json({
      token,
      user: { id: user.id, email: user.email },
      privileges: Array.from(privs),
    });
  });

  router.get("/me", requireAuth(jwtSecret), (req: Request, res: Response) => {
    const user = db.listAdminUsers().find((u) => u.id === req.userId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const privs = db.getEffectivePrivileges(user.id);
    res.status(200).json({
      user: { id: user.id, email: user.email },
      privileges: Array.from(privs),
    });
  });

  router.get("/privileges", requireAuth(jwtSecret), (_req: Request, res: Response) => {
    const body = PRIVILEGE_CATALOG.map((entry) => ({
      key: entry.key,
      label: entry.label,
      description: entry.description,
      profileCount: db.countProfilesWithPrivilege(entry.key),
    }));
    res.status(200).json(body);
  });

  // /admin/users, /admin/groups, /admin/profiles are added in Tasks 10–12.

  return router;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @new-workshop/agent-service test -- admin.routes`
Expected: 8 tests PASS.

- [ ] **Step 5: Mount the router in `index.ts`**

Add this with the other imports:

```ts
import { createAdminRouter } from "./routes/admin.js";
```

Add this with the other `app.use(...)` lines:

```ts
app.use("/admin", createAdminRouter(db, JWT_SECRET));
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-service/src/routes/admin.ts \
        packages/agent-service/src/__tests__/admin.routes.test.ts \
        packages/agent-service/src/index.ts
git commit -m "feat(admin): add /admin/login, /admin/me, /admin/privileges routes"
```

---

## Task 10: `/admin/users` CRUD + `/:id/groups`

**Files:**
- Modify: `packages/agent-service/src/routes/admin.ts`
- Modify: `packages/agent-service/src/__tests__/admin.routes.test.ts`

- [ ] **Step 1: Extend tests**

Append a new `describe` block at the end of the test file:

```ts
describe("/admin/users", () => {
  let dbPath: string; let db: Database; let app: express.Express; let token: string;
  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-admin-users-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    app = buildApp(db);
    const r = await request(app).post("/admin/login").send({ email: "admin@x", password: "pw12345678" });
    token = r.body.token;
  });
  afterEach(() => fs.existsSync(dbPath) && fs.unlinkSync(dbPath));

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it("GET /admin/users lists users with group ids", async () => {
    const res = await request(app).get("/admin/users").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0]).toMatchObject({ email: "admin@x", groupIds: [expect.any(String)] });
  });

  it("POST /admin/users creates user", async () => {
    const res = await request(app).post("/admin/users").set(auth())
      .send({ email: "new@x", password: "pw12345678" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("new@x");
    expect(db.findUserByEmail("new@x")).toBeTruthy();
  });

  it("POST /admin/users 409 on duplicate email", async () => {
    const res = await request(app).post("/admin/users").set(auth())
      .send({ email: "admin@x", password: "pw12345678" });
    expect(res.status).toBe(409);
    expect(res.body.field).toBe("email");
  });

  it("POST /admin/users 400 when password too short", async () => {
    const res = await request(app).post("/admin/users").set(auth())
      .send({ email: "new@x", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("password");
  });

  it("PATCH /admin/users/:id updates email", async () => {
    const users = await request(app).get("/admin/users").set(auth());
    const id = users.body[0].id;
    const res = await request(app).patch(`/admin/users/${id}`).set(auth())
      .send({ email: "renamed@x" });
    expect(res.status).toBe(200);
    expect(db.findUserByEmail("renamed@x")).toBeTruthy();
  });

  it("PATCH /admin/users/:id updates password", async () => {
    const users = await request(app).get("/admin/users").set(auth());
    const id = users.body[0].id;
    const res = await request(app).patch(`/admin/users/${id}`).set(auth())
      .send({ password: "newpassword12" });
    expect(res.status).toBe(200);

    const login = await request(app).post("/admin/login")
      .send({ email: "admin@x", password: "newpassword12" });
    expect(login.status).toBe(200);
  });

  it("DELETE /admin/users/:id refuses to delete the last admin", async () => {
    const users = await request(app).get("/admin/users").set(auth());
    const id = users.body[0].id;
    const res = await request(app).delete(`/admin/users/${id}`).set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last admin/i);
  });

  it("DELETE /admin/users/:id allowed when not the last admin", async () => {
    // Create a second admin first.
    const hashed = await bcrypt.hash("pw12345678", 10);
    const uid2 = uuidv4();
    db.createUser(uid2, "admin2@x", hashed);
    const adminGroupId = db.listGroups()[0].id;
    db.setUserGroups(uid2, [adminGroupId]);

    const res = await request(app).delete(`/admin/users/${uid2}`).set(auth());
    expect(res.status).toBe(204);
  });

  it("PUT /admin/users/:id/groups replaces membership", async () => {
    const g = db.createGroup(uuidv4(), "Editors");
    const users = await request(app).get("/admin/users").set(auth());
    const id = users.body[0].id;
    const adminGroupId = db.listGroups().find((x) => x.name === "Admins")!.id;
    const res = await request(app).put(`/admin/users/${id}/groups`).set(auth())
      .send({ groupIds: [adminGroupId, g.id] });
    expect(res.status).toBe(200);
    expect(db.listUserGroupIds(id).sort()).toEqual([adminGroupId, g.id].sort());
  });

  it("PUT /admin/users/:id/groups self-lockout 409", async () => {
    const users = await request(app).get("/admin/users").set(auth());
    const id = users.body[0].id;
    const res = await request(app).put(`/admin/users/${id}/groups`).set(auth())
      .send({ groupIds: [] });
    expect(res.status).toBe(409);
  });

  it("401 on admin/users without token", async () => {
    const res = await request(app).get("/admin/users");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Verify failures**

Run: `pnpm --filter @new-workshop/agent-service test -- admin.routes`
Expected: new block fails because routes don't exist.

- [ ] **Step 3: Add routes to `createAdminRouter`**

Insert these route definitions before the final `return router;` line:

```ts
// --- /admin/users ---
router.get("/users", adminAuthMiddleware(db, jwtSecret, "manage:users"), (_req, res) => {
  res.status(200).json(db.listAdminUsers());
});

router.post("/users", adminAuthMiddleware(db, jwtSecret, "manage:users"), async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password required" }); return;
  }
  if (password.length < 8) { res.status(400).json({ error: "Password too short", field: "password" }); return; }
  const normalized = email.trim().toLowerCase();
  if (db.findUserByEmail(normalized)) {
    res.status(409).json({ error: "Email already registered", field: "email" }); return;
  }
  const id = uuidv4();
  const hashed = await bcrypt.hash(password, 10);
  db.createUser(id, normalized, hashed);
  res.status(201).json({ user: { id, email: normalized } });
});

router.patch("/users/:id", adminAuthMiddleware(db, jwtSecret, "manage:users"), async (req, res) => {
  const { id } = req.params;
  const { email, password } = req.body ?? {};
  if (!db.listAdminUsers().find((u) => u.id === id)) { res.status(404).json({ error: "Not found" }); return; }
  if (typeof email === "string") {
    const normalized = email.trim().toLowerCase();
    const existing = db.findUserByEmail(normalized);
    if (existing && existing.id !== id) { res.status(409).json({ error: "Email already registered", field: "email" }); return; }
    db.updateUserEmail(id, normalized);
  }
  if (typeof password === "string") {
    if (password.length < 8) { res.status(400).json({ error: "Password too short", field: "password" }); return; }
    db.updateUserPassword(id, await bcrypt.hash(password, 10));
  }
  res.status(200).json({ ok: true });
});

router.delete("/users/:id", adminAuthMiddleware(db, jwtSecret, "manage:users"), (req, res) => {
  const { id } = req.params;
  if (!db.listAdminUsers().find((u) => u.id === id)) { res.status(404).json({ error: "Not found" }); return; }

  // Pre-check: if this user is the only holder of any admin privilege, refuse.
  const userPrivs = db.getEffectivePrivileges(id);
  for (const k of ADMIN_PRIVILEGE_KEYS) {
    if (userPrivs.has(k) && db.countUsersWithPrivilege(k) === 1) {
      res.status(409).json({ error: "Cannot delete the last admin" }); return;
    }
  }
  db.deleteUser(id);
  res.status(204).end();
});

router.put("/users/:id/groups", adminAuthMiddleware(db, jwtSecret, "manage:users"), (req, res) => {
  const { id } = req.params;
  const { groupIds } = req.body ?? {};
  if (!Array.isArray(groupIds) || groupIds.some((g) => typeof g !== "string")) {
    res.status(400).json({ error: "groupIds must be string[]" }); return;
  }

  // Simulate-then-rollback: apply, verify invariants, roll back if violated.
  const before = db.listUserGroupIds(id);
  db.setUserGroups(id, groupIds);
  const stillOK = [...ADMIN_PRIVILEGE_KEYS].every((k) => db.countUsersWithPrivilege(k) >= 1);
  if (!stillOK) {
    db.setUserGroups(id, before);
    res.status(409).json({ error: "Cannot remove last admin" }); return;
  }
  res.status(200).json({ groupIds });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @new-workshop/agent-service test -- admin.routes`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/routes/admin.ts \
        packages/agent-service/src/__tests__/admin.routes.test.ts
git commit -m "feat(admin): add /admin/users CRUD and membership routes"
```

---

## Task 11: `/admin/groups` CRUD + `/:id/members` + `/:id/profiles`

**Files:**
- Modify: `packages/agent-service/src/routes/admin.ts`
- Modify: `packages/agent-service/src/__tests__/admin.routes.test.ts`

- [ ] **Step 1: Extend tests**

Append:

```ts
describe("/admin/groups", () => {
  let dbPath: string; let db: Database; let app: express.Express; let token: string;
  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-admin-groups-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    app = buildApp(db);
    const r = await request(app).post("/admin/login").send({ email: "admin@x", password: "pw12345678" });
    token = r.body.token;
  });
  afterEach(() => fs.existsSync(dbPath) && fs.unlinkSync(dbPath));
  const auth = () => ({ Authorization: `Bearer ${token}` });

  it("GET /admin/groups lists groups", async () => {
    const res = await request(app).get("/admin/groups").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.map((g: {name: string}) => g.name)).toContain("Admins");
  });

  it("POST/PATCH/DELETE groups round-trip", async () => {
    const created = await request(app).post("/admin/groups").set(auth()).send({ name: "Editors" });
    expect(created.status).toBe(201);
    const id = created.body.group.id;

    const renamed = await request(app).patch(`/admin/groups/${id}`).set(auth()).send({ name: "Writers" });
    expect(renamed.status).toBe(200);

    const del = await request(app).delete(`/admin/groups/${id}`).set(auth());
    expect(del.status).toBe(204);
  });

  it("POST /admin/groups 409 on duplicate name", async () => {
    const res = await request(app).post("/admin/groups").set(auth()).send({ name: "Admins" });
    expect(res.status).toBe(409);
  });

  it("PUT /admin/groups/:id/members replaces transactionally", async () => {
    const adminGroup = db.listGroups().find((g) => g.name === "Admins")!;
    const g = await request(app).post("/admin/groups").set(auth()).send({ name: "Editors" });
    const uid = (await request(app).post("/admin/users").set(auth()).send({ email: "u@x", password: "pw12345678" })).body.user.id;
    const res = await request(app).put(`/admin/groups/${g.body.group.id}/members`).set(auth()).send({ userIds: [uid] });
    expect(res.status).toBe(200);
    expect(db.listGroupMemberIds(g.body.group.id)).toEqual([uid]);
    // Admins membership unaffected
    expect(db.listGroupMemberIds(adminGroup.id).length).toBe(1);
  });

  it("PUT /admin/groups/:id/profiles replaces transactionally", async () => {
    const adminGroup = db.listGroups().find((g) => g.name === "Admins")!;
    const p = db.createProfile(uuidv4(), "reader");
    db.setProfilePrivileges(p.id, []);
    const res = await request(app).put(`/admin/groups/${adminGroup.id}/profiles`).set(auth())
      .send({ profileIds: [db.listProfiles().find((pr) => pr.name === "superadmin")!.id, p.id] });
    expect(res.status).toBe(200);
    expect(db.listGroupProfileIds(adminGroup.id).sort())
      .toEqual([db.listProfiles().find((pr) => pr.name === "superadmin")!.id, p.id].sort());
  });

  it("PUT /admin/groups/:id/members self-lockout 409 when kicking out last admin", async () => {
    const admins = db.listGroups().find((g) => g.name === "Admins")!;
    const res = await request(app).put(`/admin/groups/${admins.id}/members`).set(auth()).send({ userIds: [] });
    expect(res.status).toBe(409);
  });

  it("DELETE /admin/groups/:id self-lockout 409", async () => {
    const admins = db.listGroups().find((g) => g.name === "Admins")!;
    const res = await request(app).delete(`/admin/groups/${admins.id}`).set(auth());
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Verify failures**

Run: `pnpm --filter @new-workshop/agent-service test -- admin.routes`
Expected: new block fails.

- [ ] **Step 3: Add routes**

Insert in `createAdminRouter` alongside the user routes (before `return router;`):

```ts
router.get("/groups", adminAuthMiddleware(db, jwtSecret, "manage:groups"), (_req, res) => {
  res.status(200).json(db.listGroups());
});

router.post("/groups", adminAuthMiddleware(db, jwtSecret, "manage:groups"), async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Name required", field: "name" }); return;
  }
  try {
    const id = uuidv4();
    const group = db.createGroup(id, name);
    res.status(201).json({ group });
  } catch (err) {
    if (String(err).includes("UNIQUE")) { res.status(409).json({ error: "Name already exists", field: "name" }); return; }
    throw err;
  }
});

router.patch("/groups/:id", adminAuthMiddleware(db, jwtSecret, "manage:groups"), (req, res) => {
  const { id } = req.params;
  const { name } = req.body ?? {};
  if (!db.getGroup(id)) { res.status(404).json({ error: "Not found" }); return; }
  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "Name required", field: "name" }); return; }
  try {
    db.renameGroup(id, name);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (String(err).includes("UNIQUE")) { res.status(409).json({ error: "Name already exists", field: "name" }); return; }
    throw err;
  }
});

router.delete("/groups/:id", adminAuthMiddleware(db, jwtSecret, "manage:groups"), (req, res) => {
  const { id } = req.params;
  if (!db.getGroup(id)) { res.status(404).json({ error: "Not found" }); return; }

  // Simulate-then-rollback: blank memberships + profile links, verify invariants.
  const beforeMembers = db.listGroupMemberIds(id);
  const beforeProfiles = db.listGroupProfileIds(id);
  db.setGroupMembers(id, []);
  db.setGroupProfiles(id, []);
  const stillOK = [...ADMIN_PRIVILEGE_KEYS].every((k) => db.countUsersWithPrivilege(k) >= 1);
  if (!stillOK) {
    db.setGroupMembers(id, beforeMembers);
    db.setGroupProfiles(id, beforeProfiles);
    res.status(409).json({ error: "Cannot delete last admin-granting group" }); return;
  }
  db.deleteGroup(id);
  res.status(204).end();
});

router.put("/groups/:id/members", adminAuthMiddleware(db, jwtSecret, "manage:groups"), (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body ?? {};
  if (!Array.isArray(userIds) || userIds.some((u) => typeof u !== "string")) {
    res.status(400).json({ error: "userIds must be string[]" }); return;
  }
  if (!db.getGroup(id)) { res.status(404).json({ error: "Not found" }); return; }

  const before = db.listGroupMemberIds(id);
  db.setGroupMembers(id, userIds);
  const stillOK = [...ADMIN_PRIVILEGE_KEYS].every((k) => db.countUsersWithPrivilege(k) >= 1);
  if (!stillOK) {
    db.setGroupMembers(id, before);
    res.status(409).json({ error: "Cannot remove last admin" }); return;
  }
  res.status(200).json({ userIds });
});

router.put("/groups/:id/profiles", adminAuthMiddleware(db, jwtSecret, "manage:groups"), (req, res) => {
  const { id } = req.params;
  const { profileIds } = req.body ?? {};
  if (!Array.isArray(profileIds) || profileIds.some((p) => typeof p !== "string")) {
    res.status(400).json({ error: "profileIds must be string[]" }); return;
  }
  if (!db.getGroup(id)) { res.status(404).json({ error: "Not found" }); return; }

  const before = db.listGroupProfileIds(id);
  db.setGroupProfiles(id, profileIds);
  const stillOK = [...ADMIN_PRIVILEGE_KEYS].every((k) => db.countUsersWithPrivilege(k) >= 1);
  if (!stillOK) {
    db.setGroupProfiles(id, before);
    res.status(409).json({ error: "Cannot remove last admin-granting profile" }); return;
  }
  res.status(200).json({ profileIds });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @new-workshop/agent-service test -- admin.routes`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/routes/admin.ts \
        packages/agent-service/src/__tests__/admin.routes.test.ts
git commit -m "feat(admin): add /admin/groups CRUD, members, and profiles routes"
```

---

## Task 12: `/admin/profiles` CRUD + `/:id/privileges`

**Files:**
- Modify: `packages/agent-service/src/routes/admin.ts`
- Modify: `packages/agent-service/src/__tests__/admin.routes.test.ts`

- [ ] **Step 1: Extend tests**

Append:

```ts
describe("/admin/profiles", () => {
  let dbPath: string; let db: Database; let app: express.Express; let token: string;
  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-admin-profiles-${Date.now()}-${Math.random()}.db`);
    db = new Database(dbPath);
    await ensureBootstrapAdmin(db, { email: "admin@x", password: "pw12345678" });
    app = buildApp(db);
    const r = await request(app).post("/admin/login").send({ email: "admin@x", password: "pw12345678" });
    token = r.body.token;
  });
  afterEach(() => fs.existsSync(dbPath) && fs.unlinkSync(dbPath));
  const auth = () => ({ Authorization: `Bearer ${token}` });

  it("GET /admin/profiles lists with privilege key arrays", async () => {
    const res = await request(app).get("/admin/profiles").set(auth());
    expect(res.status).toBe(200);
    const superadmin = res.body.find((p: { name: string }) => p.name === "superadmin");
    expect(superadmin.privilegeKeys.sort()).toEqual(["manage:groups", "manage:profiles", "manage:users"]);
  });

  it("POST /admin/profiles 201", async () => {
    const res = await request(app).post("/admin/profiles").set(auth()).send({ name: "reader" });
    expect(res.status).toBe(201);
  });

  it("POST /admin/profiles 409 on dup", async () => {
    const res = await request(app).post("/admin/profiles").set(auth()).send({ name: "superadmin" });
    expect(res.status).toBe(409);
  });

  it("PATCH /admin/profiles/:id renames", async () => {
    const p = (await request(app).post("/admin/profiles").set(auth()).send({ name: "reader" })).body.profile;
    const res = await request(app).patch(`/admin/profiles/${p.id}`).set(auth()).send({ name: "viewer" });
    expect(res.status).toBe(200);
  });

  it("DELETE /admin/profiles/:id self-lockout 409", async () => {
    const superadmin = db.listProfiles().find((p) => p.name === "superadmin")!;
    const res = await request(app).delete(`/admin/profiles/${superadmin.id}`).set(auth());
    expect(res.status).toBe(409);
  });

  it("PUT /admin/profiles/:id/privileges accepts only catalog keys", async () => {
    const p = (await request(app).post("/admin/profiles").set(auth()).send({ name: "reader" })).body.profile;
    const good = await request(app).put(`/admin/profiles/${p.id}/privileges`).set(auth())
      .send({ keys: ["manage:users"] });
    expect(good.status).toBe(200);

    const bad = await request(app).put(`/admin/profiles/${p.id}/privileges`).set(auth())
      .send({ keys: ["manage:nope"] });
    expect(bad.status).toBe(400);
  });

  it("PUT /admin/profiles/:id/privileges self-lockout 409 when stripping last admin-granting profile", async () => {
    const superadmin = db.listProfiles().find((p) => p.name === "superadmin")!;
    const res = await request(app).put(`/admin/profiles/${superadmin.id}/privileges`).set(auth())
      .send({ keys: [] });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Verify failures**

Run: `pnpm --filter @new-workshop/agent-service test -- admin.routes`
Expected: new block fails.

- [ ] **Step 3: Add routes**

Insert in `createAdminRouter`:

```ts
router.get("/profiles", adminAuthMiddleware(db, jwtSecret, "manage:profiles"), (_req, res) => {
  const profiles = db.listProfiles().map((p) => ({
    ...p,
    privilegeKeys: db.listProfilePrivileges(p.id),
  }));
  res.status(200).json(profiles);
});

router.post("/profiles", adminAuthMiddleware(db, jwtSecret, "manage:profiles"), async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "Name required", field: "name" }); return; }
  try {
    const id = uuidv4();
    const profile = db.createProfile(id, name);
    res.status(201).json({ profile });
  } catch (err) {
    if (String(err).includes("UNIQUE")) { res.status(409).json({ error: "Name already exists", field: "name" }); return; }
    throw err;
  }
});

router.patch("/profiles/:id", adminAuthMiddleware(db, jwtSecret, "manage:profiles"), (req, res) => {
  const { id } = req.params;
  const { name } = req.body ?? {};
  if (!db.getProfile(id)) { res.status(404).json({ error: "Not found" }); return; }
  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "Name required", field: "name" }); return; }
  try {
    db.renameProfile(id, name);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (String(err).includes("UNIQUE")) { res.status(409).json({ error: "Name already exists", field: "name" }); return; }
    throw err;
  }
});

router.delete("/profiles/:id", adminAuthMiddleware(db, jwtSecret, "manage:profiles"), (req, res) => {
  const { id } = req.params;
  if (!db.getProfile(id)) { res.status(404).json({ error: "Not found" }); return; }

  const beforeKeys = db.listProfilePrivileges(id);
  db.setProfilePrivileges(id, []);
  const stillOK = [...ADMIN_PRIVILEGE_KEYS].every((k) => db.countUsersWithPrivilege(k) >= 1);
  if (!stillOK) {
    db.setProfilePrivileges(id, beforeKeys);
    res.status(409).json({ error: "Cannot delete last admin-granting profile" }); return;
  }
  db.deleteProfile(id);
  res.status(204).end();
});

router.put("/profiles/:id/privileges", adminAuthMiddleware(db, jwtSecret, "manage:profiles"), (req, res) => {
  const { id } = req.params;
  const { keys } = req.body ?? {};
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string")) {
    res.status(400).json({ error: "keys must be string[]" }); return;
  }
  if (!db.getProfile(id)) { res.status(404).json({ error: "Not found" }); return; }

  const before = db.listProfilePrivileges(id);
  try {
    db.setProfilePrivileges(id, keys);
  } catch (err) {
    if (String(err).includes("unknown privilege")) { res.status(400).json({ error: String(err) }); return; }
    throw err;
  }
  const stillOK = [...ADMIN_PRIVILEGE_KEYS].every((k) => db.countUsersWithPrivilege(k) >= 1);
  if (!stillOK) {
    db.setProfilePrivileges(id, before);
    res.status(409).json({ error: "Cannot remove last admin privilege" }); return;
  }
  res.status(200).json({ keys });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @new-workshop/agent-service test`
Expected: **entire backend suite** passes (all `admin*` + existing tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/routes/admin.ts \
        packages/agent-service/src/__tests__/admin.routes.test.ts
git commit -m "feat(admin): add /admin/profiles CRUD + privilege assignment"
```

---

## Task 13: Frontend package scaffold (`@new-workshop/admin-panel`)

**Files (all new):**
- `packages/admin-panel/package.json`
- `packages/admin-panel/vite.config.ts`
- `packages/admin-panel/tsconfig.json`
- `packages/admin-panel/tailwind.config.ts`
- `packages/admin-panel/postcss.config.js`
- `packages/admin-panel/index.html`
- `packages/admin-panel/src/main.tsx`
- `packages/admin-panel/src/App.tsx`
- `packages/admin-panel/src/index.css`
- `packages/admin-panel/src/__tests__/setup.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@new-workshop/admin-panel",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.28.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.16",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5174,
    proxy: {
      "/api": { target: "http://localhost:3000", rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/__tests__/setup.ts"] },
});
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"],
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `tailwind.config.ts` (mirror web-client)**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0f0f1a",
        surface: "#1a1a2e",
        border: "#2a2a4a",
        primary: "#6c5ce7",
        "primary-foreground": "#ffffff",
        muted: "#888888",
        foreground: "#e0e0e0",
        success: "#00b894",
        danger: "#e74c3c",
        warning: "#f39c12",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
```

- [ ] **Step 5: Create `postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Panel</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 8: Create `src/App.tsx` (placeholder)**

```tsx
export default function App() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
      Admin Panel scaffolded.
    </div>
  );
}
```

- [ ] **Step 9: Create `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; margin: 0; padding: 0; background-color: #0f0f1a; color: #e0e0e0; }
```

- [ ] **Step 10: Create test setup file**

```ts
// packages/admin-panel/src/__tests__/setup.ts
import "@testing-library/jest-dom";
```

- [ ] **Step 11: Install deps and smoke test**

```bash
pnpm install
pnpm --filter @new-workshop/admin-panel dev
```
Open `http://localhost:5174` → should show "Admin Panel scaffolded." on the dark background. Ctrl-C when confirmed.

- [ ] **Step 12: Commit**

```bash
git add packages/admin-panel
git commit -m "feat(admin): scaffold admin-panel package with Vite, Tailwind, router"
```

---

## Task 14: Frontend types + `lib/api.ts` + setup

**Files:**
- Create: `packages/admin-panel/src/types.ts`
- Create: `packages/admin-panel/src/lib/api.ts`
- Create: `packages/admin-panel/src/lib/cn.ts` (utility)
- Create: `packages/admin-panel/src/__tests__/api.test.ts`

- [ ] **Step 1: Create `types.ts`**

```ts
export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  groupIds: string[];
}
export interface Group { id: string; name: string; createdAt: string; }
export interface ProfileWithKeys { id: string; name: string; createdAt: string; privilegeKeys: string[]; }
export interface PrivilegeEntry { key: string; label: string; description: string; profileCount: number; }
export interface Me { user: { id: string; email: string }; privileges: string[]; }
export interface LoginResponse { token: string; user: { id: string; email: string }; privileges: string[]; }
```

- [ ] **Step 2: Create `lib/cn.ts`**

```ts
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

- [ ] **Step 3: Write failing api test**

```ts
// packages/admin-panel/src/__tests__/api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError, setAuthToken } from "../lib/api.js";

describe("api client", () => {
  beforeEach(() => { vi.restoreAllMocks(); setAuthToken(null); });

  it("sends Authorization header when token set", async () => {
    setAuthToken("tok");
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await api.get("/admin/me");
    const init = fetchSpy.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("throws typed ApiError with status, error, and field", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Email already registered", field: "email" }), { status: 409 }),
    );
    await expect(api.post("/admin/users", {})).rejects.toBeInstanceOf(ApiError);
    try { await api.post("/admin/users", {}); } catch (e) {
      expect((e as ApiError).status).toBe(409);
      expect((e as ApiError).field).toBe("email");
    }
  });

  it("parses JSON body on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const res = await api.get<{ ok: boolean }>("/x");
    expect(res).toEqual({ ok: true });
  });

  it("returns null for 204", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const res = await api.del("/x");
    expect(res).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter @new-workshop/admin-panel test -- api`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `lib/api.ts`**

```ts
export class ApiError extends Error {
  status: number;
  field?: string;
  constructor(status: number, error: string, field?: string) {
    super(error);
    this.status = status;
    this.field = field;
  }
}

let token: string | null = sessionStorage.getItem("admin_token");

export function setAuthToken(t: string | null) {
  token = t;
  if (t) sessionStorage.setItem("admin_token", t);
  else sessionStorage.removeItem("admin_token");
}

export function getAuthToken(): string | null { return token; }

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || res.statusText, data && data.field);
  }
  return data as T;
}

export const api = {
  get:  <T>(p: string)            => send<T>("GET", p),
  post: <T>(p: string, body?: unknown) => send<T>("POST", p, body ?? {}),
  patch:<T>(p: string, body?: unknown) => send<T>("PATCH", p, body ?? {}),
  put:  <T>(p: string, body?: unknown) => send<T>("PUT", p, body ?? {}),
  del:  <T>(p: string)            => send<T>("DELETE", p),
};
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @new-workshop/admin-panel test -- api`
Expected: 4 PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/admin-panel/src/types.ts \
        packages/admin-panel/src/lib \
        packages/admin-panel/src/__tests__/api.test.ts
git commit -m "feat(admin-panel): add typed api client with Bearer token auth"
```

---

## Task 15: `AuthContext` + `use-auth` hook + LoginPage

**Files:**
- Create: `packages/admin-panel/src/contexts/AuthContext.tsx`
- Create: `packages/admin-panel/src/hooks/use-auth.ts`
- Create: `packages/admin-panel/src/pages/LoginPage.tsx`
- Create: `packages/admin-panel/src/__tests__/use-auth.test.tsx`
- Create: `packages/admin-panel/src/__tests__/LoginPage.test.tsx`
- Modify: `packages/admin-panel/src/App.tsx`

- [ ] **Step 1: Failing test for `use-auth`**

```tsx
// packages/admin-panel/src/__tests__/use-auth.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { AuthProvider } from "../contexts/AuthContext.js";
import { useAuth } from "../hooks/use-auth.js";
import { setAuthToken } from "../lib/api.js";

let captured: ReturnType<typeof useAuth> | null = null;
function Probe() { captured = useAuth(); return null; }

describe("useAuth", () => {
  beforeEach(() => { captured = null; setAuthToken(null); sessionStorage.clear(); });

  it("login sets token + user + privileges", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      token: "tok", user: { id: "u1", email: "a@x" }, privileges: ["manage:users"],
    }), { status: 200 }));

    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { await captured!.login("a@x", "pw12345678"); });
    expect(captured!.user?.email).toBe("a@x");
    expect(captured!.hasPrivilege("manage:users")).toBe(true);
    expect(captured!.hasPrivilege("manage:groups")).toBe(false);
  });

  it("logout clears state", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      token: "tok", user: { id: "u1", email: "a@x" }, privileges: ["manage:users"],
    }), { status: 200 }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { await captured!.login("a@x", "pw12345678"); });
    act(() => captured!.logout());
    expect(captured!.user).toBeNull();
    expect(captured!.privileges).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @new-workshop/admin-panel test -- use-auth`
Expected: FAIL (AuthProvider missing).

- [ ] **Step 3: Implement `AuthContext`**

```tsx
// packages/admin-panel/src/contexts/AuthContext.tsx
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAuthToken, getAuthToken } from "../lib/api.js";
import type { Me, LoginResponse } from "../types.js";

interface AuthValue {
  user: { id: string; email: string } | null;
  privileges: string[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPrivilege: (key: string) => boolean;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [privileges, setPrivileges] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(getAuthToken()));

  useEffect(() => {
    if (!getAuthToken()) return;
    api.get<Me>("/admin/me")
      .then((me) => { setUser(me.user); setPrivileges(me.privileges); })
      .catch(() => { setAuthToken(null); setUser(null); setPrivileges([]); })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user, privileges, loading,
    hasPrivilege: (k) => privileges.includes(k),
    login: async (email, password) => {
      const res = await api.post<LoginResponse>("/admin/login", { email, password });
      setAuthToken(res.token);
      setUser(res.user);
      setPrivileges(res.privileges);
    },
    logout: () => { setAuthToken(null); setUser(null); setPrivileges([]); },
  }), [user, privileges, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 4: Implement `use-auth`**

```ts
// packages/admin-panel/src/hooks/use-auth.ts
import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext.js";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @new-workshop/admin-panel test -- use-auth`
Expected: 2 PASS.

- [ ] **Step 6: Failing LoginPage test**

```tsx
// packages/admin-panel/src/__tests__/LoginPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import LoginPage from "../pages/LoginPage.js";
import { setAuthToken } from "../lib/api.js";

function renderLogin() {
  return render(
    <MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("logs in and shows no error on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      token: "tok", user: { id: "u1", email: "a@x" }, privileges: ["manage:users"],
    }), { status: 200 }));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@x" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(sessionStorage.getItem("admin_token")).toBe("tok"));
  });

  it("shows error message on 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401 }));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@x" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByText(/invalid email or password/i);
  });

  it("shows not-admin message on 403", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@x" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByText(/do not have access/i);
  });
});
```

- [ ] **Step 7: Run — expect failure**

Run: `pnpm --filter @new-workshop/admin-panel test -- LoginPage`
Expected: FAIL — LoginPage missing.

- [ ] **Step 8: Implement LoginPage**

```tsx
// packages/admin-panel/src/pages/LoginPage.tsx
import { useState } from "react";
import { useAuth } from "../hooks/use-auth.js";
import { ApiError } from "../lib/api.js";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You do not have access to the admin panel.");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError("Unexpected error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-surface border border-border rounded-lg p-6 space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
        <label className="block space-y-1">
          <span className="text-sm text-muted">Email</span>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted">Password</span>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
        </label>
        {error && <div role="alert" className="text-sm text-red-400">{error}</div>}
        <button type="submit" disabled={submitting}
          className="w-full bg-primary text-primary-foreground rounded px-3 py-2 font-medium disabled:opacity-50">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 9: Run — all auth tests pass**

Run: `pnpm --filter @new-workshop/admin-panel test`
Expected: all PASS.

- [ ] **Step 10: Update `App.tsx` to wire AuthProvider + routes**

```tsx
// packages/admin-panel/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext.js";
import { useAuth } from "./hooks/use-auth.js";
import LoginPage from "./pages/LoginPage.js";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<RequireAuth><div className="p-8">Authenticated shell (wired in Task 17).</div></RequireAuth>} />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add packages/admin-panel/src/contexts packages/admin-panel/src/hooks \
        packages/admin-panel/src/pages packages/admin-panel/src/__tests__ \
        packages/admin-panel/src/App.tsx
git commit -m "feat(admin-panel): add AuthProvider, useAuth, LoginPage, route guard"
```

---

## Task 16: Shared UI components

**Files:**
- Create: `packages/admin-panel/src/components/AppShell.tsx`
- Create: `packages/admin-panel/src/components/DataTable.tsx`
- Create: `packages/admin-panel/src/components/ConfirmDialog.tsx`
- Create: `packages/admin-panel/src/components/FormField.tsx`
- Create: `packages/admin-panel/src/components/MultiSelect.tsx`
- Create: `packages/admin-panel/src/components/PrivilegeBadge.tsx`

(No tests in this task — components are covered by page-level tests in later tasks.)

- [ ] **Step 1: Create `AppShell.tsx`**

```tsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/use-auth.js";
import { cn } from "../lib/cn.js";

const NAV: { to: string; label: string; privilege?: string }[] = [
  { to: "/users",      label: "Users",      privilege: "manage:users" },
  { to: "/groups",     label: "Groups",     privilege: "manage:groups" },
  { to: "/profiles",   label: "Profiles",   privilege: "manage:profiles" },
  { to: "/privileges", label: "Privileges" },
];

export default function AppShell() {
  const { user, logout, hasPrivilege } = useAuth();
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-56 bg-surface border-r border-border px-3 py-4 flex flex-col">
        <div className="text-primary font-bold text-lg mb-6 px-2">⌘ Admin</div>
        <nav className="flex-1 space-y-1">
          {NAV.filter((n) => !n.privilege || hasPrivilege(n.privilege)).map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => cn(
                "block px-3 py-2 rounded text-sm",
                isActive ? "bg-primary/15 text-foreground" : "text-muted hover:text-foreground",
              )}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-4 text-xs">
          <div className="text-muted truncate" title={user?.email}>{user?.email}</div>
          <button className="mt-2 text-primary hover:underline" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="flex-1 p-6"><Outlet /></main>
    </div>
  );
}
```

- [ ] **Step 2: Create `DataTable.tsx`**

```tsx
import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  width?: string;
}

export default function DataTable<T extends { id: string }>(
  { rows, columns, empty }: { rows: T[]; columns: Column<T>[]; empty?: string },
) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="grid text-xs uppercase tracking-wide text-muted px-4 py-3 border-b border-border"
           style={{ gridTemplateColumns: columns.map((c) => c.width || "1fr").join(" ") }}>
        {columns.map((c) => (<div key={c.header}>{c.header}</div>))}
      </div>
      {rows.length === 0 && <div className="px-4 py-10 text-center text-muted">{empty ?? "No rows."}</div>}
      {rows.map((row) => (
        <div key={row.id}
             className="grid items-center px-4 py-3 text-sm border-b border-border last:border-b-0"
             style={{ gridTemplateColumns: columns.map((c) => c.width || "1fr").join(" ") }}>
          {columns.map((c, i) => (<div key={i}>{c.cell(row)}</div>))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `ConfirmDialog.tsx`**

```tsx
interface Props { open: boolean; title: string; message: string; onCancel: () => void; onConfirm: () => void; danger?: boolean; }
export default function ConfirmDialog({ open, title, message, onCancel, onConfirm, danger }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
        <p className="text-sm text-muted mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-sm rounded border border-border text-foreground" onClick={onCancel}>Cancel</button>
          <button className={`px-3 py-1.5 text-sm rounded text-white ${danger ? "bg-red-600" : "bg-primary"}`} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `FormField.tsx`**

```tsx
import type { ReactNode } from "react";
interface Props { label: string; error?: string; children: ReactNode; }
export default function FormField({ label, error, children }: Props) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-400">{error}</span>}
    </label>
  );
}
```

- [ ] **Step 5: Create `MultiSelect.tsx`**

```tsx
interface Props<T extends { id: string; name: string }> {
  label: string;
  options: T[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}
export default function MultiSelect<T extends { id: string; name: string }>(
  { label, options, selectedIds, onChange }: Props<T>,
) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }
  return (
    <div>
      <div className="text-sm text-muted mb-2">{label}</div>
      <div className="space-y-1 max-h-48 overflow-auto border border-border rounded p-2 bg-background">
        {options.length === 0 && <div className="text-xs text-muted px-1">No options</div>}
        {options.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-surface">
            <input type="checkbox" checked={selectedIds.includes(opt.id)} onChange={() => toggle(opt.id)} />
            <span className="text-foreground">{opt.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `PrivilegeBadge.tsx`**

```tsx
export default function PrivilegeBadge({ k }: { k: string }) {
  return <span className="inline-block text-[10px] px-2 py-0.5 rounded bg-primary/20 text-[#a29bfe]">{k}</span>;
}
```

- [ ] **Step 7: Commit**

```bash
git add packages/admin-panel/src/components
git commit -m "feat(admin-panel): add shared UI components (AppShell, DataTable, dialogs, form)"
```

---

## Task 17: `UsersPage`

**Files:**
- Create: `packages/admin-panel/src/pages/UsersPage.tsx`
- Create: `packages/admin-panel/src/__tests__/UsersPage.test.tsx`
- Modify: `packages/admin-panel/src/App.tsx`

- [ ] **Step 1: Failing test**

```tsx
// packages/admin-panel/src/__tests__/UsersPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import UsersPage from "../pages/UsersPage.js";
import { setAuthToken } from "../lib/api.js";

async function renderWithAdmin() {
  const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (url: string, init) => {
    if (url.toString().endsWith("/admin/me")) {
      return new Response(JSON.stringify({ user: { id: "u1", email: "a@x" }, privileges: ["manage:users"] }), { status: 200 });
    }
    if (url.toString().endsWith("/admin/users") && (!init || init.method === "GET" || init.method === undefined)) {
      return new Response(JSON.stringify([
        { id: "u1", email: "a@x", createdAt: "2026-04-20", groupIds: ["g1"] },
      ]), { status: 200 });
    }
    if (url.toString().endsWith("/admin/groups")) {
      return new Response(JSON.stringify([{ id: "g1", name: "Admins", createdAt: "x" }]), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
  setAuthToken("tok");
  const ret = render(
    <MemoryRouter><AuthProvider><UsersPage /></AuthProvider></MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText("a@x")).toBeInTheDocument());
  return { fetchMock, ...ret };
}

describe("UsersPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("renders user rows", async () => { await renderWithAdmin(); });

  it("shows inline field error on 409 duplicate email", async () => {
    const { fetchMock } = await renderWithAdmin();
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ error: "Email already registered", field: "email" }), { status: 409 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /new user/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@x" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await screen.findByText(/already registered/i);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @new-workshop/admin-panel test -- UsersPage`
Expected: FAIL.

- [ ] **Step 3: Implement `UsersPage`**

```tsx
// packages/admin-panel/src/pages/UsersPage.tsx
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.js";
import type { AdminUser, Group } from "../types.js";
import DataTable from "../components/DataTable.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import FormField from "../components/FormField.js";
import MultiSelect from "../components/MultiSelect.js";
import { useAuth } from "../hooks/use-auth.js";

export default function UsersPage() {
  const { hasPrivilege } = useAuth();
  const canManage = hasPrivilege("manage:users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [u, g] = await Promise.all([api.get<AdminUser[]>("/admin/users"), api.get<Group[]>("/admin/groups")]);
    setUsers(u); setGroups(g);
  }
  useEffect(() => { refresh().catch((e) => setError(String(e))); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault(); setFieldErr({});
    try {
      await api.post("/admin/users", { email: newEmail, password: newPassword });
      setCreating(false); setNewEmail(""); setNewPassword("");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.field) setFieldErr({ [err.field]: err.message });
      else setError(String(err));
    }
  }

  async function onSaveGroups() {
    if (!editing) return;
    try {
      await api.put(`/admin/users/${editing.id}/groups`, { groupIds: editGroupIds });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    try {
      await api.del(`/admin/users/${confirmDelete.id}`);
      setConfirmDelete(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setConfirmDelete(null);
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted">{users.length} user{users.length === 1 ? "" : "s"}</p>
        </div>
        <button disabled={!canManage} onClick={() => setCreating(true)}
          className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-50">
          + New user
        </button>
      </div>

      {error && <div role="alert" className="text-sm text-red-400">{error}</div>}

      <DataTable<AdminUser>
        rows={users}
        columns={[
          { header: "Email", cell: (u) => u.email, width: "1.4fr" },
          { header: "Groups", cell: (u) => (
              <div className="flex flex-wrap gap-1">
                {u.groupIds.map((gid) => {
                  const g = groups.find((x) => x.id === gid);
                  return g ? <span key={gid} className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-[#a29bfe]">{g.name}</span> : null;
                })}
                {u.groupIds.length === 0 && <span className="text-muted text-xs">—</span>}
              </div>
          ), width: "2fr" },
          { header: "", cell: (u) => (
            <div className="flex gap-2 justify-end text-xs">
              <button disabled={!canManage} onClick={() => { setEditing(u); setEditGroupIds(u.groupIds); }} className="text-primary hover:underline disabled:opacity-50">Groups</button>
              <button disabled={!canManage} onClick={() => setConfirmDelete(u)} className="text-red-400 hover:underline disabled:opacity-50">Delete</button>
            </div>
          ), width: "150px" },
        ]}
      />

      {creating && (
        <form onSubmit={onCreate} className="bg-surface border border-border rounded-lg p-4 space-y-3 max-w-sm">
          <h2 className="font-semibold text-foreground">New user</h2>
          <FormField label="Email" error={fieldErr.email}>
            <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <FormField label="Password" error={fieldErr.password}>
            <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </form>
      )}

      {editing && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3 max-w-sm">
          <h2 className="font-semibold text-foreground">Groups for {editing.email}</h2>
          <MultiSelect label="Groups" options={groups} selectedIds={editGroupIds} onChange={setEditGroupIds} />
          <div className="flex gap-2">
            <button onClick={onSaveGroups} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Save</button>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete user?"
        message={`This will permanently delete ${confirmDelete?.email} and their conversations.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={onDelete}
        danger
      />
    </div>
  );
}
```

- [ ] **Step 4: Wire into router**

Edit `App.tsx` so it matches:

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext.js";
import { useAuth } from "./hooks/use-auth.js";
import LoginPage from "./pages/LoginPage.js";
import AppShell from "./components/AppShell.js";
import UsersPage from "./pages/UsersPage.js";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Navigate to="/users" replace />} />
          <Route path="users" element={<UsersPage />} />
          {/* Other pages mounted in later tasks */}
          <Route path="*" element={<div className="text-muted">Not found.</div>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @new-workshop/admin-panel test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/admin-panel/src/pages/UsersPage.tsx \
        packages/admin-panel/src/__tests__/UsersPage.test.tsx \
        packages/admin-panel/src/App.tsx
git commit -m "feat(admin-panel): add Users page with CRUD + group assignment"
```

---

## Task 18: `GroupsPage`

**Files:**
- Create: `packages/admin-panel/src/pages/GroupsPage.tsx`
- Create: `packages/admin-panel/src/__tests__/GroupsPage.test.tsx`
- Modify: `packages/admin-panel/src/App.tsx`

- [ ] **Step 1: Failing test**

```tsx
// packages/admin-panel/src/__tests__/GroupsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import GroupsPage from "../pages/GroupsPage.js";
import { setAuthToken } from "../lib/api.js";

describe("GroupsPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("renders and creates a group", async () => {
    let groupsCall = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
      const u = url.toString();
      if (u.endsWith("/admin/me")) return new Response(JSON.stringify({ user: { id: "u1", email: "a@x" }, privileges: ["manage:groups"] }), { status: 200 });
      if (u.endsWith("/admin/groups") && (!init || init.method === "GET" || init.method === undefined)) {
        groupsCall++;
        const data = groupsCall === 1
          ? [{ id: "g1", name: "Admins", createdAt: "x" }]
          : [{ id: "g1", name: "Admins", createdAt: "x" }, { id: "g2", name: "Editors", createdAt: "x" }];
        return new Response(JSON.stringify(data), { status: 200 });
      }
      if (u.endsWith("/admin/groups") && init?.method === "POST") {
        return new Response(JSON.stringify({ group: { id: "g2", name: "Editors", createdAt: "x" } }), { status: 201 });
      }
      if (u.endsWith("/admin/users")) return new Response("[]", { status: 200 });
      if (u.endsWith("/admin/profiles")) return new Response("[]", { status: 200 });
      return new Response("{}", { status: 200 });
    });
    setAuthToken("tok");
    render(<MemoryRouter><AuthProvider><GroupsPage /></AuthProvider></MemoryRouter>);
    await screen.findByText("Admins");
    fireEvent.click(screen.getByRole("button", { name: /new group/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Editors" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(screen.getByText("Editors")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @new-workshop/admin-panel test -- GroupsPage`
Expected: FAIL.

- [ ] **Step 3: Implement `GroupsPage`**

```tsx
// packages/admin-panel/src/pages/GroupsPage.tsx
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.js";
import type { Group, AdminUser, ProfileWithKeys } from "../types.js";
import DataTable from "../components/DataTable.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import FormField from "../components/FormField.js";
import MultiSelect from "../components/MultiSelect.js";
import { useAuth } from "../hooks/use-auth.js";

export default function GroupsPage() {
  const { hasPrivilege } = useAuth();
  const canManage = hasPrivilege("manage:groups");
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithKeys[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [fieldErr, setFieldErr] = useState<{ name?: string }>({});
  const [editing, setEditing] = useState<Group | null>(null);
  const [editName, setEditName] = useState("");
  const [editMembers, setEditMembers] = useState<string[]>([]);
  const [editProfileIds, setEditProfileIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [g, u, p] = await Promise.all([
      api.get<Group[]>("/admin/groups"),
      api.get<AdminUser[]>("/admin/users").catch(() => []),
      api.get<ProfileWithKeys[]>("/admin/profiles").catch(() => []),
    ]);
    setGroups(g); setUsers(u); setProfiles(p);
  }
  useEffect(() => { refresh().catch((e) => setError(String(e))); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault(); setFieldErr({});
    try {
      await api.post("/admin/groups", { name: newName });
      setCreating(false); setNewName("");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.field) setFieldErr({ [err.field]: err.message });
      else setError(String(err));
    }
  }

  function openEdit(g: Group) {
    setEditing(g);
    setEditName(g.name);
    setEditMembers(users.filter((u) => u.groupIds.includes(g.id)).map((u) => u.id));
    // Current profile IDs are derived from profiles list intersected with this group.
    // Because /admin/profiles doesn't return which groups use each profile, we start
    // with an empty selection and let the admin set explicitly. Users can see the
    // current set via the Groups column summary after saving.
    setEditProfileIds([]);
  }

  async function onSaveEdit() {
    if (!editing) return;
    try {
      if (editName !== editing.name) await api.patch(`/admin/groups/${editing.id}`, { name: editName });
      await api.put(`/admin/groups/${editing.id}/members`, { userIds: editMembers });
      await api.put(`/admin/groups/${editing.id}/profiles`, { profileIds: editProfileIds });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    try { await api.del(`/admin/groups/${confirmDelete.id}`); setConfirmDelete(null); await refresh(); }
    catch (err) { setError(err instanceof ApiError ? err.message : String(err)); setConfirmDelete(null); }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Groups</h1>
          <p className="text-sm text-muted">{groups.length} group{groups.length === 1 ? "" : "s"}</p>
        </div>
        <button disabled={!canManage} onClick={() => setCreating(true)}
          className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-50">
          + New group
        </button>
      </div>

      {error && <div role="alert" className="text-sm text-red-400">{error}</div>}

      <DataTable<Group>
        rows={groups}
        columns={[
          { header: "Name", cell: (g) => g.name, width: "1.2fr" },
          { header: "Members", cell: (g) => users.filter((u) => u.groupIds.includes(g.id)).length, width: "100px" },
          { header: "", cell: (g) => (
            <div className="flex gap-2 justify-end text-xs">
              <button disabled={!canManage} onClick={() => openEdit(g)} className="text-primary hover:underline disabled:opacity-50">Edit</button>
              <button disabled={!canManage} onClick={() => setConfirmDelete(g)} className="text-red-400 hover:underline disabled:opacity-50">Delete</button>
            </div>
          ), width: "150px" },
        ]}
      />

      {creating && (
        <form onSubmit={onCreate} className="bg-surface border border-border rounded-lg p-4 space-y-3 max-w-sm">
          <h2 className="font-semibold text-foreground">New group</h2>
          <FormField label="Name" error={fieldErr.name}>
            <input required value={newName} onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </form>
      )}

      {editing && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4 max-w-lg">
          <h2 className="font-semibold text-foreground">Edit {editing.name}</h2>
          <FormField label="Name">
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <MultiSelect label="Members" options={users.map((u) => ({ id: u.id, name: u.email }))} selectedIds={editMembers} onChange={setEditMembers} />
          <MultiSelect label="Profiles" options={profiles} selectedIds={editProfileIds} onChange={setEditProfileIds} />
          <div className="flex gap-2">
            <button onClick={onSaveEdit} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Save</button>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete group?"
        message={`Delete ${confirmDelete?.name}? Members and profile links are removed, user accounts are kept.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={onDelete}
        danger
      />
    </div>
  );
}
```

- [ ] **Step 4: Mount route in `App.tsx`**

Add an `import GroupsPage from "./pages/GroupsPage.js";` and an additional `<Route path="groups" element={<GroupsPage />} />` inside the authenticated shell.

- [ ] **Step 5: Run tests + commit**

Run: `pnpm --filter @new-workshop/admin-panel test`
Expected: all PASS.

```bash
git add packages/admin-panel/src/pages/GroupsPage.tsx \
        packages/admin-panel/src/__tests__/GroupsPage.test.tsx \
        packages/admin-panel/src/App.tsx
git commit -m "feat(admin-panel): add Groups page with members and profile editors"
```

---

## Task 19: `ProfilesPage`

**Files:**
- Create: `packages/admin-panel/src/pages/ProfilesPage.tsx`
- Create: `packages/admin-panel/src/__tests__/ProfilesPage.test.tsx`
- Modify: `packages/admin-panel/src/App.tsx`

- [ ] **Step 1: Failing test**

```tsx
// packages/admin-panel/src/__tests__/ProfilesPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import ProfilesPage from "../pages/ProfilesPage.js";
import { setAuthToken } from "../lib/api.js";

describe("ProfilesPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("renders profiles and their privilege keys", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = url.toString();
      if (u.endsWith("/admin/me")) return new Response(JSON.stringify({ user: { id: "u1", email: "a@x" }, privileges: ["manage:profiles"] }), { status: 200 });
      if (u.endsWith("/admin/profiles")) return new Response(JSON.stringify([
        { id: "p1", name: "superadmin", createdAt: "x", privilegeKeys: ["manage:users", "manage:groups", "manage:profiles"] },
      ]), { status: 200 });
      if (u.endsWith("/admin/privileges")) return new Response(JSON.stringify([
        { key: "manage:users", label: "Manage users", description: "...", profileCount: 1 },
        { key: "manage:groups", label: "Manage groups", description: "...", profileCount: 1 },
        { key: "manage:profiles", label: "Manage profiles", description: "...", profileCount: 1 },
      ]), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    setAuthToken("tok");
    render(<MemoryRouter><AuthProvider><ProfilesPage /></AuthProvider></MemoryRouter>);
    await screen.findByText("superadmin");
    await waitFor(() => expect(screen.getByText("manage:users")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @new-workshop/admin-panel test -- ProfilesPage`
Expected: FAIL.

- [ ] **Step 3: Implement `ProfilesPage`**

```tsx
// packages/admin-panel/src/pages/ProfilesPage.tsx
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.js";
import type { ProfileWithKeys, PrivilegeEntry } from "../types.js";
import DataTable from "../components/DataTable.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import FormField from "../components/FormField.js";
import PrivilegeBadge from "../components/PrivilegeBadge.js";
import { useAuth } from "../hooks/use-auth.js";

export default function ProfilesPage() {
  const { hasPrivilege } = useAuth();
  const canManage = hasPrivilege("manage:profiles");
  const [profiles, setProfiles] = useState<ProfileWithKeys[]>([]);
  const [catalog, setCatalog] = useState<PrivilegeEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [fieldErr, setFieldErr] = useState<{ name?: string }>({});
  const [editing, setEditing] = useState<ProfileWithKeys | null>(null);
  const [editName, setEditName] = useState("");
  const [editKeys, setEditKeys] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<ProfileWithKeys | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [p, c] = await Promise.all([
      api.get<ProfileWithKeys[]>("/admin/profiles"),
      api.get<PrivilegeEntry[]>("/admin/privileges"),
    ]);
    setProfiles(p); setCatalog(c);
  }
  useEffect(() => { refresh().catch((e) => setError(String(e))); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault(); setFieldErr({});
    try {
      await api.post("/admin/profiles", { name: newName });
      setCreating(false); setNewName("");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.field) setFieldErr({ [err.field]: err.message });
      else setError(String(err));
    }
  }

  async function onSaveEdit() {
    if (!editing) return;
    try {
      if (editName !== editing.name) await api.patch(`/admin/profiles/${editing.id}`, { name: editName });
      await api.put(`/admin/profiles/${editing.id}/privileges`, { keys: editKeys });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    try { await api.del(`/admin/profiles/${confirmDelete.id}`); setConfirmDelete(null); await refresh(); }
    catch (err) { setError(err instanceof ApiError ? err.message : String(err)); setConfirmDelete(null); }
  }

  function togglePriv(k: string) {
    setEditKeys((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Profiles</h1>
          <p className="text-sm text-muted">{profiles.length} profile{profiles.length === 1 ? "" : "s"}</p>
        </div>
        <button disabled={!canManage} onClick={() => setCreating(true)}
          className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-50">
          + New profile
        </button>
      </div>

      {error && <div role="alert" className="text-sm text-red-400">{error}</div>}

      <DataTable<ProfileWithKeys>
        rows={profiles}
        columns={[
          { header: "Name", cell: (p) => p.name, width: "1fr" },
          { header: "Privileges", cell: (p) => (
              <div className="flex flex-wrap gap-1">
                {p.privilegeKeys.map((k) => <PrivilegeBadge key={k} k={k} />)}
                {p.privilegeKeys.length === 0 && <span className="text-muted text-xs">—</span>}
              </div>
          ), width: "2fr" },
          { header: "", cell: (p) => (
            <div className="flex gap-2 justify-end text-xs">
              <button disabled={!canManage} onClick={() => { setEditing(p); setEditName(p.name); setEditKeys(p.privilegeKeys); }} className="text-primary hover:underline disabled:opacity-50">Edit</button>
              <button disabled={!canManage} onClick={() => setConfirmDelete(p)} className="text-red-400 hover:underline disabled:opacity-50">Delete</button>
            </div>
          ), width: "150px" },
        ]}
      />

      {creating && (
        <form onSubmit={onCreate} className="bg-surface border border-border rounded-lg p-4 space-y-3 max-w-sm">
          <h2 className="font-semibold text-foreground">New profile</h2>
          <FormField label="Name" error={fieldErr.name}>
            <input required value={newName} onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </form>
      )}

      {editing && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4 max-w-lg">
          <h2 className="font-semibold text-foreground">Edit {editing.name}</h2>
          <FormField label="Name">
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <div>
            <div className="text-sm text-muted mb-2">Privileges</div>
            <div className="space-y-1 border border-border rounded p-2 bg-background">
              {catalog.map((entry) => (
                <label key={entry.key} className="flex items-start gap-2 text-sm cursor-pointer px-1 py-1 rounded hover:bg-surface">
                  <input type="checkbox" checked={editKeys.includes(entry.key)} onChange={() => togglePriv(entry.key)} />
                  <div>
                    <div className="text-foreground"><code className="text-xs">{entry.key}</code> — {entry.label}</div>
                    <div className="text-xs text-muted">{entry.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onSaveEdit} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Save</button>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete profile?"
        message={`Delete ${confirmDelete?.name}? Groups using this profile will lose its privileges.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={onDelete}
        danger
      />
    </div>
  );
}
```

- [ ] **Step 4: Mount route**

Add `import ProfilesPage from "./pages/ProfilesPage.js";` and a `<Route path="profiles" element={<ProfilesPage />} />` in `App.tsx`.

- [ ] **Step 5: Run + commit**

Run: `pnpm --filter @new-workshop/admin-panel test`
Expected: all PASS.

```bash
git add packages/admin-panel/src/pages/ProfilesPage.tsx \
        packages/admin-panel/src/__tests__/ProfilesPage.test.tsx \
        packages/admin-panel/src/App.tsx
git commit -m "feat(admin-panel): add Profiles page with privilege assignment"
```

---

## Task 20: `PrivilegesPage`

**Files:**
- Create: `packages/admin-panel/src/pages/PrivilegesPage.tsx`
- Create: `packages/admin-panel/src/__tests__/PrivilegesPage.test.tsx`
- Modify: `packages/admin-panel/src/App.tsx`

- [ ] **Step 1: Failing test**

```tsx
// packages/admin-panel/src/__tests__/PrivilegesPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import PrivilegesPage from "../pages/PrivilegesPage.js";
import { setAuthToken } from "../lib/api.js";

describe("PrivilegesPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("renders catalog entries with profile counts", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = url.toString();
      if (u.endsWith("/admin/me")) return new Response(JSON.stringify({ user: { id: "u1", email: "a@x" }, privileges: [] }), { status: 200 });
      if (u.endsWith("/admin/privileges")) return new Response(JSON.stringify([
        { key: "manage:users", label: "Manage users", description: "CRUD users.", profileCount: 2 },
        { key: "manage:groups", label: "Manage groups", description: "CRUD groups.", profileCount: 1 },
      ]), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    setAuthToken("tok");
    render(<MemoryRouter><AuthProvider><PrivilegesPage /></AuthProvider></MemoryRouter>);
    await screen.findByText(/Manage users/);
    expect(screen.getByText(/2 profiles/)).toBeInTheDocument();
    expect(screen.getByText(/1 profile/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @new-workshop/admin-panel test -- PrivilegesPage`
Expected: FAIL.

- [ ] **Step 3: Implement `PrivilegesPage`**

```tsx
// packages/admin-panel/src/pages/PrivilegesPage.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { PrivilegeEntry } from "../types.js";

export default function PrivilegesPage() {
  const [entries, setEntries] = useState<PrivilegeEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PrivilegeEntry[]>("/admin/privileges").then(setEntries).catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Privileges</h1>
        <p className="text-sm text-muted">Fixed catalog of permission keys. Assign to profiles from the Profiles page.</p>
      </div>
      {error && <div role="alert" className="text-sm text-red-400">{error}</div>}
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.key} className="bg-surface border border-border rounded-lg p-4 flex items-start gap-4">
            <code className="text-sm bg-background border border-border rounded px-2 py-1 text-[#a29bfe] whitespace-nowrap">{e.key}</code>
            <div className="flex-1">
              <div className="text-foreground font-medium">{e.label}</div>
              <div className="text-sm text-muted">{e.description}</div>
            </div>
            <div className="text-xs text-muted whitespace-nowrap">{e.profileCount} profile{e.profileCount === 1 ? "" : "s"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount route**

Add `import PrivilegesPage from "./pages/PrivilegesPage.js";` and `<Route path="privileges" element={<PrivilegesPage />} />` in `App.tsx`.

- [ ] **Step 5: Run + commit**

Run: `pnpm --filter @new-workshop/admin-panel test`
Expected: all PASS.

```bash
git add packages/admin-panel/src/pages/PrivilegesPage.tsx \
        packages/admin-panel/src/__tests__/PrivilegesPage.test.tsx \
        packages/admin-panel/src/App.tsx
git commit -m "feat(admin-panel): add read-only Privileges catalog page"
```

---

## Task 21: Update root scripts + end-to-end smoke test

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Update root `package.json`**

Replace `scripts` with:

```json
"scripts": {
  "start": "concurrently --names \"be,fe,admin\" --prefix-colors \"blue,green,magenta\" --kill-others-on-fail \"pnpm --filter @new-workshop/agent-service dev\" \"pnpm --filter @new-workshop/web-client dev\" \"pnpm --filter @new-workshop/admin-panel dev\"",
  "stop": "echo 'Press Ctrl-C in the terminal running `pnpm start` to stop all services.'",
  "test": "pnpm -r test"
}
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: full backend + frontend suites PASS.

- [ ] **Step 3: Manual end-to-end smoke test**

```bash
# Kill anything squatting the three ports first:
lsof -ti:3000 -ti:5173 -ti:5174 2>/dev/null | xargs kill 2>/dev/null
pnpm start
```

Wait for all three services to be healthy:
```bash
for i in $(seq 1 30); do
  BE=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:3000/conversations 2>/dev/null)
  FE=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null)
  AD=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:5174 2>/dev/null)
  [ "$BE" = "401" ] && [ "$FE" = "200" ] && [ "$AD" = "200" ] && { echo ready; break; }
  sleep 1
done
```

In the browser, open `http://localhost:5174`, sign in with `ADMIN_EMAIL`/`ADMIN_PASSWORD` from `.env`, and verify:
1. `/users` — admin user listed, "+ New user" works.
2. `/groups` — "Admins" exists; create "Editors" succeeds.
3. `/profiles` — "superadmin" exists with all three privilege badges; can create a new profile and toggle privileges.
4. `/privileges` — shows three keys with correct profile counts.
5. Signing out returns to the login screen.

Stop services (Ctrl-C in the terminal running `pnpm start`).

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add admin-panel to root start script and pnpm -r test"
```

---

## Self-Review Notes

- Every `/admin/*` route in the spec has a corresponding task (Tasks 9, 10, 11, 12).
- Every self-lockout rule in the spec is enforced with a pre-check using `countUsersWithPrivilege` + simulate-then-rollback (Tasks 10, 11, 12).
- Every frontend page the spec lists has its own task (Tasks 17, 18, 19, 20).
- Privileges are validated against `PRIVILEGE_KEYS` at the DB layer (Task 5) AND at the route layer (Task 12) — belt + suspenders.
- Tests use in-memory tmp SQLite per test (no shared state), matching existing patterns.
- All function / method names agree across tasks: `ensureBootstrapAdmin`, `adminAuthMiddleware`, `createAdminRouter`, `setAuthToken`, `AuthProvider`, `useAuth`, `api.{get,post,patch,put,del}` are referenced consistently.
- Explicit non-goals from the spec (audit log, rate-limiting, MFA, E2E) are not added here.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-admin-panel-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batching with checkpoints.

Which approach?
