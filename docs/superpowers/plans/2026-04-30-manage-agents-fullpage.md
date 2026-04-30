# Manage Agents Full-Page Route — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote agent management from the 520-px right drawer to a first-class route at `/agents`, with sidebar contents that swap between conversations and agents per route.

**Architecture:** Introduce `react-router-dom` to `web-client`. Lift `useAgents` into a context so the agents sidebar and the editor share one list. Split the existing `Sidebar` into a `SidebarShell` chrome and two route-aware bodies (`ChatSidebar`, `AgentsSidebar`). Selection is URL-driven. Replace `AgentDrawer` with an `AgentsPage` layout that renders `AgentsSidebar` plus a nested `<Outlet />` for the editor.

**Tech Stack:** React 19, react-router-dom 6.28 (matches admin-panel), Vite 6, vitest 3 + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-04-30-manage-agents-fullpage-design.md`](../specs/2026-04-30-manage-agents-fullpage-design.md)

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/web-client/package.json` | Add `react-router-dom` dependency. |
| `packages/web-client/src/main.tsx` | Wrap `App` in `<BrowserRouter>`. |
| `packages/web-client/src/contexts/AgentsContext.tsx` | New — wraps `useAgents()` once at app root. |
| `packages/web-client/src/App.tsx` | Become a route table. Mount `AgentsProvider`. Drop `AgentDrawer` and `drawerOpen`. |
| `packages/web-client/src/components/sidebar-shell.tsx` | New — chrome (collapse toggle, header slot, scroll body, footer with email + logout). |
| `packages/web-client/src/components/chat-sidebar.tsx` | New — wraps `SidebarShell`; body = "⚙ Manage Agents" `NavLink` + conversations list. |
| `packages/web-client/src/components/agents-sidebar.tsx` | New — wraps `SidebarShell`; body = "← Back to chats" `NavLink` + agents list `NavLink`s. |
| `packages/web-client/src/components/agents-empty-state.tsx` | New — pane shown on `/agents` when zero agents exist. |
| `packages/web-client/src/pages/chat-page.tsx` | New — `ChatSidebar` + chat container. Owns `useChat` (mounts on `/`). |
| `packages/web-client/src/pages/agents-page.tsx` | New — `AgentsSidebar` + `<Outlet />` for editor. |
| `packages/web-client/src/pages/agent-editor.tsx` | New — route component for `/agents/new` and `/agents/:id`. |
| `packages/web-client/src/pages/agents-index.tsx` | New — index route under `/agents`: redirect-to-first or empty state. |
| `packages/web-client/src/components/sidebar.tsx` | Deleted (logic moves to `chat-sidebar.tsx` + `sidebar-shell.tsx`). |
| `packages/web-client/src/components/agent-drawer.tsx` | Deleted. |
| `packages/web-client/src/__tests__/manage-agents-routing.test.tsx` | New — sidebar swaps when route changes. |
| `packages/web-client/src/__tests__/agents-empty-state.test.tsx` | New — `/agents` with zero agents. |
| `packages/web-client/src/__tests__/agents-redirects.test.tsx` | New — `/agents` redirects to first agent; unknown id redirects to `/agents`. |
| `packages/web-client/src/__tests__/agents-create-flow.test.tsx` | New — save in create mode → URL becomes `/agents/:newId`. |
| `packages/web-client/src/__tests__/agents-delete-flow.test.tsx` | New — delete current agent → next/prev/empty rule. |

---

## Task 1: Install react-router-dom and wire BrowserRouter

**Files:**
- Modify: `packages/web-client/package.json`
- Modify: `packages/web-client/src/main.tsx`
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Add the dependency**

Run from repo root:

```bash
pnpm --filter @new-workshop/web-client add react-router-dom@^6.28.0
```

Expected: package added; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Wrap the app in BrowserRouter**

Edit `packages/web-client/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

(If `main.tsx` already differs only in module specifiers, preserve those — only the `BrowserRouter` wrapping is required.)

- [ ] **Step 3: Add a single catch-all route in `App.tsx`**

Replace the `<AuthenticatedApp />` render with a single-route table to confirm router is wired without changing UX yet. In `App.tsx`:

```tsx
import { Routes, Route } from "react-router-dom";
// ...existing imports...

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center"><p className="text-muted">Loading...</p></div>;
  if (!isAuthenticated) return <AuthPage />;
  return (
    <Routes>
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
  );
}
```

- [ ] **Step 4: Manual smoke test**

Run from repo root: `pnpm --filter @new-workshop/web-client dev` and load http://localhost:5173. The chat UI should render exactly as before. Hard-refresh once.

- [ ] **Step 5: Run existing tests**

```bash
pnpm --filter @new-workshop/web-client test
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/package.json packages/web-client/src/main.tsx packages/web-client/src/App.tsx pnpm-lock.yaml
git commit -m "feat(web-client): introduce react-router-dom"
```

---

## Task 2: Lift useAgents into an AgentsProvider context

**Files:**
- Create: `packages/web-client/src/contexts/AgentsContext.tsx`
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Create the context**

Create `packages/web-client/src/contexts/AgentsContext.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react";
import { useAgents } from "../hooks/use-agents";

