import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface SidebarShellProps {
  /** Header content to the right of the collapse toggle (title + actions). */
  header: ReactNode;
  /** Body content (scrollable). */
  body: ReactNode;
  /** Mini toolbar shown when the sidebar is collapsed. */
  collapsedActions?: ReactNode;
}

export function SidebarShell({ header, body, collapsedActions }: SidebarShellProps) {
  const { logout, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

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
        {collapsedActions}
        <button
          onClick={logout}
          className="mt-auto rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
          aria-label="Log out"
        >
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-[260px] flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-3 py-3">
        <button
          onClick={() => setCollapsed(true)}
          className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft size={16} />
        </button>
        {header}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">{body}</div>
      <div className="border-t border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="truncate text-xs text-muted">{user?.email}</span>
          <button
            onClick={logout}
            className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
            aria-label="Log out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
