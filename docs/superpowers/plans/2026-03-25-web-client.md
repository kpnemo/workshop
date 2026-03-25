# Web Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React chat client with Messenger-style UI, SSE streaming, markdown rendering, and dark theme that connects to the agent service API.

**Architecture:** Single-page Vite + React app in `packages/web-client`. API client handles SSE stream parsing with fetch. `use-chat` hook manages conversation state. shadcn/ui + Tailwind for styling.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, react-markdown, remark-gfm, rehype-highlight, vitest

**Spec:** `docs/superpowers/specs/2026-03-25-web-client-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `packages/web-client/package.json` | Package config and dependencies |
| `packages/web-client/vite.config.ts` | Vite config with API proxy |
| `packages/web-client/tsconfig.json` | TypeScript config |
| `packages/web-client/tailwind.config.ts` | Tailwind dark theme config |
| `packages/web-client/postcss.config.js` | PostCSS for Tailwind |
| `packages/web-client/components.json` | shadcn/ui config |
| `packages/web-client/index.html` | HTML entry point |
| `packages/web-client/src/main.tsx` | React mount |
| `packages/web-client/src/index.css` | Tailwind imports + dark theme globals |
| `packages/web-client/src/App.tsx` | Root component |
| `packages/web-client/src/types.ts` | Message, ChatState, API response types |
| `packages/web-client/src/lib/utils.ts` | shadcn cn() utility |
| `packages/web-client/src/lib/api.ts` | API client: createConversation, sendMessage (SSE), getConversation |
| `packages/web-client/src/hooks/use-chat.ts` | Chat state management hook |
| `packages/web-client/src/hooks/use-auto-scroll.ts` | Auto-scroll hook |
| `packages/web-client/src/components/typing-indicator.tsx` | Pulsing dots animation |
| `packages/web-client/src/components/message-bubble.tsx` | Single message with markdown |
| `packages/web-client/src/components/chat-input.tsx` | Textarea + send button |
| `packages/web-client/src/components/message-list.tsx` | Scrollable message list |
| `packages/web-client/src/components/chat-container.tsx` | Full-page chat layout |
| `packages/web-client/src/__tests__/api.test.ts` | API client unit tests |
| `packages/web-client/src/__tests__/use-chat.test.ts` | Chat hook unit tests |

---

### Task 1: Vite + React + Tailwind + shadcn/ui Scaffolding

**Files:**
- Create: `packages/web-client/package.json`
- Create: `packages/web-client/vite.config.ts`
- Create: `packages/web-client/tsconfig.json`
- Create: `packages/web-client/tailwind.config.ts`
- Create: `packages/web-client/postcss.config.js`
- Create: `packages/web-client/components.json`
- Create: `packages/web-client/index.html`
- Create: `packages/web-client/src/main.tsx`
- Create: `packages/web-client/src/App.tsx`
- Create: `packages/web-client/src/index.css`
- Create: `packages/web-client/src/lib/utils.ts`

- [ ] **Step 1: Create `packages/web-client/package.json`**

```json
{
  "name": "@new-workshop/web-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.469.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.3",
    "rehype-highlight": "^7.0.2",
    "remark-gfm": "^4.0.0",
    "tailwind-merge": "^2.6.0",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.16",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/uuid": "^10.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/web-client/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
```

- [ ] **Step 3: Create `packages/web-client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/web-client/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0f0f1a",
        surface: "#1a1a2e",
        border: "#2a2a4a",
        primary: "#6c5ce7",
        "primary-foreground": "#ffffff",
        muted: "#888888",
        foreground: "#e0e0e0",
        success: "#00b894",
        "assistant-bg": "#1e1e3a",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
```

- [ ] **Step 5: Create `packages/web-client/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create `packages/web-client/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": false
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 7: Create `packages/web-client/src/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Create `packages/web-client/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
  background-color: #0f0f1a;
  color: #e0e0e0;
}

/* Code block styling for markdown */
pre {
  background-color: #1a1a2e !important;
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
}

code {
  font-size: 0.875rem;
}

/* Typing indicator animation */
@keyframes pulse-dot {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}
```

- [ ] **Step 9: Create `packages/web-client/index.html`**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Chat</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 10: Create `packages/web-client/src/main.tsx`**

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 11: Create `packages/web-client/src/App.tsx` (placeholder)**

```typescript
export default function App() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted">Chat loading...</p>
    </div>
  );
}
```

- [ ] **Step 12: Install dependencies**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm install`

- [ ] **Step 13: Verify dev server starts**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/web-client && timeout 10 pnpm dev 2>&1 || true`
Expected: Vite dev server starts on port 5173

- [ ] **Step 14: Commit**

```bash
cd /Users/Mike.Bogdanovsky/Projects/new-workshop
git add packages/web-client/
git commit -m "chore: scaffold web-client with Vite, React, Tailwind, shadcn/ui"
```

---

### Task 2: Types and shadcn/ui Button Component

**Files:**
- Create: `packages/web-client/src/types.ts`
- Create: `packages/web-client/src/components/ui/button.tsx`

- [ ] **Step 1: Create frontend types**

Create `packages/web-client/src/types.ts`:

```typescript
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ChatState {
  conversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
}

export interface ConversationResponse {
  conversationId: string;
  agentId: string;
  createdAt: string;
}

export interface ConversationDetail {
  conversationId: string;
  agentId: string;
  createdAt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
}

export interface SendMessageCallbacks {
  onDelta: (text: string) => void;
  onBlocked: (message: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}
```

- [ ] **Step 2: Create shadcn/ui button component**

Create `packages/web-client/src/components/ui/button.tsx`:

```typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        ghost: "hover:bg-surface hover:text-foreground",
        outline: "border border-border bg-transparent hover:bg-surface",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/web-client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/Mike.Bogdanovsky/Projects/new-workshop
git add packages/web-client/src/types.ts packages/web-client/src/components/ui/button.tsx
git commit -m "feat: add frontend types and shadcn button component"
```

---

### Task 3: API Client

**Files:**
- Create: `packages/web-client/src/lib/api.ts`
- Create: `packages/web-client/src/__tests__/api.test.ts`

- [ ] **Step 1: Write failing tests for API client**

Create `packages/web-client/src/__tests__/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createConversation, sendMessage, getConversation } from "../lib/api";

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("createConversation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends POST to /api/conversations and returns response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          conversationId: "conv-123",
          agentId: "support-bot",
          createdAt: "2026-03-25T10:00:00Z",
        }),
    });

    const result = await createConversation("support-bot");

    expect(mockFetch).toHaveBeenCalledWith("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "support-bot" }),
    });
    expect(result.conversationId).toBe("conv-123");
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Agent not found" }),
    });

    await expect(createConversation("bad-agent")).rejects.toThrow(
      "Agent not found"
    );
  });
});

describe("sendMessage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls onDelta for delta events and onDone at end", async () => {
    const sseBody = [
      'event: delta\ndata: {"text":"Hello"}\n\n',
      'event: delta\ndata: {"text":" world"}\n\n',
      'event: done\ndata: {"conversationId":"conv-123"}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const onDelta = vi.fn();
    const onBlocked = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();

    await sendMessage("conv-123", "Hi", {
      onDelta,
      onBlocked,
      onError,
      onDone,
    });

    expect(onDelta).toHaveBeenCalledWith("Hello");
    expect(onDelta).toHaveBeenCalledWith(" world");
    expect(onDone).toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onBlocked for blocked events", async () => {
    const sseBody = [
      'event: blocked\ndata: {"message":"Stay on topic."}\n\n',
      'event: done\ndata: {"conversationId":"conv-123"}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const onBlocked = vi.fn();
    const onDone = vi.fn();

    await sendMessage("conv-123", "politics", {
      onDelta: vi.fn(),
      onBlocked,
      onError: vi.fn(),
      onDone,
    });

    expect(onBlocked).toHaveBeenCalledWith("Stay on topic.");
    expect(onDone).toHaveBeenCalled();
  });

  it("calls onError for SSE error events", async () => {
    const sseBody = [
      'event: error\ndata: {"message":"LLM service error"}\n\n',
      'event: done\ndata: {"conversationId":"conv-123"}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const onError = vi.fn();
    const onDone = vi.fn();

    await sendMessage("conv-123", "test", {
      onDelta: vi.fn(),
      onBlocked: vi.fn(),
      onError,
      onDone,
    });

    expect(onError).toHaveBeenCalledWith("LLM service error");
    expect(onDone).toHaveBeenCalled();
  });

  it("calls onError for non-2xx HTTP responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Conversation not found" }),
    });

    const onError = vi.fn();
    const onDone = vi.fn();

    await sendMessage("bad-id", "test", {
      onDelta: vi.fn(),
      onBlocked: vi.fn(),
      onError,
      onDone,
    });

    expect(onError).toHaveBeenCalledWith("Conversation not found");
    expect(onDone).toHaveBeenCalled();
  });
});

describe("getConversation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends GET and returns conversation detail", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          conversationId: "conv-123",
          agentId: "support-bot",
          createdAt: "2026-03-25T10:00:00Z",
          messages: [],
        }),
    });

    const result = await getConversation("conv-123");

    expect(mockFetch).toHaveBeenCalledWith("/api/conversations/conv-123");
    expect(result.conversationId).toBe("conv-123");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/web-client && pnpm test`
Expected: FAIL — module `../lib/api` not found

- [ ] **Step 3: Implement API client**

Create `packages/web-client/src/lib/api.ts`:

```typescript
import type {
  ConversationResponse,
  ConversationDetail,
  SendMessageCallbacks,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export async function createConversation(
  agentId: string
): Promise<ConversationResponse> {
  const res = await fetch(`${BASE_URL}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId }),
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to create conversation");
  }

  return res.json();
}

