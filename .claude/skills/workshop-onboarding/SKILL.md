---
name: workshop-onboarding
description: Set up the workshop project from scratch so participants can start coding immediately. Use this skill when the user says things like "set up the project", "get started", "onboard me", "install everything", "start the workshop", "how do I run this", or any variation of wanting to get the workshop environment up and running. Also trigger when the user seems confused about setup steps or asks about API keys, running services, or project URLs.
---

# Workshop Onboarding

This skill walks a workshop participant through the full project setup — from install to running services — so they can start building immediately without fighting tooling.

The project is a pnpm monorepo with three services run together via `concurrently`:
- **agent-service** (Express backend on port 3000)
- **web-client** (React + Vite chat frontend on port 5173)
- **admin-panel** (React + Vite admin SPA on port 5174) — where admins manage users, groups, profiles, and privileges

`pnpm start` launches all three in the foreground of the current terminal, with interleaved live logs prefixed `be` (blue), `fe` (green), and `admin` (magenta). Ctrl-C kills all three. There is no background process manager — what you see in the terminal is all of it.

## CRITICAL: Anchor every command to the project root

**Always run commands from the project root**, not wherever the shell happens to be. The Bash tool's working directory is persistent across commands in a session, and earlier work in subdirectories (e.g. running tests inside `packages/agent-service`) leaves cwd drifted. The skill previously broke because of exactly this — `ls ecosystem*` returned "no matches" not because the file was missing, but because cwd had drifted into a subdirectory where it didn't exist.

**Do this at the very start, before any other command:**
```bash
cd "$(git rev-parse --show-toplevel)"
pwd
```
Confirm the printed path is the project root (something like `.../new-workshop`). If you ever run a command that might leave cwd elsewhere (e.g. `cd packages/...`), prefix the *next* command with the same `cd` to root, or chain it with `&&` rather than relying on subsequent commands inheriting the right cwd.

## Step 0: Diagnose current state

After anchoring cwd to the project root, quickly check what's already in place. This avoids redoing work the user has already completed.

