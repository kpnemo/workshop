# Task Completion Checklist

When a task is completed, run these checks:

1. **Type check both packages**
   ```bash
   cd packages/agent-service && npx tsc --noEmit
   cd packages/web-client && npx tsc --noEmit
   ```

2. **Run all tests**
   ```bash
   cd packages/agent-service && pnpm test
   cd packages/web-client && pnpm test
   ```

3. **Verify no regressions** — all existing tests should still pass

4. **Commit with descriptive message** — use conventional commits style:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `chore:` for maintenance
   - `test:` for test-only changes
