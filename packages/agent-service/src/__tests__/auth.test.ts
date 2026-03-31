import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { authMiddleware } from "../middleware/auth.js";
import { Database } from "../services/database.js";
import { createAuthRouter } from "../routes/auth.js";

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

function buildAuthApp(db: Database) {
  const app = express();
  app.use(express.json());
  app.use("/auth", createAuthRouter(db, "test-secret"));
  return app;
}

function makeJsonRequest(app: express.Express, method: string, reqPath: string, body?: object) {
  return new Promise<{ status: number; body: string }>((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        { hostname: "127.0.0.1", port, path: reqPath, method, headers: { "Content-Type": "application/json" } },
        (res) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => { server.close(); resolve({ status: res.statusCode!, body: data }); });
        }
      );
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe("POST /auth/signup", () => {
  let db: Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-auth-${Date.now()}.db`);
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("creates user and returns token", async () => {
    const app = buildAuthApp(db);
    const res = await makeJsonRequest(app, "POST", "/auth/signup", { email: "test@example.com", password: "password123" });
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.token).toBeDefined();
    expect(json.user.email).toBe("test@example.com");
    expect(json.user.id).toBeDefined();
  });

  it("returns 409 for duplicate email", async () => {
    const app = buildAuthApp(db);
    await makeJsonRequest(app, "POST", "/auth/signup", { email: "test@example.com", password: "password123" });
    const res = await makeJsonRequest(app, "POST", "/auth/signup", { email: "test@example.com", password: "password456" });
    expect(res.status).toBe(409);
    expect(JSON.parse(res.body).error).toBe("Email already registered");
  });

  it("returns 400 when email or password missing", async () => {
    const app = buildAuthApp(db);
    const res = await makeJsonRequest(app, "POST", "/auth/signup", { email: "test@example.com" });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Email and password required");
  });

  it("returns 400 when password too short", async () => {
    const app = buildAuthApp(db);
    const res = await makeJsonRequest(app, "POST", "/auth/signup", { email: "test@example.com", password: "short" });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Password must be at least 8 characters");
  });
});

describe("POST /auth/login", () => {
  let db: Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-auth-login-${Date.now()}.db`);
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("returns token for valid credentials", async () => {
    const app = buildAuthApp(db);
    await makeJsonRequest(app, "POST", "/auth/signup", { email: "test@example.com", password: "password123" });
    const res = await makeJsonRequest(app, "POST", "/auth/login", { email: "test@example.com", password: "password123" });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.token).toBeDefined();
    expect(json.user.email).toBe("test@example.com");
  });

  it("returns 401 for wrong password", async () => {
    const app = buildAuthApp(db);
    await makeJsonRequest(app, "POST", "/auth/signup", { email: "test@example.com", password: "password123" });
    const res = await makeJsonRequest(app, "POST", "/auth/login", { email: "test@example.com", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toBe("Invalid email or password");
  });

  it("returns 401 for nonexistent email", async () => {
    const app = buildAuthApp(db);
    const res = await makeJsonRequest(app, "POST", "/auth/login", { email: "nobody@example.com", password: "password123" });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toBe("Invalid email or password");
  });
});
