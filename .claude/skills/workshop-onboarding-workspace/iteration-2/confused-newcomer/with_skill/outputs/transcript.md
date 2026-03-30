# Workshop Onboarding Skill -- Simulated Transcript

## Scenario

**User prompt:** "hey im at the workshop and nothing is working, how do i get this running?"

**Persona:** Confused newcomer, frustrated, vague about what is wrong.

---

## Skill Activation

The skill triggers on this prompt because it matches several trigger phrases from the skill description: "how do I run this", the user "seems confused about setup steps", and they are clearly asking to get the workshop environment up and running.

---

## Step 0: Diagnose Current State

Before doing anything, I would run four diagnostic checks in parallel to understand what is already in place and what is broken.

### Commands I would run (in parallel):

```bash
# Check 1: Do node_modules exist?
ls /Users/Mike.Bogdanovsky/Projects/new-workshop/node_modules

# Check 2: Does .env exist, and does it have a real key?
cat /Users/Mike.Bogdanovsky/Projects/new-workshop/.env

# Check 3: Is anything running on ports 3000 or 5173?
lsof -ti:3000
lsof -ti:5173

# Check 4: Was pnpm used? (check for .pnpm directory inside node_modules)
ls /Users/Mike.Bogdanovsky/Projects/new-workshop/node_modules/.pnpm
```

### Possible diagnostic outcomes and how I would respond:

---

### Scenario A: Nothing installed, no .env, nothing running

This is the most likely scenario for a confused newcomer. All four checks come back negative or erroring.

**What I would say to the user:**

> No worries -- let's get you set up from scratch. It looks like dependencies haven't been installed yet and the environment isn't configured. I'll walk you through everything step by step.

Then I proceed to Step 1.

---

### Scenario B: node_modules exist but no .pnpm directory (user ran npm install)

**What I would say to the user:**

> I can see you've already run an install, but it looks like `npm install` was used instead of `pnpm install`. This project uses pnpm workspaces to manage the monorepo, so we need to reinstall with pnpm to get everything linked up correctly. No big deal -- this is a common mix-up. Let me redo the install with pnpm.

Then I proceed to Step 1 (with pnpm).

---

### Scenario C: node_modules exist with .pnpm, .env exists but has placeholder key

**What I would say to the user:**

> Good news -- dependencies are already installed correctly. But the API key in your .env file is still set to the placeholder value, so the backend can't connect to Anthropic. Let me help you get that configured.

Then I skip to Step 2 (environment configuration).

---

### Scenario D: Everything installed and configured, but services not running

**What I would say to the user:**

> Looks like your project is set up correctly -- dependencies are installed and your API key is configured. The services just aren't running yet. Let me start them up for you.

Then I skip to Step 3.

---

### Scenario E: Backend running but frontend is not (or vice versa)

**What I would say to the user (example: backend running, frontend not):**

> The backend is already running on port 3000. Looks like the frontend just needs to be started. Let me kick that off.

Then I skip to Step 4.

---

### Scenario F: Everything is running

**What I would say to the user:**

> Actually, it looks like everything is already running! Your backend is on port 3000 and the frontend is on port 5173. Try opening http://localhost:5173 in your browser. If something specific isn't working, let me know what you're seeing and I can help debug.

---

## For the remainder of this transcript, I will follow Scenario A (the most likely path for this persona).

---

## Step 1: Install Dependencies

### First, check if pnpm is available:

```bash
which pnpm
```

**If pnpm is NOT found**, I would say:

> Looks like pnpm isn't installed on your machine yet. Mind if I install it for you?

The user says yes (or I just proceed since they asked me to get things running). I would run:

```bash
npm install -g pnpm
```

Then verify:

```bash
pnpm --version
```

**If pnpm IS found (or after installing it)**, I run:

```bash
pnpm install
```

**What I would say to the user while this runs:**

> Installing all project dependencies now. This will set up both the backend and frontend packages. Give it a moment...

**After the command completes**, I check the exit code. If it's 0 with no unresolved peer dependency errors:

> Dependencies installed successfully.

**If it fails** (e.g., Node version mismatch, network error), I would read the error output, diagnose the issue, and help the user fix it before retrying. For example:

> It looks like there's a Node version mismatch. This project needs Node 18+. Let me check what version you have...
>
> ```bash
> node --version
> ```

---

## Step 2: Configure Environment

