---
name: commit
description: Run checks, commit with AI message, and push
---

1. Run quality checks and fix ALL errors before continuing:
   ```bash
   npm run generate:types
   npx tsc --noEmit
   npm test
   ```

2. Review changes: `git status` and `git diff --staged`

3. Stage specific files by name (never `git add .`), then commit with a conventional prefix (`feat:` / `fix:` / `chore:` / `refactor:` / `docs:`), subject line under 72 chars.

4. Push only if explicitly asked.
