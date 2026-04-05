# Agent Tools System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general-purpose tool execution system to the agent backend, with `browse_url` (Playwright + Readability) as the first tool.

**Architecture:** A `ToolService` class manages tool registration, agent-tool resolution, and execution dispatch. The conversation route delegates tool calls to this service. Tools run in an agentic loop server-side — the frontend is unchanged.

**Tech Stack:** TypeScript, Playwright, @mozilla/readability, linkedom, Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-agent-tools-design.md`

---

## File Structure

```
packages/agent-service/src/
  types.ts                          — MODIFY: add tools field to AgentConfig
  index.ts                          — MODIFY: initialize ToolService at startup, shutdown on exit
  services/
    agent-loader.ts                 — MODIFY: persist tools field in saveAgent
    tool-service.ts                 — CREATE: registry, resolution, execution
    tools/
      types.ts                      — CREATE: Tool interface
      browse-url.ts                 — CREATE: Playwright URL browsing tool
      browser-manager.ts            — CREATE: shared Chromium lifecycle
  routes/
    conversations.ts                — MODIFY: tool execution loop + SSE status events
  __tests__/
    tool-service.test.ts            — CREATE: ToolService tests
    browse-url.test.ts              — CREATE: browse_url tool tests
    browser-manager.test.ts         — CREATE: BrowserManager tests
    routes.test.ts                  — MODIFY: add tool loop tests
```

---

### Task 1: Install Dependencies

**Files:**
- Modify: `packages/agent-service/package.json`

- [ ] **Step 1: Install production dependencies**

Run from project root:

```bash
cd packages/agent-service && pnpm add playwright @mozilla/readability linkedom
```

- [ ] **Step 2: Install Playwright Chromium browser**

```bash
cd packages/agent-service && pnpm exec playwright install chromium
```

This downloads the Chromium binary. Only Chromium is needed (not Firefox or WebKit).

- [ ] **Step 3: Install type definitions**

```bash
cd packages/agent-service && pnpm add -D @types/linkedom
```

Note: `@mozilla/readability` ships its own types. Playwright ships its own types.

- [ ] **Step 4: Verify install succeeded**

```bash
cd packages/agent-service && pnpm exec playwright --version
```

Expected: prints a version number (e.g., `1.52.0`).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/package.json pnpm-lock.yaml
git commit -m "chore: add playwright, readability, and linkedom dependencies"
```

---

### Task 2: Tool Interface Types

**Files:**
- Create: `packages/agent-service/src/services/tools/types.ts`
- Modify: `packages/agent-service/src/types.ts`

- [ ] **Step 1: Create the Tool interface**

Create `packages/agent-service/src/services/tools/types.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk";

export interface Tool {
  name: string;
  definition: Anthropic.Messages.Tool;
  execute(input: unknown): Promise<string>;
}
```

- [ ] **Step 2: Add `tools` field to AgentConfig**

In `packages/agent-service/src/types.ts`, add the optional `tools` field to `AgentConfig`:

```ts
export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  avatar: Avatar;
  topicBoundaries?: TopicBoundaries;
  tools?: string[];
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd packages/agent-service && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-service/src/services/tools/types.ts packages/agent-service/src/types.ts
git commit -m "feat: add Tool interface and tools field to AgentConfig"
```

---

### Task 3: AgentLoader — Persist tools field

**Files:**
- Modify: `packages/agent-service/src/services/agent-loader.ts`

The `loadAgents` function already passes through unknown frontmatter fields via `gray-matter`, but the `AgentConfig` object construction doesn't include `tools`. The `saveAgent` function also needs to persist it.

- [ ] **Step 1: Add tools to loadAgents config construction**

In `packages/agent-service/src/services/agent-loader.ts`, inside the `for` loop where `config` is built (around line 33), add the `tools` field:

