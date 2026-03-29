# Code Style and Conventions

## TypeScript
- Strict mode enabled
- ESM modules (`"type": "module"`, `.js` extensions in imports)
- Target: ES2022
- Module resolution: NodeNext (backend), bundler (frontend via Vite)

## Naming
- Files: kebab-case (`conversation-item.tsx`, `use-chat.ts`)
- Components: PascalCase (`ChatContainer`, `MessageBubble`)
- Hooks: camelCase with `use` prefix (`useChat`, `useAutoScroll`)
- Interfaces: PascalCase, no `I` prefix (`AgentConfig`, `Message`)
- Variables/functions: camelCase

## Backend Patterns
- Express router factory pattern: `createConversationRouter(agents, db)`
- Database class wraps better-sqlite3 with typed methods
- Agent configs loaded from markdown files with gray-matter
- SSE helper functions: `startSSE()`, `writeSSE()`
- Lazy Anthropic client initialization via `getClient()`

## Frontend Patterns
- Custom hooks for state management (`useChat`, `useAutoScroll`)
- Props-driven components (ChatContainer receives props from App)
- CVA (class-variance-authority) for component variants (Button)
- Tailwind CSS with custom dark theme colors
- `cn()` utility (clsx + tailwind-merge) for class merging
- lucide-react for icons

## Testing
- Vitest with `describe`/`it`/`expect` pattern
- Backend route tests use raw `http.request` with ephemeral Express servers
- Backend DB tests use temp files in `os.tmpdir()`
- Frontend tests use `@testing-library/react` with `renderHook`/`waitFor`
- Mocking via `vi.mock()` and `vi.mocked()`

## CSS/Styling
- Dark theme only (bg: #0f0f1a, surface: #1a1a2e, primary: #6c5ce7)
- Tailwind CSS 3 with custom color tokens
- No CSS modules or styled-components
