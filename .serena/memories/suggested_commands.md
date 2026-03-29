# Suggested Commands

## Install Dependencies
```bash
pnpm install
```

## Run Development Servers
```bash
# Backend (port 3000, requires ANTHROPIC_API_KEY env var)
cd packages/agent-service && ANTHROPIC_API_KEY="<key>" pnpm dev

# Frontend (port 5173, proxies /api to backend)
cd packages/web-client && pnpm dev
```

## Run Tests
```bash
# All backend tests
cd packages/agent-service && pnpm test

# All frontend tests
cd packages/web-client && pnpm test

# Watch mode
cd packages/agent-service && pnpm test:watch
cd packages/web-client && pnpm test:watch

# Single test file
cd packages/agent-service && npx vitest run src/__tests__/database.test.ts
```

## Type Checking
```bash
cd packages/agent-service && npx tsc --noEmit
cd packages/web-client && npx tsc --noEmit
```

## Build
```bash
cd packages/agent-service && pnpm build
cd packages/web-client && pnpm build
```

## System Utilities (macOS/Darwin)
- `git`, `ls`, `cd`, `grep`, `find` — standard unix commands
- `lsof -ti :3000` — find process on a port
- `kill -9 <pid>` — force kill a process
