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
- Is anything already running on ports 3000 or 5173? (`lsof -ti:3000` / `lsof -ti:5173`)
- Was `pnpm` used, or did the user use `npm`? (check for `node_modules/.pnpm` — if it's missing but `node_modules` exists, the user likely used npm)

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

Run this in the background as well. Wait a moment for Vite to start, then verify it's running.

Skip if Step 0 found the frontend already running on port 5173.

## Step 5: Present the result

Once both services are confirmed running, tell the user:

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app.

If any step failed and couldn't be resolved, clearly tell the user what went wrong and what they need to fix manually.
