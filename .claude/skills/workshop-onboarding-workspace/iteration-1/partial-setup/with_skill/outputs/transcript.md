# Workshop Onboarding Skill Transcript: Partial Setup (npm install done, API key missing)

## User Prompt

> "I already ran npm install but the app won't start, something about an API key?"

## Context / Initial State

- **node_modules** exists (user says they ran npm install; the skill uses `pnpm install` but node_modules is present)
- **.env** does NOT exist in the project root
- **.env.example** exists and contains: `ANTHROPIC_API_KEY=your-key-here`
- The user has NOT configured any API key
- No services are currently running

---

## Step-by-step Transcript of What the Skill Would Do

### Step 1: Install dependencies (SKILL.md Section 1)

**What the skill instructs:** Run `pnpm install` from the project root and verify it succeeds.

**What the agent would do:**

The skill says to run `pnpm install` unconditionally -- there is no instruction to check whether dependencies are already installed first. Even though the user explicitly said "I already ran npm install," the skill does not account for this. The agent following the skill literally would run:

```bash
pnpm install
```

**Issue identified:** The skill does NOT check for an existing `node_modules` directory or lockfile state. It will redundantly re-install dependencies even when the user has already done so. The user said they used `npm install` (not `pnpm install`), so there is a subtle difference -- `pnpm install` would re-resolve using the pnpm lockfile, which could actually be useful to ensure the correct package manager was used. However, the skill does not acknowledge what the user already did or explain WHY it is re-running the install.

**What the agent would say to the user:**

> "Let me start by making sure dependencies are properly installed with pnpm..."

The agent would then run `pnpm install` and wait for it to complete. If it succeeds (exit code 0), it moves on.

**Redundancy verdict:** Partially redundant. Running `pnpm install` when `npm install` was already used is arguably correct (different lockfiles, different node_modules structure), but the skill does not instruct the agent to explain this nuance to the user or skip it if appropriate.

---

### Step 2: Configure environment (SKILL.md Section 2)

**What the skill instructs:**
1. Check if `.env` already exists in the project root.
2. If it does NOT exist, run `cp .env.example .env`.
3. Ask the user for their Anthropic API key using AskUserQuestion.
4. Write the key into `.env` using the Edit tool.

**What the agent would do:**

The agent would check for `.env`:

```bash
ls .env
```

It does not exist. The agent would then copy the example:

```bash
cp .env.example .env
```

**What the agent would say to the user (via AskUserQuestion tool):**

> "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

**User provides key:** (e.g., `sk-ant-api03-xxxxxxxxxxxx`)

**What the agent would do next:**

The agent would use the Edit tool to replace the placeholder in `.env`:

```
Old: ANTHROPIC_API_KEY=your-key-here
New: ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```

The skill explicitly says "Do NOT echo the key to the terminal or include it in any visible output," so the agent would use the Edit tool silently.

**What the agent would say:**

> "API key configured. Let me start the services now."

**Assessment:** This step directly addresses the user's problem ("something about an API key"). The skill handles this well -- it checks for existing `.env`, creates it if missing, and asks for the key. This is the core of what the user needs.

---

### Step 3: Start the backend (SKILL.md Section 3)

**What the skill instructs:**
1. Run `pnpm --filter @new-workshop/agent-service dev` in the background.
2. Wait a few seconds.
3. Verify by curling `http://localhost:3000/conversations`.

**What the agent would do:**

```bash
pnpm --filter @new-workshop/agent-service dev
```
(Run in background using `run_in_background: true`)

Then wait a few seconds and verify:

```bash
curl -s http://localhost:3000/conversations | head -c 200
```

**What the agent would say:**

> "Starting the backend service..."

(After verification succeeds)

> "Backend is running on port 3000."

**Assessment:** Straightforward, no redundancy issues. This step is necessary regardless of what the user already did.

---

### Step 4: Start the frontend (SKILL.md Section 4)

**What the skill instructs:**
1. Run `pnpm --filter @new-workshop/web-client dev` in the background.
2. Wait for Vite to start.
3. Verify it's running.

**What the agent would do:**

```bash
pnpm --filter @new-workshop/web-client dev
```
(Run in background)

Then verify (likely by curling localhost:5173 or checking the background process output).

**What the agent would say:**

> "Starting the frontend..."

(After verification)

> "Frontend is running on port 5173."

**Assessment:** Straightforward, no redundancy issues.

---

### Step 5: Present the result (SKILL.md Section 5)

**What the skill instructs:** Tell the user the URLs and that they are all set.

**What the agent would say:**

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app.

---

## Analysis: How Well Does the Skill Handle Partial Setups?

### What the skill does well:

1. **Environment check is conditional.** Step 2 explicitly says "Check if `.env` already exists... If it does, skip the copy and just verify it has `ANTHROPIC_API_KEY` set to something other than the placeholder." This means if someone already has a `.env` with a valid key, the skill would skip the entire environment configuration step. That is good partial-setup handling.

2. **Directly addresses the user's problem.** The missing `.env` / API key is the root cause of the user's issue, and the skill reaches it at Step 2.

3. **Clear error handling guidance.** The skill says to diagnose and fix failures before continuing, and Step 3 specifically mentions checking for "missing key, port in use, etc."

### What the skill does poorly:

1. **Step 1 (install) is always executed, never skipped.** The skill has no instruction to check whether `node_modules` exists or whether dependencies are already installed. For a user who explicitly says "I already ran npm install," this wastes time (pnpm install on a monorepo can take 30+ seconds). The skill should instruct the agent to check for existing installations and skip if appropriate.

2. **No detection of npm vs pnpm mismatch.** The user said they used `npm install`, but the project uses `pnpm`. The skill does not instruct the agent to notice or warn about this. A `node_modules` created by `npm` may have a different structure than one created by `pnpm`, which could cause subtle issues. The skill should either (a) detect which package manager was used and warn, or (b) explicitly explain why re-running with pnpm is necessary.

3. **No step-skipping intelligence.** The skill says "Follow these steps in order" with no guidance on skipping steps that are already complete. A smarter skill would say something like: "Before each step, check if it has already been completed. If so, skip it and move to the next step." The conditional check in Step 2 for `.env` is the exception, not the rule.

4. **Does not acknowledge the user's situation.** The skill does not instruct the agent to first empathize with or diagnose the user's stated problem before launching into the full setup flow. The user said the "app won't start" and asked about an API key -- an ideal flow would start by saying "It sounds like you're missing the `.env` configuration. Let me check and fix that." Instead, the skill starts from Step 1 (install) regardless.

5. **Unnecessary sequential dependency.** Steps 3 and 4 (starting backend and frontend) could potentially be run in parallel, but the skill prescribes a strict sequential order.

### Summary Verdict:

The skill **partially handles** the partial-setup scenario. It correctly avoids re-configuring `.env` when one already exists (Step 2 conditional), but it **redundantly re-runs `pnpm install`** (Step 1) without checking if dependencies are present. For the specific user prompt about an API key, the skill reaches the correct fix at Step 2 but wastes time on Step 1 first. The skill would benefit from a preamble step that diagnoses what is already done before beginning the sequential walkthrough.

### Estimated Time to Resolution:

- **With skill as-is:** ~2-3 minutes (pnpm install runs unnecessarily, then .env is configured, then services start)
- **Ideal behavior:** ~30-60 seconds (skip install, create .env, ask for key, start services)
- **Wasted time:** ~1-2 minutes on redundant dependency installation