Run these checks (in parallel where possible):
- Does `node_modules/` exist in the project root?
- Does `node_modules/.pnpm/` exist? (If `node_modules` exists but `.pnpm` doesn't, the user ran `npm install` instead of `pnpm install` — needs reinstall.)
- Does `.env` exist? If so, does it have `ANTHROPIC_API_KEY` and `JWT_SECRET` set to real values (not the `your-key-here` / `your-jwt-secret-here` placeholders)? Also check that `ADMIN_EMAIL` and `ADMIN_PASSWORD` are present (they bootstrap the admin-panel user on first boot).
- Is anything already running on ports 3000, 5173, or 5174? (`lsof -ti:3000`, `lsof -ti:5173`, `lsof -ti:5174`)
- What Node.js version is installed? (`node --version`) — the project requires Node 20 or higher per `engines.node`.
- Is Playwright Chromium installed? Only check this if `node_modules` exists: `pnpm --filter @new-workshop/agent-service exec playwright --version 2>/dev/null`. If `node_modules` is missing, defer this check until after `pnpm install`.

Based on what you find, skip steps that are already complete and tell the user what you're skipping and why.

**About ports 3000 / 5173 / 5174:** if any port is occupied, do NOT immediately kill the process. First check whether what's listening is *the user's healthy `pnpm start` session* (in which case re-onboarding shouldn't disturb it) or *a stale ghost process* (which needs to be cleared). The check is in Step 3 — see "Health-gated startup" below. The mental model: a kill is a destructive action against state the user owns, so it requires affirmative evidence that the existing process is broken. Don't kill on suspicion.

**pnpm vs npm:** This project uses pnpm workspaces. If the user mentions they ran `npm install`, gently note that they need `pnpm install` instead — npm doesn't understand the workspace layout. Don't make them feel bad; just rerun with pnpm.

## Step 1: Install dependencies

Run from the project root:

```bash
pnpm install
```

If `pnpm` is not installed, offer to install it: `npm install -g pnpm`. Verify the install succeeded (exit code 0, no unresolved peer dependency errors).

Then install Playwright's Chromium browser (needed for the `browse_url` agent tool):

```bash
pnpm --filter @new-workshop/agent-service exec playwright install chromium
```

This downloads the headless Chromium binary (~150MB) and only needs to happen once. If it fails, check that the user has write access to the Playwright cache directory (`~/Library/Caches/ms-playwright` on macOS).

Skip the `pnpm install` if Step 0 confirmed deps are already present and pnpm-managed. Still verify Playwright with `pnpm --filter @new-workshop/agent-service exec playwright --version`; if it errors, run the install command above.

## Step 2: Configure environment

Check whether `.env` exists in the project root.

**If it exists:** verify both `ANTHROPIC_API_KEY` and `JWT_SECRET` are set to non-placeholder values. Then check whether `ADMIN_EMAIL` and `ADMIN_PASSWORD` are also present (the admin-panel needs them to bootstrap the admin user). If either is missing or still set to a placeholder (`admin@localhost` is tolerable as-is; `change-me-now` or anything empty is not), fall through to the "prompt for admin creds" sub-step below and append the results — **do not touch existing API-key / JWT-secret lines**. Otherwise skip the rest of this step.

**If it doesn't exist:**

```bash
cp .env.example .env
```

### 2a. Generate the JWT secret

Don't ask the user for this:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the Edit tool to replace `your-jwt-secret-here` in `.env` with the generated hex value.

### 2b. Prompt for the Anthropic API key

Ask via the AskUserQuestion tool:

> "I need your Anthropic API key to configure the project. You can get one from https://console.anthropic.com/settings/keys if you don't have one yet. Please paste your key:"

Write it into `.env` by replacing `your-key-here`. **Do NOT echo the API key to the terminal** or include it in any visible output. Use the Edit tool directly.

### 2c. Prompt for the admin credentials

The admin-panel needs a bootstrap user. On first backend start, the backend reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`, creates that user, links them to the default `Admins` group, and grants all admin privileges. Important: **once the user exists, the backend will NOT overwrite the password if you change `ADMIN_PASSWORD` later** — bootstrap is one-time per email. So we want to set a real password now, not `change-me-now`.

Ask the user via AskUserQuestion, in one call with two questions:

> **Question 1 — Admin email**
> "Pick an email for the admin account. This is what you'll use to sign in to the admin panel at http://localhost:5174. If you're not sure, `admin@localhost` is a fine default."
> Options: "Use admin@localhost (recommended)" / "Use a different email" (user types in the Other field).
>
> **Question 2 — Admin password**
> "Pick a password for the admin account. At least 8 characters. If you'd like, I can generate a strong random one and show it to you so you can save it."
> Options: "Generate a strong random password (recommended)" / "I'll type my own" (user types in the Other field).

Resolve each answer:

- **Email:** if they picked the default, use `admin@localhost`. If they typed something custom, trim + lowercase it. Reject empty.
- **Password:**
  - If they picked "generate", run:
    ```bash
    node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"
    ```
    (16-character urlsafe string, easy to copy, well above the 8-char minimum enforced by the backend.)
  - If they typed their own, accept it as-is — but if it's shorter than 8 characters, tell them why you can't use it and re-prompt.

Write both values into `.env` by replacing (or appending) the `ADMIN_EMAIL=...` and `ADMIN_PASSWORD=...` lines. If `.env` was copied from `.env.example`, the lines are already there with placeholder values and the Edit tool can replace them.

**Unlike the API key, the admin password is something the user needs to see exactly once** so they can save it. After writing to `.env`, tell them — clearly and only in this single message — the email and password you used, e.g.:

> "Admin credentials saved to `.env`:
> - **Email:** admin@localhost
> - **Password:** `aB3-xY7qZp9Kr2vM`
>
> Save these somewhere safe. You can change them later via the admin panel (Users → edit → reset password)."

Do not repeat the password in later responses.

### Final `.env` shape

```
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=<auto-generated-hex>
ADMIN_EMAIL=<chosen or admin@localhost>
ADMIN_PASSWORD=<chosen or random>
```

## Step 3: Health-gated startup

The goal of this step is to make sure all three services are responding correctly at the end. There are three possible starting states, and the right action is different for each:

1. **All three ports already healthy** — there's a `pnpm start` already running that owns the ports and serves correct responses. Don't touch it. Skip this entire step.
2. **All three ports free** — clean slate, just start.
3. **At least one port is occupied but unhealthy** — there's a stale ghost process holding the port without serving correctly. Kill the offenders, then start.

The shortest path is to *probe first and decide based on what you observe*, never kill on suspicion.

### Step 3a: Probe current health

```bash
BE=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:3000/conversations 2>/dev/null)
FE=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null)
AD=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:5174 2>/dev/null)
echo "be=$BE fe=$FE admin=$AD"
```

- Backend healthy = `401` (auth-required is the right response from `/conversations` without a token; it proves the route handler is alive).
- Frontend healthy = `200`.
- Admin-panel healthy = `200` (Vite dev server returns the SPA shell for any path).
- Anything else (`000`, `502`, `500`, etc.) = not healthy.

### Step 3b: Decide and act based on the probe result

**Case 1 — all three healthy (`be=401 fe=200 admin=200`):** the user already has services running. Do not kill, do not restart. Skip directly to Step 4. Tell the user something like "services were already running healthily — left them alone."

**Case 2 — all three ports free (no listener at all, `be=000 fe=000 admin=000` AND `lsof -ti:3000`, `lsof -ti:5173`, `lsof -ti:5174` all return nothing):** clean slate. Start fresh:

```bash
pnpm start
```
Pass `run_in_background: true` on the Bash tool call so the process survives across tool calls.

**Case 3 — port occupied but unhealthy:** something is squatting one of the ports without serving correctly (a ghost process from a previous crash, an unrelated dev server, etc.). Kill the offenders, then start:

```bash
lsof -ti:3000 -ti:5173 -ti:5174 2>/dev/null | xargs kill 2>/dev/null
sleep 2
pnpm start
```
Again, `run_in_background: true`.

### Step 3c: Wait for readiness (only Cases 2 and 3)

After starting in Case 2 or 3, poll the ports with a real readiness loop:

```bash
for i in $(seq 1 30); do
  BE=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:3000/conversations 2>/dev/null)
  FE=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null)
  AD=$(curl -s --max-time 1 -o /dev/null -w "%{http_code}" http://localhost:5174 2>/dev/null)
  if [ "$BE" = "401" ] && [ "$FE" = "200" ] && [ "$AD" = "200" ]; then
    echo "ready after ${i}s (backend=$BE, frontend=$FE, admin=$AD)"; break
  fi
  sleep 1
done
```

If after 30s any port is still not responding, something failed. Read the output of the background `pnpm start` process via the path the Bash tool returned. The most common causes are missing/invalid `ANTHROPIC_API_KEY`, an unrelated process holding the port (run `lsof -ti:3000` to identify it), or a backend startup error that shows up in the captured output.

## Step 4: Open the app in the browser

Once all three services are confirmed ready, open both the chat frontend and the admin panel so the user can see the full surface area at a glance:

**macOS:**
```bash
open http://localhost:5173
open http://localhost:5174
```

**Linux:**
```bash
xdg-open http://localhost:5173
xdg-open http://localhost:5174
```

These commands return success even if no browser handler is configured, so consider it best-effort. If the user reports a browser window didn't open, give them the URLs to paste manually.

## Step 5: Orient the user

Check the `agents/` directory and count the markdown files. Identify which ones declare a `tools:` field in their frontmatter (those have access to tools like `browse_url`).

Then tell the user:

> **You're all set!** Two browser tabs should be open now.
>
> - Backend (API): http://localhost:3000
> - Chat UI: http://localhost:5173
> - Admin UI: http://localhost:5174 — sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env` (defaults: `admin@localhost` / `change-me-now`)
>
> You have **N agent persona(s)** defined in `agents/` (M of them have tools enabled). Try chatting with one in the UI, and use the admin panel to manage users, groups, profiles, and privileges.
>
> **How services run:**
>
> All three services run together via `pnpm start` in your terminal. Logs are streamed live, prefixed with `[be]` (blue), `[fe]` (green), and `[admin]` (magenta). To stop everything, press **Ctrl-C** in that terminal. To restart, run `pnpm start` again.
>
> If you want to keep logs visible while you code, open a second terminal tab — one for `pnpm start` (logs there), one for git/editor work.
>
> **Adding tools to an agent:** Add a `tools:` field in the agent's markdown frontmatter, e.g.
> ```yaml
> tools:
>   - browse_url
> ```
> See the agent edit form in the chat UI for available tools.

If any step failed and you couldn't resolve it, clearly tell the user what went wrong, what you tried, and what they need to fix manually.

## Common gotchas

- **Working directory drift.** The single most common cause of mysterious failures running this skill. Always anchor with `cd "$(git rev-parse --show-toplevel)"` before any command. See the "CRITICAL" section above.
- **Don't reintroduce pm2.** A previous version of this project used pm2 + `ecosystem.config.cjs`. pm2 6.x has known `spawn ENOENT` failures on Node 24+ (it can't reliably spawn `npx`, `pnpm`, or even `/bin/sh` as scripts). We replaced it with `concurrently`, which is simpler, has no spawn issues, and gives better live logs for a workshop. If you find yourself trying to "fix pm2", stop — that's a rabbit hole we already climbed out of.
- **`open` returns 0 silently.** macOS's `open` command returns success even when no default browser is set. If the user says they didn't see anything, just give them the URL to paste manually.
- **`xargs` with no input.** `lsof -ti:3000 | xargs kill` is harmless on macOS when nothing's listening (xargs with no input is a no-op), but on stricter shells use `xargs -r` or guard with `[ -n "$PIDS" ]`.
- **Slow first start.** The first `pnpm start` after a fresh install can take 10–15 seconds because tsx and vite are warming up. The 30-second readiness loop handles this; don't reduce the timeout.
