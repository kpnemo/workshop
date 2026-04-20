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