```ts
const config: AgentConfig = {
  id,
  name: data.name,
  model: data.model,
  maxTokens: data.maxTokens ?? 1024,
  temperature: data.temperature ?? 1.0,
  systemPrompt: content.trim(),
  avatar: {
    emoji: data.avatar?.emoji ?? "🤖",
    color: data.avatar?.color ?? "#6c5ce7",
  },
  topicBoundaries: data.topicBoundaries,
  tools: data.tools,
};
```

- [ ] **Step 2: Add tools to saveAgent frontmatter**

In the `saveAgent` function, add tools to the frontmatter object (after the `topicBoundaries` block, around line 65):

```ts
if (config.topicBoundaries) {
  frontMatter.topicBoundaries = config.topicBoundaries;
}
if (config.tools && config.tools.length > 0) {
  frontMatter.tools = config.tools;
}
```

- [ ] **Step 3: Run existing agent-loader tests**

```bash
cd packages/agent-service && pnpm test -- agent-loader
```

Expected: all existing tests pass (the new field is optional, so nothing breaks).

- [ ] **Step 4: Commit**

```bash
git add packages/agent-service/src/services/agent-loader.ts
git commit -m "feat: support tools field in agent frontmatter loading and saving"
```

---

### Task 4: BrowserManager

**Files:**
- Create: `packages/agent-service/src/services/tools/browser-manager.ts`
- Create: `packages/agent-service/src/__tests__/browser-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/agent-service/src/__tests__/browser-manager.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock playwright before importing BrowserManager
const mockPage = {
  goto: vi.fn(),
  content: vi.fn().mockResolvedValue("<html><body>Hello</body></html>"),
  close: vi.fn(),
};

const mockContext = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn(),
};

const mockBrowser = {
  newContext: vi.fn().mockResolvedValue(mockContext),
  close: vi.fn(),
  isConnected: vi.fn().mockReturnValue(true),
};

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

import { BrowserManager } from "../services/tools/browser-manager.js";

describe("BrowserManager", () => {
  let manager: BrowserManager;

  beforeEach(() => {
    manager = new BrowserManager();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await manager.close();
  });

  it("does not launch browser until first withPage call", async () => {
    const { chromium } = await import("playwright");
    expect(chromium.launch).not.toHaveBeenCalled();

    await manager.withPage(async () => "test");

    expect(chromium.launch).toHaveBeenCalledOnce();
  });

  it("creates and closes context for each withPage call", async () => {
    await manager.withPage(async (page) => {
      expect(page).toBe(mockPage);
      return "result";
    });

    expect(mockBrowser.newContext).toHaveBeenCalledOnce();
    expect(mockContext.close).toHaveBeenCalledOnce();
  });

  it("returns the callback result", async () => {
    const result = await manager.withPage(async () => "hello");
    expect(result).toBe("hello");
  });

  it("closes context even if callback throws", async () => {
    await expect(
      manager.withPage(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(mockContext.close).toHaveBeenCalledOnce();
  });

  it("reuses browser across multiple withPage calls", async () => {
    const { chromium } = await import("playwright");

    await manager.withPage(async () => "first");
    await manager.withPage(async () => "second");

    expect(chromium.launch).toHaveBeenCalledOnce();
    expect(mockBrowser.newContext).toHaveBeenCalledTimes(2);
  });

  it("close() shuts down the browser", async () => {
    await manager.withPage(async () => "init");
    await manager.close();

    expect(mockBrowser.close).toHaveBeenCalledOnce();
  });

  it("relaunches browser if disconnected", async () => {
    const { chromium } = await import("playwright");

    await manager.withPage(async () => "init");
    mockBrowser.isConnected.mockReturnValueOnce(false);
    await manager.withPage(async () => "relaunch");

    expect(chromium.launch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/agent-service && pnpm test -- browser-manager
```

Expected: FAIL — `BrowserManager` module not found.

- [ ] **Step 3: Implement BrowserManager**

Create `packages/agent-service/src/services/tools/browser-manager.ts`:

