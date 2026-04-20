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
