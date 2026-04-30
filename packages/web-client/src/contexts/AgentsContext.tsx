import { createContext, useContext, type ReactNode } from "react";
import { useAgents } from "../hooks/use-agents";

type AgentsContextValue = ReturnType<typeof useAgents>;

export const AgentsContext = createContext<AgentsContextValue | null>(null);

export function AgentsProvider({ children }: { children: ReactNode }) {
  const value = useAgents();
  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgentsContext(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgentsContext must be used inside <AgentsProvider>");
  return ctx;
}
