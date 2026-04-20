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

  // --- /admin/groups ---
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

  // /admin/profiles is added in Task 12.

  return router;
}
