# Workshop Onboarding Skill -- Simulated Transcript

## Scenario

**User prompt:** "hey im at the workshop and nothing is working, how do i get this running?"

**Persona:** Confused newcomer, frustrated, vague about what is broken.

**Skill used:** Yes (`workshop-onboarding`)

---

## Skill Activation

The user's message matches multiple trigger phrases from the skill description: "how do I run this", the user "seems confused about setup steps", and they are clearly asking to get the workshop environment running. The skill activates immediately.

---

## Step 0: Diagnose Current State

Per the skill instructions, before running any setup steps I first diagnose what is already in place. I run these checks in parallel using the Bash tool:

### Check 1: Do node_modules exist?

**Tool call:** `Bash` with command `ls /Users/Mike.Bogdanovsky/Projects/new-workshop/node_modules`

**Simulated result:** Error -- directory does not exist (fresh state for confused newcomer).

### Check 2: Does .env exist? Does it have a real key?

**Tool call:** `Read` on `/Users/Mike.Bogdanovsky/Projects/new-workshop/.env`

**Simulated result:** File does not exist.

### Check 3: Is anything running on ports 3000 or 5173?

**Tool call:** `Bash` with command `lsof -ti:3000; lsof -ti:5173`

**Simulated result:** No output -- nothing running on either port.

### Check 4: Node.js version check

**Tool call:** `Bash` with command `node --version`

**Simulated result:** `v20.11.0` (a modern version, no issue).

### Diagnostic Summary

All checks come back negative:
- No `node_modules` directory (dependencies not installed)
- No `.env` file (environment not configured)
- Nothing running on ports 3000 or 5173
- Node.js version is v20.11.0 (fine, above v18 threshold)
- No need to check for `.pnpm` directory since `node_modules` does not exist at all

### What I would say to the user:

> No worries, let me get you sorted out. It looks like the project hasn't been set up yet -- dependencies aren't installed and the environment isn't configured. I'll walk through everything now. Good news: your Node.js version (v20.11.0) is fine for this project.

**Decision:** Proceed through all steps (1 through 5) since nothing is in place. No steps skipped.

---

## Step 1: Install Dependencies

### First, check if pnpm is available:

**Tool call:** `Bash` with command `which pnpm`

**Simulated result (Scenario A -- pnpm not found):** No output / exit code 1.

**What I would say:**

> pnpm isn't installed on your machine yet. This project uses pnpm to manage its monorepo structure. Let me install it for you.

**Tool call:** `Bash` with command `npm install -g pnpm`

**Simulated result:** pnpm installed successfully, exit code 0.

**Verification tool call:** `Bash` with command `pnpm --version`

**Simulated result:** `9.1.0`

---

**Simulated result (Scenario B -- pnpm IS found):** `/usr/local/bin/pnpm` -- skip the install step above.

---

### Run pnpm install:

**Tool call:** `Bash` with command `pnpm install` (cwd: `/Users/Mike.Bogdanovsky/Projects/new-workshop`)

**Simulated result:** Dependencies resolved and installed successfully. Exit code 0. No unresolved peer dependency errors.

**What I would say:**

> Dependencies installed successfully. Both the backend and frontend packages are set up.

---

## Step 2: Configure Environment

### Copy .env.example to .env:

Since Step 0 confirmed `.env` does not exist, I create it from the template.

**Tool call:** `Bash` with command `cp /Users/Mike.Bogdanovsky/Projects/new-workshop/.env.example /Users/Mike.Bogdanovsky/Projects/new-workshop/.env`

**Simulated result:** File copied. Exit code 0.

**What I would say:**

> I've created your environment config file from the template. Now I need one thing from you.

### Ask the user for their API key:

**Tool call:** I would use the subagent's equivalent of prompting the user, or simply ask directly in the conversation:

> I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:

### User provides key:

**Simulated user response:** `sk-ant-api03-abcdef123456789`

### Write the key into .env:

**Tool call:** `Edit` tool on `/Users/Mike.Bogdanovsky/Projects/new-workshop/.env`
- **old_string:** `ANTHROPIC_API_KEY=your-key-here`
- **new_string:** `ANTHROPIC_API_KEY=sk-ant-api03-abcdef123456789`

**Critical security note:** The key is written using the Edit tool, which modifies the file directly. I do NOT echo the key via any Bash command, do NOT include it in terminal output, and do NOT display it back to the user. The Edit tool updates the file without exposing the key in shell history or logs.

**What I would say:**

> API key configured. I've written it directly into your .env file.

---