type AgentsContextValue = ReturnType<typeof useAgents>;

const AgentsContext = createContext<AgentsContextValue | null>(null);

export function AgentsProvider({ children }: { children: ReactNode }) {
  const value = useAgents();
  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgentsContext(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgentsContext must be used inside <AgentsProvider>");
  return ctx;
}
```

- [ ] **Step 2: Mount the provider above Routes**

In `App.tsx`, wrap `<Routes>` with `<AgentsProvider>` and remove the `useAgents()` call from `AuthenticatedApp`:

```tsx
import { AgentsProvider, useAgentsContext } from "./contexts/AgentsContext";

function AuthenticatedApp() {
  const { agents, createAgent, updateAgent, deleteAgent, loadAgents } = useAgentsContext();
  // ...rest unchanged for now
}

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center"><p className="text-muted">Loading...</p></div>;
  if (!isAuthenticated) return <AuthPage />;
  return (
    <AgentsProvider>
      <Routes>
        <Route path="*" element={<AuthenticatedApp />} />
      </Routes>
    </AgentsProvider>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @new-workshop/web-client test
pnpm --filter @new-workshop/web-client dev   # smoke test
```

Expected: all tests pass; app behaves identically.

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/src/contexts/AgentsContext.tsx packages/web-client/src/App.tsx
git commit -m "refactor(web-client): lift useAgents into AgentsProvider context"
```

---

## Task 3: Extract SidebarShell and rename Sidebar → ChatSidebar

**Files:**
- Create: `packages/web-client/src/components/sidebar-shell.tsx`
- Create: `packages/web-client/src/components/chat-sidebar.tsx`
- Delete: `packages/web-client/src/components/sidebar.tsx`
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Create `SidebarShell`**

Create `packages/web-client/src/components/sidebar-shell.tsx`:

```tsx
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
```

- [ ] **Step 2: Create `ChatSidebar`**

Create `packages/web-client/src/components/chat-sidebar.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Bot } from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { ConversationItem } from "./conversation-item";
import { ConfirmDialog } from "./confirm-dialog";
import type { ConversationSummary, AgentSummary } from "../types";

interface ChatSidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  agents: AgentSummary[];
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => Promise<void>;
}

export function ChatSidebar({ conversations, activeConversationId, agents, onSelect, onNewChat, onDelete }: ChatSidebarProps) {
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <>
      <SidebarShell
        header={
          <>
            <span className="text-sm font-semibold">Chats</span>
            <button
              onClick={onNewChat}
              className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>
          </>
        }
        collapsedActions={
          <>
            <button
              onClick={onNewChat}
              className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => navigate("/agents")}
              className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"
              aria-label="Manage agents"
            >
              <Bot size={16} />
            </button>
          </>
        }
        body={
          <>
            <div className="px-1 pb-2">
              <button
                onClick={() => navigate("/agents")}
                className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted transition-colors hover:bg-background hover:text-foreground"
              >
                <Bot size={14} /> Manage Agents
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  agents={agents}
                  onClick={() => onSelect(conv.id)}
                  onDelete={() => {
                    setDeleteTarget(conv.id);
                    setDeleteError(null);
                  }}
                />
              ))}
            </div>
          </>
        }
      />

      {deleteTarget && (
        <ConfirmDialog
          title="Delete conversation?"
          message="This conversation and all its messages will be permanently deleted."
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          error={deleteError}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Replace `Sidebar` import in `App.tsx`**

In `App.tsx`, change `import { Sidebar } from "./components/sidebar";` to `import { ChatSidebar } from "./components/chat-sidebar";` and use `<ChatSidebar … />` (drop the `onManageAgents` prop — `ChatSidebar` navigates internally).

- [ ] **Step 4: Delete `sidebar.tsx`**

```bash
rm packages/web-client/src/components/sidebar.tsx
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @new-workshop/web-client test
pnpm --filter @new-workshop/web-client dev
```

Expected: all tests pass. Clicking "Manage Agents" updates the URL to `/agents` (the catch-all route still renders the chat UI for now — Task 6 fixes the rendering).

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/src/components/sidebar-shell.tsx packages/web-client/src/components/chat-sidebar.tsx packages/web-client/src/App.tsx
git rm packages/web-client/src/components/sidebar.tsx
git commit -m "refactor(web-client): split sidebar into SidebarShell + ChatSidebar"
```

---

## Task 4: Add AgentsSidebar with Back-to-chats and agents list

**Files:**
- Create: `packages/web-client/src/components/agents-sidebar.tsx`

- [ ] **Step 1: Create `AgentsSidebar`**

Create `packages/web-client/src/components/agents-sidebar.tsx`:

```tsx
import { NavLink, useNavigate } from "react-router-dom";
import { Plus, ArrowLeft } from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { AgentAvatar } from "./agent-avatar";
import { useAgentsContext } from "../contexts/AgentsContext";

export function AgentsSidebar() {
  const navigate = useNavigate();
  const { agents } = useAgentsContext();

  return (
    <SidebarShell
      header={
        <>
          <span className="text-sm font-semibold">Agents</span>
          <button
            onClick={() => navigate("/agents/new")}
            className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
            aria-label="New agent"
          >
            <Plus size={16} />
          </button>
        </>
      }
      collapsedActions={
        <button
          onClick={() => navigate("/agents/new")}
          className="rounded bg-primary p-1.5 text-white hover:bg-primary/90"
          aria-label="New agent"
        >
          <Plus size={16} />
        </button>
      }
      body={
        <>
          <div className="px-1 pb-2">
            <button
              onClick={() => navigate("/")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-primary transition-colors hover:bg-background"
            >
              <ArrowLeft size={14} /> Back to chats
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {agents.map((agent) => (
              <NavLink
                key={agent.id}
                to={`/agents/${agent.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? "bg-background outline outline-1 outline-primary/40" : "hover:bg-background"
                  }`
                }
              >
                <AgentAvatar avatar={agent.avatar} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{agent.name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {agent.model.split("-").slice(0, 2).join("-")}
                    {agent.hasGuardrails ? " · guardrails" : ""}
                  </div>
                </div>
              </NavLink>
            ))}
            {agents.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted">No agents yet.</div>
            )}
          </div>
        </>
      }
    />
  );
}
```

- [ ] **Step 2: Sanity-check the build**

```bash
pnpm --filter @new-workshop/web-client build
```

Expected: clean build (the component is unused so far, but the types must compile).

- [ ] **Step 3: Commit**

```bash
git add packages/web-client/src/components/agents-sidebar.tsx
git commit -m "feat(web-client): add AgentsSidebar"
```

---

## Task 5: Add ChatPage layout (extract from App.tsx)

**Files:**
- Create: `packages/web-client/src/pages/chat-page.tsx`
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Create the page directory**

```bash
mkdir -p packages/web-client/src/pages
```

- [ ] **Step 2: Create `ChatPage`**

Create `packages/web-client/src/pages/chat-page.tsx` and move the body of the current `AuthenticatedApp` minus the `AgentDrawer` and `drawerOpen` state:

```tsx
import { useChat } from "../hooks/use-chat";
import { useDebug } from "../hooks/use-debug";
import { useCopilot } from "../hooks/use-copilot";
import { useAgentsContext } from "../contexts/AgentsContext";
import { ChatSidebar } from "../components/chat-sidebar";
import { ChatContainer } from "../components/chat-container";
import { CopilotPanel } from "../components/copilot-panel";

export function ChatPage() {
  const { agents, loadAgents } = useAgentsContext();
  const debug = useDebug();
  const {
    state,
    currentAgentId,
    sendMessage,
    startNewChat,
    selectConversation,
    deleteConversation,
    switchAgent,
    setSummaryEnabled,
    refreshSummary,
  } = useChat(agents[0]?.id ?? null, agents.map((a) => a.id), debug);
  const copilot = useCopilot({
    agents,
    onAgentReady: () => {
      loadAgents();
    },
  });

  return (
    <div className="flex h-full">
      <ChatSidebar
        conversations={state.conversations}
        activeConversationId={state.conversationId}
        agents={agents}
        onSelect={selectConversation}
        onNewChat={() => startNewChat()}
        onDelete={deleteConversation}
      />
      <ChatContainer
        conversationId={state.conversationId}
        messages={state.messages}
        isStreaming={state.isStreaming}
        isConnecting={state.isConnecting}
        error={state.error}
        agents={agents}
        currentAgentId={currentAgentId}
        onAgentChange={switchAgent}
        onSend={sendMessage}
        onRetry={() => startNewChat()}
        isDebug={debug.isDebug}
        onDebugToggle={debug.toggleDebug}
        debugEvents={debug.debugEvents}
        onDebugClear={debug.clearEvents}
        summary={state.summary}
        summaryEnabled={state.summaryEnabled}
        onSummaryToggle={() => setSummaryEnabled(!state.summaryEnabled)}
        onSummaryRefresh={refreshSummary}
      />
      <CopilotPanel
        messages={copilot.messages}
        isStreaming={copilot.isStreaming}
        isOpen={copilot.isOpen}
        onSend={copilot.sendMessage}
        onToggle={copilot.toggle}
        onMinimize={copilot.minimize}
        onReset={copilot.reset}
      />
    </div>
  );
}
```

Note: `onAgentReady` no longer opens a drawer — it just refreshes agents so that any newly-created agent shows up. (The "open the editor for the new agent" behavior moves to the editor route in Task 7.)

- [ ] **Step 3: Update `App.tsx` to route `/` to `ChatPage`**

Replace the `AuthenticatedApp` function entirely with route-only logic:

```tsx
import { Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { AuthPage } from "./components/AuthPage";
import { ChatPage } from "./pages/chat-page";

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center"><p className="text-muted">Loading...</p></div>;
  if (!isAuthenticated) return <AuthPage />;
  return (
    <AgentsProvider>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="*" element={<ChatPage />} />
      </Routes>
    </AgentsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
```

The catch-all route still points to `ChatPage`; it will be replaced in Task 7 once the `/agents/*` subtree exists.

- [ ] **Step 4: Verify**

```bash
pnpm --filter @new-workshop/web-client test
pnpm --filter @new-workshop/web-client dev
```

Expected: all tests pass; chat UI behaves as before, including new-agent creation through the copilot (which still calls `loadAgents`). The right-drawer no longer auto-opens after copilot-create — that's an intended interim state until Task 7 lands the editor route.

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/src/pages/chat-page.tsx packages/web-client/src/App.tsx
git commit -m "refactor(web-client): extract ChatPage from App"
```

---

## Task 6: Routing test — clicking Manage Agents swaps the sidebar

**Files:**
- Create: `packages/web-client/src/__tests__/manage-agents-routing.test.tsx`

This task introduces the routing test harness used by Tasks 7-11. It also drives the addition of the `/agents` route stub.

- [ ] **Step 1: Write the failing test**

Create `packages/web-client/src/__tests__/manage-agents-routing.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import * as agentsApi from "../lib/agents-api";
import * as api from "../lib/api";
import { AuthContext } from "../contexts/AuthContext";

vi.mock("../lib/agents-api");
vi.mock("../lib/api");

const FAKE_AGENTS = [
  { id: "main", name: "Main Agent", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#6c5ce7" }, hasGuardrails: false },
  { id: "support", name: "Support Bot", model: "claude-sonnet", avatar: { emoji: "🛟", color: "#00b894" }, hasGuardrails: false },
];

function renderApp(initialPath = "/") {
  // Bypass auth gate.
  const authValue = {
    isAuthenticated: true,
    loading: false,
    user: { email: "test@example.com", id: "u1" },
    login: vi.fn(),
    logout: vi.fn(),
  } as unknown as React.ContextType<typeof AuthContext>;
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentsApi.fetchAgents).mockResolvedValue(FAKE_AGENTS);
  vi.mocked(agentsApi.fetchAgent).mockResolvedValue({
    ...FAKE_AGENTS[0],
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "You are Main.",
  });
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
  vi.mocked(api.createConversation).mockResolvedValue({ conversationId: "c1", agentId: "main", createdAt: "2026-04-30T00:00:00Z" });
});

describe("Manage Agents routing", () => {
  it("clicking 'Manage Agents' swaps sidebar contents and updates the URL", async () => {
    renderApp("/");
    await waitFor(() => expect(screen.getByText("Chats")).toBeInTheDocument());
    const button = await screen.findByRole("button", { name: /manage agents/i });
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByText("Agents")).toBeInTheDocument());
    expect(screen.getByText("Main Agent")).toBeInTheDocument();
    expect(screen.getByText("Support Bot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to chats/i })).toBeInTheDocument();
  });

  it("clicking 'Back to chats' restores the conversations sidebar", async () => {
    renderApp("/agents");
    await waitFor(() => expect(screen.getByText("Agents")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /back to chats/i }));
    await waitFor(() => expect(screen.getByText("Chats")).toBeInTheDocument());
  });
});
```

Note: the `AuthContext` import path assumes `AuthContext` is exported from `contexts/AuthContext.tsx`. If it currently isn't, add `export const AuthContext = …;` next to its `Provider`.

- [ ] **Step 2: Run the test — verify it fails**

```bash
pnpm --filter @new-workshop/web-client test src/__tests__/manage-agents-routing.test.tsx
```

Expected: FAIL — both assertions miss because `/agents` currently renders `ChatPage`.

- [ ] **Step 3: Add a stub `AgentsPage` and the `/agents` route**

Create `packages/web-client/src/pages/agents-page.tsx`:

```tsx
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
```

Update `App.tsx` to mount it:

```tsx
import { AgentsPage } from "./pages/agents-page";

