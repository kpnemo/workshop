import { describe, it, expect, vi, beforeEach } from "vitest";
import { createConversation, sendMessage, getConversation, uploadFile, listFiles, deleteFile } from "../lib/api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  localStorage.clear();
});

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

    expect(onDelta).toHaveBeenCalledWith("Hello", undefined);
    expect(onDelta).toHaveBeenCalledWith(" world", undefined);
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

    expect(mockFetch).toHaveBeenCalledWith("/api/conversations/conv-123", {
      headers: {},
    });
    expect(result.conversationId).toBe("conv-123");
  });
});

describe("signup", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends POST to /api/auth/signup and returns result", async () => {
    const { signup } = await import("../lib/api");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: "jwt-token",
          user: { id: "u-1", email: "test@example.com" },
        }),
    });

    const result = await signup("test@example.com", "password123");

    expect(mockFetch).toHaveBeenCalledWith("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });
    expect(result.token).toBe("jwt-token");
    expect(result.user.email).toBe("test@example.com");
  });
});

describe("login", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends POST to /api/auth/login and returns result", async () => {
    const { login } = await import("../lib/api");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: "jwt-token",
          user: { id: "u-1", email: "test@example.com" },
        }),
    });

    const result = await login("test@example.com", "password123");

    expect(mockFetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });
    expect(result.token).toBe("jwt-token");
  });

  it("throws on invalid credentials", async () => {
    const { login } = await import("../lib/api");
    mockFetch.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve(JSON.stringify({ error: "Invalid email or password" })),
    });

    await expect(login("test@example.com", "wrong")).rejects.toThrow(
      "Invalid email or password"
    );
  });
});

describe("sendMessage with debug", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("appends ?debug=true to URL when debug option is set", async () => {
    const sseBody = 'event: done\ndata: {"conversationId":"conv-123"}\n\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: stream });

    await sendMessage("conv-123", "Hi", { onDelta: vi.fn(), onBlocked: vi.fn(), onError: vi.fn(), onTitle: vi.fn(), onDone: vi.fn() }, { debug: true });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/conversations/conv-123/messages?debug=true",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not append ?debug=true when debug is false", async () => {
    const sseBody = 'event: done\ndata: {"conversationId":"conv-123"}\n\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: stream });

    await sendMessage("conv-123", "Hi", { onDelta: vi.fn(), onBlocked: vi.fn(), onError: vi.fn(), onTitle: vi.fn(), onDone: vi.fn() });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/conversations/conv-123/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes debug SSE events to debug callbacks", async () => {
    const sseBody = [
      'event: debug_agent\ndata: {"agentId":"test-bot","model":"claude-sonnet-4","temperature":0.7,"maxTokens":1024,"systemPromptPreview":"You are...","isDelegated":false}\n\n',
      'event: debug_thinking\ndata: {"text":"Let me think about this..."}\n\n',
      'event: debug_tool\ndata: {"tool":"browse_url","input":{"url":"https://example.com"},"result":"page content","durationMs":500,"resultSize":100}\n\n',
      'event: debug_stream\ndata: {"tokens":42,"stopReason":"end_turn","totalMs":1500,"iteration":1}\n\n',
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

    const onDebugAgent = vi.fn();
    const onDebugThinking = vi.fn();
    const onDebugTool = vi.fn();
    const onDebugStream = vi.fn();

    await sendMessage("conv-123", "Hi", {
      onDelta: vi.fn(), onBlocked: vi.fn(), onError: vi.fn(), onTitle: vi.fn(), onDone: vi.fn(),
      onDebugAgent, onDebugThinking, onDebugTool, onDebugStream,
    }, { debug: true });

    expect(onDebugAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: "test-bot", model: "claude-sonnet-4" }));
    expect(onDebugThinking).toHaveBeenCalledWith(expect.objectContaining({ text: "Let me think about this..." }));
    expect(onDebugTool).toHaveBeenCalledWith(expect.objectContaining({ tool: "browse_url", durationMs: 500 }));
    expect(onDebugStream).toHaveBeenCalledWith(expect.objectContaining({ tokens: 42, stopReason: "end_turn" }));
  });
});

describe("uploadFile", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends multipart POST to /api/files and returns file info", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "f-123",
          filename: "notes.txt",
          sizeBytes: 100,
          mimeType: "text/plain",
          description: "A text file.",
          createdAt: "2026-04-14T10:00:00Z",
        }),
    });

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    const result = await uploadFile(file);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/files",
      expect.objectContaining({ method: "POST" })
    );
    // Should use FormData, not JSON
    const call = mockFetch.mock.calls[0][1];
    expect(call.body).toBeInstanceOf(FormData);
    expect(result.id).toBe("f-123");
    expect(result.filename).toBe("notes.txt");
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "File too large" }),
    });

    const file = new File(["x"], "big.txt", { type: "text/plain" });
    await expect(uploadFile(file)).rejects.toThrow("File too large");
  });
});

describe("listFiles", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends GET to /api/files and returns file list", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "f-1", filename: "a.txt", sizeBytes: 10, mimeType: "text/plain", description: null, createdAt: "2026-04-14T10:00:00Z" }]),
    });

    const files = await listFiles();
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("a.txt");
  });
});

describe("deleteFile", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends DELETE to /api/files/:id", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await deleteFile("f-123");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/files/f-123",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