```ts
import { chromium, type Browser, type Page } from "playwright";

export class BrowserManager {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.getBrowser();
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      return await fn(page);
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/agent-service && pnpm test -- browser-manager
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/tools/browser-manager.ts packages/agent-service/src/__tests__/browser-manager.test.ts
git commit -m "feat: add BrowserManager with lazy launch and context isolation"
```

---

### Task 5: browse_url Tool

**Files:**
- Create: `packages/agent-service/src/services/tools/browse-url.ts`
- Create: `packages/agent-service/src/__tests__/browse-url.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/agent-service/src/__tests__/browse-url.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrowserManager } from "../services/tools/browser-manager.js";

function createMockBrowserManager(html: string): BrowserManager {
  return {
    withPage: vi.fn(async (fn) => {
      const mockPage = {
        goto: vi.fn(),
        content: vi.fn().mockResolvedValue(html),
        innerText: vi.fn().mockResolvedValue("fallback text"),
      };
      return fn(mockPage as any);
    }),
    close: vi.fn(),
  } as unknown as BrowserManager;
}

import { createBrowseUrlTool } from "../services/tools/browse-url.js";

describe("browse_url tool", () => {
  it("has correct name and schema", () => {
    const manager = createMockBrowserManager("");
    const tool = createBrowseUrlTool(manager);

    expect(tool.name).toBe("browse_url");
    expect(tool.definition.name).toBe("browse_url");
    expect(tool.definition.input_schema.required).toEqual(["url"]);
  });

  it("extracts readable content from HTML", async () => {
    const html = `
      <html><head><title>Test Page</title></head>
      <body>
        <nav>Navigation links</nav>
        <article>
          <h1>Main Article</h1>
          <p>This is the main content of the page with enough text to be considered an article by Readability. It needs to be reasonably long to pass the content scoring algorithm that Readability uses internally.</p>
          <p>Here is another paragraph with more content to ensure the article is detected properly by the extraction algorithm.</p>
        </article>
        <footer>Footer stuff</footer>
      </body></html>
    `;
    const manager = createMockBrowserManager(html);
    const tool = createBrowseUrlTool(manager);

    const result = await tool.execute({ url: "https://example.com" });

    expect(result).toContain("Main Article");
    expect(result).toContain("main content");
    expect(typeof result).toBe("string");
  });

  it("falls back to innerText when Readability fails", async () => {
    const html = "<html><body><p>Short</p></body></html>";
    const manager = createMockBrowserManager(html);
    const tool = createBrowseUrlTool(manager);

    const result = await tool.execute({ url: "https://example.com" });

    expect(result).toContain("fallback text");
  });

  it("truncates content exceeding 50k characters", async () => {
    const longContent = "x".repeat(60000);
    const html = `
      <html><head><title>Long Page</title></head>
      <body><article>
        <h1>Long Article</h1>
        <p>${longContent}</p>
        <p>More padding content for Readability to detect this as an article properly.</p>
      </article></body></html>
    `;
    const manager = createMockBrowserManager(html);
    const tool = createBrowseUrlTool(manager);

    const result = await tool.execute({ url: "https://example.com" });

    expect(result.length).toBeLessThanOrEqual(50100); // 50k + some header
  });

  it("returns error string on navigation failure", async () => {
    const manager = {
      withPage: vi.fn(async (fn) => {
        const mockPage = {
          goto: vi.fn().mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED")),
          content: vi.fn(),
          innerText: vi.fn(),
        };
        return fn(mockPage as any);
      }),
      close: vi.fn(),
    } as unknown as BrowserManager;

    const tool = createBrowseUrlTool(manager);
    const result = await tool.execute({ url: "https://nonexistent.invalid" });

    expect(result).toContain("Error");
    expect(result).toContain("net::ERR_NAME_NOT_RESOLVED");
  });

  it("returns error string when url is missing", async () => {
    const manager = createMockBrowserManager("");
    const tool = createBrowseUrlTool(manager);

    const result = await tool.execute({});

    expect(result).toContain("Error");
    expect(result).toContain("url");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/agent-service && pnpm test -- browse-url
```

