# Workshop Onboarding Skill -- Simulated Transcript

## Scenario

- **User prompt:** "I just cloned this repo for the workshop. Can you set everything up so I can start coding?"
- **Starting state:** Fresh clone of the `new-workshop` monorepo. No `node_modules`, no `.env` file. The repo contains `.env.example` with placeholder content `ANTHROPIC_API_KEY=your-key-here`.

---

## Step-by-Step Transcript

### Step 1: Install Dependencies

**What I would do:**

Run the following command from the project root:

```bash
pnpm install
```

**Before running**, I would consider that `pnpm` might not be installed. If the command fails with "command not found", I would say to the user:

> "It looks like `pnpm` is not installed on your system. Would you like me to install it globally for you? I would run `npm install -g pnpm`."

If the user agrees, I would run:

```bash
npm install -g pnpm
```

Then retry `pnpm install`.

**After `pnpm install` completes**, I would check the exit code and scan the output for errors. Specifically I would look for:
- Non-zero exit code
- Unresolved peer dependency errors
- Network errors or registry issues

**What I would say to the user (assuming success):**

> Nothing yet -- I would proceed silently to the next step since installs are routine.

---

### Step 2: Configure Environment

**What I would do:**

First, check if `.env` already exists in the project root. In this scenario it does NOT exist.

I would run:

```bash
cp .env.example .env
```

This creates `.env` with the content:
```
ANTHROPIC_API_KEY=your-key-here
```

**Then I would ask the user for their API key.** I would use a direct message (or the AskUserQuestion tool if available):

> "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

**I would then wait for the user to respond.**

**Once the user provides their key** (e.g., `sk-ant-abc123...`), I would use the Edit tool to update `.env`:

- **old_string:** `ANTHROPIC_API_KEY=your-key-here`
- **new_string:** `ANTHROPIC_API_KEY=sk-ant-abc123...`
- **file_path:** `/Users/Mike.Bogdanovsky/Projects/new-workshop/.env`

I would NOT echo the key to the terminal or include it in any visible output. The Edit tool modifies the file directly without displaying the secret value.

**What I would say to the user after updating:**

> "API key configured. Moving on to starting the services."

---

### Step 3: Start the Backend

**What I would do:**

Run the agent service in the background:

```bash
pnpm --filter @new-workshop/agent-service dev
```

I would use the `run_in_background: true` parameter on the Bash tool so it does not block the conversation.

**Then, after a few seconds, I would verify it started** by running:

```bash
curl -s http://localhost:3000/conversations | head -c 200
```

**If the curl succeeds** (returns JSON or a valid response), the backend is running.

**If it fails**, I would read the background process output to check for common errors:
- Missing `ANTHROPIC_API_KEY` -- would go back and fix `.env`
- Port 3000 already in use -- would tell the user and help them kill the conflicting process
- Module not found -- would suggest re-running `pnpm install`

**What I would say to the user (assuming success):**

> Nothing yet -- I would continue to the next step.

---

### Step 4: Start the Frontend

**What I would do:**

Run the web client in the background:

```bash
pnpm --filter @new-workshop/web-client dev
```

Again, I would use `run_in_background: true` so it does not block.

**Then, after a moment, I would verify Vite started** by checking for the typical Vite startup output or curling `http://localhost:5173`.

**If it fails**, I would check for:
- Port 5173 already in use
- Missing dependencies
- Vite configuration errors

---

### Step 5: Present the Result

**What I would say to the user (assuming both services started successfully):**

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app.

---

## Full Conversation Flow (as the user would experience it)

Here is the complete dialogue as it would appear:

---

**User:** "I just cloned this repo for the workshop. Can you set everything up so I can start coding?"

**Claude:** *(runs `pnpm install` silently)*

*(pnpm install succeeds)*

**Claude:** *(runs `cp .env.example .env` silently)*

**Claude:** "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

**User:** "sk-ant-api03-xxxxxxxxxxxx"

**Claude:** *(uses Edit tool to write the key into `.env` -- no terminal echo)*

**Claude:** *(runs `pnpm --filter @new-workshop/agent-service dev` in background)*

*(waits a few seconds)*

**Claude:** *(runs `curl -s http://localhost:3000/conversations | head -c 200` to verify)*

*(backend responds with valid data)*

**Claude:** *(runs `pnpm --filter @new-workshop/web-client dev` in background)*

*(waits a moment for Vite to start)*

**Claude:**

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app.

---

## Error Handling Scenarios

### Scenario A: pnpm not installed

If `pnpm install` fails with "command not found":

**Claude:** "It looks like pnpm is not installed on your system. Would you like me to install it globally with `npm install -g pnpm`?"

**User:** "Yes"

**Claude:** *(runs `npm install -g pnpm`, then retries `pnpm install`)*

### Scenario B: User does not have an API key

If the user says they do not have a key:

**Claude:** "No problem. Head to https://console.anthropic.com/settings/keys, sign in (or create an account), and generate a new API key. Paste it here when you have it."

### Scenario C: Port 3000 already in use

If the backend fails because port 3000 is occupied:

**Claude:** "Port 3000 is already in use by another process. Would you like me to find and stop whatever is using it, or would you prefer to change the port?"

### Scenario D: Backend starts but curl fails

If curl to localhost:3000 times out or returns an error:

**Claude:** *(reads background process output to diagnose)* Then reports the specific error to the user and offers a fix.

---

## Summary of Tools Used (in order)

| Step | Tool | Purpose |
|------|------|---------|
| 1 | Bash | `pnpm install` |
| 2 | Bash | `cp .env.example .env` |
| 2 | AskUserQuestion (or direct message) | Request API key from user |
| 2 | Edit | Write API key into `.env` |
| 3 | Bash (background) | Start agent-service |
| 3 | Bash | `curl` to verify backend |
| 4 | Bash (background) | Start web-client |
| 5 | Direct message | Present final success summary |

## Questions Asked to the User

Only **one** question is asked during the happy path:

1. "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

No other questions are asked unless something goes wrong (e.g., pnpm not installed, port conflict).

## Order of Operations

1. `pnpm install` (blocking, must complete before anything else)
2. `cp .env.example .env` (only if `.env` does not exist)
3. Ask user for API key (blocking, must wait for response)
4. Write API key into `.env` via Edit tool
5. Start backend in background
6. Verify backend is running (curl check)
7. Start frontend in background
8. Verify frontend is running
9. Present success message with URLs
