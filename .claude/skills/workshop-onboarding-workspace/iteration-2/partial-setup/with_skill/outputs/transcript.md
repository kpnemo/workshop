# Workshop Onboarding Skill - Simulated Transcript

## Scenario

**User prompt:** "I already ran npm install but the app won't start, something about an API key?"

This is a partial-setup scenario: the user has already attempted dependency installation (using the wrong package manager) and is now stuck on a missing API key error.

---

## Transcript

### Step 0: Diagnose current state

The skill instructs me to run diagnostic checks before taking any action. Here is exactly what I would do:

**Action 1:** Check if `node_modules/` exists in the project root.

```
Command: ls /Users/Mike.Bogdanovsky/Projects/new-workshop/node_modules/
```

**Expected result:** The directory exists, because the user said they ran `npm install`.

**Action 2:** Check if `.env` exists and whether it has a real API key.

```
Command: ls /Users/Mike.Bogdanovsky/Projects/new-workshop/.env
```

**Expected result:** `.env` does NOT exist. The user mentioned "something about an API key," which strongly suggests the `.env` file was never created (only `.env.example` exists with the placeholder `your-key-here`). If `.env` did exist, I would read it to check whether `ANTHROPIC_API_KEY` is set to something other than `your-key-here`.

**Action 3:** Check if anything is running on ports 3000 or 5173.

```
Command: lsof -ti:3000
Command: lsof -ti:5173
```

**Expected result:** Nothing running on either port. The user said "the app won't start," implying the services are not currently running.

**Action 4:** Check whether pnpm or npm was used for installation.

```
Command: ls /Users/Mike.Bogdanovsky/Projects/new-workshop/node_modules/.pnpm/
```

**Expected result:** The `.pnpm` directory does NOT exist, because the user explicitly said they ran `npm install`, not `pnpm install`. The presence of `node_modules/` without `node_modules/.pnpm/` confirms npm was used.

---

### Diagnosis summary - what I would say to the user:

> "OK, I can see what's going on. I checked the current state of your project and found two things:
>
> 1. **Package manager mismatch:** You mentioned you ran `npm install` -- this project actually uses pnpm workspaces to manage its monorepo structure, so we'll need to reinstall with `pnpm install` instead. No worries, this is a common mix-up! pnpm handles the cross-package dependencies in the monorepo correctly, whereas npm doesn't wire them up the same way.
>
> 2. **Missing API key configuration:** There's no `.env` file yet -- that's why you're seeing the API key error. We'll get that set up in a moment.
>
> Let me walk you through the fixes."

**Analysis -- Does the skill handle this well?**

- **Acknowledges what the user already did:** YES. The skill's Step 0 diagnostic detects that `node_modules/` exists but was installed with npm (no `.pnpm` directory). The skill explicitly says to check for this and to explain it kindly ("Don't make them feel bad about it").
- **Detects npm vs pnpm mismatch:** YES. The skill has a specific check: "check for `node_modules/.pnpm` -- if it's missing but `node_modules` exists, the user likely used npm." It also has a bolded **Important** note about this exact scenario.
- **Addresses the API key complaint:** YES. The `.env` check catches the missing file, which directly explains the user's "something about an API key" symptom.

---

### Step 1: Reinstall dependencies with pnpm

Since Step 0 detected that npm was used instead of pnpm, I would NOT skip this step. I would first check if pnpm is available.

**Action 5:** Check if pnpm is installed.

```
Command: which pnpm
```

**If pnpm is NOT found**, I would say:

> "It looks like pnpm isn't installed on your machine yet. Can I install it globally for you? I'd run `npm install -g pnpm`."

Then, if the user agrees:

```
Command: npm install -g pnpm
```

**If pnpm IS found (or after installing it):**

> "Let me reinstall the dependencies with pnpm. This will set up the monorepo workspace correctly."

**Action 6:** Run pnpm install.

```
Command: pnpm install
```

I would verify the exit code is 0 and that there are no unresolved peer dependency errors.

