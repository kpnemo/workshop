# Agent Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating copilot chat panel that interviews users and creates/edits agents via a dedicated backend endpoint.

**Architecture:** New `POST /api/copilot/chat` SSE endpoint with CopilotService that builds dynamic system prompts, streams Claude responses, and detects agent config blocks in the output. Frontend adds a floating panel (bottom-right) with its own hook and API client. Ephemeral chat state — no DB changes.

**Tech Stack:** Express + Anthropic SDK (backend), React + Tailwind (frontend), Vitest (tests)

---

### Task 1: CopilotService — system prompt builder and config extraction

**Files:**
- Create: `packages/agent-service/src/services/copilot-service.ts`
- Test: `packages/agent-service/src/__tests__/copilot-service.test.ts`

- [ ] **Step 1: Write failing tests for `buildSystemPrompt`**

```ts
// packages/agent-service/src/__tests__/copilot-service.test.ts
import { describe, it, expect } from "vitest";
import { CopilotService } from "../services/copilot-service.js";
import type { AgentConfig } from "../types.js";

function makeAgent(overrides: Partial<AgentConfig> & { id: string; name: string }): AgentConfig {
  return {
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "You are a test agent.",
    avatar: { emoji: "🤖", color: "#6c5ce7" },
    ...overrides,
  };
}

describe("CopilotService", () => {
  describe("buildSystemPrompt", () => {
    it("includes base instructions", () => {
      const agents = new Map<string, AgentConfig>();
      const service = new CopilotService(agents, []);
      const prompt = service.buildSystemPrompt("create");
      expect(prompt).toContain("Agent Copilot");
      expect(prompt).toContain("agent-config");
    });

    it("includes existing agent summaries", () => {
      const agents = new Map<string, AgentConfig>([
        ["support-bot", makeAgent({ id: "support-bot", name: "Support Bot", tools: ["browse_url"] })],
      ]);
      const service = new CopilotService(agents, [{ name: "browse_url", description: "Fetch web pages" }]);
      const prompt = service.buildSystemPrompt("create");
      expect(prompt).toContain("support-bot");
      expect(prompt).toContain("Support Bot");
    });

    it("includes available tools", () => {
      const agents = new Map<string, AgentConfig>();
      const service = new CopilotService(agents, [{ name: "browse_url", description: "Fetch web pages" }]);
      const prompt = service.buildSystemPrompt("create");
      expect(prompt).toContain("browse_url");
      expect(prompt).toContain("Fetch web pages");
    });

    it("includes target agent config in edit mode", () => {
      const agents = new Map<string, AgentConfig>([
        ["support-bot", makeAgent({ id: "support-bot", name: "Support Bot" })],
      ]);
      const service = new CopilotService(agents, []);
      const prompt = service.buildSystemPrompt("edit", "support-bot");
      expect(prompt).toContain("Editing: Support Bot");
      expect(prompt).toContain("You are a test agent.");
    });
  });

  describe("extractAgentConfig", () => {
    it("extracts valid config from agent-config block", () => {
      const agents = new Map<string, AgentConfig>();
      const service = new CopilotService(agents, []);
      const text = 'Here is your agent:\n\n```agent-config\n{"name": "Travel Bot", "systemPrompt": "You help with travel."}\n```\n\nEnjoy!';
      const result = service.extractAgentConfig(text);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Travel Bot");
      expect(result!.systemPrompt).toBe("You help with travel.");
    });

    it("returns null when no config block present", () => {
      const agents = new Map<string, AgentConfig>();
      const service = new CopilotService(agents, []);
      const result = service.extractAgentConfig("Just a normal message.");
      expect(result).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      const agents = new Map<string, AgentConfig>();
      const service = new CopilotService(agents, []);
      const text = '```agent-config\n{not valid json}\n```';
      const result = service.extractAgentConfig(text);
      expect(result).toBeNull();
    });

    it("returns null when required fields are missing", () => {
      const agents = new Map<string, AgentConfig>();
      const service = new CopilotService(agents, []);
      const text = '```agent-config\n{"name": "Bot"}\n```';
      const result = service.extractAgentConfig(text);
      expect(result).toBeNull();
    });

    it("applies defaults for optional fields", () => {
      const agents = new Map<string, AgentConfig>();
      const service = new CopilotService(agents, []);
      const text = '```agent-config\n{"name": "Bot", "systemPrompt": "Hello."}\n```';
      const result = service.extractAgentConfig(text);
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-sonnet-4-20250514");
      expect(result!.temperature).toBe(0.7);
      expect(result!.maxTokens).toBe(1024);
      expect(result!.avatar.emoji).toBe("🤖");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test -- --run copilot-service`
