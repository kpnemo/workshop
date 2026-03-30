# Transcript: Old Skill (v2) Handling "npm install but API key error"

## Scenario

**User message:** "I already ran npm install but the app won't start, something about an API key?"

**Project:** /Users/Mike.Bogdanovsky/Projects/new-workshop (pnpm monorepo)

**Skill used:** workshop-onboarding (SKILL.md v2 at iteration-3/skill-snapshot-v2/)

---

## Skill Trigger Decision

The user mentions "app won't start" and "API key" -- the skill description says to trigger when the user "seems confused about setup steps or asks about API keys, running services, or project URLs." This matches. The skill is activated.

---

## Step 0: Diagnose Current State

The skill instructs me to run diagnostic checks before doing any setup steps. Here is exactly what I would do:

### Check 1: Does `node_modules/` exist?

**Tool call:** Bash
```bash
ls /Users/Mike.Bogdanovsky/Projects/new-workshop/node_modules/
```

**Expected result:** The directory exists because the user said they ran `npm install`.

**Conclusion:** Dependencies were installed (by some package manager).

### Check 2: Does `.env` exist? Does it have a real API key?

**Tool call:** Bash
```bash
cat /Users/Mike.Bogdanovsky/Projects/new-workshop/.env
```

**Expected result (likely scenario A):** File does not exist -- the user never created it, which explains the "something about an API key" error.

**Expected result (likely scenario B):** File exists but contains the placeholder `ANTHROPIC_API_KEY=your-key-here` from `.env.example`.

**Conclusion:** The `.env` file is missing or has a placeholder key. This is the root cause of the user's problem.

### Check 3: Is anything running on ports 3000 or 5173?

**Tool calls:** Bash (two commands, can be parallel)
```bash
lsof -ti:3000
```
```bash
lsof -ti:5173
```

**Expected result:** No output (nothing running on either port), since the user says the app "won't start."

**Conclusion:** Neither service is running. Both need to be started.

### Check 4: Was pnpm used, or npm?

**Tool call:** Bash
```bash
ls /Users/Mike.Bogdanovsky/Projects/new-workshop/node_modules/.pnpm
```

**Expected result:** Directory does NOT exist (or the `ls` fails), because the user explicitly said they ran `npm install`, not `pnpm install`.

**Conclusion:** The user used npm, not pnpm. The skill has a specific instruction for this case.

### Check 5: Node.js version

**Tool call:** Bash
```bash
node --version
```

**Expected result:** Something like `v20.x.x` or `v18.x.x` (assuming a reasonably modern version).

**Conclusion:** If v18+, no warning needed. If below v18, warn the user.

---

## Diagnosis Summary (what I would say to the user)

At this point, I would tell the user something like:

> I can see what's going on. Two things to address:
>
> 1. **npm vs pnpm:** This project uses pnpm workspaces, so `pnpm install` is needed instead of `npm install`. No worries -- it's an easy mix-up! pnpm handles the monorepo dependencies correctly, so I'll re-run the install with pnpm for you.
>
> 2. **API key:** You don't have a `.env` file set up yet, which is why you're seeing the API key error. I'll get that configured for you.
>
> Let me walk through the remaining setup steps.

**Key behavior per the skill:** The skill says "If the user mentions they ran `npm install`, explain that the project uses pnpm workspaces so `pnpm install` is needed instead. Don't make them feel bad about it -- just note that pnpm handles the monorepo dependencies correctly and re-run with pnpm." The transcript above follows this instruction: it's friendly, non-judgmental, and explains why pnpm is needed.

---

## Step 1: Install Dependencies (with pnpm)

Even though `node_modules/` exists, the skill says to re-run with pnpm because npm was used. The skill states: "Skip this step if Step 0 confirmed dependencies are already correctly installed via pnpm." Since they were NOT installed via pnpm, this step is NOT skipped.

**Tool call:** Bash
```bash
pnpm install
```

**Decision point -- is pnpm installed?** If the command fails with "command not found":
- The skill says: "If `pnpm` is not installed, offer to install it for the user."
- I would say: "It looks like pnpm isn't installed on your system. Want me to install it for you?"
- If user agrees, I would run: `npm install -g pnpm`, then re-run `pnpm install`.

**Assuming pnpm is available:** The command runs successfully (exit code 0). I verify no unresolved peer dependency errors in the output.

**What I would say:** "Dependencies are now installed with pnpm. Moving on to the environment configuration."

---

## Step 2: Configure Environment

### Sub-step: Check if `.env` exists

From Step 0 diagnosis, `.env` does not exist (or has placeholder).

**Scenario A: `.env` does not exist**

**Tool call:** Bash
```bash
cp /Users/Mike.Bogdanovsky/Projects/new-workshop/.env.example /Users/Mike.Bogdanovsky/Projects/new-workshop/.env
```

Then I need the user's API key.

**Tool call:** I would use a mechanism to ask the user a question, with a message like:

> "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

**User provides key:** (e.g., `sk-ant-api03-xxxxxxxxxxxx`)