## Step 3: Start the Backend

**Tool call:** `Bash` with command `pnpm --filter @new-workshop/agent-service dev` and parameter `run_in_background: true`

**What I would say:**

> Starting the backend service now...

### Verify the backend started:

After a few seconds, I run a health check.

**Tool call:** `Bash` with command `curl -s http://localhost:3000/conversations | head -c 200`

**Simulated result:** `[]` (empty JSON array -- the conversations endpoint responds, confirming the service is healthy).

**What I would say:**

> Backend is up and running on port 3000.

### If it had failed:

I would read the background process output and diagnose. Common issues:
- **API key not found:** Check `.env` was saved correctly, verify dotenv is loading it.
- **Port 3000 in use:** Run `lsof -ti:3000`, offer to kill the conflicting process.
- **Module not found:** Re-run `pnpm install`.

---

## Step 4: Start the Frontend

**Tool call:** `Bash` with command `pnpm --filter @new-workshop/web-client dev` and parameter `run_in_background: true`

**What I would say:**

> Starting the frontend...

### Verify the frontend started:

After a few seconds, I run a health check by curling the dev server.

**Tool call:** `Bash` with command `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`

**Simulated result:** `200`

This is the explicit HTTP status code check specified by the skill. A 200 response confirms Vite is actually serving content, not just that something is occupying the port.

**What I would say:**

> Frontend is up and running on port 5173.

---

## Step 5: Present the Result

Both services are confirmed running and healthy. I present the final summary:

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app.

---

## Bonus: Orient the User

Per the skill instructions, after setup succeeds I check the `agents/` directory for persona files.

**Tool call:** `Glob` or `Bash` with `ls /Users/Mike.Bogdanovsky/Projects/new-workshop/agents/*.md`

**Simulated result:** `agents/support-bot.md` (1 file found).

**What I would say:**

> You have 1 agent persona defined in `agents/` -- `support-bot.md`. Try chatting with it in the UI!

---

## Assertion Coverage

| Assertion ID | Covered? | Evidence |
|---|---|---|
| `runs-diagnostic` | Yes | Step 0 runs 4+ diagnostic checks before any setup action |
| `node-version-check` | Yes | `node --version` is run during Step 0 diagnostics |
| `pnpm-check` | Yes | `which pnpm` is checked in Step 1; if missing, `npm install -g pnpm` is offered |
| `runs-pnpm-install` | Yes | `pnpm install` is run in Step 1 (not npm install) |
| `copies-env-example` | Yes | `cp .env.example .env` is run in Step 2 |
| `prompts-for-key` | Yes | User is asked for their Anthropic API key with a link to the console |
| `protects-key` | Yes | Key is written via Edit tool, never echoed to terminal or included in Bash commands |
| `starts-backend` | Yes | `pnpm --filter @new-workshop/agent-service dev` is run in Step 3 |
| `starts-frontend` | Yes | `pnpm --filter @new-workshop/web-client dev` is run in Step 4 |
| `frontend-health-check` | Yes | `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173` is run (HTTP check, not just port check) |
| `shows-urls` | Yes | Both http://localhost:3000 and http://localhost:5173 are presented in Step 5 |
| `orients-user` | Yes | Bonus step mentions the 1 agent persona in `agents/` directory |
| `correct-order` | Yes | Order is: Step 0 (diagnostic) -> Step 1 (install) -> Step 2 (env config) -> Steps 3-4 (start services) -> Step 5 (present result) |

---

## Order of Operations Summary

| Step | Action | Skipped? | Reason |
|---|---|---|---|
| 0 | Diagnose current state | No | Always runs first |
| 1 | Install pnpm + `pnpm install` | No | No `node_modules` found |
| 2 | Copy `.env.example` to `.env`, ask for API key | No | No `.env` found |
| 3 | Start backend on port 3000 | No | Nothing running on port 3000 |
| 4 | Start frontend on port 5173 | No | Nothing running on port 5173 |
| 5 | Present result with URLs | No | Always runs last |
| Bonus | Orient user with agent personas | No | Always runs after success |

---

## Communication Tone

Throughout the interaction:
- **Reassuring:** The user said "nothing is working" -- I never blame them. I say "no worries" and "let me get you sorted out."
- **Proactive:** I run all commands myself. The only thing I ask the user for is the API key (which I cannot determine on my own).
- **Transparent about state:** I report what diagnostics found and explain what I am doing at each step.
- **No unnecessary jargon:** I mention "monorepo" only briefly when explaining why pnpm is needed, without over-explaining.