Expected: FAIL — cannot find module `../services/copilot-service.js`

- [ ] **Step 3: Implement CopilotService**

```ts
// packages/agent-service/src/services/copilot-service.ts
import type { AgentConfig } from "../types.js";

export interface AvailableToolInfo {
  name: string;
  description: string;
}

export interface ExtractedAgentConfig {
  name: string;
  systemPrompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
  avatar: { emoji: string; color: string };
  tools?: string[];
  delegates?: string[];
  topicBoundaries?: {
    allowed: string[];
    blocked: string[];
    boundaryMessage: string;
  };
}

export class CopilotService {
  constructor(
    private agents: Map<string, AgentConfig>,
    private availableTools: AvailableToolInfo[]
  ) {}

  buildSystemPrompt(mode: "create" | "edit", agentId?: string): string {
    const toolsList = this.availableTools.length > 0
      ? this.availableTools.map((t) => `- ${t.name}: ${t.description}`).join("\n")
      : "No tools available.";

    const agentIds = [...this.agents.keys()];
    const agentSummaries = [...this.agents.values()]
      .map((a) => {
        const tools = a.tools?.length ? ` | tools: ${a.tools.join(", ")}` : "";
        const delegates = a.delegates?.length ? ` | delegates to: ${a.delegates.join(", ")}` : "";
        return `- ${a.id} ("${a.name}") — model: ${a.model}${tools}${delegates}`;
      })
      .join("\n") || "No agents exist yet.";

    let editSection = "";
    if (mode === "edit" && agentId) {
      const agent = this.agents.get(agentId);
      if (agent) {
        editSection = `\n\n## Editing: ${agent.name}
Current configuration:
- ID: ${agent.id}
- Model: ${agent.model}
- Temperature: ${agent.temperature}
- Max Tokens: ${agent.maxTokens}
- Avatar: ${agent.avatar.emoji} (${agent.avatar.color})
- Tools: ${agent.tools?.join(", ") || "none"}
- Delegates: ${agent.delegates?.join(", ") || "none"}
- Topic Boundaries: ${agent.topicBoundaries ? JSON.stringify(agent.topicBoundaries) : "none"}

Current system prompt:
${agent.systemPrompt}