export async function sendMessage(
  conversationId: string,
  message: string,
  callbacks: SendMessageCallbacks
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }
  );

  // Non-2xx: parse JSON error, call onError + onDone
  if (!res.ok) {
    const body = await res.json();
    callbacks.onError(body.error || "Request failed");
    callbacks.onDone();
    return;
  }

  // 200: parse SSE stream
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
          case "blocked":
            callbacks.onBlocked(data.message);
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

export async function getConversation(
  conversationId: string
): Promise<ConversationDetail> {
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}`);

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to get conversation");
  }

  return res.json();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/web-client && pnpm test`
Expected: All API tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/Mike.Bogdanovsky/Projects/new-workshop
git add packages/web-client/src/lib/api.ts packages/web-client/src/__tests__/api.test.ts
git commit -m "feat: add API client with SSE stream parsing and tests"
```

---

### Task 4: use-chat Hook

**Files:**
- Create: `packages/web-client/src/hooks/use-chat.ts`
- Create: `packages/web-client/src/__tests__/use-chat.test.ts`

- [ ] **Step 1: Write failing tests for use-chat**

Create `packages/web-client/src/__tests__/use-chat.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChat } from "../hooks/use-chat";
import * as api from "../lib/api";

vi.mock("../lib/api");

describe("useChat", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.createConversation).mockResolvedValue({
      conversationId: "conv-123",
      agentId: "support-bot",
      createdAt: "2026-03-25T10:00:00Z",
    });
  });

  it("creates a conversation on mount", async () => {
    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
      expect(result.current.state.isConnecting).toBe(false);
    });

    expect(api.createConversation).toHaveBeenCalledWith("support-bot");
  });

  it("sets isConnecting true initially", () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.state.isConnecting).toBe(true);
  });

  it("adds user message optimistically on send", async () => {
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _msg, cb) => {
      cb.onDone();
    });

    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
    });

    act(() => {
      result.current.sendMessage("Hello");
    });

    expect(result.current.state.messages[0].role).toBe("user");
    expect(result.current.state.messages[0].content).toBe("Hello");
  });

  it("streams assistant response via onDelta", async () => {
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _msg, cb) => {
      cb.onDelta("Hello");
      cb.onDelta(" there");
      cb.onDone();
    });

    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
    });

    await act(async () => {
      result.current.sendMessage("Hi");
    });

    await waitFor(() => {
      expect(result.current.state.isStreaming).toBe(false);
    });

    const assistantMsg = result.current.state.messages.find(
      (m) => m.role === "assistant"
    );
    expect(assistantMsg?.content).toBe("Hello there");
  });

  it("handles blocked messages as system messages", async () => {
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _msg, cb) => {
      cb.onBlocked("Stay on topic.");
      cb.onDone();
    });

    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
    });

    await act(async () => {
      result.current.sendMessage("politics");
    });

    await waitFor(() => {
      expect(result.current.state.isStreaming).toBe(false);
    });

    const systemMsg = result.current.state.messages.find(
      (m) => m.role === "system"
    );
    expect(systemMsg?.content).toBe("Stay on topic.");
  });

  it("sets error on connection failure", async () => {
    vi.mocked(api.createConversation).mockRejectedValue(
      new Error("Network error")
    );

    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.state.error).toBe("Network error");
      expect(result.current.state.isConnecting).toBe(false);
    });
  });

  it("clears messages on startNewChat", async () => {
    vi.mocked(api.sendMessage).mockImplementation(async (_id, _msg, cb) => {
      cb.onDelta("Reply");
      cb.onDone();
    });

    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-123");
    });

    await act(async () => {
      result.current.sendMessage("Hello");
    });

    vi.mocked(api.createConversation).mockResolvedValue({
      conversationId: "conv-456",
      agentId: "support-bot",
      createdAt: "2026-03-25T11:00:00Z",
    });

    await act(async () => {
      result.current.startNewChat();
    });

    await waitFor(() => {
      expect(result.current.state.conversationId).toBe("conv-456");
      expect(result.current.state.messages).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Add test config to vite.config.ts**

Update `packages/web-client/vite.config.ts` to the full file:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/web-client && pnpm test`
Expected: FAIL — module `../hooks/use-chat` not found

- [ ] **Step 4: Implement use-chat hook**

Create `packages/web-client/src/hooks/use-chat.ts`:

```typescript
import { useState, useCallback, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { createConversation, sendMessage as apiSendMessage } from "../lib/api";
import type { Message, ChatState } from "../types";

export function useChat() {
  const [state, setState] = useState<ChatState>({
    conversationId: null,
    messages: [],
    isStreaming: false,
    isConnecting: true,
    error: null,
  });

  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  const initConversation = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const res = await createConversation("support-bot");
      setState((s) => ({
        ...s,
        conversationId: res.conversationId,
        isConnecting: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Failed to connect",
      }));
    }
  }, []);

  useEffect(() => {
    initConversation();
  }, [initConversation]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!state.conversationId || state.isStreaming) return;

      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      const assistantMessageId = uuidv4();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setState((s) => ({
        ...s,
        messages: [...s.messages, userMessage, assistantMessage],
        isStreaming: true,
        error: null,
      }));

      apiSendMessage(state.conversationId, text, {
        onDelta: (deltaText) => {
          setState((s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: m.content + deltaText }
                : m
            ),
          }));
        },
        onBlocked: (message) => {
          const systemMessage: Message = {
            id: uuidv4(),
            role: "system",
            content: message,
            timestamp: new Date(),
          };
          setState((s) => ({
            ...s,
            messages: [
              ...s.messages.filter((m) => m.id !== assistantMessageId),
              systemMessage,
            ],
          }));
        },
        onError: (message) => {
          setState((s) => ({
            ...s,
            messages: s.messages.filter((m) => m.id !== assistantMessageId),
            error: message,
          }));
        },
        onDone: () => {
          setState((s) => ({ ...s, isStreaming: false }));
        },
      });
    },
    [state.conversationId, state.isStreaming]
  );

  const startNewChat = useCallback(async () => {
    setState((s) => ({
      ...s,
      messages: [],
      isConnecting: true,
      error: null,
      isStreaming: false,
    }));
    try {
      const res = await createConversation("support-bot");
      setState((s) => ({
        ...s,
        conversationId: res.conversationId,
        isConnecting: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Failed to connect",
      }));
    }
  }, []);

  return { state, sendMessage, startNewChat };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/web-client && pnpm test`
Expected: All use-chat tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/Mike.Bogdanovsky/Projects/new-workshop
git add packages/web-client/src/hooks/use-chat.ts packages/web-client/src/__tests__/use-chat.test.ts packages/web-client/vite.config.ts packages/web-client/package.json
git commit -m "feat: add use-chat hook with streaming support and tests"
```

