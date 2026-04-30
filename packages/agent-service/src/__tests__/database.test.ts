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
    it("creates a conversation with userId and returns it", () => {
      db.createUser("u-1", "test@example.com", "hashed-pw");
      const conv = db.createConversation("conv-1", "support-bot", "u-1");
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
      db.createUser("u-1", "test@example.com", "pw");
      db.createConversation("conv-1", "support-bot", "u-1");
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
    it("returns only conversations for the given user", () => {
      db.createUser("u-1", "a@example.com", "pw");
      db.createUser("u-2", "b@example.com", "pw");
      db.createConversation("conv-1", "support-bot", "u-1");
      db.createConversation("conv-2", "support-bot", "u-2");

      const list = db.listConversations("u-1");
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("conv-1");
    });

    it("returns empty array when user has no conversations", () => {
      db.createUser("u-1", "a@example.com", "pw");
      expect(db.listConversations("u-1")).toEqual([]);
    });
  });

  describe("addMessage", () => {
    it("inserts a message and updates conversation updatedAt", () => {
      db.createUser("u-1", "test@example.com", "pw");
      const conv = db.createConversation("conv-1", "support-bot", "u-1");
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
      db.createUser("u-1", "test@example.com", "pw");
      db.createConversation("conv-1", "support-bot", "u-1");
      db.addMessage("conv-1", "user", "Hello");

      db.deleteConversation("conv-1");

      expect(db.getConversation("conv-1")).toBeUndefined();
      expect(db.listConversations("u-1")).toEqual([]);
    });

    it("returns false for unknown id", () => {
      expect(db.deleteConversation("nonexistent")).toBe(false);
    });
  });

  describe("setTitle", () => {
    it("updates the conversation title", () => {
      db.createUser("u-1", "test@example.com", "pw");
      db.createConversation("conv-1", "support-bot", "u-1");
      db.setTitle("conv-1", "Billing Help");

      const conv = db.getConversation("conv-1")!;
      expect(conv.title).toBe("Billing Help");
    });
  });

  describe("createUser", () => {
    it("creates a user and returns it", () => {
      const user = db.createUser("u-1", "test@example.com", "hashed-pw");
      expect(user.id).toBe("u-1");
      expect(user.email).toBe("test@example.com");
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it("throws on duplicate email", () => {
      db.createUser("u-1", "test@example.com", "hashed-pw");
      expect(() => db.createUser("u-2", "test@example.com", "hashed-pw")).toThrow();
    });
  });

  describe("findUserByEmail", () => {
    it("returns user with password hash", () => {
      db.createUser("u-1", "test@example.com", "hashed-pw");
      const user = db.findUserByEmail("test@example.com");
      expect(user).toBeDefined();
      expect(user!.id).toBe("u-1");
      expect(user!.password).toBe("hashed-pw");
    });

    it("returns undefined for unknown email", () => {
      expect(db.findUserByEmail("nobody@example.com")).toBeUndefined();
    });
  });

  describe("getConversationOwnerId", () => {
    it("returns the owner userId", () => {
      db.createUser("u-1", "test@example.com", "pw");
      db.createConversation("conv-1", "support-bot", "u-1");
      expect(db.getConversationOwnerId("conv-1")).toBe("u-1");
    });

    it("returns undefined for unknown conversation", () => {
      expect(db.getConversationOwnerId("nonexistent")).toBeUndefined();
    });
  });

  describe("setAgentId", () => {
    it("setAgentId updates the agent_id of a conversation", () => {
      db.createUser("u1", "a@b.com", "x");
      db.createConversation("c1", "router", "u1");
      db.setAgentId("c1", "weather-agent");
      const conv = db.getConversation("c1")!;
      expect(conv.agentId).toBe("weather-agent");
    });
  });

  describe("Delegation support", () => {
    it("stores and retrieves active_agent on conversation", () => {
      db.createUser("user-1", "d1@example.com", "pw");
      db.createConversation("conv-d1", "main-agent", "user-1");
      db.setActiveAgent("conv-d1", "specialist-agent");
      const conv = db.getConversation("conv-d1")!;
      expect(conv.activeAgent).toBe("specialist-agent");
    });

    it("defaults active_agent to null", () => {
      db.createUser("user-1", "d2@example.com", "pw");
      db.createConversation("conv-d2", "main-agent", "user-1");
      const conv = db.getConversation("conv-d2")!;
      expect(conv.activeAgent).toBeNull();
    });

    it("clears active_agent", () => {
      db.createUser("user-1", "d3@example.com", "pw");
      db.createConversation("conv-d3", "main-agent", "user-1");
      db.setActiveAgent("conv-d3", "specialist-agent");
      db.setActiveAgent("conv-d3", null);
      const conv = db.getConversation("conv-d3")!;
      expect(conv.activeAgent).toBeNull();
    });

    it("stores agent_id on messages", () => {
      db.createUser("user-1", "d4@example.com", "pw");
      db.createConversation("conv-d4", "main-agent", "user-1");
      db.addMessage("conv-d4", "assistant", "Hello", "main-agent");
      db.addMessage("conv-d4", "user", "Hi");
      const conv = db.getConversation("conv-d4")!;
      expect(conv.messages[0].agentId).toBe("main-agent");
      expect(conv.messages[1].agentId).toBeNull();
    });

    it("stores delegation_meta on messages", () => {
      db.createUser("user-1", "d5@example.com", "pw");
      db.createConversation("conv-d5", "main-agent", "user-1");
      const meta = { type: "delegation_start", from: "main-agent", to: "schedule-agent", context: "schedule a meeting" };
      db.addDelegationMessage("conv-d5", meta);
      const conv = db.getConversation("conv-d5")!;
      const delegationMsg = conv.messages.find(m => m.delegationMeta);
      expect(delegationMsg).toBeDefined();
      expect(delegationMsg!.delegationMeta).toEqual(meta);
    });
  });

  describe("Summary support", () => {
    it("setSummary stores and getConversation returns it", () => {
      db.createUser("u-1", "s1@example.com", "pw");
      db.createConversation("conv-s1", "support-bot", "u-1");
      db.setSummary("conv-s1", "User asked about billing.");

      const conv = db.getConversation("conv-s1")!;
      expect(conv.summary).toBe("User asked about billing.");
    });

    it("summary defaults to null on new conversation", () => {
      db.createUser("u-1", "s2@example.com", "pw");
      db.createConversation("conv-s2", "support-bot", "u-1");

      const conv = db.getConversation("conv-s2")!;
      expect(conv.summary).toBeNull();
      expect(conv.summaryEnabled).toBe(false);
    });

    it("setSummaryEnabled toggles the flag", () => {
      db.createUser("u-1", "s3@example.com", "pw");
      db.createConversation("conv-s3", "support-bot", "u-1");

      db.setSummaryEnabled("conv-s3", true);
      expect(db.getConversation("conv-s3")!.summaryEnabled).toBe(true);

      db.setSummaryEnabled("conv-s3", false);
      expect(db.getConversation("conv-s3")!.summaryEnabled).toBe(false);
    });

    it("listConversations includes summaryEnabled", () => {
      db.createUser("u-1", "s4@example.com", "pw");
      db.createConversation("conv-s4", "support-bot", "u-1");
      db.setSummaryEnabled("conv-s4", true);

      const list = db.listConversations("u-1");
      expect(list[0].summaryEnabled).toBe(true);
    });
  });

  describe("File methods", () => {
    it("addFile inserts a file record and getFilesByUser returns it", () => {
      db.createUser("u-1", "test@example.com", "pw");
      db.addFile({
        id: "f-1",
        userId: "u-1",
        filename: "report.pdf",
        storagePath: "/uploads/u-1/f-1-report.pdf",
        sizeBytes: 1024,
        mimeType: "application/pdf",
      });

      const files = db.getFilesByUser("u-1");
      expect(files).toHaveLength(1);
      expect(files[0].id).toBe("f-1");
      expect(files[0].filename).toBe("report.pdf");
      expect(files[0].sizeBytes).toBe(1024);
      expect(files[0].mimeType).toBe("application/pdf");
      expect(files[0].description).toBeNull();
      expect(files[0].createdAt).toBeInstanceOf(Date);
    });

    it("getFilesByUser returns only that user's files", () => {
      db.createUser("u-1", "a@example.com", "pw");
      db.createUser("u-2", "b@example.com", "pw");
      db.addFile({ id: "f-1", userId: "u-1", filename: "a.txt", storagePath: "/a", sizeBytes: 10, mimeType: "text/plain" });
      db.addFile({ id: "f-2", userId: "u-2", filename: "b.txt", storagePath: "/b", sizeBytes: 20, mimeType: "text/plain" });

      expect(db.getFilesByUser("u-1")).toHaveLength(1);
      expect(db.getFilesByUser("u-2")).toHaveLength(1);
    });

    it("getFilesByUser returns empty array when user has no files", () => {
      db.createUser("u-1", "a@example.com", "pw");
      expect(db.getFilesByUser("u-1")).toEqual([]);
    });

    it("getFileById returns the file record", () => {
      db.createUser("u-1", "a@example.com", "pw");
      db.addFile({ id: "f-1", userId: "u-1", filename: "data.csv", storagePath: "/data", sizeBytes: 500, mimeType: "text/csv" });

      const file = db.getFileById("f-1");
      expect(file).toBeDefined();
      expect(file!.filename).toBe("data.csv");
    });

    it("getFileById returns undefined for unknown id", () => {
      expect(db.getFileById("nonexistent")).toBeUndefined();
    });

    it("updateFileDescription sets the description", () => {
      db.createUser("u-1", "a@example.com", "pw");
      db.addFile({ id: "f-1", userId: "u-1", filename: "report.pdf", storagePath: "/r", sizeBytes: 100, mimeType: "application/pdf" });
      db.updateFileDescription("f-1", "A quarterly report.");

      const file = db.getFileById("f-1");
      expect(file!.description).toBe("A quarterly report.");
    });

    it("deleteFile removes the record and returns true", () => {
      db.createUser("u-1", "a@example.com", "pw");
      db.addFile({ id: "f-1", userId: "u-1", filename: "old.txt", storagePath: "/old", sizeBytes: 50, mimeType: "text/plain" });

      expect(db.deleteFile("f-1")).toBe(true);
      expect(db.getFileById("f-1")).toBeUndefined();
      expect(db.getFilesByUser("u-1")).toEqual([]);
    });

    it("deleteFile returns false for unknown id", () => {
      expect(db.deleteFile("nonexistent")).toBe(false);
    });
  });
});

