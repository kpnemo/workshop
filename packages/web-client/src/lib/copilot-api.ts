import { getStoredToken } from "./api";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotCallbacks {
  onDelta: (text: string) => void;
  onAgentCreated: (data: { agentId: string; agentName: string }) => void;
  onAgentUpdated: (data: { agentId: string; agentName: string }) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

export async function sendCopilotMessage(
  messages: CopilotMessage[],
  mode: "create" | "edit",
  agentId: string | undefined,
  callbacks: CopilotCallbacks
): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const body: Record<string, unknown> = { messages, mode };
  if (agentId) body.agentId = agentId;

  const res = await fetch(`${BASE_URL}/api/copilot/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();
    callbacks.onError(data.error || "Copilot request failed");
    callbacks.onDone();
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        switch (currentEvent) {
          case "delta":
            callbacks.onDelta(data.text);
            break;
          case "agent_created":
            callbacks.onAgentCreated(data);
            break;
          case "agent_updated":
            callbacks.onAgentUpdated(data);
            break;
          case "error":
            callbacks.onError(data.message);
            break;
          case "done":
            callbacks.onDone();
            break;
        }
        currentEvent = "";
      }
    }
  }
}
