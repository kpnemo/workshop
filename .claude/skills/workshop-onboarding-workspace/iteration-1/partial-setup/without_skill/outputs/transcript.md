# Transcript: Handling "app won't start, something about an API key?" WITHOUT Skill Guidance

## Context

- User has already run `npm install`
- User reports the app won't start, mentioning an API key error
- No workshop-onboarding skill is loaded; I am operating purely from reading the repo

---

## Step 1: Investigate the project structure

**What I would do:** Read the project's `README.md`, `package.json`, and `pnpm-workspace.yaml` to understand the project layout.

**Commands I would run:**
```bash
cat README.md
cat package.json
cat pnpm-workspace.yaml
ls packages/
```

**What I learn:**
- This is a pnpm monorepo with packages: `agent-service`, `data`, `web-client`
- The README says to run `cp .env.example .env` and add an Anthropic API key
- The root `package.json` has no scripts defined

---

## Step 2: Diagnose the API key issue

**What I would do:** Check if a `.env` file exists, and look at `.env.example` to understand what's needed.

**Commands I would run:**
```bash
ls -la .env 2>/dev/null
cat .env.example
```

**What I learn:**
- `.env.example` contains: `ANTHROPIC_API_KEY=your-key-here`
- The user likely either (a) never created the `.env` file, or (b) created it but left the placeholder value

**I would also check how the key is consumed:**
```bash
grep -r "ANTHROPIC_API_KEY\|dotenv\|new Anthropic" packages/agent-service/src/
```

**What I learn:**
- `packages/agent-service/src/index.ts` loads dotenv pointing to `../../.env` (project root)
- `packages/agent-service/src/routes/conversations.ts` creates an `Anthropic()` client with no explicit key -- the Anthropic SDK auto-reads `ANTHROPIC_API_KEY` from the environment
- `packages/agent-service/src/services/guardrails.ts` does the same

---

## Step 3: What I would say to the user

> It looks like the app needs an Anthropic API key to start. The project uses the `@anthropic-ai/sdk` package, which expects an environment variable called `ANTHROPIC_API_KEY`.
>
> You need to create a `.env` file in the project root by copying the example:
>
> ```bash
> cp .env.example .env
> ```
>
> Then open `.env` and replace `your-key-here` with your actual Anthropic API key:
>
> ```
> ANTHROPIC_API_KEY=sk-ant-...your-actual-key...
> ```
>
> Do you have an Anthropic API key? If not, you can get one from https://console.anthropic.com/.

---

## Step 4: Address the `npm install` vs `pnpm install` issue

**What I would notice:** The user said they ran `npm install`, but this is a pnpm workspace (there's a `pnpm-lock.yaml` and `pnpm-workspace.yaml`).

**What I would say to the user:**

> One more thing -- I notice this project uses **pnpm**, not npm. You should use `pnpm install` instead of `npm install`. Using the wrong package manager can cause dependency resolution issues.
>
> If you don't have pnpm installed, you can install it with:
>
> ```bash
> npm install -g pnpm
> ```
>
> Then run:
>
> ```bash
> pnpm install
> ```

---

## Step 5: Help them start the app

**What I would say after the user confirms the .env is set up:**

> Now you can start the agent service with:
>
> ```bash
> pnpm --filter @new-workshop/agent-service dev
> ```
>
> This will start the backend API server on port 3000 (by default).
>
> If you also want to run the web client:
>
> ```bash
> pnpm --filter @new-workshop/web-client dev
> ```

---

## Step 6: If the user says they don't have an API key

**What I would say:**

> You'll need to sign up at https://console.anthropic.com/ and create an API key. Once you have it, paste it into the `.env` file.

**What I would NOT do:**
- I would NOT offer to generate a key or hardcode one
- I would NOT commit the `.env` file to git

---

## Step 7: Verify it works

**If the user reports it still doesn't work, I would ask:**

> Can you share the exact error message you're seeing? Also, can you confirm:
> 1. The `.env` file is in the project root (not inside a package)?
> 2. The key starts with `sk-ant-` and has no extra whitespace?
> 3. You used `pnpm install` (not `npm install`)?

---

## Summary of what is MISSING without a skill

Without a dedicated workshop-onboarding skill, this interaction has several gaps:

1. **No systematic checklist.** I am reacting to the user's specific complaint rather than proactively verifying all prerequisites (Node version >= 20, pnpm installed, .env configured, dependencies installed with correct package manager, database directory exists, etc.).

2. **No awareness of common pitfalls.** I don't have a curated list of frequent workshop issues. I'm reverse-engineering the setup from source code.

3. **No verification commands.** A skill could provide a scripted sequence to validate the entire setup in one go (check Node version, check pnpm, check .env exists, check key format, try starting the service, etc.).

4. **Inconsistent depth.** Depending on what I find first, I might miss secondary issues. For example, I noticed the npm-vs-pnpm issue only because I happened to read the lockfile. A skill would always check this.

5. **No mention of the `data` package or database setup.** The agent-service references a `DB_PATH` that defaults to `packages/data/conversations.db`. This directory (`packages/data/`) is untracked (visible in git status). A skill might know to verify the database directory exists or gets created on first run.

6. **No guidance on the `agents/` directory.** The service loads agent definitions from markdown files in `agents/`. If this directory is missing or empty, the service might fail in a confusing way. I did not proactively check this.

7. **Reactive, not proactive.** The entire interaction is driven by the user's error report. A skill-guided flow would walk through all setup steps upfront, catching issues before they become errors.
