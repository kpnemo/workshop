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
