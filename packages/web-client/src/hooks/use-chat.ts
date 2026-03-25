import { useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { createConversation, sendMessage as apiSendMessage } from "../lib/api";
import type { Message, ChatState } from "../types";

export function useChat() {
  const [state, setState] = useState<ChatState>({
    conversationId: null,
    messages: [],
    isStreaming: false,
    isConnecting: true,
    error: null,
  });

  const initConversation = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const res = await createConversation("support-bot");
      setState((s) => ({
        ...s,
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

  useEffect(() => {
    initConversation();
  }, [initConversation]);

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
        onDone: () => {
          setState((s) => ({ ...s, isStreaming: false }));
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
      setState((s) => ({
        ...s,
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

  return { state, sendMessage, startNewChat };
}
