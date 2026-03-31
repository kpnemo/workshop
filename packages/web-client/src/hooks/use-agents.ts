import { useState, useCallback, useEffect } from "react";
import {
  fetchAgents,
  createAgent as apiCreateAgent,
  updateAgent as apiUpdateAgent,
  deleteAgent as apiDeleteAgent,
} from "../lib/agents-api";
import type { AgentSummary, AgentConfig, CreateAgentInput } from "../types";

export function useAgents() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchAgents();
      setAgents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const createAgent = useCallback(
    async (data: CreateAgentInput): Promise<AgentConfig> => {
      const created = await apiCreateAgent(data);
      await loadAgents();
      return created;
    },
    [loadAgents]
  );

  const updateAgent = useCallback(
    async (id: string, data: CreateAgentInput): Promise<AgentConfig> => {
      const updated = await apiUpdateAgent(id, data);
      await loadAgents();
      return updated;
    },
    [loadAgents]
  );

  const deleteAgent = useCallback(
    async (id: string): Promise<void> => {
      await apiDeleteAgent(id);
      await loadAgents();
    },
    [loadAgents]
  );

  return { agents, isLoading, error, loadAgents, createAgent, updateAgent, deleteAgent };
}