The user wants to modify this agent. Ask what they'd like to change, then output the full updated config.`;
      }
    }

    return `You are an Agent Copilot that helps users create and configure AI agents.

## Interview Style
- Start by understanding what the user wants naturally
- Extract as much config as you can from their description
- Ask targeted follow-up questions ONLY for missing or ambiguous fields
- Be conversational, not robotic — don't list all fields at once
- Always confirm with the user before outputting the final config

## Agent Schema
Fields you need to gather:
- name (required): Display name for the agent
- model: Claude model (default: claude-sonnet-4-20250514)
- temperature: 0-1 (default: 0.7)
- maxTokens: (default: 1024)
- avatar: { emoji, color } — suggest based on agent personality
- systemPrompt (required): The agent's personality and instructions
- tools: Array of available tools
- delegates: Array of agent IDs this agent can delegate to
- topicBoundaries (optional): { allowed[], blocked[], boundaryMessage }

## Available Tools
${toolsList}

## Existing Agents
${agentSummaries}
${agentIds.length > 0 ? `\nExisting agent IDs (for delegates): ${agentIds.join(", ")}` : ""}

## Output Format
When you have gathered enough information and the user confirms, output the complete config in a fenced block exactly like this:

\`\`\`agent-config
{ ...valid JSON matching the schema above... }
\`\`\`

Do not output this block until the user has confirmed they are happy with the configuration.${editSection}`;
  }

  extractAgentConfig(text: string): ExtractedAgentConfig | null {
    const match = text.match(/```agent-config\s*\n([\s\S]*?)```/);
    if (!match) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      return null;
    }

    if (!parsed.name || typeof parsed.name !== "string") return null;
    if (!parsed.systemPrompt || typeof parsed.systemPrompt !== "string") return null;

    return {
      name: parsed.name as string,
      systemPrompt: parsed.systemPrompt as string,
      model: (parsed.model as string) || "claude-sonnet-4-20250514",
      maxTokens: (parsed.maxTokens as number) || 1024,
      temperature: (parsed.temperature as number) ?? 0.7,
      avatar: {
        emoji: (parsed.avatar as any)?.emoji || "🤖",
        color: (parsed.avatar as any)?.color || "#6c5ce7",
      },
      tools: Array.isArray(parsed.tools) ? parsed.tools : undefined,
      delegates: Array.isArray(parsed.delegates) ? parsed.delegates : undefined,
      topicBoundaries: parsed.topicBoundaries as ExtractedAgentConfig["topicBoundaries"],
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test -- --run copilot-service`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/copilot-service.ts packages/agent-service/src/__tests__/copilot-service.test.ts
git commit -m "feat: add CopilotService with system prompt builder and config extraction"
```

---

### Task 2: Copilot backend route with SSE streaming

**Files:**
- Create: `packages/agent-service/src/routes/copilot.ts`
- Modify: `packages/agent-service/src/index.ts:59-62`
- Test: `packages/agent-service/src/__tests__/copilot-route.test.ts`

- [ ] **Step 1: Write failing tests for the copilot route**

```ts
// packages/agent-service/src/__tests__/copilot-route.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadAgents } from "../services/agent-loader.js";
import { createCopilotRouter } from "../routes/copilot.js";
import type { AgentConfig } from "../types.js";

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn(),
      };
    },
  };
});

let tmpDir: string;
let agents: Map<string, AgentConfig>;

function buildApp() {
  agents = loadAgents(tmpDir);
  const app = express();
  app.use(express.json());
  // Inject userId like the auth middleware would
  app.use((req, _res, next) => { req.userId = "test-user"; next(); });
  app.use("/copilot", createCopilotRouter(agents, tmpDir, []));
  return app;
}

function makeSSERequest(
  app: express.Express,
  body: object
): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const options = {
        hostname: "127.0.0.1", port, path: "/copilot/chat",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      };
      const req = http.request(options, (res: any) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => { server.close(); resolve({ status: res.statusCode, body: data }); });
      });
      req.write(JSON.stringify(body));
      req.end();
    });
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-route-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
  vi.restoreAllMocks();
});

describe("POST /copilot/chat", () => {
  it("returns 400 when messages array is empty", async () => {
    const app = buildApp();
    const res = await makeSSERequest(app, { messages: [], mode: "create" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages is missing", async () => {
    const app = buildApp();
    const res = await makeSSERequest(app, { mode: "create" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when mode is edit but agentId is missing", async () => {
    const app = buildApp();
    const res = await makeSSERequest(app, {
      messages: [{ role: "user", content: "edit something" }],
      mode: "edit",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when edit target agent does not exist", async () => {
    const app = buildApp();
    const res = await makeSSERequest(app, {
      messages: [{ role: "user", content: "edit it" }],
      mode: "edit",
      agentId: "nonexistent",
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/agent-service test -- --run copilot-route`
Expected: FAIL — cannot find module `../routes/copilot.js`

- [ ] **Step 3: Implement the copilot route**

```ts
// packages/agent-service/src/routes/copilot.ts
import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { CopilotService } from "../services/copilot-service.js";
import type { AvailableToolInfo } from "../services/copilot-service.js";
import { loadAgents, saveAgent } from "../services/agent-loader.js";
import type { AgentConfig } from "../types.js";

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function startSSE(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

function writeSSE(res: Response, event: string, data: object) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createCopilotRouter(
  agents: Map<string, AgentConfig>,
  agentsDir: string,
  availableTools: AvailableToolInfo[]
): Router {
  const router = Router();

  function refreshAgents(): void {
    const updated = loadAgents(agentsDir);
    agents.clear();
    for (const [k, v] of updated) agents.set(k, v);
  }

  router.post("/chat", async (req: Request, res: Response) => {
    const { messages, mode, agentId } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required and must not be empty" });
      return;
    }

    if (mode !== "create" && mode !== "edit") {
      res.status(400).json({ error: "mode must be 'create' or 'edit'" });
      return;
    }

    if (mode === "edit" && !agentId) {
      res.status(400).json({ error: "agentId is required for edit mode" });
      return;
    }

    if (mode === "edit" && !agents.has(agentId)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const copilotService = new CopilotService(agents, availableTools);
    const systemPrompt = copilotService.buildSystemPrompt(mode, agentId);

    const claudeMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    startSSE(res);

    try {
      const stream = getClient().messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: claudeMessages,
      });

      let fullResponse = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullResponse += event.delta.text;
          writeSSE(res, "delta", { text: event.delta.text });
        }
      }

      // Check if the response contains an agent config block
      const extracted = copilotService.extractAgentConfig(fullResponse);
      if (extracted) {
        const id = mode === "edit" && agentId ? agentId : slugify(extracted.name);

        const config: AgentConfig = {
          id,
          name: extracted.name,
          model: extracted.model,
          maxTokens: extracted.maxTokens,
          temperature: extracted.temperature,
          systemPrompt: extracted.systemPrompt,
          avatar: extracted.avatar,
          tools: extracted.tools,
          delegates: extracted.delegates,
          topicBoundaries: extracted.topicBoundaries,
        };

        saveAgent(agentsDir, id, config);
        refreshAgents();

        const eventType = mode === "edit" ? "agent_updated" : "agent_created";
        writeSSE(res, eventType, { agentId: id, agentName: extracted.name });
      }

      writeSSE(res, "done", {});
      res.end();
    } catch (err) {
      console.error("[copilot] Stream error:", err);
      writeSSE(res, "error", { message: "Copilot service error" });
      writeSSE(res, "done", {});
      res.end();
    }
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/agent-service test -- --run copilot-route`
Expected: All 4 tests PASS

- [ ] **Step 5: Register the copilot route in index.ts**

In `packages/agent-service/src/index.ts`, add the import and route registration. After the existing route registrations (line 62), add:

```ts
// Add this import at the top, after the other route imports (after line 14):
import { createCopilotRouter } from "./routes/copilot.js";

// Add this route after line 62 (after the conversations route):
app.use("/copilot", authMiddleware(JWT_SECRET), createCopilotRouter(agents, AGENTS_DIR, toolService.getAvailableTools()));
```

- [ ] **Step 6: Run all backend tests to verify nothing is broken**

Run: `pnpm --filter @new-workshop/agent-service test -- --run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/agent-service/src/routes/copilot.ts packages/agent-service/src/__tests__/copilot-route.test.ts packages/agent-service/src/index.ts
git commit -m "feat: add POST /api/copilot/chat SSE endpoint"
```

---

### Task 3: Frontend copilot API client

**Files:**
- Create: `packages/web-client/src/lib/copilot-api.ts`
- Test: `packages/web-client/src/__tests__/copilot-api.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/web-client/src/__tests__/copilot-api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendCopilotMessage } from "../lib/copilot-api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => { mockFetch.mockReset(); });

describe("sendCopilotMessage", () => {
  it("sends POST to /api/copilot/chat with correct body", async () => {
    // Mock a readable stream that ends immediately
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, body: stream.getReader ? stream : { getReader: () => stream.getReader() } });

    // We need to mock properly for the reader pattern
    mockFetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => stream.getReader() },
    });

    const callbacks = {
      onDelta: vi.fn(),
      onAgentCreated: vi.fn(),
      onAgentUpdated: vi.fn(),
      onError: vi.fn(),
      onDone: vi.fn(),
    };

    await sendCopilotMessage(
      [{ role: "user", content: "Create a bot" }],
      "create",
      undefined,
      callbacks
    );

    expect(mockFetch).toHaveBeenCalledWith("/api/copilot/chat", {
      method: "POST",
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        messages: [{ role: "user", content: "Create a bot" }],
        mode: "create",
      }),
    });
    expect(callbacks.onDone).toHaveBeenCalled();
  });

  it("calls onError when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Bad request" }),
    });

    const callbacks = {
      onDelta: vi.fn(),
      onAgentCreated: vi.fn(),
      onAgentUpdated: vi.fn(),
      onError: vi.fn(),
      onDone: vi.fn(),
    };

    await sendCopilotMessage(
      [{ role: "user", content: "Create a bot" }],
      "create",
      undefined,
      callbacks
    );

    expect(callbacks.onError).toHaveBeenCalledWith("Bad request");
    expect(callbacks.onDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @new-workshop/web-client test -- --run copilot-api`
Expected: FAIL — cannot find module `../lib/copilot-api`

- [ ] **Step 3: Implement copilot-api**

```ts
// packages/web-client/src/lib/copilot-api.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @new-workshop/web-client test -- --run copilot-api`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/src/lib/copilot-api.ts packages/web-client/src/__tests__/copilot-api.test.ts
git commit -m "feat: add copilot API client with SSE parsing"
```

---

### Task 4: useCopilot hook

**Files:**
- Create: `packages/web-client/src/hooks/use-copilot.ts`

- [ ] **Step 1: Implement the useCopilot hook**

```ts
// packages/web-client/src/hooks/use-copilot.ts
import { useState, useCallback, useRef } from "react";
import { sendCopilotMessage } from "../lib/copilot-api";
import type { CopilotMessage } from "../lib/copilot-api";
import type { AgentSummary } from "../types";

interface CopilotState {
  messages: CopilotMessage[];
  isStreaming: boolean;
  isOpen: boolean;
  isMinimized: boolean;
}

interface UseCopilotOptions {
  agents: AgentSummary[];
  onAgentReady: (agentId: string) => void;
}

const EDIT_PATTERN = /^(edit|update|modify)\s+(.+)/i;

export function useCopilot({ agents, onAgentReady }: UseCopilotOptions) {
  const [state, setState] = useState<CopilotState>({
    messages: [],
    isStreaming: false,
    isOpen: false,
    isMinimized: true,
  });
  const modeRef = useRef<"create" | "edit">("create");
  const agentIdRef = useRef<string | undefined>(undefined);
  const assistantBufferRef = useRef("");

  const detectMode = useCallback(
    (text: string) => {
      const match = text.match(EDIT_PATTERN);
      if (!match) return;
      const query = match[2].trim().toLowerCase();
      const found = agents.find(
        (a) => a.id === query || a.name.toLowerCase() === query
      );
      if (found) {
        modeRef.current = "edit";
        agentIdRef.current = found.id;
      }
    },
    [agents]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const userMessage: CopilotMessage = { role: "user", content: text };

      // Detect mode on first message only
      if (state.messages.length === 0) {
        modeRef.current = "create";
        agentIdRef.current = undefined;
        detectMode(text);
      }

      const updatedMessages = [...state.messages, userMessage];
      setState((s) => ({ ...s, messages: updatedMessages, isStreaming: true }));
      assistantBufferRef.current = "";

      // Add placeholder assistant message
      const messagesWithPlaceholder = [
        ...updatedMessages,
        { role: "assistant" as const, content: "" },
      ];
      setState((s) => ({ ...s, messages: messagesWithPlaceholder }));

      await sendCopilotMessage(
        updatedMessages,
        modeRef.current,
        agentIdRef.current,
        {
          onDelta: (deltaText: string) => {
            assistantBufferRef.current += deltaText;
            const content = assistantBufferRef.current;
            setState((s) => ({
              ...s,
              messages: [
                ...updatedMessages,
                { role: "assistant", content },
              ],
            }));
          },
          onAgentCreated: (data) => {
            onAgentReady(data.agentId);
          },
          onAgentUpdated: (data) => {
            onAgentReady(data.agentId);
          },
          onError: (message: string) => {
            const content = assistantBufferRef.current || `Error: ${message}`;
            setState((s) => ({
              ...s,
              messages: [
                ...updatedMessages,
                { role: "assistant", content },
              ],
            }));
          },
          onDone: () => {
            setState((s) => ({ ...s, isStreaming: false }));
          },
        }
      );
    },
    [state.messages, detectMode, onAgentReady]
  );

  const reset = useCallback(() => {
    setState((s) => ({ ...s, messages: [] }));
    modeRef.current = "create";
    agentIdRef.current = undefined;
    assistantBufferRef.current = "";
  }, []);

  const toggle = useCallback(() => {
    setState((s) => ({
      ...s,
      isOpen: !s.isOpen,
      isMinimized: false,
    }));
  }, []);

  const minimize = useCallback(() => {
    setState((s) => ({ ...s, isMinimized: true, isOpen: false }));
  }, []);

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    isOpen: state.isOpen,
    isMinimized: state.isMinimized,
    sendMessage,
    reset,
    toggle,
    minimize,
  };
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && npx tsc --noEmit --project packages/web-client/tsconfig.json 2>&1 | head -20`
Expected: No errors related to use-copilot.ts

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/hooks/use-copilot.ts
git commit -m "feat: add useCopilot hook with mode detection and SSE streaming"
```

