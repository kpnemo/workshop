import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JwtPayload { userId: string; email: string; }

export function authMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const payload = jwt.verify(header.slice(7), secret) as JwtPayload;
      req.userId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}
