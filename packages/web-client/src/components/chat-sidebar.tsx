import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Bot } from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { ConversationItem } from "./conversation-item";
import { ConfirmDialog } from "./confirm-dialog";
import type { ConversationSummary, AgentSummary } from "../types";

interface ChatSidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  agents: AgentSummary[];
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => Promise<void>;
}

export function ChatSidebar({ conversations, activeConversationId, agents, onSelect, onNewChat, onDelete }: ChatSidebarProps) {
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <>
      <SidebarShell
        header={
          <>
            <span className="text-sm font-semibold">Chats</span>
            <button
              onClick={onNewChat}
              className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>
          </>
        }
        collapsedActions={
          <>
            <button
              onClick={onNewChat}
              className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => navigate("/agents")}
              className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
              aria-label="Manage agents"
            >
              <Bot size={16} />
            </button>
          </>
        }
        body={
          <>
            <div className="px-1 pb-2">
              <button
                onClick={() => navigate("/agents")}
                className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted transition-colors hover:bg-background hover:text-foreground"
              >
                <Bot size={14} /> Manage Agents
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  agents={agents}
                  onClick={() => onSelect(conv.id)}
                  onDelete={() => {
                    setDeleteTarget(conv.id);
                    setDeleteError(null);
                  }}
                />
              ))}
            </div>
          </>
        }
      />

      {deleteTarget && (
        <ConfirmDialog
          title="Delete conversation?"
          message="This conversation and all its messages will be permanently deleted."
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          error={deleteError}
        />
      )}
    </>
  );
}