### Check if .env exists:

```bash
ls /Users/Mike.Bogdanovsky/Projects/new-workshop/.env
```

**If .env does NOT exist**, I run:

```bash
cp /Users/Mike.Bogdanovsky/Projects/new-workshop/.env.example /Users/Mike.Bogdanovsky/Projects/new-workshop/.env
```

**What I would say:**

> I've created your environment config file. Now I need one thing from you.

### Ask for the API key:

I would use the AskUserQuestion tool (or in this simulation, prompt the user directly):

> I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:

### User provides key (e.g., `sk-ant-api03-xxxxxxxxxxxx`)

I would then use the **Edit tool** to replace the placeholder in `.env`:

```
Old: ANTHROPIC_API_KEY=your-key-here
New: ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```

**Critical:** I would NOT echo the key to the terminal, NOT include it in any bash command, and NOT display it in any output. The Edit tool modifies the file directly without exposing the key.

**What I would say:**

> API key configured. I've written it into your .env file.

**If .env already existed with a real key**, I would say:

> Your .env file already has an API key configured -- skipping this step.

---

## Step 3: Start the Backend

I would run the backend in the background:

```bash
pnpm --filter @new-workshop/agent-service dev
```

(Using the `run_in_background: true` parameter so it does not block the conversation.)

**What I would say:**

> Starting up the backend service...

After a few seconds, I verify it is running:

```bash
curl -s http://localhost:3000/conversations | head -c 200
```

**If the curl returns a response (e.g., JSON array):**

> Backend is up and running on port 3000.

**If the curl fails or returns an error**, I would read the background process output to diagnose:

- **Missing API key error:** "Looks like the API key isn't being read properly. Let me check the .env file..."
- **Port already in use:** "Port 3000 is already taken by another process. Let me check what's using it..." (then run `lsof -ti:3000` and offer to kill it)
- **Module not found:** "There seems to be a missing dependency. Let me re-run the install..."

---

## Step 4: Start the Frontend

I would run the frontend in the background:

```bash
pnpm --filter @new-workshop/web-client dev
```

(Using the `run_in_background: true` parameter.)

**What I would say:**

> Starting the frontend...

After a few seconds, I verify by checking that something is listening on port 5173:

```bash
lsof -ti:5173
```

**If a process is found:**

> Frontend is up and running.

**If not**, I read the background output and diagnose (similar to Step 3).

---

## Step 5: Present the Result

Once both services are confirmed running, I would say:

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app. If you run into anything else, just let me know.

---

## Tone and Communication Notes

Throughout this interaction, the tone is:

1. **Reassuring** -- The user said "nothing is working" and is clearly frustrated. I never blame them or make them feel bad. Phrases like "no worries", "no big deal", "common mix-up" are used intentionally.

2. **Concise but informative** -- I tell the user what I am doing and why (e.g., "This project uses pnpm workspaces so we need pnpm"), but I do not lecture them or over-explain.

3. **Proactive** -- I do not ask the user to run commands themselves. I run everything for them and only ask when I need something I cannot determine on my own (the API key).

4. **Transparent about skipping** -- If diagnostics show something is already done, I explicitly say what I am skipping and why, so the user understands the process without feeling lost.

5. **No jargon dumping** -- I avoid terms like "monorepo", "peer dependencies", or "exit code" unless necessary for context. When I do use them, I explain briefly.

---

## Order of Operations Summary

| Step | Action | Skippable? | Condition to skip |
|------|--------|------------|-------------------|
| 0 | Diagnose current state | No | Always runs first |
| 1 | `pnpm install` | Yes | `node_modules/.pnpm` exists |
| 2 | Copy `.env.example`, set API key | Yes | `.env` exists with real key |
| 3 | Start backend on port 3000 | Yes | Process already on port 3000 |
| 4 | Start frontend on port 5173 | Yes | Process already on port 5173 |
| 5 | Present result with URLs | No | Always runs last |

---

## Total Estimated Time

- Step 0 (diagnostics): ~2 seconds (parallel checks)
- Step 1 (install): ~15-30 seconds depending on cache
- Step 2 (env config): ~10 seconds + wait for user to paste key
- Step 3 (backend): ~5 seconds to start + verify
- Step 4 (frontend): ~5 seconds to start + verify
- Step 5 (present): immediate

**Total: Under 1 minute of automated work**, plus however long the user takes to paste their API key.