---

### Task 5: use-auto-scroll Hook

**Files:**
- Create: `packages/web-client/src/hooks/use-auto-scroll.ts`

- [ ] **Step 1: Implement use-auto-scroll**

Create `packages/web-client/src/hooks/use-auto-scroll.ts`:

```typescript
import { useEffect, useRef, useCallback } from "react";

export function useAutoScroll(deps: unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isNearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, deps);

  return { scrollRef, handleScroll };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/Mike.Bogdanovsky/Projects/new-workshop
git add packages/web-client/src/hooks/use-auto-scroll.ts
git commit -m "feat: add use-auto-scroll hook"
```

---

### Task 6: UI Components

**Files:**
- Create: `packages/web-client/src/components/typing-indicator.tsx`
- Create: `packages/web-client/src/components/message-bubble.tsx`
- Create: `packages/web-client/src/components/chat-input.tsx`
- Create: `packages/web-client/src/components/message-list.tsx`
- Create: `packages/web-client/src/components/chat-container.tsx`

- [ ] **Step 1: Create typing indicator**

Create `packages/web-client/src/components/typing-indicator.tsx`:

```typescript
export function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 px-4">
      <div className="flex h-7 w-7 min-w-[1.75rem] items-center justify-center rounded-full bg-primary text-xs text-white">
        S
      </div>
      <div className="rounded-[4px_16px_16px_16px] bg-assistant-bg px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full bg-muted"
              style={{
                animation: "pulse-dot 1.4s infinite ease-in-out",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create message bubble**

Create `packages/web-client/src/components/message-bubble.tsx`:

```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Message } from "../types";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="rounded-lg bg-surface px-4 py-2 text-center text-sm text-muted">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end px-4">
        <div className="max-w-[80%] rounded-[16px_16px_4px_16px] bg-primary px-4 py-3 text-sm leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="flex items-start gap-2 px-4">
      <div className="flex h-7 w-7 min-w-[1.75rem] items-center justify-center rounded-full bg-primary text-xs text-white">
        S
      </div>
      <div className="max-w-[80%] rounded-[4px_16px_16px_16px] bg-assistant-bg px-4 py-3 text-sm leading-relaxed">
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-headings:my-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create chat input**

