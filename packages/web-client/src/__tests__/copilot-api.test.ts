import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendCopilotMessage } from "../lib/copilot-api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => { mockFetch.mockReset(); });

describe("sendCopilotMessage", () => {
  it("sends POST to /api/copilot/chat with correct body", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => stream.getReader() },
    });

    const callbacks = {
      onDelta: vi.fn(),
      onAgentCreated: vi.fn(),
      onAgentUpdated: vi.fn(),
      onError: vi.fn(),
      onDone: vi.fn(),
    };

    await sendCopilotMessage(
      [{ role: "user", content: "Create a bot" }],
      "create",
      undefined,
      callbacks
    );

    expect(mockFetch).toHaveBeenCalledWith("/api/copilot/chat", {
      method: "POST",
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        messages: [{ role: "user", content: "Create a bot" }],
        mode: "create",
      }),
    });
    expect(callbacks.onDone).toHaveBeenCalled();
  });

  it("calls onError when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Bad request" }),
    });

    const callbacks = {
      onDelta: vi.fn(),
      onAgentCreated: vi.fn(),
      onAgentUpdated: vi.fn(),
      onError: vi.fn(),
      onDone: vi.fn(),
    };

    await sendCopilotMessage(
      [{ role: "user", content: "Create a bot" }],
      "create",
      undefined,
      callbacks
    );

    expect(callbacks.onError).toHaveBeenCalledWith("Bad request");
    expect(callbacks.onDone).toHaveBeenCalled();
  });
});