---

### Task 5: CopilotChat component

**Files:**
- Create: `packages/web-client/src/components/copilot-chat.tsx`

- [ ] **Step 1: Implement CopilotChat**

```tsx
// packages/web-client/src/components/copilot-chat.tsx
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send } from "lucide-react";
import type { CopilotMessage } from "../lib/copilot-api";

interface CopilotChatProps {
  messages: CopilotMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
}

export function CopilotChat({ messages, isStreaming, onSend }: CopilotChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus();
  }, [isStreaming]);

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted py-6">
            Describe the agent you want to create, or type{" "}
            <span className="font-mono text-primary">"edit agent-name"</span> to modify one.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-surface text-foreground rounded-bl-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-invert prose-xs max-w-none prose-p:my-0.5 prose-ul:my-0.5 prose-pre:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content || "..."}
                  </ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-surface rounded-lg px-3 py-2 text-xs text-muted">
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-2">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "Waiting..." : "Describe your agent..."}
            disabled={isStreaming}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-foreground placeholder-muted outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={isStreaming || !input.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && npx tsc --noEmit --project packages/web-client/tsconfig.json 2>&1 | head -20`
Expected: No errors related to copilot-chat.tsx

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/components/copilot-chat.tsx
git commit -m "feat: add CopilotChat component with markdown rendering"
```

---

### Task 6: CopilotPanel floating container

**Files:**
- Create: `packages/web-client/src/components/copilot-panel.tsx`

- [ ] **Step 1: Implement CopilotPanel**

```tsx
// packages/web-client/src/components/copilot-panel.tsx
import { Bot, Minus, RotateCcw, X } from "lucide-react";
import { CopilotChat } from "./copilot-chat";
import type { CopilotMessage } from "../lib/copilot-api";

