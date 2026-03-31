import type { AgentSummary, AgentConfig, CreateAgentInput } from "../types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export async function fetchAgents(): Promise<AgentSummary[]> {
  const res = await fetch(`${BASE_URL}/api/agents`);
  if (!res.ok) { const body = await res.json(); throw new Error(body.error || "Failed to fetch agents"); }
  return res.json();
}

export async function fetchAgent(id: string): Promise<AgentConfig> {
  const res = await fetch(`${BASE_URL}/api/agents/${id}`);
  if (!res.ok) { const body = await res.json(); throw new Error(body.error || "Failed to fetch agent"); }
  return res.json();
}

export async function createAgent(data: CreateAgentInput): Promise<AgentConfig> {
  const res = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (!res.ok) { const body = await res.json(); throw new Error(body.error || "Failed to create agent"); }
  return res.json();
}

export async function updateAgent(id: string, data: CreateAgentInput): Promise<AgentConfig> {
  const res = await fetch(`${BASE_URL}/api/agents/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (!res.ok) { const body = await res.json(); throw new Error(body.error || "Failed to update agent"); }
  return res.json();
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/agents/${id}`, { method: "DELETE" });
  if (!res.ok) { const body = await res.json(); throw new Error(body.error || "Failed to delete agent"); }
}
