import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAgents } from "./services/agent-loader.js";
import { Database } from "./services/database.js";
import { createConversationRouter } from "./routes/conversations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const AGENTS_DIR =
  process.env.AGENTS_DIR || path.resolve(__dirname, "../../../agents");
const DB_PATH =
  process.env.DB_PATH || path.resolve(__dirname, "../../../packages/data/conversations.db");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Load agents
const agents = loadAgents(AGENTS_DIR);
console.log(`[startup] Loaded ${agents.size} agent(s): ${[...agents.keys()].join(", ")}`);

// Database
const db = new Database(DB_PATH);
console.log(`[startup] Database opened at ${DB_PATH}`);

// Routes
app.use("/conversations", createConversationRouter(agents, db));

// Start server
app.listen(PORT, () => {
  console.log(`[startup] Agent service listening on http://localhost:${PORT}`);
});
