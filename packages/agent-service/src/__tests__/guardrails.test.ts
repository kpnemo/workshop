import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkTopicBoundary, type GuardrailResult } from "../services/guardrails.js";
import type { TopicBoundaries } from "../types.js";

// Mock the Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

describe("checkTopicBoundary", () => {
  const boundaries: TopicBoundaries = {
    allowed: ["product questions", "pricing"],
    blocked: ["politics", "competitors"],
    boundaryMessage: "I can only help with product topics.",
  };

  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns allowed when classification says allowed", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "allowed" }],
    });
    const result = await checkTopicBoundary("What is your pricing?", boundaries);
    expect(result).toEqual({ allowed: true });
  });

  it("returns blocked with message when classification says blocked", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "blocked" }],
    });
    const result = await checkTopicBoundary("Who will win the election?", boundaries);
    expect(result).toEqual({
      allowed: false,
      message: "I can only help with product topics.",
    });
  });

  it("handles case-insensitive response (BLOCKED)", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "BLOCKED" }],
    });
    const result = await checkTopicBoundary("politics stuff", boundaries);
    expect(result).toEqual({
      allowed: false,
      message: "I can only help with product topics.",
    });
  });

  it("handles response with whitespace", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "  blocked  \n" }],
    });
    const result = await checkTopicBoundary("politics", boundaries);
    expect(result).toEqual({
      allowed: false,
      message: "I can only help with product topics.",
    });
  });

  it("defaults to allowed on unexpected response (fail-open)", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "I think this is fine" }],
    });
    const result = await checkTopicBoundary("random message", boundaries);
    expect(result).toEqual({ allowed: true });
  });

  it("defaults to allowed on API error (fail-open)", async () => {
    mockCreate.mockRejectedValue(new Error("API unavailable"));
    const result = await checkTopicBoundary("any message", boundaries);
    expect(result).toEqual({ allowed: true });
  });

  it("sends correct classification prompt to Haiku", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "allowed" }],
    });
    await checkTopicBoundary("Tell me about pricing", boundaries);
    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      messages: [
        {
          role: "user",
          content: expect.stringContaining("product questions"),
        },
      ],
    });
  });
});
