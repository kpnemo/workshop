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

  // /admin/groups, /admin/profiles are added in Tasks 11–12.

  return router;
}
