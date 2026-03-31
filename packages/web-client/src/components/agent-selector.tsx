import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { AgentAvatar } from "./agent-avatar";
import type { AgentSummary } from "../types";

interface AgentSelectorProps {
  agents: AgentSummary[];
  currentAgentId: string;
  locked: boolean;
  onSelect: (agentId: string) => void;
}

export function AgentSelector({ agents, currentAgentId, locked, onSelect }: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentAgent = agents.find((a) => a.id === currentAgentId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!currentAgent) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm">?</div>
        <div><div className="text-sm font-semibold text-muted">Deleted Agent</div></div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !locked && setOpen(!open)}
        className={`flex items-center gap-3 ${locked ? "cursor-default" : "cursor-pointer"}`}
      >
        <AgentAvatar avatar={currentAgent.avatar} />
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{currentAgent.name}</span>
            {!locked && (
              <span className="flex items-center gap-0.5 rounded border border-primary/50 px-1.5 py-0.5 text-[10px] text-primary">
                <ChevronDown size={10} /> Change
              </span>
            )}
          </div>
          <div className="text-xs text-success">Online</div>
        </div>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => { onSelect(agent.id); setOpen(false); }}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-background ${agent.id === currentAgentId ? "bg-primary/10" : ""}`}
            >
              <AgentAvatar avatar={agent.avatar} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{agent.name}</div>
                <div className="text-[10px] text-muted">
                  {agent.model.split("-").slice(0, 2).join("-")} · {agent.hasGuardrails ? "guardrails" : "no guardrails"}
                </div>
              </div>
              {agent.id === currentAgentId && <span className="text-xs text-primary">✓</span>}
            </button>
          ))}
          {!locked && (
            <div className="border-t border-border px-3 py-2 text-center text-[11px] text-muted italic">
              Agent can be changed until you send the first message
            </div>
          )}
        </div>
      )}
    </div>
  );
}