// inside <Routes>
<Route path="/" element={<ChatPage />} />
<Route path="/agents/*" element={<AgentsPage />} />
<Route path="*" element={<ChatPage />} />
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
pnpm --filter @new-workshop/web-client test src/__tests__/manage-agents-routing.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/src/__tests__/manage-agents-routing.test.tsx packages/web-client/src/pages/agents-page.tsx packages/web-client/src/App.tsx
git commit -m "feat(web-client): add /agents route with AgentsSidebar"
```

---

## Task 7: AgentsIndex — redirect to first agent or empty state

**Files:**
- Create: `packages/web-client/src/components/agents-empty-state.tsx`
- Create: `packages/web-client/src/pages/agents-index.tsx`
- Create: `packages/web-client/src/__tests__/agents-empty-state.test.tsx`
- Create: `packages/web-client/src/__tests__/agents-redirects.test.tsx`
- Modify: `packages/web-client/src/App.tsx`

- [ ] **Step 1: Write the failing redirect test**

Create `packages/web-client/src/__tests__/agents-redirects.test.tsx` (re-using the `renderApp` helper pattern from Task 6 — duplicate the helper inline rather than importing test utilities, to keep tests self-contained):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import * as agentsApi from "../lib/agents-api";
import * as api from "../lib/api";
import { AuthContext } from "../contexts/AuthContext";

vi.mock("../lib/agents-api");
vi.mock("../lib/api");

const FAKE_AGENTS = [
  { id: "main", name: "Main Agent", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#6c5ce7" }, hasGuardrails: false },
  { id: "support", name: "Support Bot", model: "claude-sonnet", avatar: { emoji: "🛟", color: "#00b894" }, hasGuardrails: false },
];

function renderApp(initialPath: string) {
  const authValue = { isAuthenticated: true, loading: false, user: { email: "t@e.com", id: "u1" }, login: vi.fn(), logout: vi.fn() };
  return render(
    <AuthContext.Provider value={authValue as any}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentsApi.fetchAgents).mockResolvedValue(FAKE_AGENTS);
  vi.mocked(agentsApi.fetchAgent).mockImplementation(async (id) => ({
    ...FAKE_AGENTS.find((a) => a.id === id)!,
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: `You are ${id}.`,
  }));
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
});

describe("/agents redirects", () => {
  it("/agents redirects to /agents/<first-id> when there is at least one agent", async () => {
    renderApp("/agents");
    await waitFor(() => expect(screen.getByDisplayValue("Main Agent")).toBeInTheDocument());
  });

  it("/agents/<unknown-id> redirects back to /agents (and then on to first agent)", async () => {
    renderApp("/agents/garbage-id");
    await waitFor(() => expect(screen.getByDisplayValue("Main Agent")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Write the failing empty-state test**

Create `packages/web-client/src/__tests__/agents-empty-state.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import * as agentsApi from "../lib/agents-api";
import * as api from "../lib/api";
import { AuthContext } from "../contexts/AuthContext";