interface CopilotPanelProps {
  messages: CopilotMessage[];
  isStreaming: boolean;
  isOpen: boolean;
  onSend: (text: string) => void;
  onToggle: () => void;
  onMinimize: () => void;
  onReset: () => void;
}

export function CopilotPanel({
  messages,
  isStreaming,
  isOpen,
  onSend,
  onToggle,
  onMinimize,
  onReset,
}: CopilotPanelProps) {
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-transform hover:scale-105"
        aria-label="Open Agent Copilot"
      >
        <Bot size={22} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[450px] w-[350px] flex-col rounded-xl border border-border bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-primary" />
          <span className="text-xs font-semibold">Agent Copilot</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onReset}
            className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Reset conversation"
            title="Reset"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={onMinimize}
            className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Minimize"
            title="Minimize"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={onToggle}
            className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close"
            title="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Chat */}
      <CopilotChat
        messages={messages}
        isStreaming={isStreaming}
        onSend={onSend}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && npx tsc --noEmit --project packages/web-client/tsconfig.json 2>&1 | head -20`
Expected: No errors related to copilot-panel.tsx

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/components/copilot-panel.tsx
git commit -m "feat: add CopilotPanel floating container with minimize/expand"
```

---

### Task 7: Integrate CopilotPanel into App.tsx

