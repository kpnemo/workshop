import { describe, it, expect, vi, beforeEach } from "vitest";
import { createConversation, sendMessage, getConversation } from "../lib/api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("createConversation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends POST to /api/conversations and returns response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          conversationId: "conv-123",
          agentId: "support-bot",
          createdAt: "2026-03-25T10:00:00Z",
        }),
    });

    const result = await createConversation("support-bot");

    expect(mockFetch).toHaveBeenCalledWith("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "support-bot" }),
    });
    expect(result.conversationId).toBe("conv-123");
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Agent not found" }),
    });

    await expect(createConversation("bad-agent")).rejects.toThrow(
      "Agent not found"
    );
  });
});

describe("sendMessage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls onDelta for delta events and onDone at end", async () => {
    const sseBody = [
      'event: delta\ndata: {"text":"Hello"}\n\n',
      'event: delta\ndata: {"text":" world"}\n\n',
      'event: done\ndata: {"conversationId":"conv-123"}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const onDelta = vi.fn();
    const onBlocked = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();

    await sendMessage("conv-123", "Hi", { onDelta, onBlocked, onError, onTitle: vi.fn(), onDone });

    expect(onDelta).toHaveBeenCalledWith("Hello");
    expect(onDelta).toHaveBeenCalledWith(" world");
    expect(onDone).toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onBlocked for blocked events", async () => {
    const sseBody = [
      'event: blocked\ndata: {"message":"Stay on topic."}\n\n',
      'event: done\ndata: {"conversationId":"conv-123"}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });

    mockFetch.mockResolvedValue({ ok: true, status: 200, body: stream });

    const onBlocked = vi.fn();
    const onDone = vi.fn();

    await sendMessage("conv-123", "politics", {
      onDelta: vi.fn(), onBlocked, onError: vi.fn(), onTitle: vi.fn(), onDone,
    });

    expect(onBlocked).toHaveBeenCalledWith("Stay on topic.");
    expect(onDone).toHaveBeenCalled();
  });

  it("calls onError for SSE error events", async () => {
    const sseBody = [
      'event: error\ndata: {"message":"LLM service error"}\n\n',
      'event: done\ndata: {"conversationId":"conv-123"}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });

    mockFetch.mockResolvedValue({ ok: true, status: 200, body: stream });

    const onError = vi.fn();
    const onDone = vi.fn();

    await sendMessage("conv-123", "test", {
      onDelta: vi.fn(), onBlocked: vi.fn(), onError, onTitle: vi.fn(), onDone,
    });

    expect(onError).toHaveBeenCalledWith("LLM service error");
    expect(onDone).toHaveBeenCalled();
  });

  it("calls onError for non-2xx HTTP responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Conversation not found" }),
    });

    const onError = vi.fn();
    const onDone = vi.fn();

    await sendMessage("bad-id", "test", {
      onDelta: vi.fn(), onBlocked: vi.fn(), onError, onTitle: vi.fn(), onDone,
    });

    expect(onError).toHaveBeenCalledWith("Conversation not found");
    expect(onDone).toHaveBeenCalled();
  });
});

describe("getConversation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends GET and returns conversation detail", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          conversationId: "conv-123",
          agentId: "support-bot",
          createdAt: "2026-03-25T10:00:00Z",
          messages: [],
        }),
    });

    const result = await getConversation("conv-123");

    expect(mockFetch).toHaveBeenCalledWith("/api/conversations/conv-123");
    expect(result.conversationId).toBe("conv-123");
  });
});
