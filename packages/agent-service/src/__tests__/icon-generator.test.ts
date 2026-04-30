import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseAndValidateIcon, generateIcon } from "../services/icon-generator.js";

describe("parseAndValidateIcon", () => {
  it("accepts a valid emoji", () => {
    expect(parseAndValidateIcon("emoji:🔢")).toBe("emoji:🔢");
  });

  it("accepts a valid lucide name", () => {
    expect(parseAndValidateIcon("lucide:plane")).toBe("lucide:plane");
  });

  it("trims surrounding whitespace", () => {
    expect(parseAndValidateIcon("  lucide:plane  \n")).toBe("lucide:plane");
  });

  it("rejects unknown lucide names", () => {
    expect(parseAndValidateIcon("lucide:not-a-real-icon-xyz123")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseAndValidateIcon("")).toBeNull();
    expect(parseAndValidateIcon("   ")).toBeNull();
  });

  it("rejects invalid prefix", () => {
    expect(parseAndValidateIcon("svg:something")).toBeNull();
    expect(parseAndValidateIcon("plane")).toBeNull();
  });

  it("rejects empty emoji body", () => {
    expect(parseAndValidateIcon("emoji:")).toBeNull();
  });

  it("rejects lucide with uppercase or invalid chars", () => {
    expect(parseAndValidateIcon("lucide:Plane")).toBeNull();
    expect(parseAndValidateIcon("lucide:plane!")).toBeNull();
  });
});

describe("generateIcon retry behavior", () => {
  let mockClient: {
    messages: { create: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockClient = {
      messages: { create: vi.fn() },
    };
  });

  function makeResp(text: string) {
    return { content: [{ type: "text", text }] };
  }

  it("succeeds on first attempt", async () => {
    mockClient.messages.create.mockResolvedValueOnce(makeResp("emoji:🔢"));
    const result = await generateIcon(mockClient as any, {
      title: "Test",
      lastUserMessage: "hi",
      lastAssistantMessage: "hello",
    });
    expect(result).toBe("emoji:🔢");
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
  });

  it("retries once on transport error and succeeds", async () => {
    mockClient.messages.create
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makeResp("lucide:plane"));
    const result = await generateIcon(mockClient as any, {
      title: null,
      lastUserMessage: "book a flight",
      lastAssistantMessage: "sure",
    });
    expect(result).toBe("lucide:plane");
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });

  it("retries once on invalid output and succeeds", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(makeResp("garbage output"))
      .mockResolvedValueOnce(makeResp("emoji:🐛"));
    const result = await generateIcon(mockClient as any, {
      title: "Bug fix",
      lastUserMessage: "x",
      lastAssistantMessage: "y",
    });
    expect(result).toBe("emoji:🐛");
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });

  it("returns null after two failures", async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(makeResp("garbage"))
      .mockResolvedValueOnce(makeResp("more garbage"));
    const result = await generateIcon(mockClient as any, {
      title: null,
      lastUserMessage: "x",
      lastAssistantMessage: "y",
    });
    expect(result).toBeNull();
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });

  it("does not retry beyond 2 attempts on persistent transport errors", async () => {
    mockClient.messages.create
      .mockRejectedValueOnce(new Error("e1"))
      .mockRejectedValueOnce(new Error("e2"));
    const result = await generateIcon(mockClient as any, {
      title: null,
      lastUserMessage: "x",
      lastAssistantMessage: "y",
    });
    expect(result).toBeNull();
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });
});