Expected: FAIL — `createBrowseUrlTool` not found.

- [ ] **Step 3: Implement browse_url tool**

Create `packages/agent-service/src/services/tools/browse-url.ts`:

```ts
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Tool } from "./types.js";
import type { BrowserManager } from "./browser-manager.js";

const MAX_CONTENT_LENGTH = 50000;

export function createBrowseUrlTool(browserManager: BrowserManager): Tool {
  return {
    name: "browse_url",
    definition: {
      name: "browse_url",
      description: "Fetch a web page and extract its main text content",
      input_schema: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "The URL to browse" },
        },
        required: ["url"],
      },
    },
    async execute(input: unknown): Promise<string> {
      const { url } = (input ?? {}) as { url?: string };

      if (!url || typeof url !== "string") {
        return "Error: A valid url string is required.";
      }

      try {
        return await browserManager.withPage(async (page) => {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });

          const html = await page.content();
          const { document } = parseHTML(html);
          const reader = new Readability(document as any);
          const article = reader.parse();

          let content: string;
          if (article && article.textContent.trim().length > 0) {
            content = `# ${article.title}\n\n${article.textContent.trim()}`;
          } else {
            const fallback = await page.innerText("body");
            content = fallback;
          }

          if (content.length > MAX_CONTENT_LENGTH) {
            content = content.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated]";
          }

          return content;
        });
      } catch (err) {
        return `Error browsing ${url}: ${(err as Error).message}`;
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/agent-service && pnpm test -- browse-url
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/tools/browse-url.ts packages/agent-service/src/__tests__/browse-url.test.ts
git commit -m "feat: add browse_url tool with Readability extraction"
```

---

### Task 6: ToolService

**Files:**
- Create: `packages/agent-service/src/services/tool-service.ts`
- Create: `packages/agent-service/src/__tests__/tool-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/agent-service/src/__tests__/tool-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock playwright so BrowserManager doesn't launch a real browser
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({}),
        close: vi.fn(),
      }),
      close: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    }),
  },
}));

import { ToolService } from "../services/tool-service.js";
import type { Tool } from "../services/tools/types.js";
import type { AgentConfig } from "../types.js";

function makeFakeTool(name: string): Tool {
  return {
    name,
    definition: {
      name,
      description: `A fake ${name} tool`,
      input_schema: { type: "object" as const, properties: {} },
    },
    execute: vi.fn().mockResolvedValue(`${name} result`),
  };
}

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "test-agent",
    name: "Test Agent",
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "You are a test agent.",
    avatar: { emoji: "🤖", color: "#6c5ce7" },
    ...overrides,
  };
}

