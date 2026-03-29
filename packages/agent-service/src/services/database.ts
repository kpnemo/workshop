import BetterSqlite3 from "better-sqlite3";
import type { Conversation, ConversationSummary, Message } from "../types.js";

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
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

  createConversation(id: string, agentId: string): Conversation {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO conversations (id, agent_id, title, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)"
      )
      .run(id, agentId, now, now);

    return {
      id,
      agentId,
      title: null,
      messages: [],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db
      .prepare("SELECT id, agent_id, title, created_at, updated_at FROM conversations WHERE id = ?")
      .get(id) as { id: string; agent_id: string; title: string | null; created_at: string; updated_at: string } | undefined;

    if (!row) return undefined;

    const messages = this.db
      .prepare("SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC")
      .all(id) as Array<{ role: string; content: string; created_at: string }>;

    return {
      id: row.id,
      agentId: row.agent_id,
      title: row.title,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.created_at),
      })),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  listConversations(): ConversationSummary[] {
    const rows = this.db
      .prepare(`
        SELECT c.id, c.agent_id, c.title, c.updated_at,
               COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
      `)
      .all() as Array<{
        id: string;
        agent_id: string;
        title: string | null;
        updated_at: string;
        message_count: number;
      }>;

    return rows.map((r) => ({
      id: r.id,
      agentId: r.agent_id,
      title: r.title,
      updatedAt: new Date(r.updated_at),
      messageCount: r.message_count,
    }));
  }

  addMessage(conversationId: string, role: "user" | "assistant", content: string): void {
    const conv = this.db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get(conversationId);

    if (!conv) {
      throw new Error("Conversation not found");
    }

    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)")
      .run(conversationId, role, content, now);

    this.db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(now, conversationId);
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

  close(): void {
    this.db.close();
  }
}
