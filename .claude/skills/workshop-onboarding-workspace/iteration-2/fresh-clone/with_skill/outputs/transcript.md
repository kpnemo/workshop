# Workshop Onboarding Skill -- Simulated Transcript

## Scenario

A user has freshly cloned the repo and says: "I just cloned this repo for the workshop. Can you set everything up so I can start coding?"

The skill `workshop-onboarding` is triggered by this prompt.

---

## Step 0: Diagnose Current State

The skill instructs me to check what is already in place before running any setup steps. Here is exactly what I would do for a freshly cloned repo:

### Check 1: Does `node_modules/` exist?

**Command:**
```bash
ls /Users/Mike.Bogdanovsky/Projects/new-workshop/node_modules/
```

**Expected result for a fresh clone:** The directory does NOT exist. `ls` returns an error like `No such file or directory`.

**Conclusion:** Dependencies have not been installed. Step 1 is required.

---

### Check 2: Does `.env` exist? If so, does it have a real API key?

**Command:**
```bash
cat /Users/Mike.Bogdanovsky/Projects/new-workshop/.env
```

**Expected result for a fresh clone:** The file does NOT exist. Only `.env.example` exists (containing `ANTHROPIC_API_KEY=your-key-here`).

**Conclusion:** The `.env` file needs to be created and configured. Step 2 is required.

---

### Check 3: Is anything already running on ports 3000 or 5173?

**Commands:**
```bash
lsof -ti:3000
lsof -ti:5173
```

**Expected result for a fresh clone:** Both commands return empty output (no process IDs), meaning nothing is running on either port.

**Conclusion:** Both services need to be started. Steps 3 and 4 are required.

---

### Check 4: Was `pnpm` used, or did the user use `npm`?

**Command:**
```bash
ls /Users/Mike.Bogdanovsky/Projects/new-workshop/node_modules/.pnpm/
```

**Expected result for a fresh clone:** `node_modules` does not exist at all, so this check is moot. No incorrect package manager was used.

**Conclusion:** No prior install detected. We will use `pnpm` as the skill requires.

---

### Diagnostic Summary

For a freshly cloned repo, all four checks come back negative. Every step (1 through 4) is required. No steps will be skipped.

**What I would say to the user at this point:**

> "Great, let me get you set up! Looks like this is a completely fresh clone -- no dependencies installed, no `.env` file, and no services running. I will walk through each setup step now."

---

## Step 1: Install Dependencies

### Check if pnpm is available

**Command:**
```bash
pnpm --version
```

**Expected result:** Either a version number (e.g., `9.1.0`) confirming pnpm is installed, or `command not found`.

#### If pnpm is NOT installed:

**What I would say:**

> "This project uses pnpm to manage its monorepo workspaces, but it does not look like pnpm is installed on your machine. Would you like me to install it for you?"

I would use the **AskUserQuestion** tool (or equivalent interactive prompt) to confirm before proceeding.

If the user agrees:

**Command:**
```bash
npm install -g pnpm
```

Then verify:
```bash
pnpm --version
```

#### If pnpm IS installed (the more likely path at a workshop):

**What I would say:**

> "pnpm is available. Installing dependencies now..."

### Run the install

**Command:**
```bash
pnpm install
```

This is run from the project root (`/Users/Mike.Bogdanovsky/Projects/new-workshop/`).

**Expected result:** pnpm resolves the workspace packages (`@new-workshop/agent-service`, `@new-workshop/web-client`, and `@new-workshop/data`), downloads all dependencies, and exits with code 0. Output includes a summary like `dependencies: XXX`.

**What I would check:** Exit code is 0 and there are no unresolved peer dependency errors in the output.

**What I would say on success:**

> "Dependencies installed successfully."

**What I would say on failure:** I would read the error output, diagnose the issue (e.g., Node version mismatch, network problems), and help the user fix it before proceeding.

---

## Step 2: Configure Environment

### Copy .env.example to .env

Since Step 0 confirmed `.env` does not exist, I need to create it.

**Command:**
```bash
cp .env.example .env
```

This creates `/Users/Mike.Bogdanovsky/Projects/new-workshop/.env` with the contents:
```
ANTHROPIC_API_KEY=your-key-here
```

### Ask the user for their API key

**What I would say (using the AskUserQuestion tool or equivalent interactive prompt):**

> "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

I would then wait for the user's response.

### Write the key into .env

Once the user provides their key (e.g., `sk-ant-api03-XXXXXXXXXXXX`), I would use the **Edit** tool to replace the placeholder:

