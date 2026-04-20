import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { loadAgents } from "./services/agent-loader.js";
import { Database } from "./services/database.js";
import { createConversationRouter } from "./routes/conversations.js";
import { createAuthRouter } from "./routes/auth.js";
import { createAgentsRouter } from "./routes/agents.js";
import { createCopilotRouter } from "./routes/copilot.js";
import { authMiddleware } from "./middleware/auth.js";
import { ToolService } from "./services/tool-service.js";
import { createFilesRouter } from "./routes/files.js";
import { FileService } from "./services/file-service.js";
import { ensureBootstrapAdmin } from "./services/admin-bootstrap.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const AGENTS_DIR =
  process.env.AGENTS_DIR || path.resolve(__dirname, "../../../agents");
const DB_PATH =
  process.env.DB_PATH || path.resolve(__dirname, "../../../packages/data/conversations.db");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("[startup] JWT_SECRET environment variable is required");
  process.exit(1);
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[request] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// Load agents
const agents = loadAgents(AGENTS_DIR);
console.log(`[startup] Loaded ${agents.size} agent(s): ${[...agents.keys()].join(", ")}`);

// Database — ensure parent directory exists, since `packages/data/` is not
// tracked in git and won't be present on a fresh clone (better-sqlite3 will
// crash trying to open a file in a non-existent directory).
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
console.log(`[startup] Database opened at ${DB_PATH}`);

await ensureBootstrapAdmin(db, {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});

// Tool service
const toolService = new ToolService();
toolService.registerDefaults();
console.log(`[startup] Tool service initialized`);

// File service
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(__dirname, "../../../packages/data/uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const fileService = new FileService(db, UPLOADS_DIR);
console.log(`[startup] File service initialized, uploads at ${UPLOADS_DIR}`);

// Routes
app.use("/auth", createAuthRouter(db, JWT_SECRET));
app.use("/agents", createAgentsRouter(agents, AGENTS_DIR, toolService));
app.use("/conversations", authMiddleware(JWT_SECRET), createConversationRouter(agents, db, toolService, fileService));
app.use("/files", authMiddleware(JWT_SECRET), createFilesRouter(db, fileService));
app.use("/copilot", authMiddleware(JWT_SECRET), createCopilotRouter(agents, AGENTS_DIR, toolService.getAvailableTools()));

// Start server
app.listen(PORT, () => {
  console.log(`[startup] Agent service listening on http://localhost:${PORT}`);
});

process.on("SIGTERM", async () => {
  console.log("[shutdown] Shutting down tool service...");
  await toolService.shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[shutdown] Shutting down tool service...");
  await toolService.shutdown();
  process.exit(0);
});
