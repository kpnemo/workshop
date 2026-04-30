import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useMatch } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { fetchAgent } from "../lib/agents-api";
import { AgentForm } from "../components/agent-form";
import { ConfirmDialog } from "../components/confirm-dialog";
import { useAgentsContext } from "../contexts/AgentsContext";
import type { AgentConfig, CreateAgentInput } from "../types";

export function AgentEditor() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const isNewRoute = !!useMatch("/agents/new");
  const { agents, createAgent, updateAgent, deleteAgent, isLoading: agentsLoading } = useAgentsContext();
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Ref flag: suppress the "unknown id → /agents" redirect while a delete is
  // in flight. Without this, the agents list update fires the useEffect before
  // handleConfirmDelete gets to call navigate() itself.
  const deletingRef = useRef(false);

  // Reset the loaded agent whenever the target id changes so AgentForm
  // remounts fresh (it initialises its own useState from props on mount).
  useEffect(() => {
    setAgent(null);
    setError(null);
  }, [params.id, isNewRoute]);

  useEffect(() => {
    if (isNewRoute) return;
    if (!params.id) return;
    if (agentsLoading) return;
    if (!agents.some((a) => a.id === params.id)) {
      // Don't redirect while a delete is in progress — handleConfirmDelete
      // will navigate to the right place once it finishes.
      if (!deletingRef.current) {
        navigate("/agents", { replace: true });
      }
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

  async function handleConfirmDelete() {
    if (!agent) return;
    const idx = agents.findIndex((a) => a.id === agent.id);
    deletingRef.current = true;
    try {
      await deleteAgent(agent.id);
      // useAgents.deleteAgent already calls loadAgents() internally, so by
      // the time we reach here `agents` reflects the post-delete list. We
      // still filter defensively in case of stale closure.
      const next = pickNext(agents.filter((a) => a.id !== agent.id), idx);
      setConfirmDelete(false);
      setDeleteError(null);
      if (next) navigate(`/agents/${next}`, { replace: true });
      else navigate("/agents", { replace: true });
      deletingRef.current = false;
    } catch (e) {
      deletingRef.current = false;
      setDeleteError(e instanceof Error ? e.message : "Failed to delete");
    }
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">Edit · {agent.name}</span>
        <button
          onClick={() => { setConfirmDelete(true); setDeleteError(null); }}
          className="flex items-center gap-1 rounded p-1.5 text-sm text-muted hover:bg-red-950 hover:text-red-400"
          aria-label={`Delete ${agent.name}`}
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <AgentForm
          key={agent.id}
          agent={agent}
          agents={agents}
          onSave={handleSave}
          onBack={() => navigate("/agents")}
        />
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete agent?"
          message="This agent will be permanently deleted. Existing conversations using this agent will still be accessible."
          onConfirm={handleConfirmDelete}
          onCancel={() => { setConfirmDelete(false); setDeleteError(null); }}
          error={deleteError}
        />
      )}
    </div>
  );
}

/** Spec rule: snapshot index → same-index-after / last / null. */
function pickNext(postDelete: { id: string }[], snapshotIdx: number): string | null {
  if (postDelete.length === 0) return null;
  if (snapshotIdx < postDelete.length) return postDelete[snapshotIdx].id;
  return postDelete[postDelete.length - 1].id;
}
