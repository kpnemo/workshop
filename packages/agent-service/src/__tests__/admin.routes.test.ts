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
