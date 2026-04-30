// @ts-expect-error — lucide-react v0.469 ships dynamicIconImports.d.ts at this subpath
// but the package's exports map doesn't expose it under node16 module resolution.
// Runtime works correctly. This compiles and tree-shakes the same as a named import.
import dynamicIconImports from "lucide-react/dynamicIconImports";
import type Anthropic from "@anthropic-ai/sdk";

const LUCIDE_NAMES = new Set(Object.keys(dynamicIconImports));
const ICON_REGEX = /^(emoji:.+|lucide:[a-z0-9-]+)$/;

export interface IconGenerationInput {
  title: string | null;
  lastUserMessage: string;
  lastAssistantMessage: string;
}

const PROMPT = (input: IconGenerationInput) => `Pick a single icon that represents this conversation's topic.

Reply with EXACTLY one line in one of these formats:
  emoji:<single emoji>
  lucide:<icon-name>

For lucide, use a kebab-case lucide-react icon name such as plane, map-pin, dollar-sign, bug, hash, message-square — pick whichever icon best fits.

Prefer emoji when an obvious one fits. Use lucide for technical or abstract topics where no emoji is right.

Reply with the icon line only, no other text.

Title: ${input.title ?? "(none)"}
Last user message: ${input.lastUserMessage.slice(0, 300)}
Last assistant message: ${input.lastAssistantMessage.slice(0, 300)}`;

const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;

/**
 * Parse and validate the model's icon output.
 * Returns the trimmed canonical string or null if invalid.
 */
export function parseAndValidateIcon(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!ICON_REGEX.test(trimmed)) return null;

  if (trimmed.startsWith("emoji:")) {
    const body = trimmed.slice("emoji:".length);
    return body.length > 0 ? trimmed : null;
  }

  // lucide:<name>
  const name = trimmed.slice("lucide:".length);
  return LUCIDE_NAMES.has(name) ? trimmed : null;
}

/**
 * Generate a content icon for a conversation. Calls Haiku with a small prompt;
 * retries once on transport error or validation failure (max 2 attempts total,
 * 500ms delay between). Returns the validated icon string or null on failure.
 */
export async function generateIcon(
  client: Anthropic,
  input: IconGenerationInput,
): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        messages: [{ role: "user", content: PROMPT(input) }],
      });

      const text = resp.content[0].type === "text" ? resp.content[0].text : "";
      const icon = parseAndValidateIcon(text);
      if (icon) return icon;

      console.warn(`[icon] Attempt ${attempt} returned invalid output: ${JSON.stringify(text)}`);
    } catch (err) {
      console.warn(`[icon] Attempt ${attempt} failed:`, err);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  return null;
}
