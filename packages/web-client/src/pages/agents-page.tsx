import { Outlet } from "react-router-dom";
import { AgentsSidebar } from "../components/agents-sidebar";

export function AgentsPage() {
  return (
    <div className="flex h-full">
      <AgentsSidebar />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