describe("ToolService", () => {
  let service: ToolService;

  beforeEach(() => {
    service = new ToolService();
  });

  it("registers and retrieves tools", () => {
    const tool = makeFakeTool("my_tool");
    service.register(tool);

    const agent = makeAgent({ tools: ["my_tool"] });
    const definitions = service.getToolsForAgent(agent);

    expect(definitions).toHaveLength(1);
    expect(definitions[0].name).toBe("my_tool");
  });

  it("returns empty array for agent with no tools field", () => {
    service.register(makeFakeTool("my_tool"));

    const agent = makeAgent(); // no tools field
    const definitions = service.getToolsForAgent(agent);

    expect(definitions).toEqual([]);
  });

  it("returns empty array for agent with empty tools array", () => {
    service.register(makeFakeTool("my_tool"));

    const agent = makeAgent({ tools: [] });
    const definitions = service.getToolsForAgent(agent);

    expect(definitions).toEqual([]);
  });

  it("skips unregistered tool names in agent config", () => {
    service.register(makeFakeTool("real_tool"));

    const agent = makeAgent({ tools: ["real_tool", "nonexistent_tool"] });
    const definitions = service.getToolsForAgent(agent);

    expect(definitions).toHaveLength(1);
    expect(definitions[0].name).toBe("real_tool");
  });

  it("executes a registered tool", async () => {
    const tool = makeFakeTool("my_tool");
    service.register(tool);

    const result = await service.execute("my_tool", { key: "value" });

    expect(tool.execute).toHaveBeenCalledWith({ key: "value" });
    expect(result).toBe("my_tool result");
  });

  it("returns error string for unknown tool name", async () => {
    const result = await service.execute("nonexistent", {});

    expect(result).toContain("Error");
    expect(result).toContain("nonexistent");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/agent-service && pnpm test -- tool-service
```

Expected: FAIL — `ToolService` not found.

- [ ] **Step 3: Implement ToolService**

Create `packages/agent-service/src/services/tool-service.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "./tools/types.js";
import type { AgentConfig } from "../types.js";
import { BrowserManager } from "./tools/browser-manager.js";
import { createBrowseUrlTool } from "./tools/browse-url.js";

export class ToolService {
  private tools = new Map<string, Tool>();
  private browserManager: BrowserManager;

  constructor() {
    this.browserManager = new BrowserManager();
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  registerDefaults(): void {
    this.register(createBrowseUrlTool(this.browserManager));
  }

  getToolsForAgent(agent: AgentConfig): Anthropic.Messages.Tool[] {
    if (!agent.tools || agent.tools.length === 0) {
      return [];
    }

    return agent.tools
      .map((name) => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined)
      .map((tool) => tool.definition);
  }

  async execute(toolName: string, input: unknown): Promise<string> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return `Error: Tool "${toolName}" is not registered.`;
    }
    return tool.execute(input);
  }

  async shutdown(): Promise<void> {
    await this.browserManager.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/agent-service && pnpm test -- tool-service
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/services/tool-service.ts packages/agent-service/src/__tests__/tool-service.test.ts
git commit -m "feat: add ToolService with registry, resolution, and execution"
```

---

### Task 7: Wire ToolService Into Server Startup

**Files:**
- Modify: `packages/agent-service/src/index.ts`

- [ ] **Step 1: Import and initialize ToolService**

In `packages/agent-service/src/index.ts`, add the import after the existing service imports (around line 11):

```ts
import { ToolService } from "./services/tool-service.js";
```

After the database initialization (after line 51, `console.log(...Database opened...)`), add:

```ts
// Tool service
const toolService = new ToolService();
toolService.registerDefaults();
console.log(`[startup] Tool service initialized`);
```

- [ ] **Step 2: Pass toolService to conversation router**

Change the conversations route registration (line 56) from:

```ts
app.use("/conversations", authMiddleware(JWT_SECRET), createConversationRouter(agents, db));
```

to:

```ts
app.use("/conversations", authMiddleware(JWT_SECRET), createConversationRouter(agents, db, toolService));
```

- [ ] **Step 3: Add graceful shutdown**

After the `app.listen` block (after line 61), add:

```ts
process.on("SIGTERM", async () => {
  console.log("[shutdown] Shutting down tool service...");
  await toolService.shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[shutdown] Shutting down tool service...");
  await toolService.shutdown();
  process.exit(0);
});
```

- [ ] **Step 4: Verify it compiles (don't run yet — conversations.ts signature change will come in Task 8)**

This step will cause a TypeScript error because `createConversationRouter` doesn't accept `toolService` yet. That's expected — Task 8 will fix it.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/index.ts
git commit -m "feat: initialize ToolService at server startup with graceful shutdown"
```

---

### Task 8: Conversation Route — Tool Execution Loop

**Files:**
- Modify: `packages/agent-service/src/routes/conversations.ts`

This is the core change. The route handler needs to: accept `ToolService`, pass tools to the Anthropic API, and loop on `tool_use` stop reason.

- [ ] **Step 1: Update the router factory signature**

In `packages/agent-service/src/routes/conversations.ts`, change the import and function signature.

Add the import at the top (after line 6):

```ts
import type { ToolService } from "../services/tool-service.js";
```

Change the function signature (line 17) from:

```ts
export function createConversationRouter(
  agents: Map<string, AgentConfig>,
  db: Database
): Router {
```

to:

```ts
export function createConversationRouter(
  agents: Map<string, AgentConfig>,
  db: Database,
  toolService?: ToolService
): Router {
```

Note: `toolService` is optional so existing tests (which don't pass it) still compile.

- [ ] **Step 2: Replace the streaming section with the tool loop**

Replace the entire `try` block that creates the stream and processes events (lines 143–218, from `let stream;` through the final `catch` block closing brace) with:

```ts
    const MAX_TOOL_ITERATIONS = 5;
    const tools = toolService ? toolService.getToolsForAgent(agent) : [];

    // Messages array for the agentic loop — starts with conversation history
    // and grows with tool_use/tool_result pairs during tool execution
    const loopMessages: Array<{ role: string; content: any }> = claudeMessages;

    startSSE(res);

    try {
      let fullResponse = "";
      let iterations = 0;

      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;

        const streamParams: Record<string, any> = {
          model: agent.model,
          max_tokens: agent.maxTokens,
          temperature: agent.temperature,
          system: agent.systemPrompt,
          messages: loopMessages,
        };
        if (tools.length > 0) {
          streamParams.tools = tools;
        }

        const streamStart = Date.now();
        let stream;
        try {
          console.log(`[stream] Starting Claude stream (model: ${agent.model}, iteration: ${iterations}, messages: ${loopMessages.length})`);
          stream = getClient().messages.stream(streamParams);
        } catch (err) {
          console.error("[stream] Failed to create stream:", err);
          writeSSE(res, "error", { message: "LLM service error" });
          break;
        }

        // Collect the full response message
        const finalMessage = await stream.finalMessage();
        const streamMs = Date.now() - streamStart;

        // Stream text deltas to frontend
        const textBlocks = finalMessage.content.filter(
          (block: any) => block.type === "text"
        );
        for (const block of textBlocks) {
          fullResponse += block.text;
          writeSSE(res, "delta", { text: block.text });
        }

        console.log(`[stream] Response complete (${fullResponse.length} chars, ${streamMs}ms, stop: ${finalMessage.stop_reason})`);

        // Check if Claude wants to use tools
        if (finalMessage.stop_reason !== "tool_use") {
          break; // No tool calls — we're done
        }

        // Extract tool_use blocks
        const toolUseBlocks = finalMessage.content.filter(
          (block: any) => block.type === "tool_use"
        );

        if (toolUseBlocks.length === 0 || !toolService) {
          break;
        }

        // Push assistant message with all content blocks (text + tool_use)
        loopMessages.push({
          role: "assistant",
          content: finalMessage.content,
        });

        // Execute each tool and build tool_result blocks
        const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

        for (const toolUse of toolUseBlocks) {
          console.log(`[tool] Executing ${toolUse.name} with input: ${JSON.stringify(toolUse.input).slice(0, 200)}`);
          writeSSE(res, "tool_start", { tool: toolUse.name, input: toolUse.input });

          const toolStart = Date.now();
          const result = await toolService.execute(toolUse.name, toolUse.input);
          const toolMs = Date.now() - toolStart;

          console.log(`[tool] ${toolUse.name} completed (${toolMs}ms, ${result.length} chars)`);
          writeSSE(res, "tool_done", { tool: toolUse.name, duration_ms: toolMs });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        // Push tool results as a user message
        loopMessages.push({
          role: "user",
          content: toolResults,
        });

        // Reset fullResponse for the next iteration — we only save the final text
        fullResponse = "";
      }

      // Save final assistant response
      if (fullResponse) {
        db.addMessage(conversation.id, "assistant", fullResponse);
      }

      // Generate title if this is the first exchange (no title yet)
      if (!conversation.title) {
        try {
          console.log(`[title] Generating title for conversation ${conversation.id}`);
          const titleResponse = await getClient().messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 20,
            messages: [
              {
                role: "user",
                content: `Generate a 3-6 word title for this conversation. Reply with ONLY the title, no quotes or punctuation.\n\nUser: ${message}\nAssistant: ${fullResponse.slice(0, 200)}`,
              },
            ],
          });

          const title =
            titleResponse.content[0].type === "text"
              ? titleResponse.content[0].text.trim()
              : null;

          if (title) {
            db.setTitle(conversation.id, title);
            writeSSE(res, "title", { title });
            console.log(`[title] Generated: "${title}"`);
          }
        } catch (err) {
          console.error("[title] Title generation failed:", err);
        }
      }

      writeSSE(res, "done", { conversationId: conversation.id });
      res.end();
    } catch (err) {
      console.error("[stream] Stream error:", err);
      writeSSE(res, "error", { message: "LLM service error" });
      writeSSE(res, "done", { conversationId: conversation.id });
      res.end();
    }
```

- [ ] **Step 3: Verify it compiles**

```bash
cd packages/agent-service && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Update existing mock stream to include finalMessage**

The new code uses `stream.finalMessage()` instead of iterating events. The existing mock in `routes.test.ts` needs updating. Replace the `mockStream` constant (lines 18-24) with:

```ts
const mockStream = {
  async *[Symbol.asyncIterator]() {
    yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } };
    yield { type: "content_block_delta", delta: { type: "text_delta", text: " there" } };
    yield { type: "message_stop" };
  },
  finalMessage: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "Hello there" }],
    stop_reason: "end_turn",
  }),
};
```

- [ ] **Step 5: Run existing conversation tests**

```bash
cd packages/agent-service && pnpm test -- routes.test
```

Expected: all existing tests still pass. The `toolService` parameter is optional, so the existing test setup (which doesn't pass it) continues to work. The mock stream returns `stop_reason: "end_turn"`, so the loop runs once and exits.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-service/src/routes/conversations.ts packages/agent-service/src/__tests__/routes.test.ts
git commit -m "feat: add tool execution loop to conversation message handler"
```

