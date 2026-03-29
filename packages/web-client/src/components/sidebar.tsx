import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ConversationItem } from "./conversation-item";
import { ConfirmDialog } from "./confirm-dialog";
import type { ConversationSummary } from "../types";

interface SidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => Promise<void>;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  onDelete,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
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

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center border-r border-border bg-surface py-3 gap-3">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
          aria-label="Expand sidebar"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={onNewChat}
          className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
          aria-label="New chat"
        >
          <Plus size={16} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex w-[260px] flex-col border-r border-border bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3">
          <button
            onClick={() => setCollapsed(true)}
            className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold">Chats</span>
          <button
            onClick={onNewChat}
            className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
            aria-label="New chat"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <div className="flex flex-col gap-1.5">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onClick={() => onSelect(conv.id)}
                onDelete={() => {
                  setDeleteTarget(conv.id);
                  setDeleteError(null);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
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
