# Transcript: Handling "nothing is working, how do I get this running?"

## Without Skill Guidance

---

### User Message

> hey im at the workshop and nothing is working, how do i get this running?

---

### Step 1: Acknowledge and Orient

**What I would say to the user:**

> No worries, let's get you up and running. Let me take a quick look at the project to figure out what's needed.

**Tone:** Casual, reassuring, no judgment. The user is frustrated and possibly embarrassed -- the goal is to immediately signal "this is normal, we'll fix it."

---

### Step 2: Investigate the Project

**Commands I would run (in parallel):**

```bash
cat package.json
cat README.md
cat pnpm-workspace.yaml
ls packages/
```

**What I'm looking for:** Package manager (pnpm, npm, yarn), monorepo structure, any setup instructions, what services exist.

**What I would learn:**

- This is a pnpm monorepo with `packages/*` workspaces
- There are three packages: `agent-service`, `web-client`, `data`
- The root `package.json` requires Node >= 20 and uses pnpm
- README says to run `pnpm install`, copy `.env.example` to `.env`, and add an Anthropic API key
- The agent-service is the main backend (Express + Anthropic SDK + SQLite)
- The web-client is a Vite + React frontend

---

### Step 3: Check Prerequisites

**Commands I would run (in parallel):**

```bash
node --version
pnpm --version
```

**What I would say depending on results:**

- **If Node is missing or < 20:** "You need Node.js version 20 or higher. Let me help you install it." Then I would run `brew install node` or suggest `nvm install 20`.
- **If pnpm is missing:** "This project uses pnpm as its package manager. Let me install it for you." Then I would run `npm install -g pnpm`.
- **If both are present and correct:** Move on silently -- no need to narrate things that are fine.

---

### Step 4: Install Dependencies

**Command I would run:**

```bash
pnpm install
```

**What I would say:**

> Let me install the project dependencies first.

**What could go wrong:**

- If `pnpm install` fails with native module errors (e.g., `better-sqlite3` build failure), I would check if build tools are installed (`xcode-select --install` on macOS) and retry.
- If there are peer dependency warnings, I would ignore them unless they cause actual failures.

---

### Step 5: Set Up Environment Variables

**Commands I would run:**

```bash
ls .env 2>/dev/null
cat .env.example
```

**What I would learn:** `.env.example` contains `ANTHROPIC_API_KEY=your-key-here`. There is no `.env` file yet.

**What I would say:**

> You need an Anthropic API key to run the agent service. Do you have one? If so, I can set it up for you. If not, you can get one at https://console.anthropic.com/.

**What I would do depending on response:**

- **If they have a key:** I would run `cp .env.example .env` and then ask them to paste the key, or I would edit `.env` to insert it.
- **If they don't have a key:** I would explain where to get one and pause here, since the backend won't work without it. I might still get the frontend running in the meantime.
- **If there's a shared workshop key:** I would use whatever the workshop provides.

---

### Step 6: Start the Backend (Agent Service)

**Command I would run:**

```bash
pnpm --filter @new-workshop/agent-service dev
```

**What I would say:**

> Let me start the backend service. It should come up on port 3000.

**What could go wrong:**

- Port 3000 already in use -- I would check with `lsof -i :3000` and kill the conflicting process or suggest a different port.
- Missing `.env` or invalid API key -- the service would likely crash on startup with an error about the Anthropic client. I would go back to Step 5.
- SQLite errors -- the `data` package has `.db` files; if there are permission issues I would check file permissions.

---

### Step 7: Start the Frontend (Web Client)

**Command I would run (in a separate terminal or after confirming the backend is up):**

```bash
pnpm --filter @new-workshop/web-client dev
```

**What I would say:**

> Now let me start the frontend. It should open on a Vite dev server, probably port 5173.

**What could go wrong:**

- Port conflict -- same diagnosis as above.
- The frontend might not know the backend URL. I would check if there's a Vite proxy config or environment variable for the API base URL in the web-client's `vite.config.ts`.

---

### Step 8: Verify Everything Works

**What I would say:**

> Both services should be running now. The frontend is at http://localhost:5173 and the backend API is at http://localhost:3000. Try opening the frontend in your browser and sending a message.

**If they still report issues, I would ask:**

> What error are you seeing? Is it in the browser, in the terminal, or both?

Then I would debug based on the specific error.

---

### Step 9: Quick Smoke Test (if needed)

**Command I would run to verify the backend independently:**

```bash
curl -X POST http://localhost:3000/conversations \
  -H "Content-Type: application/json" \
  -d '{"agentId": "support-bot"}'
```

This would confirm the API is responding and the `support-bot` agent is loaded.

---

## Summary of Exact Command Sequence

For a user where Node and pnpm are already installed and they have an API key:

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment
cp .env.example .env
# (edit .env to add ANTHROPIC_API_KEY)

# 3. Start backend
pnpm --filter @new-workshop/agent-service dev

# 4. Start frontend (in a second terminal)
pnpm --filter @new-workshop/web-client dev
```

Total time from "nothing works" to running: approximately 2-3 minutes assuming dependencies are cached and the API key is available.

---

## Questions I Would Ask

1. **"Do you have an Anthropic API key?"** -- This is the most critical blocker. Without it, the backend cannot call Claude.
2. **"What error are you seeing?"** -- Only if the above steps don't resolve it. The user said "nothing is working" which is vague; I would try the happy path first and only dig into specifics if something fails.
3. **"Did you already try running any commands?"** -- I would NOT ask this upfront. It's faster to just do the setup correctly than to forensically determine what went wrong before.

---

## What I Would NOT Do

- **I would not ask a bunch of clarifying questions before acting.** The user is frustrated and wants results, not an interview. I would start fixing things and only ask questions when I hit a genuine blocker (like needing the API key).
- **I would not dump the entire README at them.** They want it to work, not to read documentation.
- **I would not run all the commands silently without explanation.** Brief, one-line explanations of what each step does helps them learn and builds trust.
- **I would not assume they know what pnpm, Vite, or SSE are.** But I also would not over-explain unless they ask.
