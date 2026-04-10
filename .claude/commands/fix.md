---
name: fix
description: Run typechecking and tests, then spawn parallel agents to fix all issues
---

# Project Code Quality Check

Run all quality checks, collect errors, group by domain, and spawn parallel agents to fix them.

## Step 1: Run Typechecking and Tests

Run these commands and capture all output:

```bash
npx tsc --noEmit 2>&1
npm test 2>&1
```

**Note:** 3 pre-existing failures in `tests/lib/scrapling-service.test.ts` should be ignored.

## Step 2: Collect and Parse Errors

Parse the output from both commands. Group errors by domain:
- **Type errors**: TypeScript compiler errors from `tsc --noEmit`
- **Test failures**: Failing tests from `npm test` (excluding scrapling-service pre-existing failures)

Create a list of all files with issues and the specific problems in each file.

If there are zero errors across both domains, report success and stop.

## Step 3: Spawn Parallel Agents

For each domain that has issues, spawn an agent in parallel using the Agent tool:

**IMPORTANT**: Use a SINGLE response with MULTIPLE Agent tool calls to run agents in parallel.

- Spawn a "type-fixer" agent for TypeScript errors with the full list of errors
- Spawn a "test-fixer" agent for test failures with the full list of failures

Each agent should:
1. Receive the list of files and specific errors in their domain
2. Read the relevant files and fix all errors
3. Run the relevant check command to verify fixes (`npx tsc --noEmit` or `npm test`)
4. Report completion

## Step 4: Verify All Fixes

After all agents complete, run both checks again:

```bash
npx tsc --noEmit 2>&1
npm test 2>&1
```

Confirm all issues are resolved (ignoring the 3 pre-existing scrapling-service failures).
