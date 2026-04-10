Run the test suite and fix any failures.

## Commands

- **Run all tests:** `npx vitest run`
- **Run specific file:** `npx vitest run tests/lib/activity-log.test.ts`
- **Run by pattern:** `npx vitest run -t "retainer"`
- **Watch mode:** `npx vitest`
- **Coverage report:** `npx vitest run --coverage`

## Steps

1. Run `npx vitest run` to execute the full test suite
2. If there are failures, read the failing test file AND the corresponding source file
3. Determine whether the test or the source is wrong:
   - If the source changed and the test is outdated, update the test
   - If the source has a bug, fix the source
4. Re-run only the failing file to verify: `npx vitest run <path>`
5. Run the full suite again to confirm no regressions

## Test Structure

```
tests/
  setup.ts                     # @testing-library/jest-dom matchers
  lib/                         # Unit tests for src/lib/
  collections/                 # Collection config + hook tests
  components/                  # React component tests (admin UI)
  api/                         # API route handler tests
```

## Notes

- Vitest globals are enabled (no need to import describe/it/expect)
- `@` alias maps to `./src`
- jsdom environment for DOM/React testing
- Mock payload with `{ find: vi.fn(), create: vi.fn(), update: vi.fn(), logger: { error: vi.fn() } }`
- Mock fetch with `globalThis.fetch = vi.fn()`
