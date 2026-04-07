import type { Tool, ToolContext } from "./types.js";

export function createAssignAgentTool(): Tool {
  return {
    name: "assign_agent",
    definition: {
      name: "assign_agent",
      description:
        "Assign this conversation to a specialist agent. Call this when you have understood what the user needs and can name a specific specialist that should take over. The specialist will handle this turn and every turn after. You can only call this once per conversation.",
      input_schema: {
        type: "object" as const,
        properties: {
          agent_id: {
            type: "string",
            description: "The id of the specialist agent to assign (e.g. 'weather-agent').",
          },
          reason: {
            type: "string",
            description: "A short user-facing reason for the assignment (e.g. 'user asked about weather').",
          },
        },
        required: ["agent_id", "reason"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const { agent_id, reason } = (input ?? {}) as { agent_id?: string; reason?: string };

      if (!context) return "Error: Tool context is required for assign_agent.";
      if (!agent_id) return "Error: agent_id is required.";
      if (!reason) return "Error: reason is required.";
      if (agent_id === "router") {
        return "Error: Cannot assign to router itself. Pick a specialist.";
      }

      const target = context.agents.get(agent_id);
      if (!target) {
        const available = [...context.agents.keys()].filter((k) => k !== "router").join(", ");
        return `Error: Unknown agent "${agent_id}". Available: ${available}`;
      }

      context.db.setAgentId(context.conversationId, agent_id);

      const sseData = JSON.stringify({
        from: "router",
        to: agent_id,
        agentName: target.name,
        reason,
      });
      context.res.write(`event: assignment\ndata: ${sseData}\n\n`);

      return `[ASSIGNMENT] Assigned to ${agent_id}`;
    },
  };
}
