# Workshop Onboarding Skill -- Simulated Transcript

## Scenario

**User prompt:** "hey im at the workshop and nothing is working, how do i get this running?"

**Skill triggered:** `workshop-onboarding` -- the user's message matches the skill description triggers: "how do I run this", confused about setup steps, wants to get the workshop environment up and running.

---

## Transcript

### Step 0: Skill Activation and Tone Setting

The user sounds frustrated and confused. The skill is designed for exactly this situation. I would begin with a reassuring, friendly tone -- no jargon dump, just a clear "I've got you" message before diving in.

**What I would say to the user:**

> No worries, let's get you set up from scratch. I'll walk through everything step by step -- installs, config, and starting the services. Should only take a couple minutes.

---

### Step 1: Install Dependencies

**Action:** Run `pnpm install` from the project root.

```bash
# Command I would run:
pnpm install
```

**What I would do next:** Check the exit code and output.

- **If `pnpm` is not found (command not found error):**

  **What I would say:**

  > Looks like `pnpm` isn't installed on your machine yet. Want me to install it for you? I'll run `npm install -g pnpm`.

  **Then, if the user agrees (or implicitly, since they asked for help getting things running):**

  ```bash
  npm install -g pnpm
  ```

  **Then retry:**

  ```bash
  pnpm install
  ```

- **If `pnpm install` succeeds (exit code 0, no unresolved peer dependency errors):**

  **What I would say:**

  > Dependencies are installed. Moving on to configuration.

- **If `pnpm install` fails with errors:**

  I would read the error output, diagnose the issue (e.g., wrong Node version, network issues, lockfile conflicts), and help fix it before continuing. For example, if the Node version is too old, I would tell the user what version is needed and how to update.

---

### Step 2: Configure Environment (.env file)

**Action:** Check if `.env` already exists in the project root.

```bash
# Command I would run (conceptually -- I would use the Read tool):
Read /Users/Mike.Bogdanovsky/Projects/new-workshop/.env
```

**Branch A -- `.env` exists:**

I would read its contents and check whether `ANTHROPIC_API_KEY` is set to a real value (not a placeholder like `your-key-here` or empty).

- If the key looks valid (starts with `sk-ant-`): Skip to Step 3.
- If the key is a placeholder or empty: Proceed to ask for the key (see below).

**Branch B -- `.env` does not exist:**

**Action:** Copy the example file.

```bash
cp .env.example .env
```

**Then, in both cases where the key needs to be set:**

**Action:** Use the AskUserQuestion tool to request the API key.

**What I would say (via AskUserQuestion):**

> I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:

**What I would do when the user provides the key:**

Use the Edit tool to replace the placeholder value in `.env` with the user's key. For example:

```
# Edit tool call:
file_path: /Users/Mike.Bogdanovsky/Projects/new-workshop/.env
old_string: ANTHROPIC_API_KEY=your-key-here
new_string: ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

I would NOT echo the key to the terminal, print it, or include it in any visible output. The Edit tool updates the file silently.

**What I would say after updating:**

> API key is configured. Let's start the services.

---

### Step 3: Start the Backend (agent-service)

**Action:** Start the agent service in the background.

```bash
# Command I would run (with run_in_background: true):
pnpm --filter @new-workshop/agent-service dev
```

I would use the `run_in_background` parameter so this does not block the conversation.

**Action:** Wait a few seconds, then verify the server started.

```bash
# Verification command:
curl -s http://localhost:3000/conversations | head -c 200
```

**If verification succeeds (returns JSON or a valid response):**

**What I would say:**

> Backend is running on port 3000. Starting the frontend next.

**If verification fails:**

I would read the background process output to check for errors. Common issues and how I would handle them:

- **"ANTHROPIC_API_KEY is not set"** -- Go back and check the `.env` file, re-ask for the key.
- **"EADDRINUSE: port 3000"** -- Tell the user another process is using port 3000, offer to kill it or suggest changing the port.
- **Module not found errors** -- Re-run `pnpm install` or check if the workspace is set up correctly.

I would diagnose the specific error and fix it before moving on.

---

### Step 4: Start the Frontend (web-client)

**Action:** Start the web client in the background.

```bash
# Command I would run (with run_in_background: true):
pnpm --filter @new-workshop/web-client dev
```

Again, using `run_in_background` so it does not block.

**Action:** Wait a moment, then verify Vite started (check for the "ready" message or try to reach the dev server).

```bash
# Verification command:
curl -s http://localhost:5173 | head -c 200
```

**If verification succeeds:**

Move to Step 5.

**If verification fails:**

Read the background output, diagnose, and fix. Common issues: port conflict, missing dependencies, Vite config error.

---

### Step 5: Present the Result

**What I would say to the user:**

> **You're all set!**
>
> - Backend (API): http://localhost:3000
> - Frontend (UI): http://localhost:5173
>
> Open http://localhost:5173 in your browser to start using the app.

---

## Summary of Tool Usage (in order)

| Step | Tool(s) Used | Purpose |
|------|-------------|---------|
| 1 | Bash | Run `pnpm install` (and possibly `npm install -g pnpm`) |
| 2a | Read | Check if `.env` exists and inspect its contents |
| 2b | Bash | Run `cp .env.example .env` if needed |
| 2c | AskUserQuestion | Ask user for their Anthropic API key |
| 2d | Edit | Write the API key into `.env` without exposing it |
| 3a | Bash (background) | Run `pnpm --filter @new-workshop/agent-service dev` |
| 3b | Bash | Run `curl -s http://localhost:3000/conversations` to verify |
| 4a | Bash (background) | Run `pnpm --filter @new-workshop/web-client dev` |
| 4b | Bash | Run `curl -s http://localhost:5173` to verify |
| 5 | Direct output | Present the final success message with URLs |

## Tone and Communication Notes

- **Reassuring upfront:** The user said "nothing is working" -- so the first thing is to calm them down and set expectations ("should only take a couple minutes").
- **No unnecessary questions:** The skill is clear and sequential. I would not ask "do you want me to install dependencies?" -- I would just do it. The only required question is the API key.
- **Confirm each step:** After each step, a brief one-liner confirmation before moving to the next. No walls of text.
- **Error handling is proactive:** If something fails, I diagnose it immediately rather than asking the user to figure it out.
- **Security-conscious:** The API key is never echoed or logged. It goes directly into the file via the Edit tool.

## Questions I Would Ask the User

Only **one** question is expected during the happy path:

1. **"Please paste your Anthropic API key"** (Step 2, via AskUserQuestion) -- only if the key is missing or is a placeholder.

If `pnpm` is not installed, there would be one additional question:

2. **"Want me to install pnpm for you?"** -- though given the user's frustrated tone ("nothing is working, how do I get this running"), I would likely just offer and proceed.

No other questions are needed. The skill is designed to be fully autonomous aside from the API key input.
