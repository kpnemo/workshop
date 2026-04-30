import { useEffect, useState } from "react";
import { useNavigate, useParams, useMatch } from "react-router-dom";
import { fetchAgent } from "../lib/agents-api";
import { AgentForm } from "../components/agent-form";
import { useAgentsContext } from "../contexts/AgentsContext";
import type { AgentConfig, CreateAgentInput } from "../types";

export function AgentEditor() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const isNewRoute = !!useMatch("/agents/new");
  const { agents, createAgent, updateAgent, isLoading: agentsLoading } = useAgentsContext();
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit mode — load the full agent when :id changes
  useEffect(() => {
    if (isNewRoute) {
      setAgent(null);
      setError(null);
      return;
    }
    if (!params.id) return;
    if (agentsLoading) return;
    // Unknown id → redirect back to /agents (which then redirects to first or empty state)
    if (!agents.some((a) => a.id === params.id)) {
      navigate("/agents", { replace: true });
      return;
    }
    setError(null);
    fetchAgent(params.id)
      .then(setAgent)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load agent"));
  }, [isNewRoute, params.id, agents, agentsLoading, navigate]);

  async function handleSave(data: CreateAgentInput) {
    if (isNewRoute) {
      const created = await createAgent(data);
      navigate(`/agents/${created.id}`, { replace: true });
      return;
    }
    if (!agent) return;
    await updateAgent(agent.id, data);
  }

  if (error) return <div className="p-6 text-sm text-red-400">{error}</div>;
  if (isNewRoute) {
    return (
      <AgentForm
        agents={agents}
        onSave={handleSave}
        onBack={() => navigate("/agents")}
      />
    );
  }
  if (!agent) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;
  return (
    <AgentForm
      agent={agent}
      agents={agents}
      onSave={handleSave}
      onBack={() => navigate("/agents")}
    />
  );
}
