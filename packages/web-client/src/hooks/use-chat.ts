import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  listConversations,
  createConversation,
  deleteConversation as apiDeleteConversation,
  getConversation,
  sendMessage as apiSendMessage,
  refreshSummary as apiRefreshSummary,
  toggleSummary as apiToggleSummary,
} from "../lib/api";
import type { Message, ChatState, FileInfo } from "../types";
import type { useDebug } from "./use-debug";

const LAST_AGENT_KEY = "lastAgentId";

function getLastAgentId(): string | null {
  return localStorage.getItem(LAST_AGENT_KEY);
}

function setLastAgentId(id: string): void {
  localStorage.setItem(LAST_AGENT_KEY, id);
}

export function useChat(
  defaultAgentId: string | null,
  agentIds: string[] = [],
  debug?: ReturnType<typeof useDebug>
) {
  const [state, setState] = useState<ChatState>({
    conversationId: null,
    messages: [],
    conversations: [],
    isStreaming: false,
    isConnecting: true,
    error: null,
    summary: null,
    summaryEnabled: false,
  });

  const activeAssistantIdRef = useRef<string | null>(null);

  const stableAgentIds = useMemo(() => agentIds, [agentIds.join(",")]);

  const resolveAgentId = useCallback((): string | null => {
    // Default to router if it exists in the agents list
    if (stableAgentIds.includes("router")) {
      const lastId = getLastAgentId();
      // Honor an explicit prior choice only if it was a non-router agent
      if (lastId && lastId !== "router" && stableAgentIds.includes(lastId)) {
        return lastId;
      }
      return "router";
    }
    // Fallback to existing logic when router is not available
    const lastId = getLastAgentId();
    if (lastId && stableAgentIds.length > 0 && stableAgentIds.includes(lastId)) {
      return lastId;
    }
    if (lastId && stableAgentIds.length === 0) {
      return lastId;
    }
    return defaultAgentId;
  }, [defaultAgentId, stableAgentIds]);

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
          agentId: m.agentId ?? null,
          delegationMeta: m.delegationMeta ?? null,
        }));
        setState((s) => ({
          ...s,
          conversations,
          conversationId: mostRecent.id,
          messages,
          isConnecting: false,
          summary: detail.summary ?? null,
          summaryEnabled: detail.summaryEnabled ?? false,
        }));
      } else {
        const agentId = resolveAgentId();
        if (!agentId) {
          setState((s) => ({ ...s, conversations: [], isConnecting: false }));
          return;
        }
        const res = await createConversation(agentId);
        setLastAgentId(agentId);
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
  }, [resolveAgentId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Clear debug events when conversation changes
  useEffect(() => {
    debug?.clearEvents();
  }, [state.conversationId]);

  const selectConversation = useCallback(async (id: string) => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const detail = await getConversation(id);
      const messages: Message[] = detail.messages.map((m) => ({
        id: uuidv4(),
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        agentId: m.agentId ?? null,
        delegationMeta: m.delegationMeta ?? null,
      }));
      setState((s) => ({
        ...s,
        conversationId: id,
        messages,
        isConnecting: false,
        summary: detail.summary ?? null,
        summaryEnabled: detail.summaryEnabled ?? false,
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

  useEffect(() => {
    if (state.isConnecting || state.conversationId !== null) return;

    if (state.conversations.length > 0) {
      selectConversation(state.conversations[0].id);
    } else {
      (async () => {
        const agentId = resolveAgentId();
        if (!agentId) return;
        try {
          const res = await createConversation(agentId);
          setLastAgentId(agentId);
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
  }, [state.conversationId, state.conversations, state.isConnecting, selectConversation, resolveAgentId]);

  const sendMessage = useCallback(
    (text: string, attachment?: FileInfo) => {
      if (!state.conversationId || state.isStreaming) return;

      // Prepend attachment note if a file was attached
      let messageText = text;
      if (attachment) {
        const prefix = `[Attached file: ${attachment.filename}]`;
        messageText = text ? `${prefix}\n${text}` : prefix;
      }

      const userMessage: Message = {
        id: uuidv4(), role: "user", content: messageText, timestamp: new Date(),
      };
      const assistantMessageId = uuidv4();
      const assistantMessage: Message = {
        id: assistantMessageId, role: "assistant", content: "", timestamp: new Date(),
      };

      activeAssistantIdRef.current = assistantMessageId;

      setState((s) => ({
        ...s,
        messages: [...s.messages, userMessage, assistantMessage],
        isStreaming: true, error: null,
      }));

      if (debug?.isDebug) {
        debug.startTurn(messageText);
      }

      apiSendMessage(state.conversationId, messageText, {
        onDelta: (deltaText, agentId) => {
          const targetId = activeAssistantIdRef.current;
          if (!targetId) return;
          setState((s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === targetId
                ? { ...m, content: m.content + deltaText, agentId: agentId ?? null }
                : m
            ),
          }));
        },
        onRedirect: (data) => {
          const banner: Message = {
            id: uuidv4(),
            role: "system",
            content: "",
            timestamp: new Date(),
            delegationMeta: {
              type: "redirect_to_router",
              from: data.from,
              to: data.to,
              agentName: data.agentName,
              reason: data.reason,
            },
          };
          setState((s) => ({
            ...s,
            messages: [
              // Drop the empty specialist placeholder; the upcoming assignment
              // event will mint a fresh placeholder for the next specialist.
              ...s.messages.filter((m) => !(m.id === assistantMessageId && m.content === "")),
              banner,
            ],
            conversations: s.conversations.map((c) =>
              c.id === s.conversationId ? { ...c, agentId: data.to } : c
            ),
          }));
          // The active assistant ref is now stale; the next assignment event mints a new one.
          activeAssistantIdRef.current = null;
          debug?.addEvent({
            type: "assignment",
            data: { from: data.from, to: data.to, agentName: data.agentName, reason: data.reason },
          });
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
        onAssignment: (data) => {
          const banner: Message = {
            id: uuidv4(),
            role: "system",
            content: "",
            timestamp: new Date(),
            delegationMeta: {
              type: "assignment",
              from: data.from,
              to: data.to,
              agentName: data.agentName,
              reason: data.reason,
            },
          };
          // Mint a new placeholder for the assigned agent's reply and point the
          // active-assistant ref at it, otherwise subsequent onDelta events have
          // nothing to land in (the previous placeholder was the router's, and
          // we drop it below if it never streamed any text).
          const assignedAssistantId = uuidv4();
          activeAssistantIdRef.current = assignedAssistantId;
          const assignedAssistant: Message = {
            id: assignedAssistantId,
            role: "assistant",
            content: "",
            timestamp: new Date(),
            agentId: data.to,
          };
          setState((s) => ({
            ...s,
            messages: [
              ...s.messages.filter((m) => !(m.id === assistantMessageId && m.content === "")),
              banner,
              assignedAssistant,
            ],
            conversations: s.conversations.map((c) =>
              c.id === s.conversationId ? { ...c, agentId: data.to } : c
            ),
          }));
          debug?.addEvent({
            type: "assignment",
            data: { from: data.from, to: data.to, agentName: data.agentName, reason: data.reason },
          });
        },
        onDelegationStart: (data) => {
          const specialistMessageId = uuidv4();
          activeAssistantIdRef.current = specialistMessageId;
          const delegationMessage: Message = {
            id: uuidv4(),
            role: "system",
            content: "",
            timestamp: new Date(),
            delegationMeta: {
              type: "delegation_start",
              from: data.from,
              to: data.to,
              context: data.context,
            },
          };
          const specialistMessage: Message = {
            id: specialistMessageId,
            role: "assistant",
            content: "",
            timestamp: new Date(),
            agentId: data.to,
          };
          setState((s) => ({
            ...s,
            messages: [...s.messages, delegationMessage, specialistMessage],
          }));
          debug?.addEvent({
            type: "delegation",
            data: { from: data.from, to: data.to, context: data.context, agentName: data.agentName },
          });
        },
        onDelegationEnd: (data) => {
          const delegationMessage: Message = {
            id: uuidv4(),
            role: "system",
            content: "",
            timestamp: new Date(),
            delegationMeta: {
              type: "delegation_end",
              from: data.from,
              to: data.to,
              summary: data.summary,
            },
          };
          setState((s) => ({
            ...s,
            messages: [...s.messages, delegationMessage],
          }));
          debug?.addEvent({
            type: "delegation",
            data: { from: data.from, to: data.to, summary: data.summary, agentName: data.agentName },
          });
        },
        onDebugAgent: (data) => {
          debug?.addEvent({ type: "agent", data });
        },
        onDebugThinking: (data) => {
          debug?.addEvent({ type: "thinking", data });
        },
        onDebugTool: (data) => {
          debug?.addEvent({ type: "tool", data });
        },
        onDebugStream: (data) => {
          debug?.addEvent({ type: "stream", data });
        },
        onSummary: (data) => {
          setState((s) => ({ ...s, summary: data.summary }));
        },
        onDebugSummary: (data) => {
          debug?.addEvent({ type: "summary", data });
        },
      }, { debug: debug?.isDebug });
    },
    [state.conversationId, state.isStreaming, debug]
  );

  const startNewChat = useCallback(async (agentId?: string) => {
    const resolvedId = agentId || resolveAgentId();
    if (!resolvedId) return;
    setState((s) => ({ ...s, messages: [], isConnecting: true, error: null, isStreaming: false, summary: null, summaryEnabled: false }));
    try {
      const res = await createConversation(resolvedId);
      setLastAgentId(resolvedId);
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
  }, [resolveAgentId]);

  const switchAgent = useCallback(
    async (agentId: string) => {
      if (state.conversationId) {
        const hasUserMessages = state.messages.some((m) => m.role === "user");
        if (!hasUserMessages) {
          await apiDeleteConversation(state.conversationId);
        }
      }
      await startNewChat(agentId);
    },
    [state.conversationId, state.messages, startNewChat]
  );

  const setSummaryEnabled = useCallback(
    async (enabled: boolean) => {
      if (!state.conversationId) return;
      setState((s) => ({ ...s, summaryEnabled: enabled }));
      await apiToggleSummary(state.conversationId, enabled);
    },
    [state.conversationId]
  );

  const refreshSummary = useCallback(async () => {
    if (!state.conversationId) return;
    const summary = await apiRefreshSummary(state.conversationId);
    setState((s) => ({ ...s, summary }));
    debug?.addEvent({ type: "summary", data: { summary, source: "manual-refresh" } });
  }, [state.conversationId, debug]);

  const currentAgentId =
    state.conversations.find((c) => c.id === state.conversationId)?.agentId ?? resolveAgentId() ?? "";

  return {
    state,
    currentAgentId,
    sendMessage,
    startNewChat,
    selectConversation,
    deleteConversation,
    switchAgent,
    setSummaryEnabled,
    refreshSummary,
  };
}