---

### Task 9: Conversation Route — Tool Loop Tests

**Files:**
- Modify: `packages/agent-service/src/__tests__/routes.test.ts`

- [ ] **Step 1: Add tool loop test fixtures**

At the top of `packages/agent-service/src/__tests__/routes.test.ts`, after the existing imports (around line 12), add an import for ToolService:

```ts
import { ToolService } from "../services/tool-service.js";
import type { Tool } from "../services/tools/types.js";
```

After the existing `mockStream` (around line 24), add a mock stream that returns a tool_use and then a final text response:

```ts
function createToolUseStream() {
  let callCount = 0;
  return {
    stream: vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: Claude wants to use a tool
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "message_stop" };
          },
          finalMessage: vi.fn().mockResolvedValue({
            content: [
              { type: "text", text: "Let me look that up. " },
              { type: "tool_use", id: "tool_1", name: "fake_tool", input: { query: "test" } },
            ],
            stop_reason: "tool_use",
          }),
        };
      }
      // Second call: Claude responds with final text
      return {
        async *[Symbol.asyncIterator]() {
          yield { type: "message_stop" };
        },
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Here is the answer." }],
          stop_reason: "end_turn",
        }),
      };
    }),
    create: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Tool Conversation Title" }],
    }),
  };
}
```