> "Dependencies are installed. Moving on to the API key setup."

---

### Step 2: Configure environment

Step 0 found that `.env` does not exist. I would proceed with this step.

**Action 7:** Copy .env.example to .env.

```
Command: cp .env.example .env
```

**Action 8:** Ask the user for their API key. I would use the AskUserQuestion tool (or directly ask in conversation):

> "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

**User provides key:** (e.g., `sk-ant-api03-xxxxxxxxxxxxx`)

**Action 9:** Write the key into `.env` using the Edit tool (NOT echoing it to the terminal):

```
Edit .env:
  old_string: "ANTHROPIC_API_KEY=your-key-here"
  new_string: "ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx"
```

> "API key is configured."

---

### Step 3: Start the backend

Step 0 found nothing running on port 3000, so I would NOT skip this step.

**Action 10:** Start the agent service in the background.

```
Command (background): pnpm --filter @new-workshop/agent-service dev
```

**Action 11:** Wait a few seconds, then verify the backend started.

```
Command: curl -s http://localhost:3000/conversations | head -c 200
```

If I get a valid response (e.g., JSON), the backend is running. If not, I would read the background process output to diagnose the error.

> "Backend is running on port 3000."

---

### Step 4: Start the frontend

Step 0 found nothing running on port 5173, so I would NOT skip this step.

**Action 12:** Start the web client in the background.

```
Command (background): pnpm --filter @new-workshop/web-client dev
```

**Action 13:** Wait briefly, then verify Vite started (check port 5173 or the process output).

> "Frontend is running on port 5173."

---

### Step 5: Present the result

**What I would say to the user:**

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app.

---

## Evaluation of Skill Quality

### Does the skill handle partial setups well?

**Yes, largely.** The Step 0 diagnostic is well-designed for this scenario. It checks four independent signals (node_modules existence, .env existence/content, running ports, pnpm vs npm) and gives clear instructions to skip completed steps. In this scenario, it correctly identifies that dependencies need to be reinstalled (wrong package manager) and that the .env is missing.

### Does it detect the npm vs pnpm mismatch?

**Yes, explicitly.** The skill has a dedicated check for `node_modules/.pnpm` and a bolded **Important** paragraph that addresses the npm-vs-pnpm situation directly. It even specifies the tone: "Don't make them feel bad about it."

### Does it acknowledge what the user already did?

**Yes.** The skill says to "tell the user what you're skipping and why" and gives a template phrase ("Looks like dependencies are already installed -- skipping that step."). In this case, the skill would acknowledge the user ran npm install, explain why pnpm is needed instead, and then re-run installation -- rather than ignoring the user's prior effort.

### Potential gaps or issues noticed:

1. **No explicit instruction to remove `node_modules/` before re-running with pnpm.** After an `npm install`, running `pnpm install` over the top may or may not cause issues. The skill could benefit from an explicit `rm -rf node_modules` step when an npm-to-pnpm switchover is detected. In practice, pnpm install usually handles this gracefully, but it is worth noting.

2. **No check for `pnpm-lock.yaml` vs `package-lock.json`.** If the user ran `npm install`, a `package-lock.json` may have been generated. The skill does not mention cleaning this up, which could cause confusion or warnings later.

3. **The "API key" error message is inferred, not verified.** The user said "something about an API key" but the skill does not instruct the agent to look at actual error output. The diagnostic is purely based on file existence checks. In this case the inference is correct, but a more robust skill might also check recent terminal output or logs.

4. **The skill correctly uses the Edit tool (not echo) for the API key**, which is good security practice.

5. **The AskUserQuestion tool is referenced in the skill but may not be available in all agent configurations.** Falling back to a direct conversational question works fine.

6. **Background process management is underspecified.** The skill says "run this in the background" but doesn't detail what happens if the user's terminal session ends, or how to surface background process logs if something goes wrong later.

Overall, the skill handles this partial-setup scenario well. The diagnostic step is the key strength -- it avoids blindly re-running everything and instead meets the user where they are.
