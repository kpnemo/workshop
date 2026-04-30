import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

export function AgentsEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">No agents yet.</p>
      <p className="max-w-sm text-sm text-muted">
        Create your first agent to start chatting with a custom assistant.
      </p>
      <Link
        to="/agents/new"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
      >
        <Plus size={16} /> New Agent
      </Link>
    </div>
  );
}
