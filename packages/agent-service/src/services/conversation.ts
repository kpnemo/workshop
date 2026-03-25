import { v4 as uuidv4 } from "uuid";
import type { Conversation } from "../types.js";

export class ConversationStore {
  private conversations = new Map<string, Conversation>();

  create(agentId: string): Conversation {
    const conversation: Conversation = {
      id: uuidv4(),
      agentId,
      messages: [],
      createdAt: new Date(),
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    conversation.messages.push({ role, content, timestamp: new Date() });
  }
}
