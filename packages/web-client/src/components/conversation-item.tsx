import { Trash2 } from "lucide-react";
import { AgentAvatar } from "./agent-avatar";
import type { ConversationSummary, AgentSummary } from "../types";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

interface ConversationItemProps {
  conversation: ConversationSummary;
  isActive: boolean;
  agents: AgentSummary[];
  onClick: () => void;
  onDelete: () => void;
}

export function ConversationItem({
  conversation,
  isActive,
  agents,
  onClick,
  onDelete,
}: ConversationItemProps) {
  const agent = agents.find((a) => a.id === conversation.agentId);

  return (
    <div
      onClick={onClick}
      className={`group flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
        isActive
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-assistant-bg hover:border-border hover:bg-surface"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {agent ? (
          <AgentAvatar avatar={agent.avatar} size="sm" />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px]">?</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {conversation.title || "New conversation"}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {relativeTime(conversation.updatedAt)}
          </div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="ml-2 hidden rounded p-1 text-muted hover:bg-red-950 hover:text-red-400 group-hover:block"
        aria-label="Delete conversation"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