**Edit operation:**
- File: `/Users/Mike.Bogdanovsky/Projects/new-workshop/.env`
- Old string: `ANTHROPIC_API_KEY=your-key-here`
- New string: `ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXXXXX`

**Important:** I would NOT echo the key to the terminal or include it in any visible output. The Edit tool updates the file directly without exposing the value.

**What I would say after writing the key:**

> "API key configured. Moving on to starting the services."

---

## Step 3: Start the Backend

### Launch the agent-service

**Command (run in background):**
```bash
pnpm --filter @new-workshop/agent-service dev
```

I would use the `run_in_background: true` parameter on the Bash tool so this does not block the conversation.

### Verify the backend started

After waiting a few seconds for the server to initialize, I would run:

**Command:**
```bash
curl -s http://localhost:3000/conversations | head -c 200
```

**Expected result:** A JSON response (likely an empty array `[]` or a list of conversations), confirming the Express backend on port 3000 is up and responding.

**What I would say on success:**

> "Backend is running on port 3000."

**What I would do on failure:** Read the background process output for errors. Common issues:
- **Missing API key:** Go back and verify `.env` was written correctly.
- **Port in use:** Run `lsof -ti:3000` to identify the conflicting process and ask the user if they want to kill it.
- **Module not found:** Dependencies may not have installed correctly; re-run `pnpm install`.

---

## Step 4: Start the Frontend

### Launch the web-client

**Command (run in background):**
```bash
pnpm --filter @new-workshop/web-client dev
```

Again using `run_in_background: true` so it does not block.

### Verify the frontend started

After a brief wait for Vite to compile and start, I would check:

**Command:**
```bash
lsof -ti:5173
```

**Expected result:** A process ID, confirming Vite is running on port 5173.

Alternatively, I could run:
```bash
curl -s http://localhost:5173/ | head -c 200
```

**Expected result:** HTML content from the Vite dev server.

**What I would say on success:**

> "Frontend is running on port 5173."

**What I would do on failure:** Similar to Step 3 -- read the background output, check for port conflicts, missing dependencies, etc.

---

## Step 5: Present the Result

Once both services are confirmed running, I would tell the user:

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app.

---

## Full Interaction Timeline (Summary)

| Step | Action | Commands | User Interaction |
|------|--------|----------|------------------|
| 0a | Check node_modules | `ls node_modules/` | None |
| 0b | Check .env | `cat .env` | None |
| 0c | Check ports | `lsof -ti:3000`, `lsof -ti:5173` | None |
| 0d | Check pnpm vs npm | `ls node_modules/.pnpm/` | None |
| 0 (summary) | Report findings | -- | Tell user: fresh clone, all steps needed |
| 1a | Check pnpm installed | `pnpm --version` | Ask to install if missing |
| 1b | Install deps | `pnpm install` | None |
| 2a | Copy env file | `cp .env.example .env` | None |
| 2b | Ask for API key | -- | **AskUserQuestion:** request Anthropic API key |
| 2c | Write API key | Edit tool on `.env` | None (key not echoed) |
| 3a | Start backend | `pnpm --filter @new-workshop/agent-service dev` (background) | None |
| 3b | Verify backend | `curl -s http://localhost:3000/conversations` | None |
| 4a | Start frontend | `pnpm --filter @new-workshop/web-client dev` (background) | None |
| 4b | Verify frontend | `lsof -ti:5173` | None |
| 5 | Present result | -- | Tell user: URLs and "you're all set" |

---

## Questions Asked During the Flow

Only one question is asked to the user during the entire flow:

1. **(Step 2b)** "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

A second question is possible but conditional:

2. **(Step 1a, only if pnpm is missing)** "This project uses pnpm to manage its monorepo workspaces, but it does not look like pnpm is installed on your machine. Would you like me to install it for you?"

---

## Notes on Parallelism and Ordering

- Step 0 checks (0a, 0b, 0c, 0d) are all independent and can be run in parallel using multiple Bash tool calls in a single message.
- Step 1 must complete before Step 3 or 4 (services need dependencies installed).
- Step 2 can technically run in parallel with Step 1 (copying .env does not depend on node_modules), but the API key prompt blocks the flow anyway, so it is simplest to run Step 2 after Step 1 completes.
- Steps 3 and 4 are independent and could theoretically be started in parallel, but verifying each one requires a short wait, so starting them sequentially with verification after each is more reliable.
- Step 5 depends on both Steps 3 and 4 being verified.
