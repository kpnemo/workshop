import { describe, it, expect, beforeEach } from "vitest";
import { ConversationStore } from "../services/conversation.js";

describe("ConversationStore", () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  it("creates a conversation and returns it", () => {
    const conv = store.create("support-bot");
    expect(conv.id).toBeDefined();
    expect(conv.agentId).toBe("support-bot");
    expect(conv.messages).toEqual([]);
    expect(conv.createdAt).toBeInstanceOf(Date);
  });

  it("retrieves an existing conversation by id", () => {
    const conv = store.create("support-bot");
    const found = store.get(conv.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(conv.id);
  });

  it("returns undefined for unknown conversation id", () => {
    const found = store.get("nonexistent");
    expect(found).toBeUndefined();
  });

  it("appends a user message with timestamp", () => {
    const conv = store.create("support-bot");
    store.addMessage(conv.id, "user", "Hello");
    const updated = store.get(conv.id)!;
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0].role).toBe("user");
    expect(updated.messages[0].content).toBe("Hello");
    expect(updated.messages[0].timestamp).toBeInstanceOf(Date);
  });

  it("appends an assistant message with timestamp", () => {
    const conv = store.create("support-bot");
    store.addMessage(conv.id, "user", "Hello");
    store.addMessage(conv.id, "assistant", "Hi there!");
    const updated = store.get(conv.id)!;
    expect(updated.messages).toHaveLength(2);
    expect(updated.messages[1].role).toBe("assistant");
    expect(updated.messages[1].content).toBe("Hi there!");
  });

  it("throws when adding message to nonexistent conversation", () => {
    expect(() => store.addMessage("bad-id", "user", "Hello")).toThrow(
      "Conversation not found"
    );
  });
});
