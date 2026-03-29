import { useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  listConversations,
  createConversation,
  deleteConversation as apiDeleteConversation,
  getConversation,
  sendMessage as apiSendMessage,
} from "../lib/api";
import type { Message, ChatState } from "../types";

export function useChat() {
  const [state, setState] = useState<ChatState>({
    conversationId: null,
    messages: [],
    conversations: [],
    isStreaming: false,
    isConnecting: true,
    error: null,
  });

  const loadConversations = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const conversations = await listConversations();
      if (conversations.length > 0) {
        const mostRecent = conversations[0];
        const detail = await getConversation(mostRecent.id);
        const messages: Message[] = detail.messages.map((m) => ({
          id: uuidv4(),
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp),
        }));
        setState((s) => ({
          ...s,
          conversations,
          conversationId: mostRecent.id,
          messages,
          isConnecting: false,
        }));
      } else {
        const res = await createConversation("support-bot");
        const updatedList = await listConversations();
        setState((s) => ({
          ...s,
          conversations: updatedList,
          conversationId: res.conversationId,
          messages: [],
          isConnecting: false,
        }));
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Failed to connect",
      }));
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const selectConversation = useCallback(async (id: string) => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const detail = await getConversation(id);
      const messages: Message[] = detail.messages.map((m) => ({
        id: uuidv4(),
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
      }));
      setState((s) => ({
        ...s,
        conversationId: id,
        messages,
        isConnecting: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Failed to load conversation",
      }));
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      await apiDeleteConversation(id);
      setState((s) => {
        const remaining = s.conversations.filter((c) => c.id !== id);
        if (s.conversationId === id) {
          return { ...s, conversations: remaining, conversationId: null, messages: [] };
        }
        return { ...s, conversations: remaining };
      });
    },
    []
  );

  // When active conversation becomes null, select next or create new
  useEffect(() => {
    if (state.isConnecting || state.conversationId !== null) return;

    if (state.conversations.length > 0) {
      selectConversation(state.conversations[0].id);
    } else {
      (async () => {
        try {
          const res = await createConversation("support-bot");
          const updatedList = await listConversations();
          setState((s) => ({
            ...s,
            conversations: updatedList,
            conversationId: res.conversationId,
            messages: [],
          }));
        } catch (err) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to create conversation",
          }));
        }
      })();
    }
  }, [state.conversationId, state.conversations, state.isConnecting, selectConversation]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!state.conversationId || state.isStreaming) return;

      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      const assistantMessageId = uuidv4();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setState((s) => ({
        ...s,
        messages: [...s.messages, userMessage, assistantMessage],
        isStreaming: true,
        error: null,
      }));

      apiSendMessage(state.conversationId, text, {
        onDelta: (deltaText) => {
          setState((s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: m.content + deltaText }
                : m
            ),
          }));
        },
        onBlocked: (message) => {
          const systemMessage: Message = {
            id: uuidv4(),
            role: "system",
            content: message,
            timestamp: new Date(),
          };
          setState((s) => ({
            ...s,
            messages: [
              ...s.messages.filter((m) => m.id !== assistantMessageId),
              systemMessage,
            ],
          }));
        },
        onError: (message) => {
          setState((s) => ({
            ...s,
            messages: s.messages.filter((m) => m.id !== assistantMessageId),
            error: message,
          }));
        },
        onTitle: (title) => {
          setState((s) => ({
            ...s,
            conversations: s.conversations.map((c) =>
              c.id === s.conversationId ? { ...c, title } : c
            ),
          }));
        },
        onDone: () => {
          setState((s) => ({
            ...s,
            isStreaming: false,
            conversations: s.conversations
              .map((c) =>
                c.id === s.conversationId
                  ? { ...c, updatedAt: new Date().toISOString(), messageCount: c.messageCount + 2 }
                  : c
              )
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
          }));
        },
      });
    },
    [state.conversationId, state.isStreaming]
  );

  const startNewChat = useCallback(async () => {
    setState((s) => ({
      ...s,
      messages: [],
      isConnecting: true,
      error: null,
      isStreaming: false,
    }));
    try {
      const res = await createConversation("support-bot");
      const updatedList = await listConversations();
      setState((s) => ({
        ...s,
        conversations: updatedList,
        conversationId: res.conversationId,
        isConnecting: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Failed to connect",
      }));
    }
  }, []);

  return { state, sendMessage, startNewChat, selectConversation, deleteConversation };
}