Create `packages/web-client/src/components/chat-input.tsx`:

```typescript
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [disabled]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Waiting..." : "Type a message..."}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-muted outline-none focus:border-primary disabled:opacity-50"
          style={{ maxHeight: "120px" }}
        />
        <Button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create message list**

Create `packages/web-client/src/components/message-list.tsx`:

```typescript
import { useAutoScroll } from "../hooks/use-auto-scroll";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import type { Message } from "../types";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator =
    isStreaming && lastMessage?.role === "assistant" && lastMessage.content === "";

  const { scrollRef, handleScroll } = useAutoScroll([messages, isStreaming]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-4"
    >
      {messages.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl text-white">
            S
          </div>
          <div className="text-base font-semibold">Support Bot</div>
          <div className="max-w-[260px] text-center text-sm text-muted">
            Ask me about products, troubleshooting, or pricing. I&apos;m here to help!
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {messages.map((msg) =>
          // Skip rendering empty assistant placeholder when showing typing indicator
          msg.role === "assistant" && msg.content === "" && showTypingIndicator ? null : (
            <MessageBubble key={msg.id} message={msg} />
          )
        )}
        {showTypingIndicator && <TypingIndicator />}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create chat container**

Create `packages/web-client/src/components/chat-container.tsx`:

```typescript
import { useChat } from "../hooks/use-chat";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { Button } from "./ui/button";

export function ChatContainer() {
  const { state, sendMessage, startNewChat } = useChat();

  if (state.isConnecting) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted">Connecting...</p>
      </div>
    );
  }

  if (state.error && !state.conversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-red-400">Failed to connect: {state.error}</p>
        <Button onClick={startNewChat}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm text-white">
            S
          </div>
          <div>
            <div className="text-sm font-semibold">Support Bot</div>
            <div className="text-xs text-success">Online</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={startNewChat}>
          New Chat
        </Button>
      </div>

      {/* Messages */}
      <MessageList
        messages={state.messages}
        isStreaming={state.isStreaming}
      />

      {/* Error banner */}
      {state.error && state.conversationId && (
        <div className="border-t border-red-900/50 bg-red-950/30 px-4 py-2 text-center text-sm text-red-400">
          {state.error}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        disabled={state.isStreaming || state.isConnecting}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/web-client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
cd /Users/Mike.Bogdanovsky/Projects/new-workshop
git add packages/web-client/src/components/
git commit -m "feat: add chat UI components (container, messages, input, typing indicator)"
```

---

### Task 7: App Integration and Visual Verification

**Files:**
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Wire up App.tsx**

Update `packages/web-client/src/App.tsx`:

```typescript
import { ChatContainer } from "./components/chat-container";

export default function App() {
  return (
    <div className="h-full">
      <ChatContainer />
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

Run: `cd /Users/Mike.Bogdanovsky/Projects/new-workshop/packages/web-client && pnpm test`
Expected: All tests pass

- [ ] **Step 3: Visual verification**

Start both services:
```bash
# Terminal 1: agent service
cd /Users/Mike.Bogdanovsky/Projects/new-workshop && ANTHROPIC_API_KEY=<key> pnpm --filter @new-workshop/agent-service dev

# Terminal 2: web client
cd /Users/Mike.Bogdanovsky/Projects/new-workshop && pnpm --filter @new-workshop/web-client dev
```

Open `http://localhost:5173` and verify:
- Dark theme renders correctly
- "Connecting..." shows briefly, then empty chat with Support Bot welcome
- Sending a message shows it immediately (optimistic)
- Typing indicator appears, then streams response
- Markdown in responses renders correctly
- "New Chat" button works
- Sending an off-topic message shows blocked system notification

- [ ] **Step 4: Commit**

```bash
cd /Users/Mike.Bogdanovsky/Projects/new-workshop
git add packages/web-client/src/App.tsx
git commit -m "feat: wire up chat container in App and complete web client"
```
