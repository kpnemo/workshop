import type { Tool, ToolContext } from "./types.js";

export function createHandBackTool(): Tool {
  return {
    name: "hand_back",
    definition: {
      name: "hand_back",
      description: "Hand the conversation back to the main agent after completing your delegated task. Call this when you have finished the task you were asked to do.",
      input_schema: {
        type: "object" as const,
        properties: {
          summary: { type: "string", description: "A brief summary of what you accomplished, which will be shared with the main agent" },
        },
        required: ["summary"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const { summary } = (input ?? {}) as { summary?: string };

      if (!context) return "Error: Tool context is required for hand_back.";
      if (!summary) return "Error: summary is required.";

      const mainAgent = [...context.agents.values()].find((a) => a.delegates && a.delegates.length > 0);
      const currentAgent = [...context.agents.values()].find((a) => !a.delegates || a.delegates.length === 0);

      const mainAgentId = mainAgent?.id ?? "unknown";
      const currentAgentId = currentAgent?.id ?? "unknown";

      context.db.setActiveAgent(context.conversationId, null);
      context.db.addDelegationMessage(context.conversationId, {
        type: "delegation_end",
        from: currentAgentId,
        to: mainAgentId,
        summary,
      });

      const sseData = JSON.stringify({
        from: currentAgentId,
        to: mainAgentId,
        agentName: mainAgent?.name ?? "Main Agent",
        summary,
      });
      context.res.write(`event: delegation_end\ndata: ${sseData}\n\n`);

      return `[DELEGATION] Handed back to main agent with summary: "${summary}"`;
    },
  };
}