**Tool call:** Edit tool to update `.env`
- **old_string:** `ANTHROPIC_API_KEY=your-key-here` (or whatever the placeholder is)
- **new_string:** `ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx`

**Important per skill:** "Do NOT echo the key to the terminal or include it in any visible output. Use the Edit tool to update the `.env` file directly." I would use the Edit tool, not a Bash `sed` or `echo` command.

**Scenario B: `.env` exists with placeholder**

Same as above -- skip the `cp` step, but still ask for the key and use Edit to replace the placeholder.

---

## Step 3: Start the Backend

From Step 0, nothing is running on port 3000, so this step is NOT skipped.

**Tool call:** Bash (run in background)
```bash
pnpm --filter @new-workshop/agent-service dev
```
(with `run_in_background: true`)

**Wait a few seconds, then verify:**

**Tool call:** Bash
```bash
curl -s http://localhost:3000/conversations | head -c 200
```

**Expected result:** A JSON response (likely an empty array `[]` or a list of conversations), confirming the backend is running.

**If it fails:** Read the output for errors. Common issues:
- Missing API key -> go back to Step 2
- Port already in use -> check what's using it
- Module not found -> re-run pnpm install

**What I would say:** "Backend is running on port 3000."

---

## Step 4: Start the Frontend

From Step 0, nothing is running on port 5173, so this step is NOT skipped.

**Tool call:** Bash (run in background)
```bash
pnpm --filter @new-workshop/web-client dev
```
(with `run_in_background: true`)

**Wait a moment, then verify:**

**Tool call:** Bash
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

**Expected result:** `200`

**What I would say:** "Frontend is running on port 5173."

---

## Step 5: Present the Result

**What I would say to the user:**

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app.

---

## Bonus: Orient the User

The skill says to check the `agents/` directory for markdown files.

**Tool call:** Bash or Glob
```bash
ls /Users/Mike.Bogdanovsky/Projects/new-workshop/agents/*.md
```

**Expected result:** One or more `.md` files (e.g., `agents/helpful-assistant.md`).

**What I would say:**

> You have X agent persona(s) defined in `agents/`. Try chatting with one in the UI!

---

## Summary of All Tool Calls (in order)

| # | Tool | Command / Action | Purpose |
|---|------|-----------------|---------|
| 1 | Bash | `ls node_modules/` | Check if deps installed |
| 2 | Bash | `cat .env` | Check if .env exists and has real key |
| 3 | Bash | `lsof -ti:3000` | Check if backend running |
| 4 | Bash | `lsof -ti:5173` | Check if frontend running |
| 5 | Bash | `ls node_modules/.pnpm` | Detect npm vs pnpm |
| 6 | Bash | `node --version` | Check Node.js version |
| 7 | -- | Tell user about npm vs pnpm (friendly) | Address npm detection |
| 8 | Bash | `pnpm install` | Re-install with correct package manager |
| 9 | Bash | `cp .env.example .env` | Create .env from template |
| 10 | AskUser | "Paste your Anthropic API key" | Get API key from user |
| 11 | Edit | Replace placeholder in .env | Set API key securely (no echo) |
| 12 | Bash (bg) | `pnpm --filter @new-workshop/agent-service dev` | Start backend |
| 13 | Bash | `curl localhost:3000/conversations` | Verify backend health |
| 14 | Bash (bg) | `pnpm --filter @new-workshop/web-client dev` | Start frontend |
| 15 | Bash | `curl -s -o /dev/null -w "%{http_code}" localhost:5173` | Verify frontend health |
| 16 | -- | Present "You're all set!" message | Final status |
| 17 | Bash/Glob | `ls agents/*.md` | Count agent personas |
| 18 | -- | "You have X agent(s)..." | Orient the user |

---

## Key Assertions About Skill Behavior

1. **npm vs pnpm detection:** The skill checks for `node_modules/.pnpm`. When it's missing but `node_modules/` exists, it concludes the user used npm. It then explains (without shaming) that pnpm is needed and re-runs install.

2. **Does NOT skip Step 1:** Even though `node_modules/` exists, the skill does NOT skip dependency installation because it was done with npm, not pnpm. The skip condition is "dependencies are already correctly installed via pnpm."

3. **API key handling:** The skill uses the Edit tool to write the key into `.env`, explicitly avoiding Bash echo/sed to prevent the key from appearing in terminal history or output.

4. **Port health checks:** The skill doesn't just check if a process is on the port -- it curls the service to verify it's actually healthy. For the backend: `curl localhost:3000/conversations`. For the frontend: checks for HTTP 200.

5. **Background processes:** Both services are started with `run_in_background: true` so they don't block the conversation.

6. **Friendly tone on npm mistake:** The skill explicitly says "Don't make them feel bad about it." The transcript reflects this with language like "No worries -- it's an easy mix-up!"

7. **Step skipping logic:** Steps 3 and 4 would be skipped if the ports were already occupied AND the services responded healthily. In this scenario, they are not skipped because nothing is running.

8. **Orientation bonus:** After setup, the skill checks `agents/` for markdown files and gives the user a nudge about what to do next.
