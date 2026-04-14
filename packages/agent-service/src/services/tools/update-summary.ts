import type { Tool } from "./types.js";

export function createUpdateSummaryTool(): Tool {
  return {
    name: "update_summary",
    definition: {
      name: "update_summary",
      description:
        "Update the conversation summary. Call this after meaningful exchanges to maintain a running TL;DR.",
      input_schema: {
        type: "object" as const,
        properties: {
          summary: {
            type: "string",
            description: "A brief 2-3 sentence summary of the conversation so far.",
          },
        },
        required: ["summary"],
      },
    },
    async execute(input: unknown, context): Promise<string> {
      const { summary } = (input ?? {}) as { summary?: string };

      if (!summary || typeof summary !== "string") {
        return "Error: A valid summary string is required.";
      }

      if (!context?.db || !context?.conversationId) {
        return "Error: Missing context.";
      }

      context.db.setSummary(context.conversationId, summary);
      return JSON.stringify({ success: true, summary });
    },
  };
}
