# Manage Agents — Full-Page Route

**Status:** design
**Date:** 2026-04-30
**Owner:** Mike Bogdanovsky

## Problem

Today, "Manage Agents" opens a 520-px right-side drawer (`AgentDrawer`) on top of the chat. Editing an agent — name, model, system prompt, tools — is uncomfortable in that narrow column, and the user can't see the agent list while editing.

## Goal

Promote agent management from a drawer to a first-class route that uses the full content area. The chat experience is unchanged; managing agents becomes its own page with its own sidebar contents (the agents list).

## Design summary

- New routes in `web-client`: `/`, `/agents`, `/agents/new`, `/agents/:id`.
- The sidebar slot is unchanged in width and position. Its contents swap by route:
  - `/` → conversations list + "⚙ Manage Agents" link (today's behavior).
  - `/agents*` → agents list + "← Back to chats" link + "+ New Agent" button.
- Main content area on `/agents/:id` is a master/detail editor (sidebar = list, main = full-width edit form).
- Selection is URL-driven; no React selection state.
- The existing `AgentDrawer` is removed.

## Routes

| URL | Behavior |
|---|---|
| `/` | Chat view: chat sidebar + chat container (today's UI minus the drawer). |
| `/agents` | If at least one agent exists, redirects to `/agents/<first-id>`. If zero agents, renders an empty-state pane prompting "+ New Agent". |
| `/agents/new` | Renders the editor in create mode. On save, navigates to `/agents/:newId`. |
| `/agents/:id` | Renders the editor in edit mode for that agent. If `:id` does not match an agent, redirects to `/agents`. |

The `← Back to chats` link points to `/`.

## Component changes

### New components

- `AgentsProvider` (context) — wraps `useAgents()` so both sidebars and the editor share one list and one `loadAgents()`. Mounted at the app root, above the router.
- `SidebarShell` — owns the collapsed/expanded toggle, the chrome header slot, the scrollable body slot, and the footer (user email + logout). Has no opinion about contents.
- `ChatSidebar` — wraps `SidebarShell`. Body = "⚙ Manage Agents" `NavLink` (to `/agents`) above the conversations list (preserves today's placement). Header = title "Chats" + `+ New chat` button.
- `AgentsSidebar` — wraps `SidebarShell`. Body = "← Back to chats" `NavLink` (to `/`) above the agents list (each row is `NavLink` to `/agents/:id`). Header = title "Agents" + `+ New Agent` button (links to `/agents/new`).
- `AgentsPage` — layout component for the `/agents*` subtree. Renders `AgentsSidebar` + `<Outlet />` for the editor.
- `AgentEditor` — route component for `/agents/new` and `/agents/:id`. Mode is decided by route match: `/agents/new` → create mode (renders `AgentForm` with no preset agent); `/agents/:id` → edit mode (resolves `useParams().id`, fetches the full agent via `fetchAgent` from `lib/agents-api.ts`, prefills `AgentForm`). Calls `createAgent` / `updateAgent` from the agents context on save and navigates accordingly.
- `AgentsEmptyState` — pane shown on `/agents` when there are zero agents.
- `ChatPage` — thin layout component: renders `ChatSidebar` + the existing chat container (extracted from today's `AuthenticatedApp`).

### Removed

- `AgentDrawer` and its delete-confirm flow (the flow moves into `AgentEditor`).
- `drawerOpen` state, `setDrawerOpen`, and `onManageAgents` prop on `App.tsx` / `Sidebar`.

### Reused

- `AgentForm` — already split out; mounted directly inside `AgentEditor`.
- `fetchAgent`, `useAgents` (lifted into `AgentsProvider`).
- `ConversationItem`, `ConfirmDialog`, `AgentAvatar`.

## Data flow

- `AgentsProvider` is mounted once, at app root, above `BrowserRouter`. It exposes `{ agents, loadAgents, createAgent, updateAgent, deleteAgent }`.
- `AgentsSidebar` reads `agents` from context and renders one `NavLink` per agent. The active route highlights itself via `NavLink`'s `isActive`.
- `AgentEditor` reads `id` from `useParams()`. On mount or when `id` changes, it fetches the full agent (`fetchAgent`), prefills `AgentForm`, and renders.
- `useChat` lives inside `ChatPage`. It mounts on `/` and unmounts on `/agents*`. Returning to `/` rehydrates from the existing API + localStorage paths — no regression vs. today.

## Behavior on action

| Action | Result |
|---|---|
| Click "⚙ Manage Agents" in chat sidebar | Navigate to `/agents`, which redirects to `/agents/<first-id>` (or empty state if none). |
| Click an agent row in agents sidebar | Navigate to `/agents/:id`. |
| Click "+ New Agent" | Navigate to `/agents/new`. |
| Save in create mode | Call `createAgent`, navigate to `/agents/:newId`. |
| Save in edit mode | Call `updateAgent`, stay on `/agents/:id`. |
| Delete current agent | Snapshot the agent's index in the pre-delete list, call `deleteAgent`, then refresh. If the post-delete list has an agent at the same index, navigate to it; else if the list is non-empty, navigate to the last agent; else navigate to `/agents` (empty state). |
| Click "← Back to chats" | Navigate to `/`. |
| Browser back from `/agents/:id` to `/` | Conversations list and current chat restored from rehydration. |

## Edge cases

- **Zero agents.** `/agents` renders `AgentsEmptyState` with a prominent "+ New Agent" CTA. The agents sidebar still shows "← Back to chats" and "+ New Agent" but its list is empty.
- **Unknown id.** `/agents/<garbage>` redirects to `/agents`.
- **Deleting the last agent.** Lands on `/agents` empty state.
- **Refresh on `/agents/:id`.** `AgentsProvider` loads agents on mount; `AgentEditor` waits on the list before deciding whether to redirect-on-unknown.
- **Unsaved changes when navigating away.** Out of scope for MVP. Today's drawer doesn't guard either; leave parity.

## Testing

All tests live in `packages/web-client/src/__tests__/` and use RTL + vitest, matching existing patterns. Tests render `App` with `MemoryRouter` to drive routes deterministically.

- `manage-agents-routing.test.tsx`
  - Clicking "⚙ Manage Agents" navigates to `/agents` and the sidebar contents swap to the agents list.
  - Clicking "← Back to chats" returns to `/` and the conversations list reappears.
  - The active agent row is highlighted as `NavLink isActive`.
- `agents-empty-state.test.tsx`
  - With zero agents, `/agents` renders `AgentsEmptyState`.
  - Clicking "+ New Agent" from the empty state navigates to `/agents/new`.
- `agents-redirects.test.tsx`
  - With ≥1 agent, `/agents` redirects to `/agents/<first-id>`.
  - `/agents/<unknown-id>` redirects to `/agents`.
- `agents-create-flow.test.tsx`
  - Save from `/agents/new` calls `createAgent` and ends at `/agents/:newId`.
- `agents-delete-flow.test.tsx`
  - Delete from `/agents/:id` navigates to next-or-prev agent.
  - Deleting the last remaining agent lands on `/agents` empty state.

## Out of scope

- Unsaved-changes confirmation dialog.
- Bulk delete / bulk edit.
- Agent search, filter, sort, or reordering.
- Persisting collapsed-sidebar preference across routes.
- Mobile-specific layout — the master/detail assumes desktop, same as today's UI.

## Dependency

- `react-router-dom` ^6.28 (already used by `admin-panel`; add to `web-client/package.json`).

## File-level changes (preview)

| File | Change |
|---|---|
| `packages/web-client/package.json` | Add `react-router-dom`. |
| `packages/web-client/src/App.tsx` | Wrap in `AgentsProvider` + `BrowserRouter`; render route tree. Drop `drawerOpen` state and `AgentDrawer`. |
| `packages/web-client/src/contexts/AgentsContext.tsx` | New — wraps `useAgents`. |
| `packages/web-client/src/components/sidebar-shell.tsx` | New — chrome only. |
| `packages/web-client/src/components/chat-sidebar.tsx` | New — extracted from today's `Sidebar`. |
| `packages/web-client/src/components/agents-sidebar.tsx` | New. |
| `packages/web-client/src/pages/chat-page.tsx` | New — wraps `ChatSidebar` + `ChatContainer`. |
| `packages/web-client/src/pages/agents-page.tsx` | New — wraps `AgentsSidebar` + `<Outlet />`. |
| `packages/web-client/src/pages/agent-editor.tsx` | New — route component for `:id` and `new`. |
| `packages/web-client/src/components/agents-empty-state.tsx` | New. |
| `packages/web-client/src/components/sidebar.tsx` | Deleted (logic moves to `chat-sidebar.tsx` + `sidebar-shell.tsx`). |
| `packages/web-client/src/components/agent-drawer.tsx` | Deleted. |
| `packages/web-client/src/__tests__/*.test.tsx` | Five new tests above. Update existing tests that mounted `AgentDrawer` to drive the same flows through routes. |