describe("conversation icon column", () => {
  let db: Database;
  let userId: string;
  let convId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    userId = "u1";
    db.createUser(userId, "u1@test", "hash");
    const conv = db.createConversation("c1", "support-bot", userId);
    convId = conv.id;
  });

  afterEach(() => {
    db.close();
  });

  it("starts with icon as null", () => {
    const conv = db.getConversation(convId)!;
    expect(conv.icon).toBeNull();
  });

  it("setIcon persists the value", () => {
    db.setIcon(convId, "emoji:🔢");
    const conv = db.getConversation(convId)!;
    expect(conv.icon).toBe("emoji:🔢");
  });

  it("setIcon overwrites existing value", () => {
    db.setIcon(convId, "emoji:🔢");
    db.setIcon(convId, "lucide:plane");
    const conv = db.getConversation(convId)!;
    expect(conv.icon).toBe("lucide:plane");
  });

  it("listConversations includes icon field", () => {
    db.setIcon(convId, "emoji:🐛");
    const list = db.listConversations(userId);
    expect(list).toHaveLength(1);
    expect(list[0].icon).toBe("emoji:🐛");
  });

  it("listConversations returns null icon for fresh conversations", () => {
    const list = db.listConversations(userId);
    expect(list[0].icon).toBeNull();
  });
});
