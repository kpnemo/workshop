---
name: workshop-onboarding
description: Set up the workshop project from scratch so participants can start coding immediately. Use this skill when the user says things like "set up the project", "get started", "onboard me", "install everything", "start the workshop", "how do I run this", or any variation of wanting to get the workshop environment up and running. Also trigger when the user seems confused about setup steps or asks about API keys, running services, or project URLs.
---

# Workshop Onboarding

This skill walks a workshop participant through the full project setup — from install to running services — so they can start building immediately without fighting tooling.

The project is a pnpm monorepo with two services managed by pm2:
- **agent-service** (Express backend on port 3000)
- **web-client** (React + Vite frontend on port 5173)

## Step 0: Diagnose current state

Before running through setup steps, quickly check what's already in place. This avoids wasting time redoing work the user has already completed.

Run these checks in parallel:
- Does `node_modules/` exist in the project root? (indicates dependencies were installed)
- Does `.env` exist? If so, does it have a real API key (not the `your-key-here` placeholder)?
- Is anything already running on ports 3000 or 5173? (`lsof -ti:3000` / `lsof -ti:5173`)
- Was `pnpm` used, or did the user use `npm`? (check for `node_modules/.pnpm` — if it's missing but `node_modules` exists, the user likely used npm)
- What Node.js version is installed? (`node --version`) — if below v18, warn early
- Are pm2 processes already running? (`pnpm pm2 list 2>/dev/null`) — if so, stop them first with `pnpm stop` before restarting to avoid port conflicts
- Is Playwright Chromium installed? (`cd packages/agent-service && pnpm exec playwright --version 2>/dev/null`) — if not, the `browse_url` agent tool won't work

Based on what you find, skip steps that are already complete and tell the user what you're skipping and why.

**Important:** This project uses **pnpm**, not npm. If the user mentions they ran `npm install`, explain that the project uses pnpm workspaces so `pnpm install` is needed instead. Don't make them feel bad about it — just note that pnpm handles the monorepo dependencies correctly and re-run with pnpm.

## Step 1: Install dependencies

Run from the project root:

```bash
pnpm install
```

If `pnpm` is not installed, offer to install it for the user. If they agree, run:
```bash
npm install -g pnpm
```

Verify the install succeeded (exit code 0, no unresolved peer dependency errors). This also installs pm2, which is used to manage the services.

Then install Playwright's Chromium browser (needed for the `browse_url` agent tool):

```bash
cd packages/agent-service && pnpm exec playwright install chromium
```

This downloads the headless Chromium binary. It's a ~150MB download and only needs to happen once. If it fails, check that the user has write access to the Playwright cache directory.

Skip the `pnpm install` part of this step if Step 0 confirmed dependencies are already correctly installed via pnpm. Still check if Playwright browsers are installed — run `cd packages/agent-service && pnpm exec playwright --version` to verify. If it errors, run the install command above.

## Step 2: Configure environment

Check if `.env` already exists in the project root. If it does, skip the copy and just verify it has `ANTHROPIC_API_KEY` set to something other than the placeholder.

If `.env` does not exist:

```bash
cp .env.example .env
```

Then ask the user for their Anthropic API key. Use the AskUserQuestion tool with a message like:

> "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

Once the user provides the key, write it into `.env` by replacing the placeholder value. The file format is:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Do NOT echo the key to the terminal or include it in any visible output. Use the Edit tool to update the `.env` file directly.

## Step 3: Start all services

If Step 0 found existing pm2 processes or something occupying ports 3000/5173, clean up first:

```bash
pnpm stop 2>/dev/null
lsof -ti:3000 | xargs kill 2>/dev/null
lsof -ti:5173 | xargs kill 2>/dev/null
```

Then start both services at once using pm2:

```bash
pnpm pm2 start ecosystem.config.cjs
```

This launches both the backend and frontend as managed background processes via the `ecosystem.config.cjs` file. pm2 handles process management, automatic restarts, and log aggregation.

Wait a few seconds for both services to come up, then verify:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/conversations
```
Expected: 401 (auth required — means the backend is alive).

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```
Expected: 200.

If either check fails, read the pm2 logs for errors:
```bash
pnpm pm2 logs --lines 30 --nostream
```

Help the user fix any issues (missing key, port conflicts, etc.) before proceeding.

## Step 4: Open the app in the browser

Once both services are confirmed running, open the frontend in the user's default browser. This is the payoff moment — the participant should see the working app without any manual steps.

On macOS:
```bash
open http://localhost:5173
```

On Linux:
```bash
xdg-open http://localhost:5173
```

Do a final health check before opening — curl the frontend one more time. If it returns 200, open the browser. If not, wait 2-3 seconds and retry once. Only fall back to telling the user to open it manually if the service genuinely isn't responding.

## Step 5: Orient the user

After setup succeeds, present the user with everything they need to know. Check if the `agents/` directory has any markdown files, count them, and check which ones have a `tools:` field in their frontmatter.

Tell the user:

> **You're all set!** The app should be open in your browser now.
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> You have X agent persona(s) defined in `agents/`. Try chatting with one in the UI!
>
> Some agents have **tools** enabled (like `browse_url` for web browsing). You can give an agent tools by adding a `tools:` field to its markdown frontmatter. See the agent edit form in the UI for available tools and examples.
>
> **Useful commands:**
>
> | Command | What it does |
> |---------|-------------|
> | `pnpm start` | Start services + show live logs |
> | `pnpm stop` | Stop all services |
> | `pnpm restart` | Restart all services |
> | `pnpm logs` | View live logs (Ctrl+C to exit, services keep running) |
> | `pnpm status` | Show service status table |

This commands table is important — it's how participants will manage services throughout the workshop. The key thing to convey is that `pnpm start` launches services and immediately shows logs, Ctrl+C exits the log view but the services stay running in the background, and `pnpm logs` re-attaches to the log stream anytime.

If any step failed and couldn't be resolved, clearly tell the user what went wrong and what they need to fix manually.
