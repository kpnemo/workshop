import { useState, useCallback, useRef } from "react";
import { sendCopilotMessage } from "../lib/copilot-api";
import type { CopilotMessage } from "../lib/copilot-api";
import type { AgentSummary } from "../types";

interface CopilotState {
  messages: CopilotMessage[];
  isStreaming: boolean;
  isOpen: boolean;
  isMinimized: boolean;
}

interface UseCopilotOptions {
  agents: AgentSummary[];
  onAgentReady: (agentId: string) => void;
}

const EDIT_PATTERN = /^(edit|update|modify)\s+(.+)/i;

export function useCopilot({ agents, onAgentReady }: UseCopilotOptions) {
  const [state, setState] = useState<CopilotState>({
    messages: [],
    isStreaming: false,
    isOpen: false,
    isMinimized: true,
  });
  const modeRef = useRef<"create" | "edit">("create");
  const agentIdRef = useRef<string | undefined>(undefined);
  const assistantBufferRef = useRef("");

  const detectMode = useCallback(
    (text: string) => {
      const match = text.match(EDIT_PATTERN);
      if (!match) return;
      const query = match[2].trim().toLowerCase();
      const found = agents.find(
        (a) => a.id === query || a.name.toLowerCase() === query
      );
      if (found) {
        modeRef.current = "edit";
        agentIdRef.current = found.id;
      }
    },
    [agents]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const userMessage: CopilotMessage = { role: "user", content: text };

      if (state.messages.length === 0) {
        modeRef.current = "create";
        agentIdRef.current = undefined;
        detectMode(text);
      }

      const updatedMessages = [...state.messages, userMessage];
      setState((s) => ({ ...s, messages: updatedMessages, isStreaming: true }));
      assistantBufferRef.current = "";

      const messagesWithPlaceholder = [
        ...updatedMessages,
        { role: "assistant" as const, content: "" },
      ];
      setState((s) => ({ ...s, messages: messagesWithPlaceholder }));

      await sendCopilotMessage(
        updatedMessages,
        modeRef.current,
        agentIdRef.current,
        {
          onDelta: (deltaText: string) => {
            assistantBufferRef.current += deltaText;
            const content = assistantBufferRef.current;
            setState((s) => ({
              ...s,
              messages: [
                ...updatedMessages,
                { role: "assistant", content },
              ],
            }));
          },
          onAgentCreated: (data) => {
            onAgentReady(data.agentId);
          },
          onAgentUpdated: (data) => {
            onAgentReady(data.agentId);
          },
          onError: (message: string) => {
            const content = assistantBufferRef.current || `Error: ${message}`;
            setState((s) => ({
              ...s,
              messages: [
                ...updatedMessages,
                { role: "assistant", content },
              ],
            }));
          },
          onDone: () => {
            setState((s) => ({ ...s, isStreaming: false }));
          },
        }
      );
    },
    [state.messages, detectMode, onAgentReady]
  );

  const reset = useCallback(() => {
    setState((s) => ({ ...s, messages: [] }));
    modeRef.current = "create";
    agentIdRef.current = undefined;
    assistantBufferRef.current = "";
  }, []);

  const toggle = useCallback(() => {
    setState((s) => ({
      ...s,
      isOpen: !s.isOpen,
      isMinimized: false,
    }));
  }, []);

  const minimize = useCallback(() => {
    setState((s) => ({ ...s, isMinimized: true, isOpen: false }));
  }, []);

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    isOpen: state.isOpen,
    isMinimized: state.isMinimized,
    sendMessage,
    reset,
    toggle,
    minimize,
  };
}
