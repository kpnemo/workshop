---
name: workshop-onboarding
description: Set up the workshop project from scratch so participants can start coding immediately. Use this skill when the user says things like "set up the project", "get started", "onboard me", "install everything", "start the workshop", "how do I run this", or any variation of wanting to get the workshop environment up and running. Also trigger when the user seems confused about setup steps or asks about API keys, running services, or project URLs.
---

# Workshop Onboarding

This skill walks a workshop participant through the full project setup — from install to running services — so they can start building immediately without fighting tooling.

The project is a monorepo with two services:
- **agent-service** (Express backend on port 3000)
- **web-client** (React + Vite frontend on port 5173)

## Step 0: Diagnose current state

Before running through setup steps, quickly check what's already in place. This avoids wasting time redoing work the user has already completed, and helps you jump straight to whatever is actually broken.

Run these checks:
- Does `node_modules/` exist in the project root? (indicates dependencies were installed)
- Does `.env` exist? If so, does it have a real API key (not the `your-key-here` placeholder)?
- Is anything already running on ports 3000 or 5173? (`lsof -ti:3000` / `lsof -ti:5173`) — if a port is in use, also verify the service responds correctly (curl it) before skipping its startup step. A process occupying the port doesn't guarantee a healthy service.
- Was `pnpm` used, or did the user use `npm`? (check for `node_modules/.pnpm` — if it's missing but `node_modules` exists, the user likely used npm)
- What Node.js version is installed? (`node --version`) — workshop participants sometimes have old versions. If below v18, warn the user early since the project may not work correctly.

Based on what you find, skip steps that are already complete and tell the user what you're skipping and why. For example: "Looks like dependencies are already installed — skipping that step."

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

Verify the install succeeded (exit code 0, no unresolved peer dependency errors).

Skip this step if Step 0 confirmed dependencies are already correctly installed via pnpm.

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

Note: The key will be visible in the conversation transcript when the user pastes it via AskUserQuestion — that's unavoidable. The important thing is not to run shell commands that would log it to terminal history or output.

## Step 3: Start the backend

Start the agent service in the background:

```bash
pnpm --filter @new-workshop/agent-service dev
```

Run this in the background so it doesn't block the conversation. Wait a few seconds, then verify it started by checking for the startup log message or by curling the server:

```bash
curl -s http://localhost:3000/conversations | head -c 200
```

If it fails, read the output for errors (missing key, port in use, etc.) and help the user fix them.

Skip if Step 0 found the backend already running on port 3000.

## Step 4: Start the frontend

Start the web client in the background:

```bash
pnpm --filter @new-workshop/web-client dev
```

Run this in the background as well. Wait a moment for Vite to start, then verify it's running by curling the dev server:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: 200. This mirrors the backend health check and catches cases where the port is occupied but Vite failed to start.

Skip if Step 0 found the frontend already running and healthy on port 5173.

## Step 5: Open the app in the browser

Once both services are confirmed running, open the frontend in the user's default browser automatically. This is the payoff moment — the participant should see the working app without any manual steps.

On macOS:
```bash
open http://localhost:5173
```

On Linux:
```bash
xdg-open http://localhost:5173
```

**Before opening**, do a final health check to make sure the page will actually load. Curl the frontend one more time — if it returns 200, open the browser. If not, wait 2-3 seconds and retry once. Only if it still fails should you fall back to telling the user to open it manually.

After opening, tell the user:

> **You're all set!** The app should be open in your browser now.
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173

If any step failed and couldn't be resolved, clearly tell the user what went wrong and what they need to fix manually.

## Bonus: Orient the user

After setup succeeds, give the user a quick nudge on what to do next. Check if the `agents/` directory has any markdown files — if so, mention them:

> You have X agent persona(s) defined in `agents/`. Try chatting with one in the UI!

This small hint bridges the gap between "environment works" and "I know what to do now," which matters in a workshop setting where participants may be new to the project.
