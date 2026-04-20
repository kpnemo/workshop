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
