// packages/agent-service/src/middleware/admin-auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Database } from "../services/database.js";

interface JwtPayload { userId: string; email: string; }

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      privileges?: Set<string>;
    }
  }
}

export function adminAuthMiddleware(db: Database, secret: string, requiredPrivilege: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    let payload: JwtPayload;
    try {
      payload = jwt.verify(header.slice(7), secret) as JwtPayload;
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const privs = db.getEffectivePrivileges(payload.userId);
    if (!privs.has(requiredPrivilege)) {
      res.status(403).json({ error: "Forbidden", required: requiredPrivilege });
      return;
    }
    req.userId = payload.userId;
    req.privileges = privs;
    next();
  };
}
