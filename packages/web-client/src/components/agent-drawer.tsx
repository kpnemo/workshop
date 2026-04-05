import { useState } from "react";
import { X, Pencil, Trash2, Plus } from "lucide-react";
import { AgentAvatar } from "./agent-avatar";
import { AgentForm } from "./agent-form";
import { ConfirmDialog } from "./confirm-dialog";
import type { AgentSummary, AgentConfig, CreateAgentInput } from "../types";

interface AgentDrawerProps {
  agents: AgentSummary[];
  onClose: () => void;
  onCreate: (data: CreateAgentInput) => Promise<AgentConfig>;
  onUpdate: (id: string, data: CreateAgentInput) => Promise<AgentConfig>;
  onDelete: (id: string) => Promise<void>;
  onAgentSaved: () => void;
}

type DrawerView = { type: "list" } | { type: "form"; agent?: AgentConfig };

export function AgentDrawer({ agents, onClose, onCreate, onUpdate, onDelete, onAgentSaved }: AgentDrawerProps) {
  const [view, setView] = useState<DrawerView>({ type: "list" });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadingAgent, setLoadingAgent] = useState<string | null>(null);

  async function handleEdit(agentSummary: AgentSummary) {
    setLoadingAgent(agentSummary.id);
    try {
      const { fetchAgent } = await import("../lib/agents-api");
      const full = await fetchAgent(agentSummary.id);
      setView({ type: "form", agent: full });
    } catch {
      setView({
        type: "form",
        agent: { ...agentSummary, maxTokens: 1024, temperature: 0.7, systemPrompt: "" },
      });
    } finally {
      setLoadingAgent(null);
    }
  }

  async function handleSave(data: CreateAgentInput) {
    if (view.type === "form" && view.agent) {
      await onUpdate(view.agent.id, data);
    } else {
      await onCreate(data);
    }
    onAgentSaved();
    setView({ type: "list" });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget);
      onAgentSaved();
      setDeleteTarget(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col border-l border-border bg-background shadow-xl">
        {view.type === "form" ? (
          <AgentForm agent={view.agent} onSave={handleSave} onBack={() => setView({ type: "list" })} />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Agents</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setView({ type: "form" })}
                  className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                >
                  <Plus size={14} /> New Agent
                </button>
                <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Agent list */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-2">
                {agents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-3">
                    <AgentAvatar avatar={agent.avatar} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{agent.name}</div>
                      <div className="text-[11px] text-muted">
                        {agent.model.split("-").slice(0, 2).join("-")}
                        {agent.hasGuardrails ? " · guardrails" : ""}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(agent)}
                        disabled={loadingAgent === agent.id}
                        className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground disabled:opacity-50"
                        aria-label={`Edit ${agent.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => { setDeleteTarget(agent.id); setDeleteError(null); }}
                        className="rounded p-1.5 text-muted hover:bg-red-950 hover:text-red-400"
                        aria-label={`Delete ${agent.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {agents.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted">No agents yet. Create one to get started.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete agent?"
          message="This agent will be permanently deleted. Existing conversations using this agent will still be accessible."
          onConfirm={handleConfirmDelete}
          onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
          error={deleteError}
        />
      )}
    </>
  );
}
