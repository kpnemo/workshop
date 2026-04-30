import BetterSqlite3 from "better-sqlite3";
import type { Conversation, ConversationSummary, FileRecord, Message } from "../types.js";
import { PRIVILEGE_KEYS } from "./privileges.js";

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
        updated_at TEXT NOT NULL,
        icon TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS user_groups (
        user_id  TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
        group_id TEXT NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
        PRIMARY KEY (user_id, group_id)
      );

      CREATE TABLE IF NOT EXISTS group_profiles (
        group_id   TEXT NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, profile_id)
      );

      CREATE TABLE IF NOT EXISTS profile_privileges (
        profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        privilege_key TEXT NOT NULL,
        PRIMARY KEY (profile_id, privilege_key)
      );

      CREATE INDEX IF NOT EXISTS idx_user_groups_group       ON user_groups(group_id);
      CREATE INDEX IF NOT EXISTS idx_group_profiles_profile  ON group_profiles(profile_id);
    `);
  }

  createConversation(id: string, agentId: string, userId: string): Conversation {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO conversations (id, agent_id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)")
      .run(id, agentId, userId, now, now);
    return { id, agentId, activeAgent: null, title: null, messages: [], createdAt: new Date(now), updatedAt: new Date(now), summary: null, summaryEnabled: false, icon: null };
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db
      .prepare("SELECT id, agent_id, active_agent, title, created_at, updated_at, summary, summary_enabled, icon FROM conversations WHERE id = ?")
      .get(id) as { id: string; agent_id: string; active_agent: string | null; title: string | null; created_at: string; updated_at: string; summary: string | null; summary_enabled: number; icon: string | null } | undefined;

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
      summary: row.summary ?? null,
      summaryEnabled: row.summary_enabled === 1,
      icon: row.icon ?? null,
    };
  }

  listConversations(userId: string): ConversationSummary[] {
    const rows = this.db.prepare(`
      SELECT c.id, c.agent_id, c.title, c.updated_at, COUNT(m.id) as message_count, c.summary_enabled, c.icon
      FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = ?
      GROUP BY c.id ORDER BY c.updated_at DESC
    `).all(userId) as Array<{ id: string; agent_id: string; title: string | null; updated_at: string; message_count: number; summary_enabled: number; icon: string | null }>;
    return rows.map((r) => ({ id: r.id, agentId: r.agent_id, title: r.title, updatedAt: new Date(r.updated_at), messageCount: r.message_count, summaryEnabled: r.summary_enabled === 1, icon: r.icon ?? null }));
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

  setIcon(id: string, icon: string): void {
    this.db
      .prepare("UPDATE conversations SET icon = ? WHERE id = ?")
      .run(icon, id);
  }

  setSummary(id: string, summary: string): void {
    this.db.prepare("UPDATE conversations SET summary = ? WHERE id = ?").run(summary, id);
  }

  setSummaryEnabled(id: string, enabled: boolean): void {
    this.db.prepare("UPDATE conversations SET summary_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
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

    const convCols2 = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
    if (!convCols2.some((c) => c.name === "summary")) {
      this.db.exec("ALTER TABLE conversations ADD COLUMN summary TEXT");
      console.log("[database] Migration: added summary column to conversations");
    }
    if (!convCols2.some((c) => c.name === "summary_enabled")) {
      this.db.exec(
        "ALTER TABLE conversations ADD COLUMN summary_enabled INTEGER DEFAULT 0"
      );
      console.log("[database] Migration: added summary_enabled column to conversations");
    }

    const convCols3 = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
    if (!convCols3.some((c) => c.name === "icon")) {
      this.db.exec("ALTER TABLE conversations ADD COLUMN icon TEXT");
      console.log("[database] Migration: added icon column to conversations");
    }
  }

  addFile(params: { id: string; userId: string; filename: string; storagePath: string; sizeBytes: number; mimeType: string }): void {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO files (id, user_id, filename, storage_path, size_bytes, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(params.id, params.userId, params.filename, params.storagePath, params.sizeBytes, params.mimeType, now);
  }

  getFilesByUser(userId: string): FileRecord[] {
    const rows = this.db
      .prepare("SELECT id, user_id, filename, storage_path, size_bytes, mime_type, description, created_at FROM files WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as Array<{ id: string; user_id: string; filename: string; storage_path: string; size_bytes: number; mime_type: string; description: string | null; created_at: string }>;
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      filename: r.filename,
      storagePath: r.storage_path,
      sizeBytes: r.size_bytes,
      mimeType: r.mime_type,
      description: r.description,
      createdAt: new Date(r.created_at),
    }));
  }

  getFileById(id: string): FileRecord | undefined {
    const row = this.db
      .prepare("SELECT id, user_id, filename, storage_path, size_bytes, mime_type, description, created_at FROM files WHERE id = ?")
      .get(id) as { id: string; user_id: string; filename: string; storage_path: string; size_bytes: number; mime_type: string; description: string | null; created_at: string } | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      storagePath: row.storage_path,
      sizeBytes: row.size_bytes,
      mimeType: row.mime_type,
      description: row.description,
      createdAt: new Date(row.created_at),
    };
  }

  updateFileDescription(id: string, description: string): void {
    this.db.prepare("UPDATE files SET description = ? WHERE id = ?").run(description, id);
  }

  deleteFile(id: string): boolean {
    const result = this.db.prepare("DELETE FROM files WHERE id = ?").run(id);
    return result.changes > 0;
  }

  createGroup(id: string, name: string): import("../types.js").Group {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)")
      .run(id, name.trim(), now);
    return { id, name: name.trim(), createdAt: now };
  }

  listGroups(): import("../types.js").Group[] {
    const rows = this.db
      .prepare("SELECT id, name, created_at FROM groups ORDER BY name")
      .all() as Array<{ id: string; name: string; created_at: string }>;
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  getGroup(id: string): import("../types.js").Group | undefined {
    const row = this.db
      .prepare("SELECT id, name, created_at FROM groups WHERE id = ?")
      .get(id) as { id: string; name: string; created_at: string } | undefined;
    return row && { id: row.id, name: row.name, createdAt: row.created_at };
  }

  renameGroup(id: string, name: string): void {
    this.db
      .prepare("UPDATE groups SET name = ? WHERE id = ?")
      .run(name.trim(), id);
  }

  deleteGroup(id: string): void {
    this.db.prepare("DELETE FROM groups WHERE id = ?").run(id);
  }

  createProfile(id: string, name: string): import("../types.js").Profile {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)")
      .run(id, name.trim(), now);
    return { id, name: name.trim(), createdAt: now };
  }

  listProfiles(): import("../types.js").Profile[] {
    const rows = this.db
      .prepare("SELECT id, name, created_at FROM profiles ORDER BY name")
      .all() as Array<{ id: string; name: string; created_at: string }>;
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  getProfile(id: string): import("../types.js").Profile | undefined {
    const row = this.db
      .prepare("SELECT id, name, created_at FROM profiles WHERE id = ?")
      .get(id) as { id: string; name: string; created_at: string } | undefined;
    return row && { id: row.id, name: row.name, createdAt: row.created_at };
  }

  renameProfile(id: string, name: string): void {
    this.db.prepare("UPDATE profiles SET name = ? WHERE id = ?").run(name.trim(), id);
  }

  deleteProfile(id: string): void {
    this.db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
  }

  listAdminUsers(): import("../types.js").AdminUserSummary[] {
    const users = this.db
      .prepare("SELECT id, email, created_at FROM users ORDER BY email")
      .all() as Array<{ id: string; email: string; created_at: string }>;
    const memberships = this.db
      .prepare("SELECT user_id, group_id FROM user_groups")
      .all() as Array<{ user_id: string; group_id: string }>;
    const byUser = new Map<string, string[]>();
    for (const m of memberships) {
      const arr = byUser.get(m.user_id) ?? [];
      arr.push(m.group_id);
      byUser.set(m.user_id, arr);
    }
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      groupIds: byUser.get(u.id) ?? [],
    }));
  }

  updateUserEmail(id: string, email: string): void {
    this.db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email.trim().toLowerCase(), id);
  }

  updateUserPassword(id: string, hashed: string): void {
    this.db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, id);
  }

  deleteUser(id: string): void {
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }

  setUserGroups(userId: string, groupIds: string[]): void {
    const deleteStmt = this.db.prepare("DELETE FROM user_groups WHERE user_id = ?");
    const insertStmt = this.db.prepare("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)");
    this.db.transaction(() => {
      deleteStmt.run(userId);
      for (const gid of groupIds) insertStmt.run(userId, gid);
    })();
  }

  listUserGroupIds(userId: string): string[] {
    const rows = this.db
      .prepare("SELECT group_id FROM user_groups WHERE user_id = ?")
      .all(userId) as Array<{ group_id: string }>;
    return rows.map((r) => r.group_id);
  }

  setGroupMembers(groupId: string, userIds: string[]): void {
    const deleteStmt = this.db.prepare("DELETE FROM user_groups WHERE group_id = ?");
    const insertStmt = this.db.prepare("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)");
    this.db.transaction(() => {
      deleteStmt.run(groupId);
      for (const uid of userIds) insertStmt.run(uid, groupId);
    })();
  }

  listGroupMemberIds(groupId: string): string[] {
    const rows = this.db
      .prepare("SELECT user_id FROM user_groups WHERE group_id = ?")
      .all(groupId) as Array<{ user_id: string }>;
    return rows.map((r) => r.user_id);
  }

  setGroupProfiles(groupId: string, profileIds: string[]): void {
    const deleteStmt = this.db.prepare("DELETE FROM group_profiles WHERE group_id = ?");
    const insertStmt = this.db.prepare("INSERT INTO group_profiles (group_id, profile_id) VALUES (?, ?)");
    this.db.transaction(() => {
      deleteStmt.run(groupId);
      for (const pid of profileIds) insertStmt.run(groupId, pid);
    })();
  }

  listGroupProfileIds(groupId: string): string[] {
    const rows = this.db
      .prepare("SELECT profile_id FROM group_profiles WHERE group_id = ?")
      .all(groupId) as Array<{ profile_id: string }>;
    return rows.map((r) => r.profile_id);
  }

  setProfilePrivileges(profileId: string, keys: string[]): void {
    for (const k of keys) {
      if (!PRIVILEGE_KEYS.has(k)) throw new Error(`unknown privilege: ${k}`);
    }
    const deleteStmt = this.db.prepare("DELETE FROM profile_privileges WHERE profile_id = ?");
    const insertStmt = this.db.prepare("INSERT INTO profile_privileges (profile_id, privilege_key) VALUES (?, ?)");
    this.db.transaction(() => {
      deleteStmt.run(profileId);
      for (const k of keys) insertStmt.run(profileId, k);
    })();
  }

  listProfilePrivileges(profileId: string): string[] {
    const rows = this.db
      .prepare("SELECT privilege_key FROM profile_privileges WHERE profile_id = ?")
      .all(profileId) as Array<{ privilege_key: string }>;
    return rows.map((r) => r.privilege_key);
  }

  getEffectivePrivileges(userId: string): Set<string> {
    const rows = this.db.prepare(`
      SELECT DISTINCT pp.privilege_key
        FROM user_groups ug
        JOIN group_profiles gp  ON gp.group_id = ug.group_id
        JOIN profile_privileges pp ON pp.profile_id = gp.profile_id
       WHERE ug.user_id = ?
    `).all(userId) as Array<{ privilege_key: string }>;
    return new Set(rows.map((r) => r.privilege_key));
  }

  countUsersWithPrivilege(key: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(DISTINCT ug.user_id) AS c
        FROM user_groups ug
        JOIN group_profiles gp ON gp.group_id = ug.group_id
        JOIN profile_privileges pp ON pp.profile_id = gp.profile_id
       WHERE pp.privilege_key = ?
    `).get(key) as { c: number };
    return row.c;
  }

  countProfilesWithPrivilege(key: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS c FROM profile_privileges WHERE privilege_key = ?")
      .get(key) as { c: number };
    return row.c;
  }

  close(): void {
    this.db.close();
  }
}