vi.mock("../lib/agents-api");
vi.mock("../lib/api");

function renderApp(path: string) {
  const authValue = { isAuthenticated: true, loading: false, user: { email: "t@e.com", id: "u1" }, login: vi.fn(), logout: vi.fn() };
  return render(
    <AuthContext.Provider value={authValue as any}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentsApi.fetchAgents).mockResolvedValue([]);
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
});

describe("agents empty state", () => {
  it("renders the empty-state pane when there are zero agents", async () => {
    renderApp("/agents");
    await waitFor(() => expect(screen.getByText(/no agents yet/i)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /new agent/i })).toHaveAttribute("href", "/agents/new");
  });
});
```

- [ ] **Step 3: Run the tests — verify they fail**

```bash
pnpm --filter @new-workshop/web-client test src/__tests__/agents-redirects.test.tsx src/__tests__/agents-empty-state.test.tsx
```

Expected: FAIL — `/agents` renders an empty `<Outlet />` and no editor.

- [ ] **Step 4: Create the empty state**

Create `packages/web-client/src/components/agents-empty-state.tsx`:

```tsx
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

export function AgentsEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">No agents yet.</p>
      <p className="max-w-sm text-sm text-muted">
        Create your first agent to start chatting with a custom assistant.
      </p>
      <Link
        to="/agents/new"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
      >
        <Plus size={16} /> New Agent
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: Create the index route**