**Files:**
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Add CopilotPanel to AuthenticatedApp**

In `packages/web-client/src/App.tsx`, add the import and mount the component.

Add imports at the top (after line 8):
```ts
import { CopilotPanel } from "./components/copilot-panel";
import { useCopilot } from "./hooks/use-copilot";
```

Inside the `AuthenticatedApp` function, after the `const [drawerOpen, setDrawerOpen] = useState(false);` line (line 21), add the copilot hook:
```ts
  const copilot = useCopilot({
    agents,
    onAgentReady: () => {
      loadAgents();
      setDrawerOpen(true);
    },
  });
```

In the JSX return, after the `AgentDrawer` conditional block (after line 55) and before the closing `</div>`, add:
```tsx
      <CopilotPanel
        messages={copilot.messages}
        isStreaming={copilot.isStreaming}
        isOpen={copilot.isOpen}
        onSend={copilot.sendMessage}
        onToggle={copilot.toggle}
        onMinimize={copilot.minimize}
        onReset={copilot.reset}
      />
```

- [ ] **Step 2: Verify the module compiles**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && npx tsc --noEmit --project packages/web-client/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Run all frontend tests to verify nothing is broken**

Run: `pnpm --filter @new-workshop/web-client test -- --run`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/src/App.tsx
git commit -m "feat: integrate CopilotPanel into App with agent drawer callback"
```

---

### Task 8: Manual end-to-end verification

- [ ] **Step 1: Start the backend**

Run: `pnpm --filter @new-workshop/agent-service dev`
Expected: Server starts on port 3000, "Loaded N agent(s)" logged

- [ ] **Step 2: Start the frontend**

Run: `pnpm --filter @new-workshop/web-client dev`
Expected: Vite dev server starts on port 5173

- [ ] **Step 3: Verify copilot button appears**

Open http://localhost:5173, log in. A circular 🤖 button should appear in the bottom-right corner.

- [ ] **Step 4: Test create flow**

1. Click the copilot button — panel expands
2. Type "I want a coding assistant that helps with Python" and send
3. The copilot should ask follow-up questions (tools, guardrails, etc.)
4. Answer questions until the copilot produces an agent-config block
5. Verify the Agent Drawer opens showing the new agent form

- [ ] **Step 5: Test edit flow**

1. Reset the copilot (click reset button)
2. Type "edit [name of an existing agent]"
3. The copilot should show current config and ask what to change
4. Make a change and confirm
5. Verify the Agent Drawer opens showing the updated agent

- [ ] **Step 6: Run all tests one final time**

Run: `pnpm --filter @new-workshop/agent-service test -- --run && pnpm --filter @new-workshop/web-client test -- --run`
Expected: All tests PASS

- [ ] **Step 7: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: polish copilot integration after e2e testing"
```
