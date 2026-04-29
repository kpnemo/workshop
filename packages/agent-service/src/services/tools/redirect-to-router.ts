import type { Tool, ToolContext } from "./types.js";

export function createRedirectToRouterTool(): Tool {
  return {
    name: "redirect_to_router",
    definition: {
      name: "redirect_to_router",
      description:
        "Hand the conversation back to the Auto router when the user's message is outside your domain or scope. The router will pick a different specialist. Call this instead of refusing — the user should never hit a dead end. You can only call this once per turn.",
      input_schema: {
        type: "object" as const,
        properties: {
          reason: {
            type: "string",
            description: "A short user-facing reason for handing back (e.g. 'weather isn't in my scope').",
          },
        },
        required: ["reason"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const { reason } = (input ?? {}) as { reason?: string };

      if (!context) return "Error: Tool context is required for redirect_to_router.";
      if (!reason) return "Error: reason is required.";

      const conv = context.db.getConversation(context.conversationId);
      if (!conv) return "Error: Conversation not found.";

      const fromAgentId = conv.agentId;
      if (fromAgentId === "router") {
        return "Error: Cannot redirect to router from router.";
      }

      context.db.setAgentId(context.conversationId, "router");
      context.db.addDelegationMessage(context.conversationId, {
        type: "redirect_to_router",
        from: fromAgentId,
        to: "router",
        summary: reason,
      });

      const routerAgent = context.agents.get("router");
      const sseData = JSON.stringify({
        from: fromAgentId,
        to: "router",
        agentName: routerAgent?.name ?? "Auto",
        reason,
      });
      context.res.write(`event: redirect_to_router\ndata: ${sseData}\n\n`);

      return `[REDIRECT] Redirected to router with reason: "${reason}"`;
    },
  };
}