Create `packages/web-client/src/pages/agents-index.tsx`:

```tsx
import { Navigate } from "react-router-dom";
import { useAgentsContext } from "../contexts/AgentsContext";
import { AgentsEmptyState } from "../components/agents-empty-state";

export function AgentsIndex() {
  const { agents, isLoading } = useAgentsContext();
  if (isLoading) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;
  if (agents.length === 0) return <AgentsEmptyState />;
  return <Navigate to={`/agents/${agents[0].id}`} replace />;
}
```

- [ ] **Step 6: Mount the index route**

In `App.tsx`, replace the catch-all subtree under `/agents` with nested routes:

```tsx
import { AgentsIndex } from "./pages/agents-index";

<Route path="/agents" element={<AgentsPage />}>
  <Route index element={<AgentsIndex />} />
  {/* /agents/new and /agents/:id are added in Task 8/9 */}
  <Route path="*" element={<AgentsIndex />} />
</Route>
```

`<Route path="*" element={<AgentsIndex />} />` covers the unknown-id case for now (Task 9 narrows it to "redirect when id doesn't match").

- [ ] **Step 7: Run the empty-state test — verify it passes**

```bash
pnpm --filter @new-workshop/web-client test src/__tests__/agents-empty-state.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web-client/src/components/agents-empty-state.tsx packages/web-client/src/pages/agents-index.tsx packages/web-client/src/App.tsx packages/web-client/src/__tests__/agents-redirects.test.tsx packages/web-client/src/__tests__/agents-empty-state.test.tsx
git commit -m "feat(web-client): add /agents index — redirect or empty state"
```

(The redirect-to-first-agent test will continue failing until Task 8 lands `/agents/:id`. That is expected — it is fixed in Task 8 Step 5.)

---

## Task 8: AgentEditor — `/agents/:id` and `/agents/new`

**Files:**
- Create: `packages/web-client/src/pages/agent-editor.tsx`
- Modify: `packages/web-client/src/App.tsx`
- Create: `packages/web-client/src/__tests__/agents-create-flow.test.tsx`

- [ ] **Step 1: Write the failing create-flow test**

