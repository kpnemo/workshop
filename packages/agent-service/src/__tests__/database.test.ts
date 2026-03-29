import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../services/database.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Database", () => {
  let db: Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
  });

  describe("createConversation", () => {
    it("creates a conversation and returns it", () => {
      const conv = db.createConversation("conv-1", "support-bot");
      expect(conv.id).toBe("conv-1");
      expect(conv.agentId).toBe("support-bot");
      expect(conv.title).toBeNull();
      expect(conv.messages).toEqual([]);
      expect(conv.createdAt).toBeInstanceOf(Date);
      expect(conv.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("getConversation", () => {
    it("returns conversation with messages", () => {
      db.createConversation("conv-1", "support-bot");
      db.addMessage("conv-1", "user", "Hello");
      db.addMessage("conv-1", "assistant", "Hi there!");

      const conv = db.getConversation("conv-1");
      expect(conv).toBeDefined();
      expect(conv!.messages).toHaveLength(2);
      expect(conv!.messages[0].role).toBe("user");
      expect(conv!.messages[0].content).toBe("Hello");
      expect(conv!.messages[0].timestamp).toBeInstanceOf(Date);
      expect(conv!.messages[1].role).toBe("assistant");
      expect(conv!.messages[1].content).toBe("Hi there!");
    });

    it("returns undefined for unknown id", () => {
      expect(db.getConversation("nonexistent")).toBeUndefined();
    });
  });

  describe("listConversations", () => {
    it("returns conversations sorted by updatedAt desc", async () => {
      db.createConversation("conv-1", "support-bot");
      db.addMessage("conv-1", "user", "First");

      await new Promise((r) => setTimeout(r, 10));

      db.createConversation("conv-2", "support-bot");
      db.addMessage("conv-2", "user", "Second");

      const list = db.listConversations();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe("conv-2");
      expect(list[1].id).toBe("conv-1");
      expect(list[0].messageCount).toBe(1);
    });

    it("returns empty array when no conversations", () => {
      expect(db.listConversations()).toEqual([]);
    });
  });

  describe("addMessage", () => {
    it("inserts a message and updates conversation updatedAt", () => {
      const conv = db.createConversation("conv-1", "support-bot");
      const beforeUpdate = conv.updatedAt;

      db.addMessage("conv-1", "user", "Hello");

      const updated = db.getConversation("conv-1")!;
      expect(updated.messages).toHaveLength(1);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it("throws when conversation does not exist", () => {
      expect(() => db.addMessage("bad-id", "user", "Hello")).toThrow(
        "Conversation not found"
      );
    });
  });

  describe("deleteConversation", () => {
    it("deletes conversation and its messages", () => {
      db.createConversation("conv-1", "support-bot");
      db.addMessage("conv-1", "user", "Hello");

      db.deleteConversation("conv-1");

      expect(db.getConversation("conv-1")).toBeUndefined();
      expect(db.listConversations()).toEqual([]);
    });

    it("returns false for unknown id", () => {
      expect(db.deleteConversation("nonexistent")).toBe(false);
    });
  });

  describe("setTitle", () => {
    it("updates the conversation title", () => {
      db.createConversation("conv-1", "support-bot");
      db.setTitle("conv-1", "Billing Help");

      const conv = db.getConversation("conv-1")!;
      expect(conv.title).toBe("Billing Help");
    });
  });
});
