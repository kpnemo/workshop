import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { Database } from "../services/database.js";

const SALT_ROUNDS = 10;

export function createAuthRouter(db: Database, jwtSecret: string): Router {
  const router = Router();

  router.post("/signup", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    console.log(`[auth] Signup attempt for ${email}`);
    if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }
    if (typeof password !== "string" || password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
    if (db.findUserByEmail(email)) { console.log(`[auth] Signup rejected — email already exists: ${email}`); res.status(409).json({ error: "Email already registered" }); return; }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const id = uuidv4();
    db.createUser(id, email, hashedPassword);
    const token = jwt.sign({ userId: id, email }, jwtSecret, { expiresIn: "7d" });
    console.log(`[auth] User created: ${email} (${id})`);
    res.status(201).json({ token, user: { id, email } });
  });

  router.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    console.log(`[auth] Login attempt for ${email}`);
    if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }

    const user = db.findUserByEmail(email);
    if (!user) { console.log(`[auth] Login failed — unknown email: ${email}`); res.status(401).json({ error: "Invalid email or password" }); return; }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) { console.log(`[auth] Login failed — wrong password: ${email}`); res.status(401).json({ error: "Invalid email or password" }); return; }

    const token = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, { expiresIn: "7d" });
    console.log(`[auth] Login success: ${email}`);
    res.status(200).json({ token, user: { id: user.id, email: user.email } });
  });

  return router;
}
