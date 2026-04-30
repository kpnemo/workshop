import { NavLink, useNavigate } from "react-router-dom";
import { Plus, ArrowLeft } from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { AgentAvatar } from "./agent-avatar";
import { useAgentsContext } from "../contexts/AgentsContext";

export function AgentsSidebar() {
  const navigate = useNavigate();
  const { agents } = useAgentsContext();

  return (
    <SidebarShell
      header={
        <>
          <span className="text-sm font-semibold">Agents</span>
          <button
            onClick={() => navigate("/agents/new")}
            className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
            aria-label="New agent"
          >
            <Plus size={16} />
          </button>
        </>
      }
      collapsedActions={
        <button
          onClick={() => navigate("/agents/new")}
          className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
          aria-label="New agent"
        >
          <Plus size={16} />
        </button>
      }
      body={
        <>
          <div className="px-1 pb-2">
            <button
              onClick={() => navigate("/")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-primary transition-colors hover:bg-background"
            >
              <ArrowLeft size={14} /> Back to chats
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {agents.map((agent) => (
              <NavLink
                key={agent.id}
                to={`/agents/${agent.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? "bg-background outline outline-1 outline-primary/40" : "hover:bg-background"
                  }`
                }
              >
                <AgentAvatar avatar={agent.avatar} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{agent.name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {agent.model.split("-").slice(0, 2).join("-")}
                    {agent.hasGuardrails ? " · guardrails" : ""}
                  </div>
                </div>
              </NavLink>
            ))}
            {agents.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted">No agents yet.</div>
            )}
          </div>
        </>
      }
    />
  );
}
