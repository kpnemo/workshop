import { Navigate } from "react-router-dom";
import { useAgentsContext } from "../contexts/AgentsContext";
import { AgentsEmptyState } from "../components/agents-empty-state";

export function AgentsIndex() {
  const { agents, isLoading } = useAgentsContext();
  if (isLoading) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;
  if (agents.length === 0) return <AgentsEmptyState />;
  return <Navigate to={`/agents/${agents[0].id}`} replace />;
}
