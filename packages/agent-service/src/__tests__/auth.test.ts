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
