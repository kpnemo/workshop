import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChat } from "../hooks/use-chat";
import * as api from "../lib/api";

vi.mock("../lib/api");

const DEFAULT_AGENT_ID = "support-bot";

describe("useChat", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // listConversations returns empty first → triggers auto-create flow
    vi.mocked(api.listConversations).mockResolvedValueOnce([]);
    vi.mocked(api.createConversation).mockResolvedValue({
      conversationId: "conv-123",
      agentId: "support-bot",
      createdAt: "2026-03-25T10:00:00Z",
    });
    // After create, re-fetch returns the new conversation
    vi.mocked(api.listConversations).mockResolvedValue([
      {
        id: "conv-123",
        agentId: "support-bot",
        title: null,
        updatedAt: "2026-03-25T10:00:00Z",
        messageCount: 0,
      },
    ]);
  });

  it("creates a conversation on mount", async () => {
    const { result } = renderHook(() => useChat(DEFAULT_AGENT_ID));
    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
      expect(result.current.state.isConnecting).toBe(false);
    });
    expect(api.createConversation).toHaveBeenCalledWith("support-bot");
  });

  it("sets isConnecting true initially", () => {
    const { result } = renderHook(() => useChat(DEFAULT_AGENT_ID));
    expect(result.current.state.isConnecting).toBe(true);
  });

  it("adds user message optimistically on send", async () => {
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _msg, cb) => {
      cb.onDone();
    });
    const { result } = renderHook(() => useChat(DEFAULT_AGENT_ID));
    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
    });
    act(() => {
      result.current.sendMessage("Hello");
    });
    expect(result.current.state.messages[0].role).toBe("user");
    expect(result.current.state.messages[0].content).toBe("Hello");
  });

  it("streams assistant response via onDelta", async () => {
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _msg, cb) => {
      cb.onDelta("Hello");
      cb.onDelta(" there");
      cb.onDone();
    });
    const { result } = renderHook(() => useChat(DEFAULT_AGENT_ID));
    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
    });
    await act(async () => {
      result.current.sendMessage("Hi");
    });
    await waitFor(() => {
      expect(result.current.state.isStreaming).toBe(false);
    });
    const assistantMsg = result.current.state.messages.find(
      (m) => m.role === "assistant"
    );
    expect(assistantMsg?.content).toBe("Hello there");
  });

  it("handles blocked messages as system messages", async () => {
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _msg, cb) => {
      cb.onBlocked("Stay on topic.");
      cb.onDone();
    });
    const { result } = renderHook(() => useChat(DEFAULT_AGENT_ID));
    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
    });
    await act(async () => {
      result.current.sendMessage("politics");
    });
    await waitFor(() => {
      expect(result.current.state.isStreaming).toBe(false);
    });
    const systemMsg = result.current.state.messages.find(
      (m) => m.role === "system"
    );
    expect(systemMsg?.content).toBe("Stay on topic.");
  });

  it("sets error on connection failure", async () => {
    vi.mocked(api.listConversations).mockReset();
    vi.mocked(api.listConversations).mockResolvedValueOnce([]);
    vi.mocked(api.createConversation).mockRejectedValue(
      new Error("Network error")
    );
    const { result } = renderHook(() => useChat(DEFAULT_AGENT_ID));
    await waitFor(() => {
      expect(result.current.state.error).toBe("Network error");
      expect(result.current.state.isConnecting).toBe(false);
    });
  });

  it("handles assignment event as system banner and updates conversation agentId", async () => {
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _msg, cb) => {
      cb.onAssignment({
        from: "router",
        to: "weather-agent",
        agentName: "Weather",
        reason: "you asked about weather",
      });
      cb.onDone();
    });
    const { result } = renderHook(() => useChat(DEFAULT_AGENT_ID));
    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
    });
    await act(async () => {
      result.current.sendMessage("What is the weather?");
    });
    await waitFor(() => {
      expect(result.current.state.isStreaming).toBe(false);
    });

    // Banner system message should be present
    const bannerMsg = result.current.state.messages.find(
      (m) => m.role === "system" && m.delegationMeta?.type === "assignment"
    );
    expect(bannerMsg).toBeDefined();
    expect(bannerMsg?.delegationMeta?.to).toBe("weather-agent");

    // Empty assistant placeholder should be removed
    const emptyAssistant = result.current.state.messages.find(
      (m) => m.role === "assistant" && m.content === ""
    );
    expect(emptyAssistant).toBeUndefined();

    // Conversation agentId should be updated
    const conv = result.current.state.conversations.find(
      (c) => c.id === "conv-123"
    );
    expect(conv?.agentId).toBe("weather-agent");
  });

  it("clears messages on startNewChat", async () => {
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _msg, cb) => {
      cb.onDelta("Reply");
      cb.onDone();
    });
    const { result } = renderHook(() => useChat(DEFAULT_AGENT_ID));
    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
    });
    await act(async () => {
      result.current.sendMessage("Hello");
    });
    vi.mocked(api.createConversation).mockResolvedValue({
      conversationId: "conv-456",
      agentId: "support-bot",
      createdAt: "2026-03-25T11:00:00Z",
    });
    vi.mocked(api.listConversations).mockResolvedValue([
      {
        id: "conv-456",
        agentId: "support-bot",
        title: null,
        updatedAt: "2026-03-25T11:00:00Z",
        messageCount: 0,
      },
      {
        id: "conv-123",
        agentId: "support-bot",
        title: null,
        updatedAt: "2026-03-25T10:00:00Z",
        messageCount: 2,
      },
    ]);
    await act(async () => {
      result.current.startNewChat();
    });
    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-456");
      expect(result.current.state.messages).toHaveLength(0);
    });
  });
});