Create `packages/web-client/src/__tests__/agents-create-flow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import * as agentsApi from "../lib/agents-api";
import * as api from "../lib/api";
import { AuthContext } from "../contexts/AuthContext";

vi.mock("../lib/agents-api");
vi.mock("../lib/api");

function renderApp(path: string) {
  const authValue = { isAuthenticated: true, loading: false, user: { email: "t@e.com", id: "u1" }, login: vi.fn(), logout: vi.fn() };
  return render(
    <AuthContext.Provider value={authValue as any}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  // Start with no agents so the create flow lands on a clean state.
  vi.mocked(agentsApi.fetchAgents).mockResolvedValueOnce([]);
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
});

describe("create-agent flow", () => {
  it("saving a new agent navigates to /agents/:newId", async () => {
    const newAgent = {
      id: "new-id",
      name: "Brand New",
      model: "claude-sonnet-4-20250514",
      maxTokens: 1024,
      temperature: 0.7,
      systemPrompt: "Hi.",
      avatar: { emoji: "🤖", color: "#6c5ce7" },
    };
    vi.mocked(agentsApi.createAgent).mockResolvedValue(newAgent);
    // After create, the agents list refresh returns the new one.
    vi.mocked(agentsApi.fetchAgents).mockResolvedValue([
      { id: "new-id", name: "Brand New", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#6c5ce7" }, hasGuardrails: false },
    ]);
    vi.mocked(agentsApi.fetchAgent).mockResolvedValue(newAgent);

    renderApp("/agents/new");
    await waitFor(() => expect(screen.getByLabelText(/name/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/name/i), "Brand New");
    await userEvent.type(screen.getByLabelText(/system prompt/i), "Hi.");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(vi.mocked(agentsApi.createAgent)).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Brand New", systemPrompt: "Hi." }),
      ),
    );
    // Editor for the new agent is now mounted — its preset name should appear.
    await waitFor(() => expect(screen.getByDisplayValue("Brand New")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

```bash
pnpm --filter @new-workshop/web-client test src/__tests__/agents-create-flow.test.tsx
```

Expected: FAIL (the routes don't exist).

- [ ] **Step 3: Create `AgentEditor`**

Create `packages/web-client/src/pages/agent-editor.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, useMatch } from "react-router-dom";
import { fetchAgent } from "../lib/agents-api";
import { AgentForm } from "../components/agent-form";
import { useAgentsContext } from "../contexts/AgentsContext";
import type { AgentConfig, CreateAgentInput } from "../types";

export function AgentEditor() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const isNewRoute = !!useMatch("/agents/new");
  const { agents, createAgent, updateAgent, isLoading: agentsLoading } = useAgentsContext();
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit mode — load the full agent when :id changes
  useEffect(() => {
    if (isNewRoute) {
      setAgent(null);
      setError(null);
      return;
    }
    if (!params.id) return;
    if (agentsLoading) return;
    // Unknown id → redirect back to /agents (which then redirects to first or empty state)
    if (!agents.some((a) => a.id === params.id)) {
      navigate("/agents", { replace: true });
      return;
    }
    setError(null);
    fetchAgent(params.id)
      .then(setAgent)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load agent"));
  }, [isNewRoute, params.id, agents, agentsLoading, navigate]);

  async function handleSave(data: CreateAgentInput) {
    if (isNewRoute) {
      const created = await createAgent(data);
      navigate(`/agents/${created.id}`, { replace: true });
      return;
    }
    if (!agent) return;
    await updateAgent(agent.id, data);
  }

  if (error) return <div className="p-6 text-sm text-red-400">{error}</div>;
  if (isNewRoute) {
    return (
      <AgentForm
        agents={agents}
        onSave={handleSave}
        onBack={() => navigate("/agents")}
      />
    );
  }
  if (!agent) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;
  return (
    <AgentForm
      agent={agent}
      agents={agents}
      onSave={handleSave}
      onBack={() => navigate("/agents")}
    />
  );
}
```

- [ ] **Step 4: Mount the editor routes**

In `App.tsx`, replace the catch-all `*` under `/agents` with explicit children:

```tsx
import { AgentEditor } from "./pages/agent-editor";

<Route path="/agents" element={<AgentsPage />}>
  <Route index element={<AgentsIndex />} />
  <Route path="new" element={<AgentEditor />} />
  <Route path=":id" element={<AgentEditor />} />
  <Route path="*" element={<AgentsIndex />} />
</Route>
```

- [ ] **Step 5: Run the redirect test, the create test, and the routing test**

```bash
pnpm --filter @new-workshop/web-client test src/__tests__/agents-redirects.test.tsx src/__tests__/agents-create-flow.test.tsx src/__tests__/manage-agents-routing.test.tsx
```

Expected: all PASS. The redirect test now succeeds because `AgentsIndex` redirects to `/agents/main` and the editor renders the form.

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/src/pages/agent-editor.tsx packages/web-client/src/App.tsx packages/web-client/src/__tests__/agents-create-flow.test.tsx
git commit -m "feat(web-client): add AgentEditor for /agents/new and /agents/:id"
```

---

## Task 9: Delete flow with next-or-prev navigation

**Files:**
- Modify: `packages/web-client/src/pages/agent-editor.tsx`
- Create: `packages/web-client/src/__tests__/agents-delete-flow.test.tsx`

The spec rule: snapshot the current agent's index in the pre-delete list; after delete, if the post-delete list has an entry at that same index, navigate to it; else if the list is non-empty, navigate to the last agent; else go to `/agents` (empty state).

