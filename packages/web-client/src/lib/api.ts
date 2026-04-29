import type {
  ConversationResponse,
  ConversationDetail,
  ConversationSummary,
  FileInfo,
  SendMessageCallbacks,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

const TOKEN_KEY = "auth_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function signup(
  email: string,
  password: string
): Promise<{ token: string; user: { id: string; email: string } }> {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      throw new Error(body.error || "Signup failed");
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("Signup failed — server unavailable");
      throw e;
    }
  }

  return res.json();
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: { id: string; email: string } }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      throw new Error(body.error || "Login failed");
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("Login failed — server unavailable");
      throw e;
    }
  }

  return res.json();
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${BASE_URL}/api/conversations`, {
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to list conversations");
  }

  return res.json();
}

export async function createConversation(
  agentId: string
): Promise<ConversationResponse> {
  const res = await fetch(`${BASE_URL}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ agentId }),
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to create conversation");
  }

  return res.json();
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to delete conversation");
  }
}

export async function sendMessage(
  conversationId: string,
  message: string,
  callbacks: SendMessageCallbacks,
  options?: { debug?: boolean }
): Promise<void> {
  const url = `${BASE_URL}/api/conversations/${conversationId}/messages${options?.debug ? "?debug=true" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const body = await res.json();
    callbacks.onError(body.error || "Request failed");
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
            callbacks.onDelta(data.text, data.agentId);
            break;
          case "error":
            callbacks.onError(data.message);
            break;
          case "title":
            callbacks.onTitle(data.title);
            break;
          case "delegation_start":
            callbacks.onDelegationStart?.(data);
            break;
          case "delegation_end":
            callbacks.onDelegationEnd?.(data);
            break;
          case "assignment":
            callbacks.onAssignment?.(data);
            break;
          case "redirect_to_router":
            callbacks.onRedirect?.(data);
            break;
          case "debug_agent":
            callbacks.onDebugAgent?.(data);
            break;
          case "debug_thinking":
            callbacks.onDebugThinking?.(data);
            break;
          case "debug_tool":
            callbacks.onDebugTool?.(data);
            break;
          case "debug_stream":
            callbacks.onDebugStream?.(data);
            break;
          case "summary":
            callbacks.onSummary?.(data);
            break;
          case "debug_summary":
            callbacks.onDebugSummary?.(data);
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

export async function getConversation(
  conversationId: string
): Promise<ConversationDetail> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to get conversation");
  }

  return res.json();
}

export async function refreshSummary(conversationId: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to refresh summary");
  }

  const data = await res.json();
  return data.summary;
}

export async function toggleSummary(conversationId: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ summaryEnabled: enabled }),
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to toggle summary");
  }
}

export async function uploadFile(file: File): Promise<FileInfo> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/api/files`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to upload file");
  }

  return res.json();
}

export async function listFiles(): Promise<FileInfo[]> {
  const res = await fetch(`${BASE_URL}/api/files`, {
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to list files");
  }

  return res.json();
}

export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/files/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    throw new Error("Failed to delete file");
  }
}