Note: The existing Anthropic mock at the top of the file uses `vi.mock` which applies globally. For the tool tests, we need to override the mock per-test. Add this helper after the `buildApp` function:

```ts
function buildAppWithTools(agents: Map<string, AgentConfig>, toolService: ToolService) {
  const app = express();
  app.use(express.json());
  app.use("/conversations", authMiddleware(JWT_SECRET), createConversationRouter(agents, db, toolService));
  return app;
}
```

- [ ] **Step 2: Add the tool loop test**

At the bottom of the file (before the closing of the file), add a new describe block:

```ts
describe("Tool execution loop", () => {
  it("executes tool and returns final response", async () => {
    // Create a ToolService with a fake tool
    const toolService = new ToolService();
    const fakeTool: Tool = {
      name: "fake_tool",
      definition: {
        name: "fake_tool",
        description: "A fake tool",
        input_schema: { type: "object" as const, properties: {} },
      },
      execute: vi.fn().mockResolvedValue("tool execution result"),
    };
    toolService.register(fakeTool);

    const agentWithTools: AgentConfig = {
      ...testAgent,
      id: "tool-bot",
      tools: ["fake_tool"],
    };

    // Override the Anthropic mock for this test
    const toolMock = createToolUseStream();
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const instance = new Anthropic();
    instance.messages.stream = toolMock.stream;
    instance.messages.create = toolMock.create;

    const app = buildAppWithTools(
      new Map([["tool-bot", agentWithTools]]),
      toolService
    );
    db.createConversation("conv-tool", "tool-bot", "user-a");

    const res = await makeRequest(
      app, "POST", "/conversations/conv-tool/messages",
      { message: "Use the tool" }, userAToken
    );

    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("event: tool_start");
    expect(res.body).toContain("event: tool_done");
    expect(res.body).toContain("Here is the answer");
    expect(res.body).toContain("event: done");
    expect(fakeTool.execute).toHaveBeenCalledWith({ query: "test" });
  });
});
```

