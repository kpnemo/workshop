import type { Tool, ToolContext } from "./types.js";

export function createDelegateToTool(allowedDelegates: string[]): Tool {
  return {
    name: "delegate_to",
    definition: {
      name: "delegate_to",
      description: "Delegate the current conversation to a specialist agent. Use this when the user's request matches a specialist's capability.",
      input_schema: {
        type: "object" as const,
        properties: {
          agent_id: { type: "string", description: "The ID of the specialist agent to delegate to" },
          context: { type: "string", description: "A summary of what the user needs, passed to the specialist as context" },
        },
        required: ["agent_id", "context"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const { agent_id, context: delegationContext } = (input ?? {}) as { agent_id?: string; context?: string };

      if (!context) return "Error: Tool context is required for delegation.";
      if (!agent_id || !delegationContext) return "Error: agent_id and context are required.";
      if (!allowedDelegates.includes(agent_id)) {
        return `Error: Cannot delegate to "${agent_id}". Available delegates: [${allowedDelegates.join(", ")}]`;
      }

      const targetAgent = context.agents.get(agent_id);
      if (!targetAgent) return `Error: Agent "${agent_id}" not found.`;

      const mainAgentId = [...context.agents.values()].find((a) => a.delegates?.includes(agent_id))?.id;

      context.db.setActiveAgent(context.conversationId, agent_id);
      context.db.addDelegationMessage(context.conversationId, {
        type: "delegation_start",
        from: mainAgentId ?? "unknown",
        to: agent_id,
        context: delegationContext,
      });

      const sseData = JSON.stringify({
        from: mainAgentId ?? "unknown",
        to: agent_id,
        agentName: targetAgent.name,
        emoji: targetAgent.avatar.emoji,
        color: targetAgent.avatar.color,
        context: delegationContext,
      });
      context.res.write(`event: delegation_start\ndata: ${sseData}\n\n`);

      return `[DELEGATION] Successfully delegated to "${targetAgent.name}". The specialist will now handle the conversation.`;
    },
  };
}