- [ ] **Step 1: Write the failing delete test**

Create `packages/web-client/src/__tests__/agents-delete-flow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import * as agentsApi from "../lib/agents-api";
import * as api from "../lib/api";
import { AuthContext } from "../contexts/AuthContext";

vi.mock("../lib/agents-api");
vi.mock("../lib/api");

const A = { id: "a", name: "A", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#6c5ce7" }, hasGuardrails: false };
const B = { id: "b", name: "B", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#00b894" }, hasGuardrails: false };
const C = { id: "c", name: "C", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#fd79a8" }, hasGuardrails: false };

function renderApp(path: string) {
  const authValue = { isAuthenticated: true, loading: false, user: { email: "t@e.com", id: "u1" }, login: vi.fn(), logout: vi.fn() };
  return render(
    <AuthContext.Provider value={authValue as any}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
  vi.mocked(agentsApi.fetchAgent).mockImplementation(async (id) => ({
    ...({ a: A, b: B, c: C } as Record<string, typeof A>)[id],
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: `You are ${id}.`,
  }));
});

describe("delete-agent flow", () => {
  it("deleting middle agent navigates to the agent now at the same index", async () => {
    vi.mocked(agentsApi.fetchAgents).mockResolvedValueOnce([A, B, C]);
    vi.mocked(agentsApi.deleteAgent).mockResolvedValue(undefined);
    vi.mocked(agentsApi.fetchAgents).mockResolvedValue([A, C]);

    renderApp("/agents/b");
    await waitFor(() => expect(screen.getByDisplayValue("B")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    // Index of B was 1 in pre-delete list. Post-delete [A, C], same index = C.
    await waitFor(() => expect(screen.getByDisplayValue("C")).toBeInTheDocument());
  });

  it("deleting last agent in the list navigates to the new last", async () => {
    vi.mocked(agentsApi.fetchAgents).mockResolvedValueOnce([A, B, C]);
    vi.mocked(agentsApi.deleteAgent).mockResolvedValue(undefined);
    vi.mocked(agentsApi.fetchAgents).mockResolvedValue([A, B]);

    renderApp("/agents/c");
    await waitFor(() => expect(screen.getByDisplayValue("C")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(screen.getByDisplayValue("B")).toBeInTheDocument());
  });

  it("deleting the only remaining agent lands on the empty state", async () => {
    vi.mocked(agentsApi.fetchAgents).mockResolvedValueOnce([A]);
    vi.mocked(agentsApi.deleteAgent).mockResolvedValue(undefined);
    vi.mocked(agentsApi.fetchAgents).mockResolvedValue([]);

    renderApp("/agents/a");
    await waitFor(() => expect(screen.getByDisplayValue("A")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(screen.getByText(/no agents yet/i)).toBeInTheDocument());
  });
});
```

The "Delete" and "Confirm" buttons referenced above must be present in the editor — this drives the implementation in Step 3.

- [ ] **Step 2: Run the test — verify it fails**

```bash
pnpm --filter @new-workshop/web-client test src/__tests__/agents-delete-flow.test.tsx
```

Expected: FAIL (delete button doesn't exist in `AgentEditor`).

- [ ] **Step 3: Implement delete in `AgentEditor`**

Replace `pages/agent-editor.tsx` with the version below (adds Delete button, confirm dialog, and the next-or-prev rule):

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, useMatch } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { fetchAgent } from "../lib/agents-api";
import { AgentForm } from "../components/agent-form";
import { ConfirmDialog } from "../components/confirm-dialog";
import { useAgentsContext } from "../contexts/AgentsContext";
import type { AgentConfig, CreateAgentInput } from "../types";

export function AgentEditor() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const isNewRoute = !!useMatch("/agents/new");
  const { agents, createAgent, updateAgent, deleteAgent, isLoading: agentsLoading } = useAgentsContext();
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (isNewRoute) {
      setAgent(null);
      setError(null);
      return;
    }
    if (!params.id) return;
    if (agentsLoading) return;
    if (!agents.some((a) => a.id === params.id)) {
      navigate("/agents", { replace: true });
      return;
    }
    setError(null);
    fetchAgent(params.id)
      .then(setAgent)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load agent"));
  }, [isNewRoute, params.id, agents, agentsLoading, navigate]);

  async function handleSave(data: CreateAgentInput) {
    if (isNewRoute) {
      const created = await createAgent(data);
      navigate(`/agents/${created.id}`, { replace: true });
      return;
    }
    if (!agent) return;
    await updateAgent(agent.id, data);
  }

  async function handleConfirmDelete() {
    if (!agent) return;
    const idx = agents.findIndex((a) => a.id === agent.id);
    try {
      await deleteAgent(agent.id);
      // useAgents.deleteAgent already calls loadAgents() internally, so by
      // the time we reach here `agents` reflects the post-delete list. We
      // still filter defensively in case of stale closure.
      const next = pickNext(agents.filter((a) => a.id !== agent.id), idx);
      setConfirmDelete(false);
      setDeleteError(null);
      if (next) navigate(`/agents/${next}`, { replace: true });
      else navigate("/agents", { replace: true });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (error) return <div className="p-6 text-sm text-red-400">{error}</div>;

  if (isNewRoute) {
    return (
      <AgentForm
        agents={agents}
        onSave={handleSave}
        onBack={() => navigate("/agents")}
      />
    );
  }
  if (!agent) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">Edit · {agent.name}</span>
        <button
          onClick={() => { setConfirmDelete(true); setDeleteError(null); }}
          className="flex items-center gap-1 rounded p-1.5 text-sm text-muted hover:bg-red-950 hover:text-red-400"
          aria-label={`Delete ${agent.name}`}
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <AgentForm
          agent={agent}
          agents={agents}
          onSave={handleSave}
          onBack={() => navigate("/agents")}
        />
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete agent?"
          message="This agent will be permanently deleted. Existing conversations using this agent will still be accessible."
          onConfirm={handleConfirmDelete}
          onCancel={() => { setConfirmDelete(false); setDeleteError(null); }}
          error={deleteError}
        />
      )}
    </div>
  );
}

