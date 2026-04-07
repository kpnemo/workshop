import BetterSqlite3 from "better-sqlite3";
import type { Conversation, ConversationSummary, Message } from "../types.js";

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.init();
    this.migrate();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    `);
  }

  createConversation(id: string, agentId: string, userId: string): Conversation {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO conversations (id, agent_id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)")
      .run(id, agentId, userId, now, now);
    return { id, agentId, activeAgent: null, title: null, messages: [], createdAt: new Date(now), updatedAt: new Date(now) };
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db
      .prepare("SELECT id, agent_id, active_agent, title, created_at, updated_at FROM conversations WHERE id = ?")
      .get(id) as { id: string; agent_id: string; active_agent: string | null; title: string | null; created_at: string; updated_at: string } | undefined;

    if (!row) return undefined;

    const messages = this.db
      .prepare("SELECT role, content, created_at, agent_id, delegation_meta FROM messages WHERE conversation_id = ? ORDER BY id ASC")
      .all(id) as Array<{ role: string; content: string; created_at: string; agent_id: string | null; delegation_meta: string | null }>;

    return {
      id: row.id,
      agentId: row.agent_id,
      activeAgent: row.active_agent ?? null,
      title: row.title,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
        timestamp: new Date(m.created_at),
        agentId: m.agent_id ?? null,
        delegationMeta: m.delegation_meta ? JSON.parse(m.delegation_meta) : null,
      })),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  listConversations(userId: string): ConversationSummary[] {
    const rows = this.db.prepare(`
      SELECT c.id, c.agent_id, c.title, c.updated_at, COUNT(m.id) as message_count
      FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = ?
      GROUP BY c.id ORDER BY c.updated_at DESC
    `).all(userId) as Array<{ id: string; agent_id: string; title: string | null; updated_at: string; message_count: number }>;
    return rows.map((r) => ({ id: r.id, agentId: r.agent_id, title: r.title, updatedAt: new Date(r.updated_at), messageCount: r.message_count }));
  }

  getConversationOwnerId(conversationId: string): string | undefined {
    const row = this.db.prepare("SELECT user_id FROM conversations WHERE id = ?").get(conversationId) as { user_id: string } | undefined;
    return row?.user_id;
  }

  addMessage(conversationId: string, role: "user" | "assistant", content: string, agentId?: string): void {
    const conv = this.db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get(conversationId);

    if (!conv) {
      throw new Error("Conversation not found");
    }

    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO messages (conversation_id, role, content, created_at, agent_id) VALUES (?, ?, ?, ?, ?)")
      .run(conversationId, role, content, now, agentId ?? null);

    this.db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(now, conversationId);
  }

  addDelegationMessage(conversationId: string, meta: { type: string; from: string; to: string; context?: string; summary?: string }): void {
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO messages (conversation_id, role, content, created_at, delegation_meta) VALUES (?, ?, ?, ?, ?)").run(conversationId, "system", "", now, JSON.stringify(meta));
    this.db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, conversationId);
  }

  setActiveAgent(conversationId: string, agentId: string | null): void {
    this.db.prepare("UPDATE conversations SET active_agent = ? WHERE id = ?").run(agentId, conversationId);
  }

  setAgentId(conversationId: string, agentId: string): void {
    this.db
      .prepare("UPDATE conversations SET agent_id = ?, updated_at = ? WHERE id = ?")
      .run(agentId, new Date().toISOString(), conversationId);
  }

  deleteConversation(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM conversations WHERE id = ?")
      .run(id);

    return result.changes > 0;
  }

  setTitle(id: string, title: string): void {
    this.db
      .prepare("UPDATE conversations SET title = ? WHERE id = ?")
      .run(title, id);
  }

  createUser(id: string, email: string, hashedPassword: string): { id: string; email: string; createdAt: Date } {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO users (id, email, password, created_at) VALUES (?, ?, ?, ?)")
      .run(id, email, hashedPassword, now);
    return { id, email, createdAt: new Date(now) };
  }

  findUserByEmail(email: string): { id: string; email: string; password: string } | undefined {
    const row = this.db
      .prepare("SELECT id, email, password FROM users WHERE email = ?")
      .get(email) as { id: string; email: string; password: string } | undefined;
    return row ?? undefined;
  }

  private migrate(): void {
    const columns = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
    const hasUserId = columns.some((c) => c.name === "user_id");
    if (!hasUserId) {
      this.db.exec("ALTER TABLE conversations ADD COLUMN user_id TEXT REFERENCES users(id)");
      console.log("[database] Migration: added user_id column to conversations");
    }

    const convColumns = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
    if (!convColumns.some((c) => c.name === "active_agent")) {
      this.db.exec("ALTER TABLE conversations ADD COLUMN active_agent TEXT");
      console.log("[database] Migration: added active_agent column to conversations");
    }

    const msgColumns = this.db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
    if (!msgColumns.some((c) => c.name === "agent_id")) {
      this.db.exec("ALTER TABLE messages ADD COLUMN agent_id TEXT");
      console.log("[database] Migration: added agent_id column to messages");
    }
    if (!msgColumns.some((c) => c.name === "delegation_meta")) {
      this.db.exec("ALTER TABLE messages ADD COLUMN delegation_meta TEXT");
      console.log("[database] Migration: added delegation_meta column to messages");
    }
  }

  close(): void {
    this.db.close();
  }
}
