import Anthropic from "@anthropic-ai/sdk";
import type { TopicBoundaries } from "../types.js";

export interface GuardrailResult {
  allowed: boolean;
  message?: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export async function checkTopicBoundary(
  userMessage: string,
  boundaries: TopicBoundaries
): Promise<GuardrailResult> {
  try {
    const prompt = `Given these allowed topics: ${boundaries.allowed.join(", ")}
And these blocked topics: ${boundaries.blocked.join(", ")}

Classify the following user message as "allowed" or "blocked":
"${userMessage}"

Respond with only "allowed" or "blocked".`;

    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text"
        ? response.content[0].text.trim().toLowerCase()
        : "";

    if (text === "blocked") {
      return { allowed: false, message: boundaries.boundaryMessage };
    }

    return { allowed: true };
  } catch (err) {
    console.warn("[guardrails] Classification failed, defaulting to allowed:", err);
    return { allowed: true };
  }
}