- [ ] **Step 3: Run the new test**

```bash
cd packages/agent-service && pnpm test -- routes.test
```

Expected: all tests pass, including the new tool execution loop test.

Note: The `mockStream` was already updated in Task 8 to include `finalMessage`. The `createToolUseStream` helper creates per-test mocks that override the Anthropic instance methods.

- [ ] **Step 4: Run the full test suite**

```bash
cd packages/agent-service && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/__tests__/routes.test.ts
git commit -m "test: add tool execution loop tests for conversation route"
```

---

### Task 10: Add browse_url to an Agent and Smoke Test

**Files:**
- Modify: `agents/support-bot.md`

- [ ] **Step 1: Add tools field to the support bot**

In `agents/support-bot.md`, add the `tools` field to the frontmatter:

```yaml
---
name: Support Bot
model: claude-sonnet-4-20250514
maxTokens: 1024
temperature: 0.7
avatar:
  emoji: "🤖"
  color: "#6c5ce7"
tools:
  - browse_url
topicBoundaries:
  allowed:
    - "product questions"
    - "troubleshooting"
    - "pricing"
  blocked:
    - "competitor comparisons"
    - "political topics"
  boundaryMessage: "I can only help with product-related questions."
---
```

- [ ] **Step 2: Restart the backend**

```bash
pnpm restart
```

Wait a few seconds, then check logs:

```bash
pnpm pm2 logs backend --lines 10 --nostream
```

Expected: you should see `[startup] Tool service initialized` in the logs, and no errors.

- [ ] **Step 3: Smoke test in the browser**

Open http://localhost:5173 and start a chat with Support Bot. Send a message like:

> "Can you look at https://httpbin.org/html and tell me what's on that page?"

Expected: The agent should browse the URL, extract content, and respond with a summary. In the backend logs you should see `[tool] Executing browse_url` and `[tool] browse_url completed`.

- [ ] **Step 4: Commit**

```bash
git add agents/support-bot.md
git commit -m "feat: enable browse_url tool for support bot agent"
```

---

### Task 11: Run Full Test Suite and Final Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd packages/agent-service && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Run all frontend tests**

```bash
cd packages/web-client && pnpm test
```

Expected: all tests pass (no frontend changes were made, so nothing should break).

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd packages/agent-service && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Final commit if any fixes were needed**

If any fixes were made during verification, commit them:

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
