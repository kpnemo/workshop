# Workshop Onboarding Transcript (Without Skill Guidance)

## Context

User prompt: "I just cloned this repo for the workshop. Can you set everything up so I can start coding?"

Project: A monorepo at `/Users/Mike.Bogdanovsky/Projects/new-workshop` using pnpm workspaces, containing:
- `packages/agent-service` -- Express + Anthropic Claude REST API with SSE streaming
- `packages/web-client` -- React + Vite + Tailwind frontend
- `packages/data` -- SQLite database files
- `agents/` -- Markdown-based agent definitions

---

## Step-by-step Transcript

### Step 1: Explore the project to understand what we are dealing with

**What I would do:** Read `package.json`, `pnpm-workspace.yaml`, `README.md`, list directories.

**Commands I would run:**
```bash
cat package.json
cat pnpm-workspace.yaml
cat README.md
ls packages/
ls agents/
```

**What I would say to the user:** Nothing yet -- this is silent reconnaissance to understand the project before taking action.

---

### Step 2: Check prerequisites (Node.js and pnpm versions)

**Commands I would run:**
```bash
node --version
pnpm --version
```

**What I would say to the user:**

> Checking your environment. The project requires Node.js >= 20. You have Node v24.9.0 and pnpm 10.30.1 -- both are fine.

**If Node or pnpm were missing/wrong, I would say:**

> The project requires Node.js >= 20. You currently have [version]. You will need to upgrade before proceeding. You can use `nvm install 20` or download from nodejs.org. For pnpm, run `npm install -g pnpm` or `corepack enable`.

---

### Step 3: Install dependencies

**Commands I would run:**
```bash
pnpm install
```

**What I would say to the user:**

> Installing all workspace dependencies with `pnpm install`. This will install packages for the root, agent-service, and web-client.

**Note:** In this case, `node_modules` already exist (the repo was not freshly cloned -- it has been used before). For a truly fresh clone, `pnpm install` is essential. I would run it regardless to ensure everything is in sync with the lockfile.

---

### Step 4: Set up the `.env` file

**What I would check:** Does `.env` already exist? Does `.env.example` exist?

**Commands I would run:**
```bash
cp .env.example .env
```

**What I would say to the user:**

> I have created a `.env` file from `.env.example`. You need to add your Anthropic API key to it. The file currently contains:
>
> ```
> ANTHROPIC_API_KEY=your-key-here
> ```
>
> **Please replace `your-key-here` with your actual Anthropic API key.** You can get one from https://console.anthropic.com/. Without this key, the agent service will not be able to call Claude.

**Question I would ask:**

> Do you already have an Anthropic API key, or do you need help getting one?

---

### Step 5: Verify the setup works

**Commands I would run:**
```bash
pnpm --filter @new-workshop/agent-service test
pnpm --filter @new-workshop/web-client test
```

**What I would say to the user:**

> Running the test suites for both packages to make sure everything is wired up correctly.

**If tests pass:**

> All tests pass. The project is set up correctly.

**If tests fail:**

> Some tests failed. Let me look at the errors and fix any issues. [Would then diagnose and fix.]

---

### Step 6: Explain how to start developing

**What I would say to the user:**

> Everything is set up. Here is how to start coding:
>
> **Start the backend (agent service):**
> ```bash
> pnpm --filter @new-workshop/agent-service dev
> ```
> This starts the Express API server with hot-reload on http://localhost:3000.
>
> **Start the frontend (web client):**
> ```bash
> pnpm --filter @new-workshop/web-client dev
> ```
> This starts the Vite dev server (likely on http://localhost:5173).
>
> **Run tests in watch mode:**
> ```bash
> pnpm --filter @new-workshop/agent-service test:watch
> pnpm --filter @new-workshop/web-client test:watch
> ```
>
> The project uses a monorepo structure with two main packages:
> - `packages/agent-service` -- The backend REST API that integrates with Claude via the Anthropic SDK
> - `packages/web-client` -- A React frontend built with Vite, Tailwind CSS, and shadcn-style components
>
> Agent personas are defined as markdown files in the `agents/` directory. See `agents/support-bot.md` for an example.

---

## Summary of actions taken (in order)

| # | Action | Command | Blocking? |
|---|--------|---------|-----------|
| 1 | Read project files to understand structure | `cat`, `ls` | No |
| 2 | Check Node.js and pnpm versions | `node --version`, `pnpm --version` | Yes -- stop if wrong |
| 3 | Install dependencies | `pnpm install` | Yes -- stop if fails |
| 4 | Copy `.env.example` to `.env` | `cp .env.example .env` | No |
| 5 | Run tests to verify setup | `pnpm ... test` | No, but report issues |
| 6 | Explain dev workflow to user | (verbal) | No |

## Questions I would ask the user

1. **"Do you already have an Anthropic API key, or do you need help getting one?"** -- This is the one piece of information I cannot provide for them. Without it, the agent service will not work.

2. No other questions. The README and project structure are clear enough to proceed without ambiguity.

## What I would NOT do

- I would **not** ask the user what package manager to use (it is clearly pnpm, evidenced by `pnpm-lock.yaml` and `pnpm-workspace.yaml`).
- I would **not** run `npm install` or `yarn install`.
- I would **not** start the dev servers automatically -- the user said "set everything up so I can start coding," which means preparation, not launching.
- I would **not** commit any changes (the `.env` file is presumably gitignored).
- I would **not** modify any source code.
- I would **not** create any documentation files.

## Potential issues I would watch for

1. **Missing API key** -- The `.env` file needs a real `ANTHROPIC_API_KEY`. This is the most likely blocker.
2. **Port conflicts** -- If port 3000 or 5173 are already in use, the dev servers will fail. I would only address this if it happens.
3. **SQLite native module** -- `better-sqlite3` requires native compilation. If `pnpm install` fails on this, it may need Python or build tools. The `pnpm.onlyBuiltDependencies` config suggests this has been considered.
4. **Database files in `packages/data/`** -- There are existing `.db` files. These may be fine, or they may need to be reset for a fresh workshop. I would not touch them unless instructed.