/** Spec rule: snapshot index → same-index-after / last / null. */
function pickNext(postDelete: { id: string }[], snapshotIdx: number): string | null {
  if (postDelete.length === 0) return null;
  if (snapshotIdx < postDelete.length) return postDelete[snapshotIdx].id;
  return postDelete[postDelete.length - 1].id;
}
```

Note: `pickNext` uses the post-delete agents list constructed from the current `agents` minus the deleted id. This avoids depending on the timing of `loadAgents()` re-rendering.

- [ ] **Step 4: Run the delete tests — verify they pass**

```bash
pnpm --filter @new-workshop/web-client test src/__tests__/agents-delete-flow.test.tsx
```

Expected: all three cases PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/src/pages/agent-editor.tsx packages/web-client/src/__tests__/agents-delete-flow.test.tsx
git commit -m "feat(web-client): delete agent with next-or-prev navigation"
```

---

## Task 10: Remove AgentDrawer

**Files:**
- Delete: `packages/web-client/src/components/agent-drawer.tsx`

- [ ] **Step 1: Confirm there are no live references**

```bash
grep -rn "AgentDrawer\|agent-drawer" packages/web-client/src --include='*.tsx' --include='*.ts'
```

Expected: only the file itself. (`App.tsx` no longer imports it after Task 5.)

- [ ] **Step 2: Delete the file**

```bash
git rm packages/web-client/src/components/agent-drawer.tsx
```

- [ ] **Step 3: Run the full test suite**

```bash
pnpm --filter @new-workshop/web-client test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(web-client): remove obsolete AgentDrawer"
```

---

## Task 11: Manual end-to-end check and cleanup

**Files:** none (verification only).

- [ ] **Step 1: Start the full stack**

```bash
pnpm start
```

- [ ] **Step 2: Walk the flow**

In a browser at http://localhost:5173:

1. Sign in. The conversations sidebar appears.
2. Click "Manage Agents" → URL is `/agents/<first-id>`, sidebar swaps to agents list, editor renders.
3. Pick a different agent in the sidebar → URL updates to `/agents/<id>`, form rehydrates.
4. Click "+ New Agent" → URL is `/agents/new`, blank form.
5. Save the new agent → URL becomes `/agents/<newId>`, sidebar shows the new entry.
6. Click "Delete" on the current agent → confirm → URL moves to next agent. Repeat until empty → empty state appears.
7. Click "← Back to chats" → URL is `/`, conversations sidebar restored, prior chat selectable.
8. Browser back/forward — moves between routes correctly.

If any step misbehaves, file an issue or open a follow-up task; do not silently patch.

- [ ] **Step 3: Run the full backend + frontend test suites once more**

```bash
pnpm --filter @new-workshop/web-client test
pnpm --filter @new-workshop/agent-service test
```

Expected: all PASS.

- [ ] **Step 4: Final commit (only if anything was tweaked above)**

If no edits, skip. Otherwise:

```bash
git commit -m "chore(web-client): post-rollout polish"
```

---

## Self-Review Notes

**Spec coverage:**
- Routes `/`, `/agents`, `/agents/new`, `/agents/:id` — Tasks 5, 7, 8.
- Sidebar swap by route — Tasks 3, 4, 6.
- Master/detail layout — Tasks 4, 7, 8.
- URL-driven selection — Task 8 (uses `useParams`).
- Removed `AgentDrawer`, `drawerOpen`, `onManageAgents` — Tasks 5, 10.
- Reused `AgentForm`, `fetchAgent`, `useAgents` (via context) — Tasks 2, 8, 9.
- Empty state when zero agents — Task 7.
- `/agents/<unknown>` redirect — Task 8 Step 3 (`useEffect` in `AgentEditor`).
- Delete next-or-prev rule — Task 9 (`pickNext`).
- Browser back from `/agents/:id` to `/` rehydrates — supported by `ChatPage` mount/unmount; covered by manual Task 11 step 7.
- Tests — five new test files, one per spec bullet, plus the routing test in Task 6.

**Out-of-scope items honored:** no unsaved-changes guard, no bulk ops, no search/filter, no mobile layout, no collapsed-sidebar persistence.
