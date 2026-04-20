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
});
